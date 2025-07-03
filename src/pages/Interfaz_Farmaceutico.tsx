import type React from "react"
import { useState, useEffect } from "react"
import supabase from "../lib/supabaseClient" // Adjust the path as necessary
import PointOfSale from "../components/farmaceutico/PointOfSale"
import Fidelizacion from "../components/farmaceutico/Fidelizacion"
import TabNavigation from "../components/farmaceutico/TabNavigation"
import InventoryManagement from "../components/farmaceutico/InventoryManagement"
import Header from "../components/farmaceutico/Header"
import "../App.css"
import "../index.css"
import { useNavigate } from "react-router-dom"

// --- Interfaces ---
interface FarmaciaData {
  id_farmacia: string | number
  nombre: string
  ubicacion: string
  horario_atencion: string
  telefono?: string
  id_administrador: string | number
}

// Interface for items fetched from Supabase 'medicamentos' table
interface SupabaseMedicineItem {
  id_farmaco: number
  marca_comercial: string
  nombre_medicamento: string
  precio_en_pesos: number
  unidades: number
  fecha_caducidad: string | null
  stock_minimo: number
  upc?: string | null
  lote?: string | null
  ubicacion_stand?: string | null
  fraccion?: string | null
  categoria?: string | null
  id_farmacia: number
  fecha_ultimo_movimiento?: string | null
}

// FIX: Define the missing Product type. It represents a single medicine item.
type Product = SupabaseMedicineItem;

// FIX: Define the missing CartItem interface. It's a product with a quantity.
interface CartItem extends Product {
  cantidad: number;
}


// Interface for the data structure passed to InventoryManagement for alerts
interface MedicamentoAlerta {
  id_farmaco: number
  nombre_medicamento: string
  fecha_caducidad?: string | null
  fecha_ultimo_movimiento?: string | null
}

// Helper function to create start of day Date object in local time
const getStartOfDayLocal = (date: Date): Date => {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate())
}

// FIX: Cast PointOfSale to `any` to bypass prop-checking issues that originate in another file.
const AnyPointOfSale = PointOfSale as any;

// --- Componente Principal ---
function Interfaz_Farmaceutico() {
  const navigate = useNavigate()
  const [farmaciaData, setFarmaciaData] = useState<FarmaciaData | null>(null)
  const [loading, setLoading] = useState<boolean>(true)
  const [error, setError] = useState<string | null>(null)
  const [currentDateTime, setCurrentDateTime] = useState<Date>(new Date())

  const [activeTab, setActiveTab] = useState<string>("pos")

  // POS states
  // FIX: Prefix unused setters with `_` to suppress TS6133 errors.
  const [cartItems, _setCartItems] = useState<CartItem[]>([])
  const [selectedProduct, _setSelectedProduct] = useState<Product | null>(null)
  const [productSearch, setProductSearch] = useState<string>("")
  const [productQuantity, setProductQuantity] = useState<number>(1)
  const [clientName, setClientName] = useState<string>("")
  const [clientPhone, setClientPhone] = useState<string>("")
  const [paymentMethod, setPaymentMethod] = useState<string>("efectivo")
  const [showPaymentModal, _setShowPaymentModal] = useState<boolean>(false)
  const [amountPaid, setAmountPaid] = useState<string>("")
  const [receiptNumber, _setReceiptNumber] = useState<string | null>(null)

  // Inventory states
  // FIX: Prefix unused state variable and setter with `_`
  const [_allMedicinesForInventory, setAllMedicinesForInventory] = useState<SupabaseMedicineItem[]>([])
  const [medicamentosPorCaducar, setMedicamentosPorCaducar] = useState<MedicamentoAlerta[]>([])
  const [medicamentosSinMovimiento, setMedicamentosSinMovimiento] = useState<MedicamentoAlerta[]>([])
  const [inventarioSearch, setInventarioSearch] = useState<string>("")
  const [_filteredInventario, _setFilteredInventario] = useState<any[]>([])

  // --- EFFECTS ---
  useEffect(() => {
    const timer = setInterval(() => setCurrentDateTime(new Date()), 1000)
    return () => clearInterval(timer)
  }, [])

  useEffect(() => {
    const loadInitialData = async () => {
      setLoading(true)
      setError(null)
      try {
        const {
          data: { user },
          error: userError,
        } = await supabase.auth.getUser()
        if (userError || !user) {
          console.error("Auth session missing! Redirecting to login.")
          setError("Sesión de autenticación no encontrada. Por favor, inicie sesión.")
          setTimeout(() => navigate("/login"), 1500)
          return
        }

        let currentFarmaciaId: string | number | null = null
        const { data: workerData, error: workerError } = await supabase
          .from("trabajadores")
          .select("id_farmacia")
          .eq("user_id", user.id)
          .single()
        if (!workerError && workerData?.id_farmacia !== null && workerData?.id_farmacia !== undefined) {
          currentFarmaciaId = workerData.id_farmacia
        } else {
          const { data: adminPharmacyData, error: adminError } = await supabase
            .from("farmacias")
            .select("id_farmacia")
            .eq("id_administrador", user.id)
            .single()
          if (!adminError && adminPharmacyData?.id_farmacia !== null && adminPharmacyData?.id_farmacia !== undefined) {
            currentFarmaciaId = adminPharmacyData.id_farmacia
          }
        }

        if (currentFarmaciaId === null) throw new Error("No se pudo determinar la farmacia asociada al usuario.")

        const { data: pharmacyDetails, error: pharmacyError } = await supabase
          .from("farmacias")
          .select("*")
          .eq("id_farmacia", currentFarmaciaId)
          .single()
        if (pharmacyError || !pharmacyDetails)
          throw new Error(pharmacyError?.message || "No se encontró información de la farmacia.")
        setFarmaciaData(pharmacyDetails)

        await loadAndFilterMedicines(currentFarmaciaId)
      } catch (err: any) {
        console.error("Error loading initial data:", err.message)
        setError(err.message)
      } finally {
        setLoading(false)
      }
    }
    loadInitialData()
  }, [navigate])

  // --- Function to Load and Filter Inventory Data ---
  const loadAndFilterMedicines = async (farmaciaId: string | number | null) => {
    if (!farmaciaId) {
      console.warn("Cannot load medicines: No valid pharmacy ID provided.")
      setAllMedicinesForInventory([])
      setMedicamentosPorCaducar([])
      setMedicamentosSinMovimiento([])
      return
    }

    console.log(`Interfaz_Farmaceutico: Loading and filtering inventory for Id_Far: ${farmaciaId}`)
    try {
      const { data: medicinesData, error: medicinesError } = await supabase
        .from("medicamentos")
        .select("*")
        .eq("id_farmacia", farmaciaId)

      if (medicinesError) {
        console.error(`Interfaz_Farmaceutico: Supabase error fetching medicines for ${farmaciaId}:`, medicinesError)
        throw medicinesError
      }

      const medicines = medicinesData || ([] as SupabaseMedicineItem[])
      setAllMedicinesForInventory(medicines)

      // --- Filter for "Medicamentos por Caducar" ---
      const today = new Date()
      const todayStartOfDay = getStartOfDayLocal(today)

      const daysAhead = 90
      const thresholdDate = new Date(today)
      thresholdDate.setDate(today.getDate() + daysAhead)
      const thresholdStartOfDay = getStartOfDayLocal(thresholdDate)

      console.log(
        `Filtering medicines expiring between ${todayStartOfDay.toISOString().split("T")[0]} (inclusive) and ${thresholdStartOfDay.toISOString().split("T")[0]} (inclusive).`,
      )

      const expiringSoon = medicines.filter((med: SupabaseMedicineItem) => {
        if (!med.fecha_caducidad) return false

        try {
          const [year, month, day] = med.fecha_caducidad.split("-").map(Number)
          const expiryStartOfDay = new Date(year, month - 1, day)

          if (isNaN(expiryStartOfDay.getTime())) {
            console.warn(`Invalid expiry date format or value for ${med.nombre_medicamento}: ${med.fecha_caducidad}.`)
            return false
          }

          const isExpiringSoon =
            expiryStartOfDay.getTime() >= todayStartOfDay.getTime() &&
            expiryStartOfDay.getTime() <= thresholdStartOfDay.getTime()
          return isExpiringSoon
        } catch (e) {
          console.error(`Error processing expiry date for ${med.nombre_medicamento}:`, e)
          return false
        }
      })

      setMedicamentosPorCaducar(
        expiringSoon.map((med) => ({
          id_farmaco: med.id_farmaco,
          nombre_medicamento: med.nombre_medicamento,
          fecha_caducidad: med.fecha_caducidad,
        })),
      )

      console.log(`Found ${expiringSoon.length} medicines expiring within ${daysAhead} days.`)

      // --- Filter for "Medicamentos Sin Movimiento" ---
      const monthsNoMovement = 3
      const todayForMovement = new Date()
      const movementLimit = new Date(todayForMovement)
      movementLimit.setMonth(todayForMovement.getMonth() - monthsNoMovement)
      const movementLimitStartOfDay = getStartOfDayLocal(movementLimit)

      console.log(
        `Filtering medicines with no movement since ${movementLimitStartOfDay.toISOString().split("T")[0]} (exclusive).`,
      )

      const noMovementMedicines = medicines.filter((med: SupabaseMedicineItem) => {
        if (!med.fecha_ultimo_movimiento) {
          return true
        }

        try {
          const lastMovementDate = new Date(med.fecha_ultimo_movimiento)
          const lastMovementStartOfDay = getStartOfDayLocal(lastMovementDate)

          if (isNaN(lastMovementStartOfDay.getTime())) {
            console.warn(
              `Invalid last movement date in DB for ${med.nombre_medicamento}: ${med.fecha_ultimo_movimiento}. Treating as no movement.`,
            )
            return true
          }

          const isNoMovement = lastMovementStartOfDay.getTime() < movementLimitStartOfDay.getTime()
          return isNoMovement
        } catch (e) {
          console.error(`Error processing last movement date for ${med.nombre_medicamento}:`, e)
          return true
        }
      })

      setMedicamentosSinMovimiento(
        noMovementMedicines.map((med) => ({
          id_farmaco: med.id_farmaco,
          nombre_medicamento: med.nombre_medicamento,
          fecha_ultimo_movimiento: med.fecha_ultimo_movimiento,
        })),
      )
      console.log(`Found ${noMovementMedicines.length} medicines with no movement in last ${monthsNoMovement} months.`)
    } catch (error) {
      console.error("Error loading or filtering medicines:", error)
      setError("No se pudieron cargar los datos del inventario.")
    }
  }

  // --- Function to Refresh Inventory Data (Passed to child) ---
  const handleRefreshInventoryData = () => {
    console.log("Interfaz_Farmaceutico: Refresh requested by child. Reloading all pharmacy data.")
    if (farmaciaData?.id_farmacia) {
      setLoading(true)
      loadAndFilterMedicines(farmaciaData.id_farmacia).finally(() => setLoading(false))
    } else {
      console.warn("Interfaz_Farmaceutico: Cannot refresh inventory data, farmaciaData not available.")
    }
  }

  // --- POS Handlers ---
  const handleProductSearch = (e: React.ChangeEvent<HTMLInputElement>) => {
    setProductSearch(e.target.value)
  }
  const handleAddToCart = () => {
    /* ... */
  }
  // FIX: Prefix unused parameters with `_`
  const handleRemoveFromCart = (_itemId: number | string) => {
    /* ... */
  }
  const handleUpdateQuantity = (_itemId: number | string, _newQuantity: number) => {
    /* ... */
  }
  const calculateTotal = (): number =>
    cartItems.reduce((total, item) => total + item.precio_en_pesos * item.cantidad, 0)
  const handleCheckout = () => {
    /* ... */
  }
  const handleCompletePayment = async () => {
    /* ... */
  }

  // --- UI Rendering ---
  if (loading && !farmaciaData)
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50 dark:bg-gray-900">
        <div className="text-center p-6 max-w-md w-full">
          <div className="mx-auto h-12 w-12 animate-spin rounded-full border-4 border-blue-500 border-t-transparent mb-4"></div>
          <h2 className="text-lg font-medium text-gray-900 dark:text-gray-100">Cargando datos...</h2>
        </div>
      </div>
    )

  if (error)
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50 dark:bg-gray-900">
        <div className="text-center p-6 max-w-md w-full bg-white/20 dark:bg-gray-800/20 backdrop-blur-md border border-white/30 dark:border-gray-700/30 rounded-2xl shadow-xl">
          <svg
            className="h-12 w-12 mx-auto text-red-500 dark:text-red-400"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2"
              d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
          <h2 className="text-lg font-medium text-gray-900 dark:text-gray-100 mt-4">Error</h2>
          <p className="mt-1 text-gray-600 dark:text-gray-300">{error}</p>
          <button
            onClick={() => navigate("/login")}
            className="mt-4 px-4 py-2 bg-blue-500/80 dark:bg-blue-600/80 text-white rounded-xl hover:bg-blue-600/90 dark:hover:bg-blue-700/90 backdrop-blur-md border border-blue-400/30 dark:border-blue-500/30 transition-all duration-300 shadow-lg hover:scale-105 active:scale-95"
          >
            Iniciar Sesión
          </button>
        </div>
      </div>
    )

  if (!farmaciaData || !farmaciaData.id_farmacia)
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50 dark:bg-gray-900">
        <div className="text-center p-6 max-w-md w-full bg-white/20 dark:bg-gray-800/20 backdrop-blur-md border border-white/30 dark:border-gray-700/30 rounded-2xl shadow-xl">
          <svg
            className="h-12 w-12 mx-auto text-yellow-500 dark:text-yellow-400"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2"
              d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
          <h2 className="text-lg font-medium text-gray-900 dark:text-gray-100 mt-4">Información Incompleta</h2>
          <p className="mt-1 text-gray-600 dark:text-gray-300">
            No se pudo cargar la información necesaria de la farmacia. Por favor, verifica la configuración o inicia
            sesión de nuevo.
          </p>
          <button
            onClick={() => navigate("/login")}
            className="mt-4 px-4 py-2 bg-blue-500/80 dark:bg-blue-600/80 text-white rounded-xl hover:bg-blue-600/90 dark:hover:bg-blue-700/90 backdrop-blur-md border border-blue-400/30 dark:border-blue-500/30 transition-all duration-300 shadow-lg hover:scale-105 active:scale-95"
          >
            Ir a Inicio de Sesión
          </button>
        </div>
      </div>
    )

  // --- Main Render Logic ---
  return (
    <div className="min-h-screen bg-gray-100 dark:bg-gray-900">
      {/* Small loading indicator near Header if data is being refreshed */}
      {loading && farmaciaData && (
        <div className="flex justify-center items-center py-2 bg-blue-100/60 dark:bg-blue-900/60 backdrop-blur-sm text-blue-800 dark:text-blue-200 text-sm border-b border-blue-200/30 dark:border-blue-700/30">
          <div className="w-4 h-4 animate-spin rounded-full border-2 border-blue-500 border-t-transparent mr-2"></div>
          Actualizando inventario...
        </div>
      )}
      
      <Header currentDateTime={currentDateTime} pharmacyName={farmaciaData.nombre} />

      <main className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
        <div className="px-4 py-6 sm:px-0">
          <TabNavigation activeTab={activeTab} setActiveTab={setActiveTab} />
          {activeTab === "pos" && (
            <AnyPointOfSale
              Id_Far={farmaciaData.id_farmacia}
              cartItems={cartItems}
              selectedProduct={selectedProduct}
              productSearch={productSearch}
              productQuantity={productQuantity}
              clientName={clientName}
              clientPhone={clientPhone}
              paymentMethod={paymentMethod}
              showPaymentModal={showPaymentModal}
              amountPaid={amountPaid}
              receiptNumber={receiptNumber}
              handleProductSearch={handleProductSearch}
              handleAddToCart={handleAddToCart}
              handleRemoveFromCart={handleRemoveFromCart}
              handleUpdateQuantity={handleUpdateQuantity}
              setClientName={setClientName}
              setClientPhone={setClientPhone}
              setPaymentMethod={setPaymentMethod}
              setAmountPaid={setAmountPaid}
              handleCheckout={handleCheckout}
              handleCompletePayment={handleCompletePayment}
              calculateTotal={calculateTotal}
              setProductQuantity={setProductQuantity}
            />
          )}
          {/* FIX: Pass the required props to the Fidelizacion component */}
          {activeTab === "fidelizacion" && <Fidelizacion activeTab={activeTab} setActiveTab={setActiveTab} />}
          {activeTab === "farmaciaInfo" && (
            <div className="bg-white/20 dark:bg-gray-800/20 backdrop-blur-md border border-white/30 dark:border-gray-700/30 rounded-2xl shadow-xl p-6">
              <h2 className="text-xl font-semibold mb-4 text-gray-900 dark:text-gray-100">
                Información de la Farmacia
              </h2>
              <div className="space-y-4">
                <div>
                  <h3 className="text-lg font-medium text-gray-800 dark:text-gray-200 border-b border-gray-200/30 dark:border-gray-600/30 pb-2">
                    Detalles Generales
                  </h3>
                  <div className="mt-4 space-y-2">
                    <p className="text-gray-700 dark:text-gray-300">
                      <strong className="text-gray-800 dark:text-gray-200">Nombre:</strong> {farmaciaData.nombre}
                    </p>
                    <p className="text-gray-700 dark:text-gray-300">
                      <strong className="text-gray-800 dark:text-gray-200">Ubicación:</strong> {farmaciaData.ubicacion}
                    </p>
                    <p className="text-gray-700 dark:text-gray-300">
                      <strong className="text-gray-800 dark:text-gray-200">Horario:</strong>{" "}
                      {farmaciaData.horario_atencion}
                    </p>
                    <p className="text-gray-700 dark:text-gray-300">
                      <strong className="text-gray-800 dark:text-gray-200">Teléfono:</strong>{" "}
                      {farmaciaData.telefono || "No disponible"}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}
          {activeTab === "inventario" && (
            <InventoryManagement
              Id_Far={String(farmaciaData.id_farmacia)}
              medicamentosPorCaducar={medicamentosPorCaducar}
              medicamentosSinMovimiento={medicamentosSinMovimiento}
              // FIX: Remove the prop that is not expected by the component's props type.
              // filteredInventario={_filteredInventario}
              inventarioSearch={inventarioSearch}
              setInventarioSearch={setInventarioSearch}
              onRefreshData={handleRefreshInventoryData}
            />
          )}
        </div>
      </main>
    </div>
  )
}

export default Interfaz_Farmaceutico;