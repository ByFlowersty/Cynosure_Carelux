import { useState, type ChangeEvent, type FormEvent, useRef, useEffect, useCallback } from "react";
import { Link, useNavigate } from "react-router-dom";
import supabase from "../lib/supabaseClient"; // Adjust path if needed
import { FcGoogle } from "react-icons/fc";
import { Button } from "../components/ui/button"; // Assuming this exists
import { Input } from "../components/ui/input";   // Assuming this exists
import {
  Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter,
} from "../components/ui/card"; // Assuming this exists
import {
  EyeIcon, EyeOffIcon, UserIcon, MailIcon, LockIcon, PhoneIcon, CalendarIcon,
  DropletIcon, ShieldAlertIcon, Camera, CheckCircle2,
} from "lucide-react"; // Assuming lucide-react is installed
import toast from 'react-hot-toast'; // Ensure react-hot-toast is installed (npm install react-hot-toast)

// --- Interfaces ---
interface FormData {
  nombre_completo: string;
  email: string;
  password: string;
  telefono: string;
  date_of_birth: string;
  gender: string;
}

// --- Constants ---
const bloodTypes = ['A+', 'A-', 'AB+', 'AB-', 'B+', 'B-', 'O+', 'O-'] as const;
type BloodType = typeof bloodTypes[number] | "";

// --- Helper Function: Convert Base64 Data URL to Blob ---
function dataURLtoBlob(dataurl: string): Blob | null {
    try {
        const arr = dataurl.split(',');
        if (arr.length < 2) { console.error("Invalid data URL format"); return null; }
        const mimeMatch = arr[0].match(/:(.*?);/);
        if (!mimeMatch || mimeMatch.length < 2) { console.error("Could not extract mime type"); return null; }
        const mime = mimeMatch[1];
        const bstr = atob(arr[1]);
        let n = bstr.length;
        const u8arr = new Uint8Array(n);
        while(n--){ u8arr[n] = bstr.charCodeAt(n); }
        return new Blob([u8arr], {type:mime});
    } catch (e) {
        console.error("Error converting data URL to Blob:", e);
        return null;
    }
}

// --- Component ---
export default function Register() {
  // --- State ---
  const [formData, setFormData] = useState<FormData>({
    nombre_completo: "", email: "", password: "", telefono: "", date_of_birth: "", gender: "",
  });
  const [message, setMessage] = useState({ text: "", type: "" });
  const [selectedRole, setSelectedRole] = useState("paciente");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false); // Overall form submission loading
  const [step, setStep] = useState(1);
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [registrationComplete, setRegistrationComplete] = useState(false);
  const [registeredUserEmail, setRegisteredUserEmail] = useState("");

  // Patient Specific State (Step 2)
  const [bloodType, setBloodType] = useState<BloodType>("");
  const [allergies, setAllergies] = useState<string>("");

  // Camera State
  const [showCameraModal, setShowCameraModal] = useState<boolean>(false);
  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null);
  const [capturedImage, setCapturedImage] = useState<string | null>(null); // Base64 Data URL
  const [isUploadingPhoto, setIsUploadingPhoto] = useState<boolean>(false); // Specific photo upload loading

  // --- Hooks ---
  const navigate = useNavigate();
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // --- Handlers ---
  const handleChange = (
    e: ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>
  ) => {
    const { name, value } = e.target;
    if (name in formData) {
      setFormData(prev => ({ ...prev, [name]: value }));
    } else if (name === "allergies") {
      setAllergies(value);
    } else if (name === "blood_type") {
      setBloodType(value as BloodType);
    } else if (name === "gender") { // Ensure gender select updates formData
      setFormData(prev => ({ ...prev, gender: value }));
    }
  };

  // --- Camera Functions ---
  const startCamera = async () => {
      setMessage({ text: "", type: "" });
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
          toast.error("Tu navegador no soporta el acceso a la cámara.");
          return;
      }
      setShowCameraModal(true);
      try {
          const constraints = { video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false };
          const mediaStream = await navigator.mediaDevices.getUserMedia(constraints);
          setCameraStream(mediaStream);
      } catch (err: any) {
          console.error("Error accessing camera:", err.name, err.message);
          let errorMsg = "Error al iniciar la cámara.";
          if (err.name === "NotAllowedError" || err.name === "PermissionDeniedError") { errorMsg = "Permiso de cámara denegado. Habilítalo en los ajustes de tu navegador."; }
          else if (err.name === "NotFoundError" || err.name === "DevicesNotFoundError") { errorMsg = "No se encontró ninguna cámara."; }
          else if (err.name === "NotReadableError") { errorMsg = "La cámara está en uso por otra aplicación."; }
          toast.error(errorMsg);
          setShowCameraModal(false);
          setCameraStream(null);
      }
  };

  const stopCamera = useCallback(() => {
      console.log("[Camera] Stopping camera...");
      if (cameraStream) {
          cameraStream.getTracks().forEach(track => track.stop());
          console.log("[Camera] Tracks stopped.");
      }
      if (videoRef.current) {
          videoRef.current.srcObject = null; // Detach stream
          console.log("[Camera] Stream detached from video element.");
      }
      setCameraStream(null);
      setShowCameraModal(false);
  }, [cameraStream]); // Depend only on cameraStream

  const capturePhoto = () => {
      console.log("[Camera] Attempting capture...");
      if (videoRef.current && canvasRef.current && cameraStream) {
          const video = videoRef.current;
          const canvas = canvasRef.current;
          const context = canvas.getContext('2d');
          if (context) {
              console.log("[Camera] Canvas context obtained.");
              canvas.width = video.videoWidth;
              canvas.height = video.videoHeight;
              console.log(`[Camera] Canvas dimensions set to: ${canvas.width}x${canvas.height}`);

              context.translate(canvas.width, 0); // Move origin to top right
              context.scale(-1, 1); // Flip horizontally
              context.drawImage(video, 0, 0, canvas.width, canvas.height); // Draw mirrored image
              context.setTransform(1, 0, 0, 1, 0, 0); // Reset transform

              const dataUrl = canvas.toDataURL('image/png'); // Get Base64 PNG
              console.log("[Camera] Photo captured as Data URL (length):", dataUrl.length);
              setCapturedImage(dataUrl);
              stopCamera(); // Close camera after capture
          } else {
              toast.error("No se pudo obtener el contexto del canvas.");
              console.error("[Camera] Failed to get canvas context.");
              stopCamera();
          }
      } else {
          toast.error("La cámara no está lista para capturar.");
          console.error("[Camera] Capture failed: Video, canvas, or stream not ready.");
          stopCamera();
      }
  };

  // --- Effects ---
  // Connect stream to video element
  useEffect(() => {
      if (cameraStream && videoRef.current) {
          console.log("[Effect] Attaching camera stream to video element.");
          videoRef.current.srcObject = cameraStream;
          videoRef.current.play().catch(playError => {
              console.error("[Effect] Error playing video stream:", playError);
              toast.error("No se pudo mostrar la vista previa de la cámara.");
              stopCamera();
          });
      } else {
          console.log("[Effect] No camera stream or video element ref.");
      }
  }, [cameraStream, stopCamera]); // Add stopCamera dependency

  // Cleanup camera on component unmount
   useEffect(() => {
       return () => {
           console.log("[Effect] Component unmounting, ensuring camera is stopped.");
           if (cameraStream) {
               stopCamera();
           }
       };
   }, [cameraStream, stopCamera]); // Depend on stream and stop function

  // Reset patient-specific state (including camera)
  const resetPatientStep2State = useCallback(() => {
    console.log("[State] Resetting patient step 2 state.");
    setBloodType("");
    setAllergies("");
    setCapturedImage(null);
    if (cameraStream) { // Ensure camera is stopped if reset happens while modal is open
        stopCamera();
    }
    // No need to reset isUploadingPhoto here, handled in submit finally block
  }, [cameraStream, stopCamera]);

  // --- Form Submission ---
  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    // --- Step 1 Logic ---
    if (step === 1) {
      if (!formData.nombre_completo || !formData.email || !formData.password) { setMessage({ text: "Por favor completa todos los campos obligatorios (*).", type: "error" }); return; }
      const passwordPattern = /^(?=.*[!@#$%^&*(),.?":{}|<>]).{8,}$/;
      if (!passwordPattern.test(formData.password)) { setMessage({ text: "La contraseña debe tener al menos 8 caracteres y un carácter especial.", type: "error" }); return; }
      setMessage({ text: "", type: "" }); setStep(2); return;
    }

    // --- Step 2 Logic ---
    if (!termsAccepted) { setMessage({ text: "Debes aceptar los términos y condiciones para continuar.", type: "error" }); return; }

    setLoading(true); // Start overall loading
    setMessage({ text: "", type: "" });
    console.log("--- FORM SUBMIT (Step 2) ---");

    try {
      // 1. Sign Up User in Supabase Auth
      console.log("Attempting Supabase Auth SignUp for:", formData.email);
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email: formData.email,
        password: formData.password,
        options: { data: { full_name: formData.nombre_completo, role: selectedRole } },
      });

      if (authError) {
        console.error("Supabase Auth SignUp Error:", authError);
        throw authError; // Throw to outer catch
      }
      if (!authData.user) {
        console.error("Supabase Auth SignUp returned no user object.");
        throw new Error("Registro fallido, no se obtuvo el usuario.");
      }
      const userId = authData.user.id;
      const registeredEmail = formData.email;
      console.log("Supabase Auth SignUp successful. User ID:", userId);

      // 2. Process Role-Specific Data Insertion
      if (selectedRole === "administrador") {
        console.log("Inserting data for role: administrador");
        const { error: adminError } = await supabase.from("administradores").insert([
          { id: userId, nombre: formData.nombre_completo, email: formData.email, telefono: formData.telefono || null }
        ]);
        if (adminError) {
          console.error("Error inserting into administradores:", adminError);
          throw adminError;
        }
        console.log("Administrador inserted successfully.");
        setRegisteredUserEmail(registeredEmail);
        setRegistrationComplete(true);
        
      } else if (selectedRole === "paciente") {
        console.log("Processing data for role: paciente");
        let photoUrl: string | null = null;

        // 2a. Upload Photo (if one was captured)
        if (capturedImage) {
          console.log("Captured image found, starting upload process...");
          setIsUploadingPhoto(true);
          setMessage({ text: "Subiendo foto...", type: "info" });
          const blob = dataURLtoBlob(capturedImage);

          if (!blob) {
            console.error("Failed to convert captured image Data URL to Blob.");
            throw new Error("Error al procesar la imagen capturada.");
          }
          console.log("Image converted to Blob, size:", blob.size, "type:", blob.type);

          const fileExt = blob.type.split('/')[1] || 'png';
          const fileName = `${Date.now()}_${Math.random().toString(36).substring(2)}.${fileExt}`;
          const filePath = `${userId}/${fileName}`; // IMPORTANT: User-specific folder path
          const bucketName = 'patient-photos';
          console.log(`Attempting to upload to Supabase Storage. Bucket: ${bucketName}, Path: ${filePath}`);

          const { error: uploadError } = await supabase.storage
            .from(bucketName)
            .upload(filePath, blob, { cacheControl: '3600', upsert: false, contentType: blob.type });

          setIsUploadingPhoto(false);

          if (uploadError) {
            console.error("Supabase Storage Upload Error:", uploadError);
            throw new Error(`Error al subir la foto: ${uploadError.message}. Verifica los permisos del bucket.`);
          }
          console.log("Photo uploaded successfully to Storage.");
          const { data: urlData } = supabase.storage.from(bucketName).getPublicUrl(filePath);
          if (urlData?.publicUrl) {
            photoUrl = urlData.publicUrl;
          }
        }

        // 2b. Prepare and Insert Patient Data
        const patientData = {
          user_id: userId, name: formData.nombre_completo, email: formData.email, 
          phone: formData.telefono || null, date_of_birth: formData.date_of_birth || null, 
          gender: formData.gender || null, blood_type: bloodType || null, 
          allergies: allergies || null, Foto_paciente: photoUrl,
        };
        const { error: patientError } = await supabase.from("patients").insert([patientData]);
        if (patientError) throw patientError;

        // On success, show the completion screen
        console.log("Patient record inserted successfully.");
        setRegisteredUserEmail(registeredEmail);
        setRegistrationComplete(true);
        return;
      }

    } catch (error: any) {
      console.error("--- ERROR during Registration Process (Outer Catch) ---");
      console.error(error); 
      if (capturedImage && error.message?.toLowerCase().includes("foto")) {
          setCapturedImage(null);
      }
      setMessage({
        text: error.code === '23505' || error.message?.includes('duplicate key value')
              ? "Este correo electrónico ya está registrado. Intenta iniciar sesión."
              : error.message?.includes('Email rate limit exceeded')
              ? "Se ha superado el límite de envío de correos. Intenta más tarde."
              : error.message || "Error en el registro. Por favor intenta nuevamente.",
        type: "error",
      });
    } finally {
      console.log("--- Registration Process Finished (Finally Block) ---");
      setLoading(false); 
      setIsUploadingPhoto(false);
    }
  };

  // --- Google Sign Up ---
  const handleGoogleSignUp = async () => {
      console.log("Initiating Google Sign Up...");
      setLoading(true); setMessage({ text: "", type: "" });
      try {
          const { error } = await supabase.auth.signInWithOAuth({
              provider: "google",
              options: {
                  redirectTo: `${window.location.origin}/paciente`, // Adjust as needed
                  queryParams: { access_type: "offline", prompt: "consent" },
              },
          });
          if (error) throw error;
      } catch (error: any) {
          console.error("Google Sign Up Error (Catch Block):", error);
          setMessage({ text: `Error con Google: ${error.message}`, type: "error" });
          setLoading(false);
      }
  };

  // --- Styles ---
  const primaryButtonClasses = "w-full bg-[#29abe2] text-white hover:bg-[#1f8acb] focus-visible:ring-[#29abe2] disabled:opacity-70";
  const googleButtonClasses = "w-full flex items-center justify-center gap-2 py-2 px-4 border border-input rounded-md text-sm font-medium text-foreground bg-background hover:bg-accent focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[#29abe2]";
  const backButtonClasses = "w-full text-sm text-[#29abe2] hover:text-[#1f8acb] mt-2";
  const inputFocusClass = "focus-visible:ring-[#29abe2]";
  const standardControlClasses = `w-full h-10 rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-[#29abe2] focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50`;
  const textareaClasses = standardControlClasses.replace('h-10', 'min-h-[80px]');
  const checkboxFocusClass = "focus:ring-[#29abe2]";
  const textColor = "text-gray-700";
  const labelColor = "text-gray-700";

  // --- Render ---
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-b from-sky-50 to-white p-4 font-sans">
      <div className="w-full max-w-md">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-sky-100 mb-4">
            <img src="/logo.png" alt="Logo" width="64" height="64" className="opacity-90 p-1"/>
          </div>
          <h1 className="text-3xl font-bold text-gray-900">Carelux Point</h1>
          {!registrationComplete && <p className="text-gray-500 mt-1">Regístrate, es gratis</p>}
        </div>

        {registrationComplete ? (
            <Card className="w-full shadow-lg border border-gray-100 rounded-xl">
                <CardContent className="p-8 flex flex-col items-center text-center">
                    <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-green-100 mb-6">
                        <CheckCircle2 className="h-8 w-8 text-green-600" />
                    </div>
                    <h2 className="text-2xl font-semibold text-gray-800 mb-3">¡Registro Exitoso!</h2>
                    <p className="text-gray-600 mb-6 max-w-xs">
                        Gracias por elegir Carelux Point. Verifica el correo que enviamos a <br/>
                        <strong className="text-gray-800">{registeredUserEmail}</strong> para poder acceder.
                    </p>
                    <Button
                        onClick={() => navigate('/login')}
                        className={`${primaryButtonClasses} h-11 text-base font-semibold`}
                    >
                        Ir a Iniciar Sesión
                    </Button>
                </CardContent>
            </Card>
        ) : (
            <Card className="w-full shadow-lg border border-gray-100 rounded-xl">
                <CardHeader className="pb-4">
                    <CardTitle className="text-xl font-semibold text-center text-gray-800">Crear cuenta</CardTitle>
                    <CardDescription className="text-center text-sm text-gray-500">
                        {step === 1 ? "Ingresa tus datos de acceso" : "Completa tu perfil"}
                    </CardDescription>
                </CardHeader>

                <div className="px-6">
                    <div className="flex items-center justify-center border-b border-gray-200 mb-5">
                        <button
                            type="button"
                            onClick={() => { if (!loading) { setSelectedRole("paciente"); setStep(1); setMessage({ text: "", type: "" }); resetPatientStep2State();} }}
                            className={`relative px-4 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-[#29abe2] focus-visible:ring-offset-1 rounded-t-md ${selectedRole === "paciente" ? "text-[#29abe2] font-medium" : "text-gray-600 hover:text-gray-900"}`}
                            aria-pressed={selectedRole === 'paciente'}
                        >
                            Paciente
                            {selectedRole === "paciente" && (<div className="absolute bottom-[-1px] left-0 right-0 h-0.5 bg-[#29abe2]"></div>)}
                        </button>
                        <div className="h-5 w-px bg-gray-200 mx-1 self-center"></div>
                        <button
                            type="button"
                            onClick={() => { if (!loading) { setSelectedRole("administrador"); setStep(1); setMessage({ text: "", type: "" }); resetPatientStep2State();} }}
                            className={`relative px-4 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-[#29abe2] focus-visible:ring-offset-1 rounded-t-md ${selectedRole === "administrador" ? "text-[#29abe2] font-medium" : "text-gray-600 hover:text-gray-900"}`}
                            aria-pressed={selectedRole === 'administrador'}
                        >
                            Administrador
                            {selectedRole === "administrador" && (<div className="absolute bottom-[-1px] left-0 right-0 h-0.5 bg-[#29abe2]"></div>)}
                        </button>
                    </div>
                </div>

                {message.text && (
                    <div className="mx-6 mb-4">
                        <div
                        className={` p-3 text-sm rounded-md border ${
                            message.type === "success" ? "bg-green-50 text-green-800 border-green-300" :
                            message.type === "error" ? "bg-red-50 text-red-800 border-red-300" :
                            "bg-blue-50 text-blue-800 border-blue-300"
                        }`}
                        role={message.type === 'error' ? 'alert' : 'status'}
                        >
                        {message.text}
                        </div>
                    </div>
                )}

                <CardContent className="px-6 pt-0 pb-6">
                    <form onSubmit={handleSubmit} className="space-y-5">
                        {step === 1 && (
                            <>
                                <div className="space-y-1.5"> <label htmlFor="nombre_completo" className={`text-sm font-medium ${labelColor} flex items-center gap-1.5`}> <UserIcon className="h-4 w-4 text-gray-400" /> Nombre Completo * </label> <Input id="nombre_completo" name="nombre_completo" type="text" required value={formData.nombre_completo} onChange={handleChange} disabled={loading} aria-required="true" className={`${inputFocusClass}`} /> </div>
                                <div className="space-y-1.5"> <label htmlFor="email" className={`text-sm font-medium ${labelColor} flex items-center gap-1.5`}> <MailIcon className="h-4 w-4 text-gray-400" /> Correo electrónico * </label> <Input id="email" name="email" type="email" required value={formData.email} onChange={handleChange} disabled={loading} aria-required="true" className={`${inputFocusClass}`} /> </div>
                                <div className="space-y-1.5"> <label htmlFor="password" className={`text-sm font-medium ${labelColor} flex items-center gap-1.5`}> <LockIcon className="h-4 w-4 text-gray-400" /> Contraseña * </label> <div className="relative"> <Input id="password" name="password" type={showPassword ? "text" : "password"} placeholder="••••••••" required minLength={8} value={formData.password} onChange={handleChange} pattern='^(?=.*[!@#$%^&*(),.?":{}|<>]).{8,}$' title="Mínimo 8 caracteres y un símbolo especial." disabled={loading} aria-required="true" aria-describedby="password-hint" className={`${inputFocusClass} pr-10`} /> <button type="button" className={`absolute right-0 top-0 bottom-0 px-3 flex items-center text-gray-400 hover:text-gray-600 focus:outline-none focus:ring-1 ${checkboxFocusClass} rounded-r-md`} onClick={() => setShowPassword(!showPassword)} aria-label={showPassword ? "Ocultar contraseña" : "Mostrar contraseña"}> {showPassword ? <EyeOffIcon className="h-5 w-5" /> : <EyeIcon className="h-5 w-5" />} </button> </div> <p id="password-hint" className="text-xs text-gray-500 pt-1"> Mínimo 8 caracteres y un carácter especial (ej: !, @, #, $).</p> </div>
                            </>
                        )}

                        {step === 2 && (
                            <>
                                <div className="space-y-1.5"> <label htmlFor="telefono" className={`text-sm font-medium ${labelColor} flex items-center gap-1.5`}> <PhoneIcon className="h-4 w-4 text-gray-400" /> Teléfono <span className="text-xs text-gray-400">(Opcional)</span> </label> <Input id="telefono" name="telefono" type="tel" value={formData.telefono} onChange={handleChange} disabled={loading} className={`${inputFocusClass}`} /> </div>
                                {selectedRole === 'paciente' && (
                                <>
                                    <div className="space-y-1.5"> <label htmlFor="date_of_birth" className={`text-sm font-medium ${labelColor} flex items-center gap-1.5`}> <CalendarIcon className="h-4 w-4 text-gray-400" /> Fecha de nacimiento <span className="text-xs text-gray-400">(Opcional)</span> </label> <Input id="date_of_birth" name="date_of_birth" type="date" value={formData.date_of_birth} onChange={handleChange} max={new Date().toISOString().split("T")[0]} disabled={loading} className={`block w-full ${inputFocusClass} text-sm`} /> </div>
                                    <div className="space-y-1.5"> <label htmlFor="gender" className={`text-sm font-medium ${labelColor} block`}> Género <span className="text-xs text-gray-400">(Opcional)</span> </label> <select id="gender" name="gender" value={formData.gender} onChange={handleChange} disabled={loading} className={standardControlClasses}> <option value="">Seleccionar...</option> <option value="masculino">Masculino</option> <option value="femenino">Femenino</option> <option value="otro">Otro</option> <option value="prefiero_no_decir">Prefiero no decir</option> </select> </div>
                                    <div className="space-y-1.5"> <label htmlFor="blood_type" className={`text-sm font-medium ${labelColor} flex items-center gap-1.5`}> <DropletIcon className="h-4 w-4 text-gray-400" /> Tipo de Sangre <span className="text-xs text-gray-400">(Opcional)</span> </label> <select id="blood_type" name="blood_type" value={bloodType} onChange={handleChange} disabled={loading} className={standardControlClasses} > <option value="">Seleccionar...</option> {bloodTypes.map((type) => (<option key={type} value={type}>{type}</option>))} </select> </div>
                                    <div className="space-y-1.5"> <label htmlFor="allergies" className={`text-sm font-medium ${labelColor} flex items-center gap-1.5`}> <ShieldAlertIcon className="h-4 w-4 text-gray-400" /> Alergias <span className="text-xs text-gray-400">(Opcional, separadas por coma)</span> </label> <textarea id="allergies" name="allergies" rows={3} placeholder="Ej: Penicilina, Polvo, Polen..." value={allergies} onChange={handleChange} disabled={loading} className={textareaClasses} /> </div>
                                    <div className="space-y-2 pt-1">
                                        <label className={`text-sm font-medium ${labelColor} block`}> Foto de Paciente <span className="text-xs text-gray-400">(Opcional)</span> </label>
                                        <div className="flex items-center gap-4">
                                            <div className="h-16 w-16 rounded-full border border-dashed border-gray-300 flex items-center justify-center overflow-hidden bg-gray-100"> {capturedImage ? ( <img src={capturedImage} alt="Foto capturada" className="h-full w-full object-cover" /> ) : ( <UserIcon className="h-8 w-8 text-gray-400" /> )} </div>
                                            <Button type="button" variant="outline" onClick={startCamera} disabled={loading || isUploadingPhoto} className={`text-sm ${inputFocusClass} h-10`}> <Camera className="h-4 w-4 mr-2" /> {capturedImage ? "Tomar Otra" : "Tomar Foto"} </Button>
                                        </div>
                                    </div>
                                </>
                                )}
                                <div className="flex items-start pt-3">
                                    <input id="terms" type="checkbox" checked={termsAccepted} onChange={() => setTermsAccepted(!termsAccepted)} disabled={loading} className={`h-4 w-4 mt-0.5 text-[#29abe2] ${checkboxFocusClass} border-gray-300 rounded`} />
                                    <label htmlFor="terms" className={`ml-2.5 block text-sm ${textColor}`}> He leído y acepto los{" "} <Link to="/terms" target="_blank" rel="noopener noreferrer" className="font-medium text-[#29abe2] hover:text-[#1f8acb] hover:underline focus:outline-none focus:ring-1 focus:ring-offset-1 focus:ring-[#29abe2] rounded"> Términos </Link> y la{" "} <Link to="/privacy" target="_blank" rel="noopener noreferrer" className="font-medium text-[#29abe2] hover:text-[#1f8acb] hover:underline focus:outline-none focus:ring-1 focus:ring-offset-1 focus:ring-[#29abe2] rounded"> Política de Privacidad </Link>.* </label>
                                </div>
                            </>
                        )}

                        <div className="pt-2 space-y-3">
                            <Button type="submit" className={`${primaryButtonClasses} h-11 text-base font-semibold`} disabled={loading || isUploadingPhoto || (step === 2 && !termsAccepted)}>
                                {loading ? ( <span className="flex items-center justify-center"><svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg> <span>{isUploadingPhoto ? "Subiendo foto..." : "Registrando..."}</span></span> ) : step === 1 ? ( "Continuar" ) : ( "Registrarse" ) }
                            </Button>

                            {step === 1 && selectedRole === "paciente" && (
                                <>
                                    <div className="relative my-2">
                                        <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-gray-200"></div></div>
                                        <div className="relative flex justify-center text-xs"><span className="px-2 bg-card text-gray-500"> O regístrate con </span></div>
                                    </div>
                                    <button type="button" onClick={handleGoogleSignUp} disabled={loading} className={`${googleButtonClasses} h-10`}>
                                        <FcGoogle className="h-5 w-5" /><span>Google</span>
                                    </button>
                                </>
                            )}

                            {step === 2 && (
                                <button type="button" onClick={() => { setStep(1); setMessage({ text: "", type: "" }); }} disabled={loading} className={`${backButtonClasses} h-9`}>
                                Volver al paso anterior
                                </button>
                            )}
                        </div>
                    </form>
                    <canvas ref={canvasRef} style={{ display: 'none' }}></canvas>
                </CardContent>

                <CardFooter className="px-6 pt-4 pb-6 border-t border-gray-100">
                    <p className="text-sm text-center text-gray-600 w-full">
                        ¿Ya tienes una cuenta?{" "}
                        <Link to="/login" className="font-medium text-[#29abe2] hover:text-[#1f8acb] hover:underline focus:outline-none focus:ring-1 focus:ring-offset-1 focus:ring-[#29abe2] rounded">
                            Iniciar sesión
                        </Link>
                    </p>
                </CardFooter>
            </Card>
        )}
        
        <div className="mt-8 text-center text-xs text-gray-500">
           <p>© {new Date().getFullYear()} Carelux Point. Todos los derechos reservados.</p>
           <div className="flex justify-center space-x-4 mt-2">
             <Link to="/terms" className="hover:text-[#29abe2] hover:underline focus:outline-none focus:ring-1 focus:ring-offset-1 focus:ring-[#29abe2] rounded px-1">Términos</Link>
             <Link to="/privacy" className="hover:text-[#29abe2] hover:underline focus:outline-none focus:ring-1 focus:ring-offset-1 focus:ring-[#29abe2] rounded px-1">Privacidad</Link>
             <Link to="/help" className="hover:text-[#29abe2] hover:underline focus:outline-none focus:ring-1 focus:ring-offset-1 focus:ring-[#29abe2] rounded px-1">Ayuda</Link>
           </div>
        </div>
      </div>
        {showCameraModal && (
           <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-75 p-4 backdrop-blur-sm">
               <div className="bg-white p-5 rounded-lg shadow-xl max-w-sm w-full mx-auto border border-gray-200">
                   <h3 className="text-lg font-semibold leading-6 text-gray-900 mb-4 text-center">Tomar Foto</h3>
                   <div className="relative w-full aspect-[9/16] bg-gray-900 rounded-md overflow-hidden mb-5 border border-gray-300">
                       <video
                           ref={videoRef}
                           playsInline autoPlay muted
                           className="absolute inset-0 w-full h-full object-cover"
                           style={{ transform: 'scaleX(-1)' }}
                       ></video>
                       {!cameraStream && (
                           <div className="absolute inset-0 flex items-center justify-center text-gray-400 text-sm font-medium bg-gray-800/50">
                               Iniciando cámara...
                           </div>
                       )}
                   </div>
                   <div className="flex justify-center space-x-4">
                       <button
                           type="button"
                           onClick={capturePhoto}
                           disabled={!cameraStream}
                           className="inline-flex items-center justify-center px-5 py-2.5 border border-transparent rounded-full shadow-sm text-base font-medium text-white bg-primary hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                           aria-label="Capturar Foto"
                       >
                           <Camera className="h-5 w-5" />
                       </button>
                       <button
                           type="button"
                           onClick={stopCamera}
                           className="inline-flex items-center justify-center px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-400 transition-colors"
                       >
                           Cancelar
                       </button>
                   </div>
               </div>
           </div>
       )}
    </div>
  );
}
