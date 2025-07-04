import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Home, Calendar as CalendarIcon, Package2, FileText, Clock, Sunrise, Menu, X, User,
   Sun, Cloud, CloudFog, CloudDrizzle, CloudLightning, Snowflake,
  AlertTriangle, CloudRain, Camera, UploadCloud, CheckCircle, Loader2, QrCode
} from 'lucide-react';
import Barcode from 'react-barcode';
import ContentPanel from '../components/paciente/ContentPanel';
import supabase from '../lib/supabaseClient';
import toast from 'react-hot-toast';
import axios from 'axios';
import { FloatingRadialNav } from '../components/paciente/FloatingRadialNav';

// --- Interfaces ---
interface LinkFaceResponse { success: boolean; message: string; }

// --- Helper: Convierte Data URL (Base64) a Blob ---
function dataURLtoBlob(dataurl: string): Blob | null {
    try {
        const arr = dataurl.split(',');
        if (arr.length < 2) return null;
        const mimeMatch = arr[0].match(/:(.*?);/);
        if (!mimeMatch || mimeMatch.length < 2) return null;
        const mime = mimeMatch[1];
        const bstr = atob(arr[1]);
        let n = bstr.length;
        const u8arr = new Uint8Array(n);
        while(n--){ u8arr[n] = bstr.charCodeAt(n); }
        return new Blob([u8arr], {type:mime});
    } catch (e) { console.error("Error converting data URL to Blob:", e); return null; }
}

// --- Componente Principal Paciente_Interfaz ---
const Paciente_Interfaz: React.FC = () => {
  // --- Estados Generales ---
  const [currentView, setCurrentView] = useState<string>('home');
  const [patientData, setPatientData] = useState<any>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [loyaltyCode, setLoyaltyCode] = useState<string>('');
  const [showBarcode, setShowBarcode] = useState(false);
  const [isGeneratingCode, setIsGeneratingCode] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [appointments, setAppointments] = useState<any[]>([]);
  const [loadingAppointments, setLoadingAppointments] = useState(true);
  const [user, setUser] = useState<any>(null);
  const [showPatientForm, setShowPatientForm] = useState(false);
  const [formData, setFormData] = useState({ name: '', date_of_birth: '', gender: '', phone: '', blood_type: '', allergies: '' });

  // --- Estados Cámara ---
  const [showFacialRegistrationModal, setShowFacialRegistrationModal] = useState(false);
  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null);
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);
  const [isRegisteringFace, setIsRegisteringFace] = useState(false);
  const [cameraPurpose, setCameraPurpose] = useState<'profile' | 'facial_registration' | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // --- Estado Clima ---
  const [weatherData, setWeatherData] = useState<{ temp: number | null; condition: string; location: string; day: string; icon: React.ReactElement; }>({ temp: null, condition: 'Cargando...', location: 'Obteniendo ubicación...', day: new Date().toLocaleDateString('es-ES', { weekday: 'long' }), icon: <Cloud className="h-5 w-5 text-white" /> });
  const [loadingWeather, setLoadingWeather] = useState(true);

  // --- Estado para el registro facial ---
  const [hasFacialRegistration, setHasFacialRegistration] = useState(false);
  const [isLoadingRegistrationStatus, setIsLoadingRegistrationStatus] = useState(true);

  // --- Variables de Entorno ---
  const faceApiBaseUrl = import.meta.env.VITE_FACE_API_URL ;

  // --- Función para Obtener Citas ---
  const fetchAppointments = useCallback(async (patientId: string | null = null) => {
       const idToFetch = patientId || patientData?.id;
       if (!idToFetch) {
           console.log("[Appointments] No patient ID found, skipping fetch.");
           setLoadingAppointments(false);
           return;
       }
       setLoadingAppointments(true);
       try {
           const { data, error } = await supabase
               .from('citas')
               .select(`
                   id, dia_atencion, horario_cita, status, motivo_cita,
                   doctor:trabajadores(nombre)
               `)
               .eq('id_usuario', idToFetch)
               .gte('dia_atencion', new Date().toISOString().split('T')[0])
               .order('dia_atencion', { ascending: true })
               .order('horario_cita', { ascending: true });

           if (error) throw error;

           const processedAppointments = data?.map(appt => {
               const timeString = appt.horario_cita ? appt.horario_cita.split('T')[1]?.split('.')[0] || null : null;
               const doctorObject = Array.isArray(appt.doctor) ? appt.doctor[0] : appt.doctor;
               return {
                   ...appt,
                   appointment_date: appt.dia_atencion,
                   appointment_time: timeString,
                   doctor_name: doctorObject?.nombre || 'Dr. No asignado'
               };
           }) || [];

           setAppointments(processedAppointments);

       } catch (fetchError: any) {
           console.error('[Appointments] Error loading appointments:', fetchError);
           toast.error('Error al cargar las citas. Revisa la consola para detalles.');
       } finally {
           setLoadingAppointments(false);
       }
  }, [patientData?.id]);

  // --- Función para comprobar el estado del registro facial (DESDE LA DB) ---
  const checkFacialRegistrationStatus = useCallback(async (patientId: string | null) => {
    if (!patientId) {
        setHasFacialRegistration(false);
        setIsLoadingRegistrationStatus(false);
        return;
    }
    setIsLoadingRegistrationStatus(true);
    try {
        const { data, error } = await supabase
            .from('patients')
            .select('has_facial_registration')
            .eq('id', patientId)
            .single();
        if (error) throw error;
        setHasFacialRegistration(data?.has_facial_registration ?? false);
    } catch (dbError: any) {
        toast.error(`Error al verificar registro facial: ${dbError.message}`);
        setHasFacialRegistration(false);
    } finally {
        setIsLoadingRegistrationStatus(false);
    }
  }, []);

  // --- Efecto para Autenticación y Carga Inicial ---
  useEffect(() => {
    const checkAuthAndPatientData = async () => {
        setLoading(true); setError(null);
        try {
            const { data: { user: authUser }, error: authError } = await supabase.auth.getUser();
            if (authError || !authUser) {
                toast.error('Sesión no válida. Redirigiendo a login...');
                setTimeout(() => { window.location.href = '/login'; }, 1500);
                return;
            }
            setUser(authUser);
            const { data: patient, error: patientError } = await supabase.from('patients').select('*').eq('user_id', authUser.id).maybeSingle();
            if (patientError) { throw new Error("Error al obtener perfil del paciente."); }
            if (!patient) {
                setShowPatientForm(true);
            } else {
                setPatientData(patient);
                setLoyaltyCode(patient.surecode || '');
                setShowPatientForm(false);
                fetchAppointments(patient.id);
                await checkFacialRegistrationStatus(patient.id);
            }
        } catch (err: any) {
            setError(err.message || 'Ocurrió un error inesperado.');
        } finally {
            setLoading(false);
        }
    };
    checkAuthAndPatientData();
  }, [fetchAppointments, checkFacialRegistrationStatus]);

  // --- Manejo de Cambios en Formularios ---
  const handleFormChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
     const { name, value } = e.target;
     setFormData(prev => ({ ...prev, [name]: value }));
  };

  // --- Funciones de Cámara ---
  const startCameraGeneric = async (modalToShow: 'profile' | 'facial_registration') => {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) { toast.error("La cámara no es soportada por este navegador."); return; }
    setCapturedImage(null); setCameraStream(null); setCameraPurpose(modalToShow);
    setShowFacialRegistrationModal(true);
    try {
      const constraints = { video: { facingMode: 'user', width: { ideal: 720 }, height: { ideal: 1280 } }, audio: false };
      const mediaStream = await navigator.mediaDevices.getUserMedia(constraints);
      setCameraStream(mediaStream);
    } catch (err: any) {
      let errorMsg = `Error de cámara (${err.name}).`;
      if (err.name === "NotAllowedError") errorMsg = "Permiso de cámara denegado.";
      else if (err.name === "NotFoundError") errorMsg = "No se encontró cámara.";
      else if (err.name === "NotReadableError") errorMsg = "Cámara ocupada.";
      toast.error(errorMsg);
      stopCamera();
    }
  };

  const stopCamera = useCallback(() => {
    if (cameraStream) { cameraStream.getTracks().forEach(track => track.stop()); }
    setCameraStream(null);
    setShowFacialRegistrationModal(false);
    // Don't clear the image when stopping the camera from the profile form
    if (cameraPurpose !== 'profile') {
        setCapturedImage(null);
    }
    setCameraPurpose(null);
  }, [cameraStream, cameraPurpose]);

  const capturePhoto = () => {
    if (!videoRef.current || !canvasRef.current) return;
    const video = videoRef.current; const canvas = canvasRef.current; const context = canvas.getContext('2d');
    if (!context) return;
    canvas.width = video.videoWidth; canvas.height = video.videoHeight;
    context.translate(canvas.width, 0); context.scale(-1, 1);
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    context.setTransform(1, 0, 0, 1, 0, 0);
    const dataUrl = canvas.toDataURL('image/jpeg', 0.9);

    setCapturedImage(dataUrl);

    if (cameraPurpose === 'profile') {
        // Manually close modal to preserve image data
        if (cameraStream) { cameraStream.getTracks().forEach(track => track.stop()); }
        setCameraStream(null);
        setShowFacialRegistrationModal(false);
        setCameraPurpose(null);
    } else if (cameraPurpose === 'facial_registration') {
        handleFacialRegistrationSubmit(dataUrl);
    }
  };

  useEffect(() => {
    if (cameraStream && videoRef.current) videoRef.current.srcObject = cameraStream;
    return () => { if (cameraStream) cameraStream.getTracks().forEach(track => track.stop()); };
  }, [cameraStream]);

  async function uploadPhoto(imageDataUrl: string): Promise<string | null> {
    if (!user) { toast.error("Usuario no autenticado."); return null; }
    const blob = dataURLtoBlob(imageDataUrl);
    if (!blob) { toast.error("Error al procesar la imagen."); return null; }
    setIsUploadingPhoto(true);
    try {
        const filePath = `patient-photos/${user.id}-${Date.now()}.jpeg`;
        const { error: uploadError } = await supabase.storage.from('patient-photos').upload(filePath, blob, { upsert: true });
        if (uploadError) throw uploadError;
        const { data } = supabase.storage.from('patient-photos').getPublicUrl(filePath);
        if (!data.publicUrl) throw new Error("No se pudo obtener la URL pública.");
        toast.success("Foto de perfil subida.");
        return data.publicUrl;
    } catch (error: any) {
        toast.error(`Error al subir foto: ${error.message || 'Error desconocido.'}`);
        return null;
    } finally {
        setIsUploadingPhoto(false);
    }
  }

  const handleFacialRegistrationSubmit = async (imageDataUrl: string | null) => {
      if (!imageDataUrl || !patientData?.surecode || !faceApiBaseUrl) {
          toast.error("Faltan datos para el registro facial (imagen, Surecode o URL de API).");
          stopCamera();
          return;
      }
      const blob = dataURLtoBlob(imageDataUrl);
      if (!blob) { toast.error("Error al procesar la imagen capturada."); stopCamera(); return; }
      setIsRegisteringFace(true);
      const formData = new FormData();
      formData.append('surecode', patientData.surecode);
      formData.append('image', blob, `facial_registration.jpg`);
      const apiUrl = `${faceApiBaseUrl}/register`;
      try {
          const response = await axios.post<LinkFaceResponse>(apiUrl, formData);
          if (response.data.success) {
              toast.success(response.data.message || "Registro facial exitoso!");
              await updateFacialRegistrationStatusInDB(patientData.id, true);
          } else {
              throw new Error(response.data.message || "Fallo en el registro facial.");
          }
      } catch (error: any) {
          const errorMessage = error.response?.data?.detail || error.message || "Error desconocido.";
          toast.error(`Error en registro facial: ${errorMessage}`);
      } finally {
          setIsRegisteringFace(false);
          stopCamera();
      }
  };

  const updateFacialRegistrationStatusInDB = async (patientId: string, status: boolean) => {
      try {
          const { error } = await supabase.from('patients').update({ has_facial_registration: status }).eq('id', patientId);
          if (error) throw error;
          setHasFacialRegistration(status);
      } catch (updateError: any) {
          toast.error(`Error al actualizar estado facial: ${updateError.message}`);
      }
  };

  const handleFormSubmit = async (e: React.FormEvent) => {
      e.preventDefault();
      if (!user) { toast.error("Usuario no disponible."); return; }
      let photoUrl: string | null = null;
      if (capturedImage) photoUrl = await uploadPhoto(capturedImage);
      try {
          const { data: newPatient, error } = await supabase.from('patients').insert({
              user_id: user.id, email: user.email, name: formData.name, date_of_birth: formData.date_of_birth || null,
              gender: formData.gender || null, phone: formData.phone || null, blood_type: formData.blood_type || null,
              allergies: formData.allergies || null, Foto_paciente: photoUrl, has_facial_registration: false
          }).select().single();
          if (error) throw error;
          setPatientData(newPatient);
          setShowPatientForm(false);
          toast.success('¡Perfil guardado con éxito!');
          fetchAppointments(newPatient.id);
      } catch (err: any) {
          toast.error(`Error al guardar perfil: ${err.message || 'Inténtelo de nuevo.'}`);
      }
  };

  const generateLoyaltyCode = async () => {
       if (!patientData?.id) { toast.error('Datos del paciente no cargados.'); return; }
       setIsGeneratingCode(true);
       try {
           const code = Math.random().toString(36).substring(2, 10).toUpperCase();
           const { error } = await supabase.from('patients').update({ surecode: code }).eq('id', patientData.id);
           if (error) throw error;
           setLoyaltyCode(code);
           setPatientData((prev: any) => ({ ...prev, surecode: code }));
           toast.success('¡Código generado!');
       } catch (err: any) {
           toast.error(`Error al generar código: ${err.message || 'Inténtelo de nuevo.'}`);
       } finally {
           setIsGeneratingCode(false);
       }
  };

  useEffect(() => {
    const fetchWeather = async () => {
        setLoadingWeather(true);
        try {
            if (!navigator.geolocation) {
                throw new Error("Geolocalización no soportada.");
            }
            navigator.geolocation.getCurrentPosition(async (position) => {
                const { latitude, longitude } = position.coords;
                const openMeteoApiEndpoint = import.meta.env.VITE_OPEN_METEO_API;
                if (!openMeteoApiEndpoint) {
                    throw new Error("Configuración API del clima incorrecta.");
                }
                const weatherApiUrl = `${openMeteoApiEndpoint}?latitude=${latitude}&longitude=${longitude}¤t_weather=true&timezone=auto`;
                const response = await fetch(weatherApiUrl);
                if (!response.ok) throw new Error(`Error en la API del clima: ${response.statusText}`);
                const data = await response.json();
                if (!data.current_weather) throw new Error("Datos del clima inválidos.");
                const { temperature, weathercode } = data.current_weather;
                const getWeatherDetails = (code: number): { condition: string; icon: React.ReactElement } => {
                    const conditions: { [key: number]: { condition: string; icon: React.ReactElement } } = {
                        0: { condition: 'Despejado', icon: <Sun className="h-5 w-5 text-white" /> },
                        1: { condition: 'Mayormente despejado', icon: <Sun className="h-5 w-5 text-white" /> },
                        2: { condition: 'Parcialmente nublado', icon: <Cloud className="h-5 w-5 text-white" /> },
                        3: { condition: 'Nublado', icon: <Cloud className="h-5 w-5 text-white" /> },
                        45: { condition: 'Niebla', icon: <CloudFog className="h-5 w-5 text-white" /> },
                        48: { condition: 'Niebla engelante', icon: <CloudFog className="h-5 w-5 text-white" /> },
                        51: { condition: 'Llovizna ligera', icon: <CloudDrizzle className="h-5 w-5 text-white" /> },
                        53: { condition: 'Llovizna moderada', icon: <CloudDrizzle className="h-5 w-5 text-white" /> },
                        55: { condition: 'Llovizna densa', icon: <CloudRain className="h-5 w-5 text-white" /> },
                        61: { condition: 'Lluvia ligera', icon: <CloudRain className="h-5 w-5 text-white" /> },
                        63: { condition: 'Lluvia moderada', icon: <CloudRain className="h-5 w-5 text-white" /> },
                        65: { condition: 'Lluvia fuerte', icon: <CloudRain className="h-5 w-5 text-white" /> },
                        71: { condition: 'Nieve ligera', icon: <Snowflake className="h-5 w-5 text-white" /> },
                        73: { condition: 'Nieve moderada', icon: <Snowflake className="h-5 w-5 text-white" /> },
                        75: { condition: 'Nieve fuerte', icon: <Snowflake className="h-5 w-5 text-white" /> },
                        80: { condition: 'Chubascos ligeros', icon: <CloudRain className="h-5 w-5 text-white" /> },
                        81: { condition: 'Chubascos moderados', icon: <CloudRain className="h-5 w-5 text-white" /> },
                        82: { condition: 'Chubascos violentos', icon: <CloudRain className="h-5 w-5 text-white" /> },
                        95: { condition: 'Tormenta', icon: <CloudLightning className="h-5 w-5 text-white" /> },
                        96: { condition: 'Tormenta c/ granizo ligero', icon: <CloudLightning className="h-5 w-5 text-white" /> },
                        99: { condition: 'Tormenta c/ granizo fuerte', icon: <CloudLightning className="h-5 w-5 text-white" /> },
                    };
                    return conditions[code] ?? { condition: 'No disponible', icon: <Cloud className="h-5 w-5 text-white" /> };
                };
                const details = getWeatherDetails(weathercode);
                setWeatherData({
                    temp: Math.round(temperature),
                    condition: details.condition,
                    icon: details.icon,
                    location: 'Tu ubicación',
                    day: new Date().toLocaleDateString('es-ES', { weekday: 'long' })
                });
            }, (geoError) => {
                throw new Error(`Error de geolocalización: ${geoError.message}`);
            });
        } catch (err: any) {
            setWeatherData(prev => ({ ...prev, temp: null, condition: err.message, location: 'Desconocida', icon: <AlertTriangle className="h-5 w-5 text-white" /> }));
        } finally {
            setLoadingWeather(false);
        }
    };
    fetchWeather();
  }, []);

  const handleViewChange = (view: string) => {
    setCurrentView(view);
    setMobileMenuOpen(false);
  };

  const handleLogout = async () => {
      const { error } = await supabase.auth.signOut();
      if (error) toast.error("Error al cerrar sesión.");
      else {
          toast.success("Cerrando sesión...");
          setTimeout(() => { window.location.href = '/login'; }, 1000);
      }
  };

  const toggleMobileMenu = () => setMobileMenuOpen(prev => !prev);

  const formatDate = (dateString: string | null | undefined): string => {
      if (!dateString) return 'No programada';
      try {
          const date = new Date(dateString.includes('T') ? dateString : `${dateString}T00:00:00`);
          if (isNaN(date.getTime())) return 'Fecha inválida';
          return date.toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' });
      } catch (e) { return 'Error fecha'; }
  };
  const formatTime = (timeString: string | null | undefined): string => {
      if (!timeString) return '--:--';
      try {
          const timeParts = timeString.split(':');
          if (timeParts.length >= 2) {
              const hours = parseInt(timeParts[0], 10);
              const minutes = parseInt(timeParts[1], 10);
              if (!isNaN(hours) && !isNaN(minutes)) {
                  return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
              }
          }
          return timeString;
      } catch(e) { return timeString; }
  };

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center bg-gray-100 dark:bg-gray-900"><div className="animate-spin rounded-full h-16 w-16 border-t-4 border-b-4 border-primary dark:border-primary-400"></div></div>;
  }
  if (error) {
    return <div className="min-h-screen flex flex-col items-center justify-center bg-red-50 p-4 text-center dark:bg-red-900/30"><AlertTriangle className="h-12 w-12 text-red-500 mb-4 dark:text-red-400" /><h2 className="text-xl font-semibold text-red-700 mb-2 dark:text-red-300">Ocurrió un Error</h2><p className="text-red-600 mb-6 dark:text-red-400">{error}</p><button onClick={() => window.location.reload()} className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 dark:bg-red-700 dark:hover:bg-red-800">Intentar de Nuevo</button></div>;
  }
  
  // ==================================================================
  // ========= START: RESTRUCTURING THE RENDER LOGIC ==================
  // ==================================================================
  return (
    <>
      {showPatientForm ? (
        <div className="min-h-screen bg-gradient-to-br from-primary/5 via-white to-accent/5 p-4 dark:from-primary/10 dark:to-gray-800 flex items-center justify-center">
            <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl p-8 max-w-lg w-full border border-gray-100 dark:border-gray-700">
                <h2 className="text-2xl font-bold text-gray-800 dark:text-white mb-6 text-center">Completa tu Perfil</h2>
                <form onSubmit={handleFormSubmit} className="space-y-5">
                    <div><label htmlFor="name" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Nombre completo*</label><input id="name" type="text" name="name" value={formData.name} onChange={handleFormChange} required className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-colors dark:bg-gray-700 dark:border-gray-600 dark:text-white dark:focus:ring-primary-400" placeholder="Ej: Ana García López"/></div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                        <div><label htmlFor="date_of_birth" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Fecha de nacimiento</label><div className="relative"><input id="date_of_birth" type="text" onFocus={(e) => e.target.type='date'} onBlur={(e) => e.target.type='text'} name="date_of_birth" value={formData.date_of_birth} onChange={handleFormChange} className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-colors dark:bg-gray-700 dark:border-gray-600 dark:text-white dark:focus:ring-primary-400" max={new Date().toISOString().split("T")[0]} placeholder="dd/mm/aaaa" /><CalendarIcon className="absolute right-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400 pointer-events-none" /></div></div>
                        <div><label htmlFor="gender" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Género</label><select id="gender" name="gender" value={formData.gender} onChange={handleFormChange} className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-colors bg-white dark:bg-gray-700 dark:border-gray-600 dark:text-white dark:focus:ring-primary-400 appearance-none"><option value="">Seleccionar...</option><option value="Masculino">Masculino</option><option value="Femenino">Femenino</option><option value="Otro">Otro</option><option value="Prefiero no decir">Prefiero no decir</option></select></div>
                    </div>
                    <div><label htmlFor="phone" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Teléfono</label><input id="phone" type="tel" name="phone" value={formData.phone} onChange={handleFormChange} className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-colors dark:bg-gray-700 dark:border-gray-600 dark:text-white dark:focus:ring-primary-400" placeholder="Ej: 55 1234 5678"/></div>
                    <div> <label htmlFor="blood_type" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Tipo de sangre</label> <select id="blood_type" name="blood_type" value={formData.blood_type} onChange={handleFormChange} className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-colors bg-white dark:bg-gray-700 dark:border-gray-600 dark:text-white dark:focus:ring-primary-400 appearance-none"> <option value="">Seleccionar...</option> <option value="A+">A+</option> <option value="A-">A-</option> <option value="AB+">AB+</option> <option value="AB-">AB-</option> <option value="B+">B+</option> <option value="B-">B-</option> <option value="O+">O+</option> <option value="O-">O-</option>  </select> </div>
                    <div> <label htmlFor="allergies" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Alergias conocidas</label> <textarea id="allergies" name="allergies" value={formData.allergies} onChange={handleFormChange} rows={3} className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-colors dark:bg-gray-700 dark:border-gray-600 dark:text-white dark:focus:ring-primary-400" placeholder="Ej: Penicilina, Cacahuetes, Polvo..." /> </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Foto de perfil (Opcional)</label>
                        <div className="mt-1 flex items-center space-x-4">
                            {capturedImage ? <img src={capturedImage} alt="Foto Capturada" className="h-20 w-20 rounded-full object-cover border-2 border-primary shadow-sm dark:border-primary-400" /> : <span className="inline-block h-20 w-20 rounded-full overflow-hidden bg-gray-100 dark:bg-gray-700 flex items-center justify-center border dark:border-gray-600"><User className="h-12 w-12 text-gray-300 dark:text-gray-400" /></span>}
                            <button type="button" onClick={() => startCameraGeneric('profile')} className="ml-5 bg-white py-2 px-3 border border-gray-300 rounded-md shadow-sm text-sm leading-4 font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary dark:bg-gray-700 dark:border-gray-600 dark:text-white dark:hover:bg-gray-600 transition-colors flex items-center gap-1.5"><Camera className="h-4 w-4" /> {capturedImage ? 'Tomar Otra' : 'Tomar Foto'}</button>
                        </div>
                        {isUploadingPhoto && <div className="mt-2 flex items-center text-sm text-gray-500 dark:text-gray-400"><UploadCloud className="animate-pulse h-4 w-4 mr-1 text-primary dark:text-primary-400" /> Subiendo foto...</div>}
                    </div>
                    <div className="pt-4"><button type="submit" disabled={isUploadingPhoto} className="w-full bg-primary text-white py-3 px-4 rounded-lg hover:bg-primary/90 transition-colors focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 font-semibold text-lg shadow-md hover:shadow-lg disabled:opacity-70 disabled:cursor-not-allowed dark:bg-primary-600 dark:hover:bg-primary-700">{isUploadingPhoto ? 'Guardando...' : 'Guardar y Continuar'}</button></div>
                </form>
            </div>
        </div>
      ) : (
        <div className="min-h-screen flex flex-col bg-gray-100 dark:bg-gray-900">
          <header className="bg-white dark:bg-gray-800 shadow-sm sticky top-0 z-30 border-b border-gray-200 dark:border-gray-700">
              <div className="max-w-screen-xl mx-auto px-4 sm:px-6 lg:px-8 py-3 flex justify-between items-center">
                  <div className="flex items-center gap-3"><img src="/logo.png" alt="Carelux Logo" className="h-10 w-auto"/></div>
                  <div className="flex items-center">
                      <button onClick={handleLogout} className="flex items-center justify-center gap-2 px-4 py-2 h-[36px] rounded-full bg-[#ff362b34] hover:bg-[#ff362b52] transition-colors" aria-label="Cerrar Sesión"><span className="text-[#ff342b] text-sm font-medium tracking-wide">Cerrar sesión</span><svg className="w-5 h-5 text-[#ff342b]" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M15 12H3m0 0l4-4m-4 4l4 4m10 4h2a2 2 0 002-2V6a2 2 0 00-2-2h-2"/></svg></button>
                      <button className="p-2 rounded-md text-gray-600 hover:text-primary hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-primary lg:hidden dark:text-gray-300 dark:hover:bg-gray-700 dark:hover:text-primary-400" onClick={toggleMobileMenu} aria-label="Abrir menú"><Menu className="h-6 w-6" /></button>
                  </div>
              </div>
          </header>
          <main className="flex-1 pt-6 pb-24 lg:pb-8">
            <div className="max-w-screen-xl mx-auto px-4 sm:px-6 lg:px-8">
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-8">
                 <aside className="lg:col-span-3 xl:col-span-2 hidden lg:block">
                    <div className="sticky top-20 bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-4 space-y-1.5">{[{ view: 'home', label: 'Inicio', icon: Home }, { view: 'appointments', label: 'Calendario', icon: CalendarIcon }, { view: 'medications', label: 'Recetas', icon: FileText }, { view: 'EREBUS', label: 'EREBUS', icon: FileText }, { view: 'pharmacies', label: 'Farmacias', icon: Package2 }, { view: 'profile', label: 'Perfil', icon: User }].map(item => (<button key={item.view} className={`w-full flex items-center space-x-3 p-3 text-sm rounded-lg transition-colors duration-150 ${currentView === item.view ? 'bg-primary/10 text-primary font-semibold dark:bg-primary-700/30 dark:text-primary-400' : 'text-gray-600 hover:bg-gray-100 hover:text-gray-800 dark:text-gray-300 dark:hover:bg-gray-700 dark:hover:text-white'}`} onClick={() => handleViewChange(item.view)}><item.icon className="h-5 w-5 flex-shrink-0 text-gray-500 dark:text-gray-400 group-hover:text-gray-700 dark:group-hover:text-white" /><span>{item.label}</span></button>))}</div>
                </aside>
                {mobileMenuOpen && ( <> <div className="fixed inset-0 z-30 bg-black/40 backdrop-blur-sm lg:hidden" onClick={toggleMobileMenu} aria-hidden="true"></div><div className="fixed inset-y-0 left-0 max-w-xs w-full bg-white dark:bg-gray-800 shadow-xl z-40 lg:hidden flex flex-col"><div className="p-4 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between"><div className="flex items-center gap-2"><img src="/logo.png" alt="Logo" className="h-8 w-auto"/><span className="text-lg font-semibold text-gray-800 dark:text-white">Menú</span></div><button className="p-2 -mr-2 rounded-md text-gray-500 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700" onClick={toggleMobileMenu} aria-label="Cerrar menú"><X className="h-6 w-6" /></button></div><nav className="flex-1 px-3 py-4 space-y-1.5 overflow-y-auto">{[{ view: 'home', label: 'Inicio', icon: Home }, { view: 'appointments', label: 'Calendario', icon: CalendarIcon }, { view: 'medications', label: 'Recetas', icon: FileText }, { view: 'EREBUS', label: 'EREBUS', icon: FileText }, { view: 'pharmacies', label: 'Farmacias', icon: Package2 }, { view: 'profile', label: 'Perfil', icon: User }].map(item => (<button key={item.view} className={`w-full flex items-center space-x-3 p-3 text-sm rounded-lg transition-colors duration-150 ${currentView === item.view ? 'bg-primary/10 text-primary font-semibold dark:bg-primary-700/30 dark:text-primary-400' : 'text-gray-600 hover:bg-gray-100 hover:text-gray-800 dark:text-gray-300 dark:hover:bg-gray-700 dark:hover:text-white'}`} onClick={() => handleViewChange(item.view)}><item.icon className="h-5 w-5 flex-shrink-0 text-gray-500 dark:text-gray-400 group-hover:text-gray-700 dark:group-hover:text-white" /><span>{item.label}</span></button>))}</nav></div></>)}
                <div className="lg:hidden"><FloatingRadialNav currentView={currentView} onChange={handleViewChange}/></div>
                <div className="lg:col-span-9 xl:col-span-10 space-y-6">
                  {currentView === 'home' && (
                      <>
                       <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
                        <div className="bg-gradient-to-br from-primary to-blue-600 rounded-xl shadow-lg p-5 text-white"><div className="flex justify-between items-start mb-3"><div><p className="text-sm font-medium opacity-90">Hola de nuevo,</p><h2 className="text-2xl font-bold truncate dark:text-white"> {patientData?.name ?? 'Paciente'} </h2><p className="text-xs opacity-80 mt-1 flex items-center gap-1.5"><Clock className="h-3.5 w-3.5" />{new Date().toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}</p></div><div className="flex-shrink-0 h-11 w-11 bg-white/20 rounded-full flex items-center justify-center ring-2 ring-white/30"><Sunrise className="h-6 w-6" /></div></div><p className="text-xs opacity-90 mt-2">¡Que tengas un excelente día!</p></div>
                        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-5 cursor-pointer hover:shadow-md transition-shadow group" onClick={() => handleViewChange('appointments')} role="button" tabIndex={0} aria-label="Ver próxima cita"><div className="flex justify-between items-start mb-3"><div><p className="text-sm text-gray-500 dark:text-gray-400">Próxima Cita</p><h2 className="text-xl font-bold text-gray-800 dark:text-white">{appointments.length > 0 ? formatDate(appointments[0].appointment_date) : 'No hay citas'}</h2><p className="text-xs text-gray-500 dark:text-gray-400 mt-1 truncate">Ver detalles en Calendario</p></div><div className="flex-shrink-0 h-11 w-11 bg-gradient-to-br from-accent/80 to-accent rounded-full flex items-center justify-center shadow transition-transform duration-300 group-hover:scale-110"><CalendarIcon className="h-5 w-5 text-white" /></div></div><span className="text-sm font-medium text-primary dark:text-primary-400 opacity-0 group-hover:opacity-100 transition-opacity">Ver detalles</span></div>
                        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-5"><div className="flex justify-between items-start mb-3"><div><p className="text-sm text-gray-500 dark:text-gray-400 capitalize">{weatherData.day}</p><h2 className="text-xl font-bold text-gray-800 dark:text-white">{loadingWeather ? '...' : (weatherData.temp !== null ? `${weatherData.temp}°C` : '--')}</h2><p className="text-xs text-gray-500 dark:text-gray-400 mt-1 truncate">{weatherData.condition} • {weatherData.location}</p></div><div className={`flex-shrink-0 h-11 w-11 rounded-full flex items-center justify-center shadow ${loadingWeather ? 'bg-gray-400 animate-pulse dark:bg-gray-700' : 'bg-gradient-to-br from-blue-400 to-cyan-400'}`}>{weatherData.icon}</div></div><p className="text-xs text-gray-500 dark:text-gray-400">Clima actual en tu zona.</p></div>
                      </div>
                       <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
                        <div className="px-5 py-4 border-b border-gray-200 dark:border-gray-700 flex justify-between items-center"><h3 className="text-lg font-semibold text-gray-800 dark:text-white">Citas Próximas</h3><button className="text-sm font-medium text-primary hover:text-primary/80 focus:outline-none dark:text-primary-400 dark:hover:text-primary-300" onClick={() => handleViewChange('appointments')}> Ver todas </button></div>
                        {loadingAppointments ? (<div className="h-40 flex items-center justify-center text-gray-500 dark:text-gray-400"><Loader2 className="animate-spin h-5 w-5 mr-3" /> Cargando citas...</div>
                        ) : appointments.length > 0 ? (
                            <div className="overflow-x-auto"><table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700"><thead className="bg-gray-50 dark:bg-gray-700/50"><tr><th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider dark:text-gray-300">Fecha</th><th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider dark:text-gray-300">Hora</th><th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider dark:text-gray-300">Doctor</th></tr></thead><tbody className="bg-white divide-y divide-gray-200 dark:bg-gray-800 dark:divide-gray-700">{appointments.slice(0, 4).map((appt) => (<tr key={appt.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"><td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-800 dark:text-white">{formatDate(appt.appointment_date)}</td><td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600 dark:text-gray-300">{formatTime(appt.appointment_time)}</td><td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600 dark:text-gray-300">{appt.doctor_name || 'No asignado'}</td></tr>))}</tbody></table></div>
                        ) : (
                            <div className="h-40 flex flex-col items-center justify-center text-center px-6 py-4"><CalendarIcon className="h-10 w-10 text-gray-400 dark:text-gray-500 mb-3" /><p className="text-sm text-gray-500 dark:text-gray-400">No tienes citas programadas próximamente.</p><button onClick={() => handleViewChange('appointments')} className="mt-3 text-sm font-medium text-primary hover:underline dark:text-primary-400"> Agendar una cita </button></div>
                        )}
                       </div>
                      </>
                  )}
                  {currentView !== 'home' && currentView !== 'profile' && (<ContentPanel view={currentView as any} patientId={patientData?.id} onClose={() => handleViewChange('home')} />)}
                  {currentView === 'profile' && patientData && (
                    <div className="space-y-6">
                      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-5 md:p-6"><div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-6"><div><h3 className="text-lg font-semibold text-gray-800 dark:text-white mb-1">Código de Identificación</h3><p className="text-sm text-gray-600 dark:text-gray-300 mb-3">Usa este código para identificarte rápidamente.</p><p className="text-2xl font-bold text-primary font-mono tracking-widest bg-gray-100 px-4 py-2 rounded-md inline-block break-all dark:bg-gray-700 dark:text-primary-400">{patientData?.surecode || loyaltyCode || 'No Generado'}</p></div><div className="flex flex-col sm:flex-row md:flex-col gap-3 mt-2 md:mt-0 flex-shrink-0">{(patientData?.surecode || loyaltyCode) ? (<button onClick={() => setShowBarcode((prev) => !prev)} className="flex items-center justify-center gap-2 px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 text-sm font-medium dark:bg-gray-700 dark:text-white dark:hover:bg-gray-600"><QrCode className="h-4 w-4" /><span>{showBarcode ? 'Ocultar Barras' : 'Mostrar Barras'}</span></button>) : (<button onClick={generateLoyaltyCode} disabled={isGeneratingCode} className="flex items-center justify-center gap-2 px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 transition-colors focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 text-sm font-medium shadow disabled:opacity-70 disabled:cursor-not-allowed dark:bg-primary-600 dark:hover:bg-primary-600">{isGeneratingCode ? ( <> <Loader2 className="animate-spin h-4 w-4" /> <span>Generando...</span> </> ) : ( <> <QrCode className="h-4 w-4" /> <span>Generar Código</span> </>)}</button>)}</div></div>
                          {(patientData?.surecode || loyaltyCode) && (
                              <div className="mt-6 border-t pt-6 border-gray-200 dark:border-gray-700">
                                  <h4 className="text-md font-semibold text-gray-700 dark:text-white mb-3">Reconocimiento Facial</h4>
                                  {isLoadingRegistrationStatus ? (<div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400 mb-4"><Loader2 className="animate-spin h-4 w-4 text-primary dark:text-primary-400" /> Verificando estado...</div>
                                  ) : hasFacialRegistration ? (
                                      <div className="flex items-center gap-2 p-3 bg-green-100 dark:bg-green-900/30 border border-green-300 dark:border-green-700 rounded-md text-green-700 dark:text-green-300 mb-4">
                                          <CheckCircle className="h-5 w-5 text-green-500 dark:text-green-400" /><p className="text-sm">¡Ya tienes un registro facial creado!</p>
                                          <button onClick={() => startCameraGeneric('facial_registration')} className="ml-auto inline-flex items-center gap-1 px-3 py-1 bg-blue-100 text-blue-600 hover:bg-blue-200 rounded-md text-xs font-medium focus:outline-none focus:ring-2 focus:ring-blue-400 dark:bg-blue-900/50 dark:text-blue-400 dark:hover:bg-blue-800" title="Intentar registrar de nuevo"><Camera className="h-4 w-4" /> Reintentar</button>
                                      </div>
                                  ) : (
                                      <><p className="text-sm text-gray-600 dark:text-gray-300 mb-4">Aún no tienes un registro facial. Regístrate para usar esta función.</p><button onClick={() => startCameraGeneric('facial_registration')} disabled={isRegisteringFace} className="flex items-center justify-center gap-2 px-4 py-2 bg-teal-500 text-white rounded-lg hover:bg-teal-600 transition-colors focus:outline-none focus:ring-2 focus:ring-teal-500 focus:ring-offset-2 text-sm font-medium shadow disabled:opacity-70 disabled:cursor-not-allowed">{isRegisteringFace ? ( <> <Loader2 className="animate-spin h-4 w-4" /> <span>Registrando...</span> </> ) : ( <> <Camera className="h-4 w-4" /> <span>Hacer registro facial</span> </> )}</button></>
                                  )}
                              </div>
                          )}
                          {(patientData?.surecode || loyaltyCode) && showBarcode && (<div className="mt-6 p-4 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 overflow-x-auto max-w-md mx-auto flex justify-center"><Barcode value={patientData?.surecode || loyaltyCode} width={1.8} height={60} margin={10} displayValue={false} background="#f3f4f6" lineColor="#000000" /></div>)}
                      </div>
                       <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
                         <div className="px-5 py-4 border-b border-gray-200 dark:border-gray-700 sm:px-6 flex justify-between items-center"><h3 className="text-lg font-semibold text-gray-800 dark:text-white">Información Personal</h3></div>
                         <div className="px-5 py-5 sm:px-6 grid grid-cols-1 sm:grid-cols-3 gap-6">
                             <div className="sm:col-span-1 flex flex-col items-center sm:items-start"><dt className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-2">Foto de perfil</dt>{patientData?.Foto_paciente ? (<img src={patientData.Foto_paciente} alt="Foto de perfil" className="h-32 w-32 rounded-full object-cover border-2 border-gray-200 dark:border-gray-700 shadow-sm" onError={(e) => { e.currentTarget.src = '/placeholder-user.png'; }} />) : (<div className="h-32 w-32 rounded-full bg-gray-100 dark:bg-gray-700 flex items-center justify-center border dark:border-gray-600"><User className="h-16 w-16 text-gray-400 dark:text-gray-300" /></div>)}</div>
                            <dl className="sm:col-span-2 grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-5">{[{ label: 'Nombre completo', value: patientData?.name }, { label: 'Fecha de nacimiento', value: formatDate(patientData?.date_of_birth) }, { label: 'Correo electrónico', value: patientData?.email || user?.email }, { label: 'Teléfono', value: patientData?.phone }, { label: 'Género', value: patientData?.gender }, { label: 'Tipo de sangre', value: patientData?.blood_type }, { label: 'Alergias', value: patientData?.allergies },].map(item => { if (item.value && item.value !== 'Fecha inválida' && item.value !== 'No programada') { return (<div key={item.label} className={`${item.label === 'Alergias' || item.label === 'Correo electrónico' ? 'sm:col-span-2' : 'sm:col-span-1'}`}><dt className="text-sm font-medium text-gray-500 dark:text-gray-400">{item.label}</dt><dd className={`mt-1 text-sm text-gray-900 dark:text-white ${item.label === 'Alergias' ? 'whitespace-pre-wrap' : ''}`}>{item.value}</dd></div>); } else if (item.label === 'Nombre completo' || item.label === 'Correo electrónico') { return (<div key={item.label} className="sm:col-span-1"><dt className="text-sm font-medium text-gray-500 dark:text-gray-400">{item.label}</dt><dd className="mt-1 text-sm text-gray-500 dark:text-gray-400 italic">No disponible</dd></div>);} return null;})}</dl>
                         </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </main>
        </div>
      )}
      {/* ================================================================== */}
      {/* ======================= CAMERA MODAL (FIXED) ===================== */}
      {/* ================================================================== */}
      {showFacialRegistrationModal && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black bg-opacity-75 p-4 backdrop-blur-sm">
            <div className="bg-white dark:bg-gray-800 p-4 sm:p-6 rounded-lg shadow-xl max-w-sm w-full mx-auto">
                <h3 className="text-lg font-medium leading-6 text-gray-900 dark:text-white mb-2 text-center">{cameraPurpose === 'profile' ? 'Tomar Foto de Perfil' : 'Registro Facial'}</h3>
                <p className="text-center text-sm text-gray-600 dark:text-gray-300 mb-4">Centra tu rostro en el óvalo.</p>
                <div className="relative w-full aspect-[9/16] bg-gray-800 dark:bg-gray-900 rounded overflow-hidden mb-4 border border-gray-300 dark:border-gray-600">
                    {/* 👇 AQUÍ ESTÁ EL CAMBIO DE object-cover a object-contain 👇 */}
                    <video ref={videoRef} playsInline autoPlay muted className="absolute inset-0 w-full h-full object-contain" style={{ transform: 'scaleX(-1)' }} ></video>
                    <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                        <div className="border-2 border-white border-dashed rounded-full" style={{ width: '75%', height: '70%' }}></div>
                    </div>
                    {!cameraStream && !isRegisteringFace && ( <div className="absolute inset-0 flex items-center justify-center text-gray-400 dark:text-gray-300 text-sm bg-black/50"> Iniciando cámara... </div> )}
                    {isRegisteringFace && ( <div className="absolute inset-0 flex flex-col items-center justify-center text-white text-sm bg-black/70 z-10"> <Loader2 className="animate-spin h-8 w-8 mb-2 text-primary dark:text-primary-400" /> Registrando... </div> )}
                </div>
                <div className="flex justify-center space-x-4">
                    <button type="button" onClick={capturePhoto} disabled={!cameraStream || isRegisteringFace} className={`inline-flex items-center justify-center px-5 py-2 border border-transparent rounded-full shadow-sm text-base font-medium text-white focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary disabled:opacity-50 disabled:cursor-not-allowed ${isRegisteringFace ? 'bg-gray-500' : 'bg-primary hover:bg-primary/90 dark:bg-primary-600 dark:hover:bg-primary-700'}`}><Camera className="h-5 w-5" /></button>
                    <button type="button" onClick={stopCamera} disabled={isRegisteringFace} className="inline-flex items-center justify-center px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 dark:bg-gray-700 dark:border-gray-600 dark:text-white dark:hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed"> Cancelar </button>
                </div>
            </div>
        </div>
      )}
      <canvas ref={canvasRef} style={{ display: 'none' }}></canvas>
    </>
  );
};

export default Paciente_Interfaz;
