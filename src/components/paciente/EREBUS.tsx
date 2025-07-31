// src/components/paciente/EREBUS.tsx // Asumiendo ubicación dentro de paciente
import React, { useState, useRef, useCallback, useEffect } from 'react';
import { Mic, Square, Loader2, AlertCircle, Volume2, Play, Pause, BrainCircuit } from 'lucide-react'; // Iconos relevantes

// Interfaz para la respuesta esperada de la API
interface ApiResponse {
  responseText: string;
  audioBase64: string | null;
}

// Componente EREBUS
function EREBUS() {
  // --- Estados ---
  const [isRecording, setIsRecording] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isPlayingResponse, setIsPlayingResponse] = useState<boolean>(false); // Estado para controlar si el audio de respuesta está sonando
  const [responseText, setResponseText] = useState<string>('');
  const [error, setError] = useState<string | null>(null);

  // --- Refs ---
  const mediaRecorder = useRef<MediaRecorder | null>(null);
  const audioChunks = useRef<Blob[]>([]);
  const audioPlayer = useRef<HTMLAudioElement | null>(null); // Inicializar como null

  // --- Configuración de la API (URL Directa) ---
  // *** CAMBIO AQUÍ: URL hardcodeada usando HTTPS ***
  const API_ENDPOINT = 'https://erebus-production.up.railway.app'; // URL base (HTTPS!)
  const PROCESS_ENDPOINT = `${API_ENDPOINT}/process_audio/`; // Endpoint específico

  // --- Efecto para inicializar y limpiar Audio Player ---
  useEffect(() => {
    // Crear instancia de Audio al montar
    audioPlayer.current = new Audio();

    const player = audioPlayer.current; // Referencia local para limpieza

    // Manejar fin de reproducción
    const handleEnded = () => setIsPlayingResponse(false);
    player.addEventListener('ended', handleEnded);

    // Manejar errores de reproducción
    const handleError = (e: Event) => {
        console.error("Error en Audio Player:", e);
        setError("Error al reproducir la respuesta de audio.");
        setIsPlayingResponse(false);
    };
    player.addEventListener('error', handleError);

    // Limpieza al desmontar
    return () => {
      if (player) {
        player.removeEventListener('ended', handleEnded);
        player.removeEventListener('error', handleError);
        if (!player.paused) {
          player.pause();
        }
        player.src = ''; // Liberar recursos
      }
      audioPlayer.current = null; // Limpiar ref
    };
  }, []); // Se ejecuta solo una vez al montar

  // --- Funciones de Grabación ---
  const startRecording = useCallback(async () => {
    setError(null);
    setResponseText('');
    setIsPlayingResponse(false); // Detener reproducción si estaba sonando
    audioPlayer.current?.pause();

    // Limpiar grabación anterior
    if (mediaRecorder.current && mediaRecorder.current.state !== "inactive") {
        mediaRecorder.current.stop(); // Detener si estaba grabando o pausado
    }
    mediaRecorder.current = null;
    audioChunks.current = [];


    if (!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia)) {
      setError("La API de grabación no es soportada por este navegador.");
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      // Intentar con opciones comunes si es posible
      const options = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? { mimeType: 'audio/webm;codecs=opus' }
        : MediaRecorder.isTypeSupported('audio/ogg;codecs=opus')
        ? { mimeType: 'audio/ogg;codecs=opus' }
        : {}; // Usar default del navegador si no

      mediaRecorder.current = new MediaRecorder(stream, options);

      mediaRecorder.current.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunks.current.push(event.data);
        }
      };

      mediaRecorder.current.onstop = () => {
        if (audioChunks.current.length > 0) {
          const audioBlob = new Blob(audioChunks.current, { type: mediaRecorder.current?.mimeType || 'audio/webm' });
          sendAudioToApi(audioBlob); // Enviar al detener
        } else {
          console.warn("No se grabaron datos de audio.");
          setIsLoading(false); // Terminar carga si no hay chunks
          setError("No se detectó audio durante la grabación.");
        }
        // Detener tracks del stream para liberar micrófono
        stream.getTracks().forEach(track => track.stop());
      };

      mediaRecorder.current.onerror = (event) => {
        const specificError = (event as ErrorEvent).error; // Casting a ErrorEvent
        console.error("Error de MediaRecorder:", specificError);
        setError(`Error de grabación: ${specificError?.name || 'desconocido'}`);
        setIsRecording(false);
        setIsLoading(false);
        stream.getTracks().forEach(track => track.stop());
      }

      mediaRecorder.current.start();
      setIsRecording(true);

    } catch (err: any) { // Capturar error de getUserMedia
      console.error("Error al acceder al micrófono:", err);
      let userFriendlyError = "No se pudo acceder al micrófono.";
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
          userFriendlyError = "Permiso denegado para el micrófono. Revisa la configuración de tu navegador.";
      } else if (err.name === 'NotFoundError') {
          userFriendlyError = "No se encontró un dispositivo de micrófono.";
      }
      setError(userFriendlyError);
      setIsRecording(false);
    }
  }, [PROCESS_ENDPOINT]); // Dependencia del endpoint

  const stopRecording = useCallback(() => {
    if (mediaRecorder.current && mediaRecorder.current.state === "recording") {
      mediaRecorder.current.stop(); // Esto dispara onstop -> sendAudioToApi
      setIsRecording(false);
      setIsLoading(true); // Mostrar carga mientras se procesa
    }
  }, []); // Sin dependencias

  // --- Función para Enviar Audio a la API ---
  const sendAudioToApi = useCallback(async (audioBlob: Blob) => {
    console.log("Enviando audio a:", PROCESS_ENDPOINT);
    // No establecer isLoading aquí, ya se hizo en stopRecording
    const formData = new FormData();
    // Usar un nombre de archivo estándar, el backend debería manejarlo
    formData.append('file', audioBlob, 'audio_record.wav');

    try {
      const response = await fetch(PROCESS_ENDPOINT, {
        method: 'POST',
        body: formData,
        // Podrías añadir AbortController para timeouts largos si es necesario
      });

      // Manejo de errores HTTP más detallado
      if (!response.ok) {
        let errorDetail = `Error ${response.status}`;
        let errorTitle = response.statusText || "Error de Red";
        try {
          // Intentar parsear error JSON del backend (FastAPI a menudo usa 'detail')
          const errorJson = await response.json();
          errorDetail = errorJson.detail || errorJson.message || errorDetail;
        } catch (e) { /* No hacer nada si el cuerpo del error no es JSON */ }
        throw new Error(`${errorTitle}: ${errorDetail}`);
      }

      const data = await response.json() as ApiResponse;
      setResponseText(data.responseText || 'Respuesta recibida, pero sin texto.'); // Mensaje más claro

      // Manejo de Audio de Respuesta
      if (data.audioBase64 && audioPlayer.current) {
        const audioSrc = `data:audio/mpeg;base64,${data.audioBase64}`;
        audioPlayer.current.src = audioSrc;
        // Intentar reproducir
        audioPlayer.current.play()
          .then(() => {
            setIsPlayingResponse(true); // Éxito al iniciar reproducción
          })
          .catch(e => {
            console.error("Error al llamar a play():", e);
            setError("Error al iniciar audio. Haz clic en Play."); // Pedir interacción
            setIsPlayingResponse(false); // No se está reproduciendo
          });
      } else {
        console.warn("No se recibió audioBase64 en la respuesta.");
        setIsPlayingResponse(false); // Asegurar que no está en estado de reproducción
      }

    } catch (err: any) {
      console.error("Error en sendAudioToApi:", err);
      setError(err.message || "Error desconocido al procesar el audio."); // Mostrar mensaje del error
      setResponseText(''); // Limpiar texto en caso de error
      setIsPlayingResponse(false); // Asegurar que no está en estado de reproducción
    } finally {
      setIsLoading(false); // Quitar carga al final, sea éxito o error
    }
  }, [PROCESS_ENDPOINT]); // Dependencia correcta

  // --- Manejador del Botón Principal (Grabar/Detener) ---
  const handleRecordButtonClick = () => {
    // Detener reproducción de respuesta si está sonando
    if (isPlayingResponse && audioPlayer.current) {
      audioPlayer.current.pause();
      audioPlayer.current.currentTime = 0;
      setIsPlayingResponse(false);
    }

    if (isRecording) {
      stopRecording();
    } else {
      startRecording();
    }
  };

  // --- Manejador para Botón de Reproducción/Pausa de Respuesta ---
  const handlePlayPauseResponse = () => {
    if (!audioPlayer.current || !audioPlayer.current.src || audioPlayer.current.src.startsWith('data:application/octet-stream')) {
        setError("No hay audio de respuesta para reproducir.");
        return; // No hacer nada si no hay fuente válida
    }

    if (isPlayingResponse) {
      audioPlayer.current.pause();
      setIsPlayingResponse(false);
    } else {
      audioPlayer.current.play().catch(e => {
        console.error("Error al llamar a play() manualmente:", e);
        setError("No se pudo iniciar la reproducción.");
        setIsPlayingResponse(false);
      });
       setIsPlayingResponse(true); // Asumir que play() tuvo éxito inicialmente
    }
  };

  // --- Renderizado con Clases Tailwind (Rediseño) ---
  return (
    // Contenedor principal con mejor padding y sombra
    <div className="bg-white rounded-xl shadow-lg border border-gray-100 p-6 sm:p-8 max-w-3xl mx-auto my-6 flex flex-col">

      {/* Cabecera */}
      <div className="flex items-center justify-center gap-3 mb-6 text-center">
        <BrainCircuit className="h-8 w-8 text-primary" />
        <div>
            <h2 className="text-2xl font-bold text-gray-800">
            Asistente E.R.E.B.U.S.
            </h2>
            <p className="text-xs text-gray-500 -mt-0.5">Impulsado por Cynosure AI</p>
        </div>
      </div>

      {/* Controles Principales */}
      <div className="flex flex-col sm:flex-row items-center justify-center gap-4 my-4">
        {/* Botón Grabar/Detener */}
        <button
          onClick={handleRecordButtonClick}
          disabled={isLoading}
          className={`
            py-3 px-6 min-w-[180px] flex items-center justify-center gap-2.5
            rounded-full text-base font-semibold text-white shadow-md hover:shadow-lg
            transition-all duration-200 ease-in-out transform
            focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-white
            disabled:opacity-60 disabled:cursor-not-allowed disabled:shadow-md disabled:scale-100
            ${
              isRecording
                ? 'bg-red-600 hover:bg-red-700 focus:ring-red-500 active:bg-red-800'
                : 'bg-primary hover:bg-primary/90 focus:ring-primary active:bg-primary'
            }
            ${isLoading ? 'animate-pulse' : ''}
            active:scale-95
          `}
          aria-live="polite" // Anunciar cambios (grabando/no grabando)
        >
          {isLoading ? (
            <>
              <Loader2 className="animate-spin h-5 w-5" />
              <span>Procesando...</span>
            </>
          ) : isRecording ? (
            <>
              <Square className="h-5 w-5" />
              <span>Detener</span>
            </>
          ) : (
            <>
              <Mic className="h-5 w-5" />
              <span>Grabar</span>
            </>
          )}
        </button>

         {/* Botón Reproducir/Pausar Respuesta (solo si hay audio) */}
         {audioPlayer.current?.src && !audioPlayer.current.src.startsWith('data:application/octet-stream') && !isRecording && !isLoading && (
             <button
                 onClick={handlePlayPauseResponse}
                 className={`
                    p-3 flex items-center justify-center
                    rounded-full text-base font-medium shadow-md hover:shadow-lg
                    transition-all duration-200 ease-in-out transform
                    focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-white
                    ${ isPlayingResponse
                        ? 'bg-amber-500 hover:bg-amber-600 text-white focus:ring-amber-400 active:bg-amber-700'
                        : 'bg-gray-100 hover:bg-gray-200 text-gray-700 focus:ring-gray-400 active:bg-gray-300'
                    }
                    active:scale-95
                 `}
                 aria-label={isPlayingResponse ? 'Pausar respuesta' : 'Reproducir respuesta'}
             >
                {isPlayingResponse ? <Pause className="h-5 w-5" /> : <Play className="h-5 w-5" />}
             </button>
         )}
      </div>

       {/* Indicador de Grabación (Visual) */}
       {isRecording && (
           <div className="flex justify-center items-center gap-2 text-red-600 mb-4 -mt-1 animate-pulse">
               <div className="h-2 w-2 bg-red-600 rounded-full"></div>
               <span className="text-sm font-medium">Grabando...</span>
           </div>
       )}


      {/* Mensaje de Error */}
      {error && (
        <div
          role="alert"
          className="my-4 px-4 py-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm flex items-center gap-2 justify-center"
        >
          <AlertCircle className="h-5 w-5 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Área de Respuesta */}
      <div className="mt-6 w-full">
        <label htmlFor="responseTextOutput" className="block text-sm font-medium text-gray-700 mb-1.5">
          Respuesta de E.R.E.B.U.S.:
        </label>
        <textarea
          id="responseTextOutput"
          value={responseText}
          readOnly
          placeholder="La respuesta aparecerá aquí..."
          rows={8} // Altura inicial
          className="w-full p-3.5 text-sm bg-gray-50 border border-gray-300 rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition duration-150 text-gray-800 leading-relaxed shadow-inner min-h-[150px]"
          aria-live="polite" // Anunciar cambios en el texto
        />
      </div>
    </div>
  );
}

export default EREBUS;
