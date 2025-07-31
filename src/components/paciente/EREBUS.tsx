import React, { useState, useRef, useEffect } from 'react';
import imageCompression from 'browser-image-compression';

// --- Iconos ---
const CameraIcon = () => <svg xmlns="http://www.w3.org/2000/svg" className="w-6 h-6 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" /><path strokeLinecap="round" strokeLinejoin="round" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" /></svg>;
const UploadIcon = () => <svg xmlns="http://www.w3.org/2000/svg" className="w-6 h-6 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" /></svg>;
const AnalyzeIcon = () => <svg xmlns="http://www.w3.org/2000/svg" className="w-6 h-6 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>;
const CaptureIcon = () => <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" /><path strokeLinecap="round" strokeLinejoin="round" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" /></svg>;

// --- COMPONENTE RASTREADOR DE PROGRESO ---
const ProgressTracker = ({ steps, currentStep }: { steps: string[], currentStep: number }) => (
  <div className="w-full my-4">
    <ol className="flex items-center w-full">
      {steps.map((step, index) => {
        const stepIndex = index + 1;
        const isCompleted = currentStep > stepIndex;
        const isCurrent = currentStep === stepIndex;
        return (
          <li key={step} className={`flex w-full items-center ${stepIndex < steps.length ? "after:content-[''] after:w-full after:h-1 after:border-b after:border-gray-300 after:inline-block" : ""}`}>
            <span className={`flex items-center justify-center w-10 h-10 rounded-full shrink-0 transition-colors duration-300 ${isCompleted ? 'bg-blue-600 text-white' : isCurrent ? 'bg-blue-200 text-blue-800 animate-pulse' : 'bg-gray-200 text-gray-500'}`}>
              {isCompleted ? <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd"></path></svg> : <span className="font-bold">{stepIndex}</span>}
            </span>
            <span className={`ml-2 text-sm font-semibold hidden md:inline-block ${isCurrent || isCompleted ? 'text-gray-800' : 'text-gray-500'}`}>{step}</span>
          </li>
        );
      })}
    </ol>
  </div>
);


export default function EREBUS() {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);
  const progressSteps = ['Procesar', 'Analizar', 'Finalizado'];

  // --- ESTADOS Y REFERENCIAS PARA EL MODAL DE LA CÁMARA ---
  const [showCameraModal, setShowCameraModal] = useState(false);
  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // --- LÓGICA DE MANEJO DE ESTADO Y ARCHIVOS ---
  const resetState = () => {
    setError(null);
    setAudioUrl(null);
    setCurrentStep(0);
    if (imagePreview) {
      URL.revokeObjectURL(imagePreview);
      setImagePreview(null);
    }
    setSelectedFile(null);
  };

  const processAndSetFile = async (file: File) => {
    if (!file) return;
    resetState();
    setIsLoading(true);
    setCurrentStep(1);

    const options = { maxSizeMB: 1, maxWidthOrHeight: 1280, useWebWorker: true };
    try {
      const compressedFile = await imageCompression(file, options);
      setSelectedFile(compressedFile);
      setImagePreview(URL.createObjectURL(compressedFile));
    } catch (compressionError) {
      setError("Error al procesar la imagen.");
      setSelectedFile(file);
      setImagePreview(URL.createObjectURL(file));
    } finally {
      setIsLoading(false);
    }
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) processAndSetFile(file);
    event.target.value = '';
  };
  
  // --- LÓGICA DE LA CÁMARA ---
  const startCamera = async () => {
    resetState();
    setShowCameraModal(true);
    setCameraStream(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
      setCameraStream(stream);
    } catch (err) {
      setError("No se pudo acceder a la cámara. Asegúrate de tener permisos y estar en un sitio seguro (HTTPS).");
      setShowCameraModal(false);
    }
  };
  useEffect(() => { if (cameraStream && videoRef.current) videoRef.current.srcObject = cameraStream; }, [cameraStream]);
  const stopCamera = () => { if (cameraStream) cameraStream.getTracks().forEach(track => track.stop()); setCameraStream(null); setShowCameraModal(false); };
  const capturePhoto = () => {
    if (!videoRef.current || !canvasRef.current) return;
    const video = videoRef.current;
    const canvas = canvasRef.current;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext('2d')?.drawImage(video, 0, 0, video.videoWidth, video.videoHeight);
    canvas.toBlob((blob) => {
      if (blob) processAndSetFile(new File([blob], `capture-${Date.now()}.jpg`, { type: 'image/jpeg' }));
    }, 'image/jpeg', 0.95);
    stopCamera();
  };

  // --- LÓGICA DE ANÁLISIS ---
  const handleAnalyzeClick = async () => {
    if (!selectedFile) { setError("Por favor, toma o carga una foto primero."); return; }
    setIsLoading(true);
    setCurrentStep(2);
    setAudioUrl(null);
    setError(null);
    const formData = new FormData();
    formData.append('image', selectedFile);
    try {
      const response = await fetch('http://localhost:5000/api/analyze', { method: 'POST', body: formData });
      if (!response.ok) { const errorData = await response.json(); throw new Error(errorData.error || 'Error desconocido.'); }
      const audioBlob = await response.blob();
      const url = URL.createObjectURL(audioBlob);
      setAudioUrl(url);
      setCurrentStep(3);
    } catch (err: any) {
      setError(err.message || 'No se pudo conectar con el servidor.');
      setCurrentStep(0);
    } finally {
      setIsLoading(false);
    }
  };

  // --- EFECTO DE LIMPIEZA GENERAL ---
  useEffect(() => {
    return () => {
      if (audioUrl) URL.revokeObjectURL(audioUrl);
      if (imagePreview) URL.revokeObjectURL(imagePreview);
      if (cameraStream) cameraStream.getTracks().forEach(track => track.stop());
    };
  }, [audioUrl, imagePreview, cameraStream]);

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="w-full max-w-5xl bg-white rounded-2xl shadow-2xl p-6 md:p-8 grid md:grid-cols-2 md:gap-10">
        
        <canvas ref={canvasRef} className="hidden"></canvas>
        <input id="upload-input" type="file" onChange={handleFileChange} className="hidden" accept="image/*" />

        {/* --- COLUMNA DE CONTROLES (IZQUIERDA) --- */}
        <div className="flex flex-col">
          <h1 className="text-3xl md:text-4xl font-bold text-gray-800">EREBUS</h1>
          <p className="mt-2 text-gray-600 mb-6">Asistente Farmacéutico IA</p>

          <div className="space-y-4">
            <button onClick={startCamera} className="w-full flex items-center justify-center px-6 py-4 text-lg font-semibold text-white bg-gradient-to-r from-cyan-500 to-blue-500 rounded-xl shadow-lg cursor-pointer transform hover:scale-105 transition-transform duration-300">
              <CameraIcon /> Tomar Foto
            </button>
            <label htmlFor="upload-input" className="w-full flex items-center justify-center px-6 py-4 text-lg font-semibold text-gray-700 bg-gray-100 border border-gray-300 rounded-xl shadow-sm cursor-pointer transform hover:scale-105 transition-transform duration-300">
              <UploadIcon /> Cargar Foto
            </label>
          </div>

          <div className="border-t my-6"></div>
          
          <button onClick={handleAnalyzeClick} disabled={!selectedFile || isLoading} className="w-full flex items-center justify-center px-6 py-4 text-lg font-bold text-white bg-gradient-to-r from-teal-500 to-green-500 rounded-xl shadow-lg disabled:opacity-50 disabled:cursor-not-allowed disabled:from-gray-400 disabled:to-gray-500 disabled:scale-100 transform hover:scale-105 transition-transform duration-300">
            <AnalyzeIcon /> Analizar
          </button>
        </div>

        {/* --- COLUMNA DE VISUALIZACIÓN (DERECHA) --- */}
        <div className="flex flex-col items-center justify-center mt-6 md:mt-0 p-6 bg-slate-100 rounded-xl border-2 border-dashed border-slate-300 min-h-[350px]">
          {!selectedFile && !isLoading && !error && (
            <div className="text-center text-slate-500">
              <svg className="mx-auto h-12 w-12" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
              <p className="mt-2 font-semibold">Esperando imagen</p>
              <p className="text-sm">Toma una foto o cárgala para comenzar.</p>
            </div>
          )}
          {imagePreview && (
            <img src={imagePreview} alt="Vista previa" className="max-h-52 w-auto object-contain rounded-lg shadow-lg mb-4" />
          )}
          {(currentStep > 1 || audioUrl) && (
            <div className="w-full">
              <ProgressTracker steps={progressSteps} currentStep={currentStep} />
            </div>
          )}
          {audioUrl && (
            <div className="w-full mt-4">
              <audio src={audioUrl} controls autoPlay className="w-full" />
            </div>
          )}
          {error && <p className="mt-4 font-semibold text-red-600 animate-shake">Error: {error}</p>}
        </div>

        {/* --- MODAL DE LA CÁMARA (MODIFICADO) --- */}
        {showCameraModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-75 p-4 backdrop-blur-sm">
             {/* --- MODIFICACIÓN: Contenedor del modal más compacto (max-w-md) --- */}
             <div className="bg-white p-5 rounded-2xl shadow-xl max-w-md w-full mx-auto border border-gray-200">
                 <h3 className="text-xl font-semibold text-gray-900 mb-4 text-center">Apunte al medicamento</h3>
                 {/* --- MODIFICACIÓN: Vista previa cuadrada (aspect-square), más compacta --- */}
                 <div className="relative w-full aspect-square bg-gray-900 rounded-xl overflow-hidden mb-5 border-2 border-gray-300">
                     <video ref={videoRef} playsInline autoPlay muted className="absolute inset-0 w-full h-full object-cover"></video>
                     {!cameraStream && <div className="absolute inset-0 flex items-center justify-center text-white bg-gray-800/50"><p>Iniciando cámara...</p></div>}
                 </div>
                 <div className="flex justify-center gap-4">
                     <button onClick={capturePhoto} disabled={!cameraStream} className="p-4 rounded-full text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 transition-all transform hover:scale-110"><CaptureIcon /></button>
                     <button onClick={stopCamera} className="px-6 py-3 rounded-full text-gray-700 bg-gray-200 hover:bg-gray-300 transition-colors">Cancelar</button>
                 </div>
             </div>
         </div>
        )}
      </div>
    </div>
  );
}
