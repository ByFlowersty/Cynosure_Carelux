"use client"

import type React from "react"
import { useState, useEffect, useRef, useCallback } from "react"
import { Fingerprint, Loader2, AlertCircle, UserCheck, UserX, Link2, QrCode, User, Phone } from "lucide-react"
import supabase from "../../lib/supabaseClient" // Adjust path if needed

// =============================================================================
// INTERFACES Y TIPOS GLOBALES
// =============================================================================
declare global {
  interface Navigator {
    serial: Serial
  }
  interface Serial {
    requestPort(): Promise<SerialPort>
    getPorts(): Promise<SerialPort[]>
  }
  interface SerialPort {
    open(options: { baudRate: number }): Promise<void>
    close(): Promise<void>
    readable: ReadableStream<Uint8Array> | null
    writable: WritableStream<any> | null
    addEventListener(type: "disconnect", listener: (event: Event) => void): void
    removeEventListener(type: "disconnect", listener: (event: Event) => void): void
    closed?: boolean
  }
}

interface PatientData {
  id: string
  name: string
  nombre_completo?: string | null
  allergies: string | null
  tag_rfid: string | null
  surecode?: string | null
  phone?: string | null
  email?: string | null
  blood_type?: string | null
  profile_image?: string | null
  Foto_paciente?: string | null
  date_of_birth?: string | null
  emergency_contact?: string | null
}
interface RFIDReaderProps {
  onPatientIdentified?: (patient: PatientData | null) => void;
  onError?: (message: string) => void; // FIX: Added onError prop
  disableAssociationMode?: boolean
}

// =============================================================================
// ESTADO GLOBAL Y HELPERS (Fuera del componente para persistencia)
// =============================================================================
let globalPort: SerialPort | null = null
let globalReader: ReadableStreamDefaultReader<Uint8Array> | null = null
let globalKeepReading = true
let globalIsConnecting = false
let globalIsDisconnecting = false
let globalPortDisconnectListener: ((event: Event) => void) | null = null
let globalReadLoopPromise: Promise<void> | null = null
let globalError: string | null = null
let globalReceivedDataBuffer = ""

type TagScannedCallback = (tagId: string) => void
let onTagScannedForUICallback: TagScannedCallback | null = null

type GlobalStateListener = () => void
const globalStateListeners = new Set<GlobalStateListener>()
const subscribeToGlobalState = (listener: GlobalStateListener) => {
  globalStateListeners.add(listener)
  return () => globalStateListeners.delete(listener)
}
const notifyGlobalStateChange = () => {
  globalStateListeners.forEach((listener) => listener())
}

const cleanTagIdGlobal = (rawTag: string): string => {
  let cleaned = rawTag.replace(/[^\w\s.:-]/g, "")
  cleaned = cleaned.trim()
  cleaned = cleaned.replace(/\s+/g, "")
  const colonIndex = cleaned.lastIndexOf(":")
  if (colonIndex > -1 && /:\d+$/.test(cleaned.substring(colonIndex))) {
    cleaned = cleaned.substring(0, colonIndex)
  }
  cleaned = cleaned.replace(/[\u0000-\u001F\u007F-\u009F]/g, "")
  return cleaned.trim()
}

const removeGlobalDisconnectListener = (port: SerialPort | null) => {
  if (port && globalPortDisconnectListener && typeof port.removeEventListener === "function") {
    try {
      port.removeEventListener("disconnect", globalPortDisconnectListener)
    } catch (e) {
      console.warn("Error removing global listener:", e)
    }
  }
  globalPortDisconnectListener = null
}

const handleGlobalPortEventDisconnect = () => {
  console.warn('Global Port: "disconnect" event triggered.')
  if (!globalIsDisconnecting) {
    globalError = "Lector desconectado inesperadamente (evento 'disconnect')."
    handleFullDisconnect(true).catch((err) => console.error("Error in handleFullDisconnect from event:", err))
  }
  notifyGlobalStateChange()
}

const addGlobalDisconnectListener = (port: SerialPort) => {
  if (!port || typeof port.addEventListener !== "function") return
  removeGlobalDisconnectListener(port)
  globalPortDisconnectListener = handleGlobalPortEventDisconnect
  try {
    port.addEventListener("disconnect", globalPortDisconnectListener)
  } catch (e) {
    console.error("Error adding global disconnect listener:", e)
    globalPortDisconnectListener = null
  }
}

async function readLoopGlobal(currentPort: SerialPort, _onTagScanned: TagScannedCallback | null) {
  console.log("Global Read Loop: Starting...")
  if (!currentPort?.readable || (currentPort as any).closed) {
    console.warn("Global Read Loop: Port not readable or closed at start.")
    globalError = "El puerto del lector no está disponible o cerrado."
    await handleFullDisconnect(true)
    return
  }

  const textDecoder = new TextDecoder()
  let partialData = ""

  try {
    globalReader = currentPort.readable.getReader()
    console.log("Global Read Loop: Reader obtained.")

    while (globalKeepReading && currentPort.readable && !(currentPort as any).closed) {
      let readResult
      try {
        readResult = await globalReader.read()
      } catch (readErr: any) {
        console.error("Global Read Loop: Error during read:", readErr)
        if (globalKeepReading) {
          globalError = `Error de lectura: ${readErr.message}`
          await handleFullDisconnect(true)
        }
        break
      }

      const { value, done } = readResult
      if (done) {
        console.log("Global Read Loop: Stream done.")
        if (globalKeepReading) {
          globalError = "La conexión con el lector se cerró (stream done)."
          await handleFullDisconnect(true)
        }
        break
      }
      if (!globalKeepReading) break

      if (value?.length) {
        partialData += textDecoder.decode(value, { stream: true })
        globalReceivedDataBuffer += textDecoder.decode(value)
        if (globalReceivedDataBuffer.length > 2048) globalReceivedDataBuffer = globalReceivedDataBuffer.slice(-2048)
        notifyGlobalStateChange()

        let newlineIndex
        while ((newlineIndex = partialData.indexOf("\n")) !== -1) {
          const rawLine = partialData.substring(0, newlineIndex)
          partialData = partialData.substring(newlineIndex + 1)
          const line = cleanTagIdGlobal(rawLine)
          if (line && onTagScannedForUICallback) {
            console.log("Global Read Loop: Tag scanned:", line)
            onTagScannedForUICallback(line)
          }
        }
      }
    }
  } catch (err: any) {
    console.error("Global Read Loop: Critical error:", err)
    if (globalKeepReading) {
      globalError = `Error crítico en lector: ${err.message}`
      await handleFullDisconnect(true)
    }
  } finally {
    console.log("Global Read Loop: Finalizing.")
    if (globalReader) {
      try {
        if (currentPort?.readable) {
          console.log("Global Read Loop: Releasing reader lock.")
          globalReader.releaseLock()
        }
      } catch (e) {
        console.warn("Global Read Loop: Error releasing lock (expected if closed):", e)
      }
      globalReader = null
    }
    console.log("Global Read Loop: Finished.")
    notifyGlobalStateChange()
  }
}

async function handleFullDisconnect(internalError = false) {
  if (globalIsDisconnecting) {
    console.log("Global Disconnect: Already in progress.")
    return
  }
  console.log(`Global Disconnect: Initiating (internalError=${internalError}).`)
  globalIsDisconnecting = true
  globalKeepReading = false
  notifyGlobalStateChange()

  const portToClose = globalPort
  const readerToCancel = globalReader
  const loopToAwait = globalReadLoopPromise

  if (portToClose) removeGlobalDisconnectListener(portToClose)

  if (readerToCancel) {
    try {
      await readerToCancel.cancel()
    } catch (e) {
      console.warn("Global Disconnect: Error cancelling reader:", e)
    }
  }
  if (loopToAwait) {
    try {
      await loopToAwait
    } catch (e) {
      console.warn("Global Disconnect: Error waiting for loop:", e)
    }
  }
  globalReadLoopPromise = null

  if (readerToCancel) {
    try {
      if (portToClose?.readable) readerToCancel.releaseLock()
    } catch (e) {
      console.warn("Global Disconnect: Error releasing lock:", e)
    }
  }
  globalReader = null

  if (portToClose) {
    try {
      if (!(portToClose as any).closed && portToClose.readable !== null) await portToClose.close()
    } catch (e: any) {
      console.error("Global Disconnect: Error closing port:", e)
      if (!internalError) globalError = `Error al cerrar: ${e.message}`
    }
  }
  globalPort = null

  if (!internalError) globalError = null
  globalIsConnecting = false
  globalIsDisconnecting = false
  globalKeepReading = true
  console.log("Global Disconnect: Finished.")
  notifyGlobalStateChange()
}

// =============================================================================
// COMPONENTE PRINCIPAL: RFIDReader (UI)
// =============================================================================
function RFIDReader({ onPatientIdentified, onError, disableAssociationMode = false }: RFIDReaderProps): React.ReactElement {
  const [isConnected, setIsConnected] = useState(
    !!globalPort && globalPort.readable !== null && !(globalPort as any).closed,
  )
  const [error, setError] = useState(globalError)
  const [isConnectingUI, setIsConnectingUI] = useState(globalIsConnecting)
  const [isDisconnectingUI, setIsDisconnectingUI] = useState(globalIsDisconnecting)
  const [receivedData, setReceivedData] = useState(globalReceivedDataBuffer)

  const [lastTagId, setLastTagId] = useState("")
  const [isFetchingPatient, setIsFetchingPatient] = useState(false)
  const [patientError, setPatientError] = useState<string | null>(null)
  const [patientInfo, setPatientInfo] = useState<PatientData | null>(null)

  const [isAssociationMode, setIsAssociationMode] = useState<boolean>(!disableAssociationMode && false)
  const [surecode, setSurecode] = useState("")
  const [isAssociating, setIsAssociating] = useState(false)
  const [associationError, setAssociationError] = useState<string | null>(null)
  const [associationSuccess, setAssociationSuccess] = useState(false)
  const [listeningForAssociation, setListeningForAssociation] = useState(false)
  const [cardContent, setCardContent] = useState("")
  const [patientToAssociate, setPatientToAssociate] = useState<PatientData | null>(null)
  const [isLoadingPatientData, setIsLoadingPatientData] = useState(false)

  const componentMountedRef = useRef(true)
  const onPatientIdentifiedRef = useRef(onPatientIdentified)
  const onErrorRef = useRef(onError); // FIX: Use a ref for the onError callback

  useEffect(() => {
    onPatientIdentifiedRef.current = onPatientIdentified
    onErrorRef.current = onError; // FIX: Update the ref when the prop changes
  }, [onPatientIdentified, onError])

  const resetPatientState = useCallback(() => {
    if (componentMountedRef.current) {
      setPatientInfo(null)
      setPatientError(null)
      setIsFetchingPatient(false)
      setLastTagId("")
    }
  }, [])
  const resetAssociationState = useCallback(() => {
    if (componentMountedRef.current) {
      setSurecode("")
      setAssociationError(null)
      setAssociationSuccess(false)
      setIsAssociating(false)
      setListeningForAssociation(false)
      setCardContent("")
      setPatientToAssociate(null)
      setIsLoadingPatientData(false)
    }
  }, [])
  useEffect(() => {
    if (disableAssociationMode && isAssociationMode) {
      setIsAssociationMode(false)
      resetAssociationState()
    }
    if (disableAssociationMode) {
      setIsAssociationMode(false)
    }
  }, [disableAssociationMode, isAssociationMode, resetAssociationState])

  useEffect(() => {
    componentMountedRef.current = true
    const handleGlobalStateUpdate = () => {
      if (componentMountedRef.current) {
        setIsConnected(!!globalPort && globalPort.readable !== null && !(globalPort as any).closed)
        setError(globalError)
        // FIX: Call onError prop when a global error is set
        if (globalError && onErrorRef.current) {
          onErrorRef.current(globalError);
        }
        setIsConnectingUI(globalIsConnecting)
        setIsDisconnectingUI(globalIsDisconnecting)
        setReceivedData(globalReceivedDataBuffer)
        if (!globalPort && !globalIsConnecting) {
          resetPatientState()
          resetAssociationState()
        }
      }
    }
    const unsubscribe = subscribeToGlobalState(handleGlobalStateUpdate)
    handleGlobalStateUpdate()

    onTagScannedForUICallback = (tagId: string) => {
      if (componentMountedRef.current) {
        if (componentMountedRef.current) setLastTagId(tagId)
        if (isAssociationModeRef.current && listeningForAssociationRef.current && surecodeRef.current) {
          if (componentMountedRef.current) {
            setListeningForAssociation(false)
            setCardContent(tagId)
          }
        } else if (!isAssociationModeRef.current && !isFetchingPatientRef.current) {
          fetchPatientData(tagId)
        }
      }
    }

    return () => {
      componentMountedRef.current = false
      unsubscribe()
      onTagScannedForUICallback = null
      console.log("RFIDReader UI unmounted. Global connection/loop may persist.")
    }
  }, [resetPatientState, resetAssociationState])

  const isAssociationModeRef = useRef(isAssociationMode)
  const listeningForAssociationRef = useRef(listeningForAssociation)
  const surecodeRef = useRef(surecode)
  const isFetchingPatientRef = useRef(isFetchingPatient)

  useEffect(() => {
    isAssociationModeRef.current = isAssociationMode
  }, [isAssociationMode])
  useEffect(() => {
    listeningForAssociationRef.current = listeningForAssociation
  }, [listeningForAssociation])
  useEffect(() => {
    surecodeRef.current = surecode
  }, [surecode])
  useEffect(() => {
    isFetchingPatientRef.current = isFetchingPatient
  }, [isFetchingPatient])

  const fetchPatientBySurecode = useCallback(async (surecodeValue: string) => {
    setIsLoadingPatientData(true)
    setAssociationError(null)
    setPatientToAssociate(null)
    try {
      const { data, error: dbError } = await supabase
        .from("patients")
        .select("*")
        .eq("surecode", surecodeValue.trim())
        .single()
      if (dbError) throw dbError
      if (data) setPatientToAssociate(data as PatientData)
      else setAssociationError("No se encontró paciente.")
    } catch (err: any) {
      if (err.code === "PGRST116") setAssociationError("No se encontró paciente.")
      else setAssociationError(`Error: ${err.message}`)
    } finally {
      setIsLoadingPatientData(false)
    }
  }, [])
  const fetchPatientData = useCallback(
    async (tagId: string) => {
        if (!componentMountedRef.current) return
      const cleanedTagId = tagId
      if (isFetchingPatientRef.current) return
      resetPatientState()
      setIsFetchingPatient(true)
      try {
        const { data, error: fetchError } = await supabase
          .from("patients")
          .select("*")
          .eq("tag_rfid", cleanedTagId)
          .single()
        if (fetchError) throw fetchError
        if (data) {
          const pData = data as PatientData
          if (componentMountedRef.current) setPatientInfo(pData)
          if (onPatientIdentifiedRef.current) onPatientIdentifiedRef.current(pData)
        } else {
          if (componentMountedRef.current) setPatientError("No se encontró paciente.")
           if (onPatientIdentifiedRef.current) onPatientIdentifiedRef.current(null)
        }
      } catch (err: any) {
        if (err.code === "PGRST116") {
          if (componentMountedRef.current) setPatientError("No se encontró paciente.")
        } else {
          if (componentMountedRef.current) setPatientError(`Error: ${err.message}`)
        }
        if (componentMountedRef.current) setPatientInfo(null)
         if (onPatientIdentifiedRef.current) onPatientIdentifiedRef.current(null)
      } finally {
        if (componentMountedRef.current) setIsFetchingPatient(false)
        if (componentMountedRef.current) setLastTagId(cleanedTagId)
      }
    },
    [resetPatientState],
  )
  const associateTagToPatient = useCallback(
    async (tagId: string, pSurecode: string) => {
        if (!componentMountedRef.current) return
      setIsAssociating(true)
      setAssociationError(null)
      setAssociationSuccess(false)
      const cTId = tagId
      const cSCode = pSurecode.trim()
      try {
        const { data: exP, error: pce } = await supabase
          .from("patients")
          .select("id, name")
          .eq("surecode", cSCode)
          .single()
        if (pce) throw pce
        const { data: tInU, error: tE } = await supabase
          .from("patients")
          .select("id, name")
          .eq("tag_rfid", cTId)
          .not("id", "eq", exP.id)
          .maybeSingle()
        if (tE) throw tE
        if (tInU) throw new Error(`Tag ya usado por: ${tInU.name}`)
        const { data: uP, error: uE } = await supabase
          .from("patients")
          .update({ tag_rfid: cTId })
          .eq("id", exP.id)
          .select()
        if (uE) throw uE
        if (!uP || !uP.length) {
          if (componentMountedRef.current) {
            setAssociationError("Asociado, pero no se recuperó info.")
            setAssociationSuccess(true)
            setPatientToAssociate((prev) => (prev ? ({ ...prev, tag_rfid: cTId } as PatientData) : null))
          }
        } else {
          if (componentMountedRef.current) {
            setAssociationSuccess(true)
            setPatientToAssociate(uP[0] as PatientData)
          }
        }
        setTimeout(resetAssociationState, 3000)
      } catch (err: any) {
        if (componentMountedRef.current) setAssociationError(err.message || "Error inesperado.")
      } finally {
        if (componentMountedRef.current) setIsAssociating(false)
      }
    },
    [resetAssociationState],
  )

  const handleConnectUI = useCallback(async () => {
    if (globalIsConnecting || globalIsDisconnecting) return
    globalIsConnecting = true
    globalError = null
    notifyGlobalStateChange()
    resetPatientState()
    resetAssociationState()

    try {
      if (typeof navigator === "undefined" || !("serial" in navigator)) throw new Error("Web Serial API no soportado.")
      const port = await navigator.serial.requestPort()
      await port.open({ baudRate: 9600 })

      globalPort = port
      addGlobalDisconnectListener(port)
      globalKeepReading = true

      if (globalReadLoopPromise) await globalReadLoopPromise
      globalReadLoopPromise = readLoopGlobal(port, onTagScannedForUICallback)
    } catch (err: any) {
      console.error("UI Connect Error:", err)
      globalError = err.message.includes("No port selected")
        ? "Conexión cancelada."
        : `Error al conectar: ${err.message}`
      await handleFullDisconnect(true)
    } finally {
      globalIsConnecting = false
      notifyGlobalStateChange()
    }
  }, [resetPatientState, resetAssociationState])

  const handleDisconnectUI = useCallback(async () => {
    await handleFullDisconnect(false)
  }, [])

  useEffect(() => {
    const cleanup = async () => {
      console.log("Browser closing, attempting to disconnect RFID reader.")
      if (globalPort) await handleFullDisconnect(false)
    }
    window.addEventListener("beforeunload", cleanup)
    return () => window.removeEventListener("beforeunload", cleanup)
  }, [])

  const handleStartAssociation = useCallback(() => {
      if (!surecode.trim()) {
      setAssociationError("Ingrese código.")
      return
    }
    setCardContent("")
    setListeningForAssociation(false)
    setAssociationError(null)
    setAssociationSuccess(false)
    setPatientToAssociate(null)
    fetchPatientBySurecode(surecode)
  }, [surecode, fetchPatientBySurecode])
  const handleListenForCard = useCallback(() => {
      setCardContent("")
    setAssociationError(null)
    setAssociationSuccess(false)
    setListeningForAssociation(true)
  }, [])
  const handleAssociateCard = useCallback(() => {
      if (!cardContent.trim() || !surecode.trim()) {
      setAssociationError("Faltan datos.")
      return
    }
    associateTagToPatient(cardContent, surecode)
  }, [cardContent, surecode, associateTagToPatient])

  return (
    <div className="p-4 sm:p-2 w-full mx-auto bg-white dark:bg-gray-800 rounded-xl space-y-3">
      <div className="p-3 border dark:border-gray-700 rounded bg-gray-50 dark:bg-gray-700 flex flex-col sm:flex-row justify-between items-center gap-2">
        <p className="text-xs sm:text-sm font-medium text-gray-600 dark:text-gray-300">
          Lector RFID:
          <span
            className={`ml-2 font-bold ${isConnected ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"}`}
          >
            {isConnectingUI
              ? "Conectando..."
              : isDisconnectingUI
                ? "Desconectando..."
                : isConnected
                  ? "Conectado"
                  : "Desconectado"}
          </span>
        </p>
        <div className="flex gap-2 flex-wrap justify-center">
          {!isConnected ? (
            <button
              onClick={handleConnectUI}
              className="px-3 py-1.5 sm:px-4 sm:py-2 bg-blue-500 text-white rounded hover:bg-blue-600 text-xs sm:text-sm flex items-center gap-1 disabled:opacity-50"
              disabled={
                isConnectingUI || isDisconnectingUI || (typeof navigator !== "undefined" && !("serial" in navigator))
              }
            >
              {isConnectingUI && <Loader2 className="inline w-4 h-4 animate-spin" />}
              Conectar
            </button>
          ) : (
            <button
              onClick={handleDisconnectUI}
              className="px-3 py-1.5 sm:px-4 sm:py-2 bg-red-500 text-white rounded hover:bg-red-600 text-xs sm:text-sm flex items-center gap-1 disabled:opacity-50"
              disabled={isDisconnectingUI || isConnectingUI}
            >
              {isDisconnectingUI && <Loader2 className="inline w-4 h-4 animate-spin" />}
              Desconectar
            </button>
          )}
          {isConnected && !disableAssociationMode && (
            <>
              {!isAssociationMode ? (
                <button
                  onClick={() => {
                    resetPatientState()
                    setIsAssociationMode(true)
                    resetAssociationState()
                    setError(null)
                    setPatientError(null)
                  }}
                  className="px-3 py-1.5 sm:px-4 sm:py-2 bg-cyan-600 text-white rounded hover:bg-cyan-700 text-xs sm:text-sm flex items-center gap-1"
                  disabled={
                    isDisconnectingUI || isConnectingUI || isFetchingPatient || isAssociating || isLoadingPatientData
                  }
                >
                  <Link2 className="h-4 w-4" /> Asociar
                </button>
              ) : (
                <button
                  onClick={() => {
                    setIsAssociationMode(false)
                    resetAssociationState()
                    resetPatientState()
                    setError(null)
                    setPatientError(null)
                  }}
                  className="px-3 py-1.5 sm:px-4 sm:py-2 bg-gray-500 text-white rounded hover:bg-gray-600 text-xs sm:text-sm flex items-center gap-1"
                  disabled={isAssociating || isDisconnectingUI || isConnectingUI}
                >
                  ✕ Cancelar
                </button>
              )}
            </>
          )}
        </div>
      </div>
      {error && (
        <div className="p-2 border border-red-300 bg-red-100 text-red-700 dark:border-red-600 dark:bg-red-900 dark:text-red-300 rounded flex items-start gap-2 text-sm">
          <AlertCircle className="h-5 w-5 flex-shrink-0 mt-0.5" />
          <div className="flex-grow">
            <p className="font-semibold">Error Lector:</p> <p>{error}</p>
          </div>
          <button
            onClick={() => {
              setError(null)
              globalError = null
              notifyGlobalStateChange()
            }}
            className="ml-auto text-xl leading-none pb-1"
          >
            ×
          </button>
        </div>
      )}
      <div
        className={`mt-3 ${isConnected && isAssociationMode && !disableAssociationMode ? "flex flex-row gap-4" : "flex flex-col"}`}
      >
        {isConnected && isAssociationMode && !disableAssociationMode && (
          <div className="flex-1 p-3 border border-cyan-200 dark:border-cyan-700 bg-cyan-50 dark:bg-cyan-900/30 rounded-lg space-y-3">
            <h3 className="text-md font-semibold text-cyan-800 dark:text-cyan-200 flex items-center gap-2">
              <Link2 className="h-5 w-5" /> Modo Asociación
            </h3>
            <div>
              <label htmlFor="surecode" className="block text-xs font-medium text-gray-700 dark:text-gray-200 mb-1">
                Surecode
              </label>
              <div className="flex items-center gap-2">
                <div className="relative flex-grow">
                  <QrCode className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                  <input
                    type="text"
                    id="surecode"
                    value={surecode}
                    onChange={(e) => {
                      setSurecode(e.target.value)
                      setAssociationError(null)
                      if (patientToAssociate || cardContent || listeningForAssociation || associationSuccess) {
                        setPatientToAssociate(null)
                        setCardContent("")
                        setListeningForAssociation(false)
                        setAssociationSuccess(false)
                      }
                    }}
                    placeholder="Código paciente"
                    className="pl-7 pr-2 py-1.5 text-sm w-full rounded-md border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700"
                    disabled={
                      isAssociating ||
                      isLoadingPatientData ||
                      listeningForAssociation ||
                      isDisconnectingUI ||
                      isConnectingUI
                    }
                  />
                </div>
                <button
                  onClick={handleStartAssociation}
                  disabled={
                    !surecode.trim() ||
                    isAssociating ||
                    isLoadingPatientData ||
                    listeningForAssociation ||
                    isDisconnectingUI ||
                    isConnectingUI
                  }
                  className="px-3 py-1.5 bg-cyan-600 text-white rounded text-xs hover:bg-cyan-700 flex items-center gap-1 disabled:opacity-50"
                >
                  {isLoadingPatientData ? <Loader2 className="h-4 w-4 animate-spin" /> : <User className="h-4 w-4" />}
                  Buscar
                </button>
              </div>
            </div>
            {isLoadingPatientData && (
              <div className="p-3 bg-blue-50 dark:bg-blue-900 border rounded text-xs text-blue-700 dark:text-blue-300 flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                Buscando...
              </div>
            )}
            {associationError && !isLoadingPatientData && !associationSuccess && (
              <div className="p-2 border border-red-200 bg-red-50 text-red-600 dark:bg-red-800 dark:text-red-300 dark:border-red-600 rounded text-xs flex items-center gap-1">
                <AlertCircle className="h-4" />
                {associationError}{" "}
                <button onClick={() => setAssociationError(null)} className="ml-auto">
                  ✕
                </button>
              </div>
            )}
            {patientToAssociate && !isAssociating && !associationSuccess && (
              <PatientInfoCard patient={patientToAssociate} associationContext={true} />
            )}
            {patientToAssociate && (
              <div className="space-y-2 pt-2 border-t border-cyan-100 dark:border-cyan-700">
                <div>
                  <label className="text-xs font-medium">Tag RFID</label>
                  <div className="relative">
                    <input
                      type="text"
                      value={cardContent}
                      readOnly
                      placeholder={listeningForAssociation ? "Acerque tarjeta..." : "Tag leído"}
                      className="w-full py-1.5 px-2 text-sm rounded-md border-gray-300 dark:border-gray-600 bg-gray-100 dark:bg-gray-800"
                    />
                    <Fingerprint
                      className={`absolute right-2 top-1/2 -translate-y-1/2 h-4 w-4 ${listeningForAssociation ? "text-blue-500 animate-pulse" : "text-gray-400"}`}
                    />
                  </div>
                </div>
                <div className="flex gap-2">
                  {!listeningForAssociation && !cardContent && !isAssociating && !associationSuccess && (
                    <button
                      onClick={handleListenForCard}
                      disabled={isAssociating || isDisconnectingUI || isConnectingUI || isLoadingPatientData}
                      className="flex-1 px-3 py-1.5 bg-blue-600 text-white rounded text-xs hover:bg-blue-700 disabled:opacity-50 flex items-center justify-center gap-1"
                    >
                      <Fingerprint className="h-4" />
                      Leer Tarjeta
                    </button>
                  )}
                  {listeningForAssociation && (
                    <div className="flex-1 p-2 bg-yellow-50 dark:bg-yellow-800 border rounded text-xs text-yellow-700 dark:text-yellow-300 flex items-center justify-center gap-1">
                      <Loader2 className="h-4 animate-spin" />
                      Acerque tarjeta...
                    </div>
                  )}
                  {cardContent && !isAssociating && !associationSuccess && (
                    <button
                      onClick={handleAssociateCard}
                      disabled={
                        isAssociating || !cardContent.trim() || !surecode.trim() || isDisconnectingUI || isConnectingUI
                      }
                      className="flex-1 px-3 py-1.5 bg-green-600 text-white rounded text-xs hover:bg-green-700 disabled:opacity-50 flex items-center justify-center gap-1"
                    >
                      {isAssociating ? (
                        <>
                          <Loader2 className="h-4 animate-spin" />
                          Asociando...
                        </>
                      ) : (
                        <>
                          <Link2 className="h-4" />
                          Asociar
                        </>
                      )}
                    </button>
                  )}
                  {isAssociating && (
                    <div className="flex-1 p-2 bg-green-50 dark:bg-green-800 border rounded text-xs text-green-700 dark:text-green-300 flex items-center justify-center gap-1">
                      <Loader2 className="h-4 animate-spin" />
                      Asociando...
                    </div>
                  )}
                  {cardContent && !isAssociating && !listeningForAssociation && !associationSuccess && (
                    <button
                      onClick={() => {
                        setCardContent("")
                        setAssociationError(null)
                      }}
                      disabled={isAssociating || listeningForAssociation || isDisconnectingUI || isConnectingUI}
                      className="px-2 py-1.5 bg-gray-200 dark:bg-gray-600 rounded text-xs hover:bg-gray-300 dark:hover:bg-gray-500"
                    >
                      ✕
                    </button>
                  )}
                </div>
              </div>
            )}
            {associationSuccess && patientToAssociate && (
              <div className="p-2 mt-2 border border-green-200 bg-green-50 text-green-700 dark:bg-green-800 dark:text-green-300 dark:border-green-600 rounded text-xs">
                <UserCheck className="inline h-4 mr-1" />
                Asociación exitosa: {patientToAssociate.name} con tag {cardContent.substring(0, 6)}...
              </div>
            )}
          </div>
        )}

        <div className={`${isAssociationMode && !disableAssociationMode ? "flex-1" : "w-full"}`}>
          <h3
            className={`text-md font-semibold text-gray-700 dark:text-gray-200 flex items-center justify-center gap-2 mb-2 ${isAssociationMode && !disableAssociationMode ? "text-sm text-gray-500 dark:text-gray-400" : ""}`}
          >
            <Fingerprint
              className={`h-5 w-5 ${isAssociationMode && !disableAssociationMode ? "text-gray-400" : "text-blue-500"}`}
            />
            Lector RFID
          </h3>
          <div
            className={`min-h-[120px] flex items-center justify-center p-3 rounded-lg border ${isConnected ? (isAssociationMode && !disableAssociationMode ? "bg-gray-100 dark:bg-gray-700/50 border-gray-200 dark:border-gray-600" : "bg-blue-50 dark:bg-blue-900/30 border-blue-200 dark:border-blue-600 border-dashed") : "bg-gray-100 dark:bg-gray-700/50 border-gray-200 dark:border-gray-600"}`}
          >
            {!isConnected && !isConnectingUI && !isDisconnectingUI ? (
              <InfoBox message="Lector Desconectado" details="Conecte para empezar." icon={AlertCircle} color="gray" />
            ) : isConnectingUI ? (
              <InfoBox message="Conectando..." icon={Loader2} color="gray" spinning />
            ) : isDisconnectingUI ? (
              <InfoBox message="Desconectando..." icon={Loader2} color="gray" spinning />
            ) : isAssociationMode && !disableAssociationMode ? (
              listeningForAssociation ? (
                <InfoBox message="Asociación: Escaneando" icon={Loader2} color="cyan" spinning />
              ) : patientToAssociate && !cardContent ? (
                <InfoBox
                  message="Asociación: Paciente Listo"
                  details="Presione 'Leer Tarjeta'."
                  icon={UserCheck}
                  color="cyan"
                />
              ) : patientToAssociate && cardContent && !isAssociating && !associationSuccess ? (
                <InfoBox
                  message="Asociación: Tarjeta Leída"
                  details="Presione 'Asociar'."
                  lastTag={cardContent}
                  icon={Fingerprint}
                  color="cyan"
                />
              ) : isAssociating ? (
                <InfoBox message="Asociación: Guardando..." icon={Loader2} color="cyan" spinning />
              ) : associationSuccess && patientToAssociate ? (
                <InfoBox
                  message="Asociación Exitosa"
                  details={`Tag ${cardContent.substring(0, 6)}... asociado.`}
                  icon={UserCheck}
                  color="green"
                />
              ) : isLoadingPatientData ? (
                <InfoBox message="Asociación: Buscando..." icon={Loader2} color="cyan" spinning />
              ) : (
                <InfoBox message="Modo Asociación" details="Ingrese Surecode." icon={Link2} color="cyan" />
              )
            ) : isFetchingPatient ? (
              <InfoBox
                message="Identificando..."
                details={lastTagId ? `Tag: ${lastTagId}` : ""}
                icon={Loader2}
                color="blue"
                spinning
              />
            ) : patientError ? (
              <InfoBox
                message="No Identificado"
                details={patientError}
                lastTag={lastTagId}
                icon={UserX}
                color="yellow"
              />
            ) : patientInfo ? (
              <PatientInfoCard patient={patientInfo} />
            ) : (
              <InfoBox
                message="Esperando Tarjeta"
                details="Acerque tarjeta para identificar."
                icon={Fingerprint}
                color="blue"
                animated
              />
            )}
          </div>
        </div>
      </div>
      {(isConnected || receivedData || error) && (
        <div className="mt-3 pt-3 border-t dark:border-gray-600">
          <details className="group">
            <summary className="text-xs font-medium text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 cursor-pointer list-none flex justify-between items-center">
              <span>Datos Raw ({receivedData.split("\n").filter(Boolean).length} líneas)</span>
              <span className="transform transition-transform duration-200 group-open:rotate-180">▼</span>
            </summary>
            <textarea
              readOnly
              value={receivedData || "Sin datos."}
              className="mt-1 w-full p-1.5 border dark:border-gray-600 rounded bg-gray-100 dark:bg-gray-900 text-xs font-mono h-20 resize-y"
            />
          </details>
        </div>
      )}
    </div>
  )
}

// =============================================================================
// COMPONENTES AUXILIARES
// =============================================================================
interface InfoBoxProps {
  message: string
  details?: string
  lastTag?: string
  icon: React.ElementType
  color: "gray" | "blue" | "yellow" | "cyan" | "green"
  spinning?: boolean
  animated?: boolean
}
const InfoBox: React.FC<InfoBoxProps> = ({ message, details, lastTag, icon: Icon, color, spinning, animated }) => {
  const C = {
    gray: {
      text: "text-gray-500 dark:text-gray-400",
      bg: "bg-gray-100 dark:bg-gray-700/50",
      icon: "text-gray-400 dark:text-gray-500",
      ping: "bg-gray-400",
    },
    blue: {
      text: "text-blue-600 dark:text-blue-300",
      bg: "bg-blue-50 dark:bg-blue-900/30",
      icon: "text-blue-500 dark:text-blue-400",
      ping: "bg-blue-400",
    },
    yellow: {
      text: "text-yellow-700 dark:text-yellow-300",
      bg: "bg-yellow-50 dark:bg-yellow-800/30",
      icon: "text-yellow-500 dark:text-yellow-400",
      ping: "bg-yellow-400",
    },
    cyan: {
      text: "text-cyan-700 dark:text-cyan-300",
      bg: "bg-cyan-50 dark:bg-cyan-900/30",
      icon: "text-cyan-500 dark:text-cyan-400",
      ping: "bg-cyan-400",
    },
    green: {
      text: "text-green-700 dark:text-green-300",
      bg: "bg-green-50 dark:bg-green-900/30",
      icon: "text-green-500 dark:text-green-400",
      ping: "bg-green-400",
    },
  }[color]
  return (
    <div
      className={`py-6 px-3 ${C.bg} rounded-lg flex flex-col items-center text-center w-full min-h-[100px] justify-center`}
    >
      {animated ? (
        <div className={`relative flex h-4 w-4 mb-2 ${C.icon}`}>
          <span className={`animate-ping absolute inline-flex h-full w-full rounded-full ${C.ping} opacity-75`}></span>
          <span className={`relative inline-flex rounded-full h-4 w-4 ${C.ping}`}></span>
        </div>
      ) : (
        <Icon className={`h-6 w-6 ${C.icon} mb-2 ${spinning ? "animate-spin" : ""}`} />
      )}
      <p className={`${C.text} text-sm font-semibold`}>{message}</p>
      {details && <p className={`text-xs ${C.text} opacity-80 mt-0.5`}>{details}</p>}
      {lastTag && <p className="text-xs text-gray-400 dark:text-gray-500 mt-1 font-mono break-all">{lastTag}</p>}
    </div>
  )
}

interface PatientInfoCardProps {
  patient: PatientData
  associationContext?: boolean
}
const PatientInfoCard: React.FC<PatientInfoCardProps> = ({ patient, associationContext = false }) => {
  const cardBg = associationContext ? "bg-white dark:bg-gray-700" : "bg-green-50 dark:bg-green-900/30"
  const borderColor = associationContext
    ? "border-gray-300 dark:border-gray-600"
    : "border-green-300 dark:border-green-600"
  const titleColor = associationContext ? "text-gray-700 dark:text-gray-100" : "text-green-700 dark:text-green-200"
  return (
    <div className={`w-full p-3 ${cardBg} rounded-lg border ${borderColor} space-y-2 shadow-sm`}>
      <div className={`flex items-center gap-2 w-full border-b pb-1.5 mb-1.5 ${borderColor}`}>
        <UserCheck className={`h-5 w-5 ${titleColor} flex-shrink-0`} />
        <h4 className={`text-sm font-semibold ${titleColor}`}>
          {associationContext ? "Paciente a Asociar" : "Paciente Identificado"}
        </h4>
      </div>
      <div className="flex items-start gap-3 w-full text-xs">
        <div className="flex-shrink-0">
          {patient.profile_image || patient.Foto_paciente ? (
            <img
              src={patient.profile_image || patient.Foto_paciente || ""}
              alt="Foto"
              className="w-12 h-12 rounded-full object-cover border dark:border-gray-600"
            />
          ) : (
            <div className="w-12 h-12 rounded-full bg-gray-200 dark:bg-gray-600 flex items-center justify-center border dark:border-gray-500">
              <User className="h-6 w-6 text-gray-400 dark:text-gray-500" />
            </div>
          )}
        </div>
        <div className="flex-grow space-y-0.5">
          <div>
            <p className="font-medium text-gray-500 dark:text-gray-400">Nombre:</p>
            <p className="text-gray-800 dark:text-gray-100 font-semibold">
              {patient.name || patient.nombre_completo || "N/A"}
            </p>
          </div>
          {patient.allergies && (
            <div>
              <p className="font-medium text-gray-500 dark:text-gray-400">Alergias:</p>
              <p className="text-red-600 dark:text-red-400 font-semibold">{patient.allergies}</p>
            </div>
          )}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-2 gap-y-0.5 pt-1 border-t border-gray-200 dark:border-gray-600 mt-1">
            {patient.surecode && (
              <div className="flex items-center gap-1 truncate">
                <QrCode className="h-3 w-3 text-gray-400 dark:text-gray-500 shrink-0" />
                <span className="font-medium text-gray-500 dark:text-gray-400">Surecode:</span>
                <span className="text-gray-700 dark:text-gray-300 font-mono truncate">{patient.surecode}</span>
              </div>
            )}
            {patient.tag_rfid && (
              <div className="flex items-center gap-1 truncate">
                <Fingerprint className="h-3 w-3 text-gray-400 dark:text-gray-500 shrink-0" />
                <span className="font-medium text-gray-500 dark:text-gray-400">Tag:</span>
                <span className="text-gray-700 dark:text-gray-300 font-mono truncate">{patient.tag_rfid}</span>
              </div>
            )}
            {patient.phone && (
              <div className="flex items-center gap-1 truncate">
                <Phone className="h-3 w-3 text-gray-400 dark:text-gray-500 shrink-0" />
                <span className="font-medium text-gray-500 dark:text-gray-400">Tel:</span>
                <span className="text-gray-700 dark:text-gray-300 truncate">{patient.phone}</span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

export default RFIDReader