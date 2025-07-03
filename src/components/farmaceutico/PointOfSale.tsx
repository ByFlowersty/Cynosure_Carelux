import React, { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Search, ShoppingCart, User, Plus, Minus, X, CreditCard, DollarSign,
  AlertCircle, CheckCircle, Trash2, QrCode, Loader2,
  AlertTriangle, Fingerprint, Camera, Receipt, ScanFace, Tag, Package, BookOpen, XCircle
} from "lucide-react";
import QRCode from "qrcode";
import supabase from "../../lib/supabaseClient";
import RFIDReader from "../farmaceutico/RFIDReader";
import { toast } from 'react-hot-toast';

// --- Interfaces ---

interface PrescriptionLink {
    receta_id: string;
    medicamento_recetado: {
        nombre: string;
        principio_activo: string;
        dosis: string;
        via: string;
        frecuencia: string;
        duracion: string;
        cantidad_a_dispensar: string;
        unidad_cantidad: string;
    };
}

interface Product {
  upc: string;
  nombre_medicamento: string;
  precio_en_pesos: number;
  unidades: number;
  id_farmacia: number | string;
  [key: string]: any;
}

interface CartItem extends Product {
  cantidad: number;
  prescriptionLink?: PrescriptionLink;
}

interface StockWarning {
  message: string;
  productId: string;
}
interface Patient {
  id: string;
  name: string;
  surecode?: string | null;
  phone?: string | null; // Allow null
  allergies?: string;
  Foto_paciente?: string | null;
}

interface RFIDPatientData {
    id: string | number;
    name: string;
    surecode?: string | null;
    phone?: string | null;
    allergies?: string | null;
    Foto_paciente?: string | null;
}

interface FoundAppointmentPayment {
  id: number | string;
  cita_id: number | string;
  metodo_pago: string | null;
  numero_recibo: string;
  estado_pago: string;
  precio: number | null;
  fecha_creacion: string;
  id_farmacia?: number | string | null;
  referencia_tarjeta?: string | null;
  citas: {
    horario_cita: string;
    dia_atencion: string;
    id_usuario: string;
    motivo_cita?: string | null;
    patients?: {
        name: string;
    } | null;
  } | null;
}
interface EmotionResult {
    dominant_emotion: string;
}
interface IdentificationResultData {
    id: string;
    nombre_completo?: string | null;
    similarity: number;
    emocion_registro?: string | null;
}
interface IdentifyResponse {
    found: boolean;
    patient?: IdentificationResultData | null;
    current_emotion: EmotionResult;
}
interface RecetaMedicamentoDB {
    nombre: string;
    principio_activo: string;
    dosis: string;
    via: string;
    frecuencia: string;
    duracion: string;
    cantidad_a_dispensar: string;
    unidad_cantidad: string;
}
interface RecetaHistorial {
    id: string;
    fecha_consulta: string;
    diagnostico: string;
    medicamentos: RecetaMedicamentoDB[];
    fecha_emision: string;
    estado_dispensacion?: 'dispensada' | 'no dispensada' | 'incompleta' | null;
}

interface CashSession {
  id: string;
  id_farmacia: number | string;
  id_trabajador: string;
  fecha_apertura: string;
  monto_inicial_pesos: number;
  estado: 'abierta' | 'cerrada';
   fecha_cierre?: string | null;
   monto_final_calculado_pesos?: number | null;
   monto_final_real_pesos?: number | null;
   diferencia_pesos?: number | null;
   notas_cierre?: string | null;
}

interface CashSessionSummary {
    monto_inicial: number;
    total_ventas_efectivo: number;
    total_ventas_tarjeta: number;
    total_ventas_qr: number;
    total_citas_efectivo: number;
    total_citas_otros_metodos: number;
}


// --- Componente Principal ---
const PointOfSale = () => {
  // --- Estados POS ---
  const [productSearch, setProductSearch] = useState<string>("");
  const [searchResults, setSearchResults] = useState<Product[]>([]);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [productQuantity, setProductQuantity] = useState<number>(1);
  const [isSearchingDb, setIsSearchingDb] = useState<boolean>(false);
  const [cartItems, setCartItems] = useState<CartItem[]>([]);
  const [stockWarning, setStockWarning] = useState<StockWarning | null>(null);
  const [selectedPatientData, setSelectedPatientData] = useState<Patient | null>(null);
  const [buyWithoutAccount, setBuyWithoutAccount] = useState<boolean>(false);
  const [showValidationMessage, setShowValidationMessage] = useState<boolean>(false);
  const [activeIdentificationModal, setActiveIdentificationModal] = useState<'code' | 'facial' | 'rfid' | null>(null);
  const [patientSearchQuery, setPatientSearchQuery] = useState<string>("");
  const [isSearchingPatient, setIsSearchingPatient] = useState<boolean>(false);
  const [patientSearchError, setPatientSearchError] = useState<string | null>(null);
  const [isIdentifyingFace, setIsIdentifyingFace] = useState<boolean>(false);

  // --- Estado de Farmacia y Trabajador ---
  const [currentPharmacyId, setCurrentPharmacyId] = useState<number | string | null>(null);
  const [currentWorkerId, setCurrentWorkerId] = useState<string | null>(null);
  const [isLoadingPharmacyId, setIsLoadingPharmacyId] = useState<boolean>(true);
  const [pharmacyIdError, setPharmacyIdError] = useState<string | null>(null);

  // --- Estados Cámara ---
  const [showCamera, setShowCamera] = useState<boolean>(false);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isCameraLoading, setIsCameraLoading] = useState<boolean>(false);

  // --- Estados Pago (Carrito Actual) ---
  const [paymentMethod, setPaymentMethod] = useState<string>("efectivo");
  const [showPaymentModal, setShowPaymentModal] = useState<boolean>(false);
  const [amountPaid, setAmountPaid] = useState<string>("");
  const [receiptNumber, setReceiptNumber] = useState<number | string | null>(null);
  const [currentOrderId, setCurrentOrderId] = useState<number | string | null>(null);
  const [isGeneratingQR, setIsGeneratingQR] = useState<boolean>(false);
  const [mercadoPagoQrUrl, setMercadoPagoQrUrl] = useState<string | null>(null);
  const [qrError, setQrError] = useState<string | null>(null);
  const [isConfirmingCash, setIsConfirmingCash] = useState<boolean>(false);
  const [cashConfirmationError, setCashConfirmationError] = useState<string | null>(null);
  const [cardPaymentReference, setCardPaymentReference] = useState<string>("");

  // --- Estados para "Tarjeta o Terminal" ---
  const [isConfirmingCardPayment, setIsConfirmingCardPayment] = useState<boolean>(false);
  const [cardConfirmationError, setCardConfirmationError] = useState<string | null>(null);
  const [countdownForCard, setCountdownForCard] = useState<number>(0);
  const countdownIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // --- ESTADOS: Pago de Citas Pendientes ---
  const [receiptSearchQuery, setReceiptSearchQuery] = useState<string>("");
  const [foundAppointmentPayment, setFoundAppointmentPayment] = useState<FoundAppointmentPayment | null>(null);
  const [appointmentPrice, setAppointmentPrice] = useState<string>("");
  const [isSearchingReceipt, setIsSearchingReceipt] = useState<boolean>(false);
  const [receiptSearchError, setReceiptSearchError] = useState<string | null>(null);
  const [isUpdatingPayment, setIsUpdatingPayment] = useState<boolean>(false);
  const [paymentUpdateError, setPaymentUpdateError] = useState<string | null>(null);
  const [paymentUpdateSuccess, setPaymentUpdateSuccess] = useState<string | null>(null);
  const [appointmentPaymentMethod, setAppointmentPaymentMethod] = useState<string>("efectivo");
  const [appointmentCardReference, setAppointmentCardReference] = useState<string>("");

  // --- ESTADOS RECETAS ---
  const [showPrescriptionModal, setShowPrescriptionModal] = useState<boolean>(false);
  const [patientPrescriptions, setPatientPrescriptions] = useState<RecetaHistorial[]>([]);
  const [isFetchingPrescriptions, setIsFetchingPrescriptions] = useState<boolean>(false);
  const [prescriptionFetchError, setPrescriptionFetchError] = useState<string | null>(null);
  const [_selectedPrescription, setSelectedPrescription] = useState<RecetaHistorial | null>(null);
  const [activePrescription, setActivePrescription] = useState<RecetaHistorial | null>(null);

  // --- ESTADOS DE CAJA ---
  const [activeCashSession, setActiveCashSession] = useState<CashSession | null>(null);
  const [isCheckingSession, setIsCheckingSession] = useState<boolean>(true);
  const [showOpenCashSessionModal, setShowOpenCashSessionModal] = useState<boolean>(false);
  const [showCloseCashSessionModal, setShowCloseCashSessionModal] = useState<boolean>(false);
  const [initialAmount, setInitialAmount] = useState<string>("");
  const [isOpeningSession, setIsOpeningSession] = useState<boolean>(false);
  const [sessionSummary, setSessionSummary] = useState<CashSessionSummary | null>(null);
  const [isFetchingSummary, setIsFetchingSummary] = useState<boolean>(false);
  const [realAmountCounted, setRealAmountCounted] = useState<string>("");
  const [closeNotes, setCloseNotes] = useState<string>("");
  const [isClosingSession, setIsClosingSession] = useState<boolean>(false);

  // --- Estados UI ---
  const [isSearchFocused, setIsSearchFocused] = useState<boolean>(false);

  // --- URL del Backend ---
  const BACKEND_API_BASE_URL = import.meta.env.VITE_BACKEND_API_PAYMENTS_URL;
  const BACKEND_API_FACE_URL = import.meta.env.VITE_BACKEND_API_FACE_URL;
   // Comprobación de que las variables existen
  
   if (!BACKEND_API_BASE_URL || !BACKEND_API_FACE_URL) {
    return (
      <div className="fixed inset-0 bg-red-100 text-red-800 flex items-center justify-center p-8">
        <div className="text-center">
          <h1 className="text-2xl font-bold">Error de Configuración</h1>
          <p className="mt-2">Las variables de entorno para las URLs del backend no están definidas.</p>
          <p className="mt-1 text-sm">Asegúrate de que tu archivo <code>.env</code> exista y contenga <code>VITE_BACKEND_API_PAYMENTS_URL</code> y <code>VITE_BACKEND_API_FACE_URL</code>.</p>
        </div>
      </div>
    );
  }


  // --- useEffect para Obtener ID de Farmacia y Trabajador ---
  useEffect(() => {
    const fetchWorkerAndPharmacyId = async () => {
        setIsLoadingPharmacyId(true);
        setPharmacyIdError(null);
        try {
            const { data: { user }, error: userError } = await supabase.auth.getUser();
            if (userError || !user) throw new Error(userError?.message || "No se pudo obtener el usuario.");

            const { data: workerData, error: workerError } = await supabase
                .from("trabajadores")
                .select("id, id_farmacia, nombre")
                .eq("user_id", user.id)
                .single();

            if (workerError) {
                if (workerError.code === "PGRST116") throw new Error("Registro de trabajador no encontrado para este usuario.");
                throw new Error(`Error al obtener datos del trabajador: ${workerError.message}`);
            }
            if (!workerData || workerData.id_farmacia === null || workerData.id_farmacia === undefined) {
                throw new Error("Este trabajador no tiene un ID de farmacia asignado.");
            }
             if (!workerData.id) {
                throw new Error("Este trabajador no tiene un ID de trabajador asignado.");
            }
            setCurrentPharmacyId(workerData.id_farmacia);
            setCurrentWorkerId(workerData.id);
        } catch (error: any) {
            console.error("Error crítico obteniendo ID de farmacia/trabajador:", error);
            setPharmacyIdError(error.message || "Ocurrió un error inesperado al cargar los datos.");
            setCurrentPharmacyId(null);
            setCurrentWorkerId(null);
             setIsCheckingSession(false);
        } finally {
            setIsLoadingPharmacyId(false);
        }
    };
    fetchWorkerAndPharmacyId();
  }, []);

  // --- useEffect para Verificar y Restaurar la Sesión de Caja ---
  useEffect(() => {
    const initializeSession = async () => {
      if (!currentPharmacyId || !currentWorkerId || isLoadingPharmacyId || pharmacyIdError) {
          return;
      }

      setIsCheckingSession(true);
      setPharmacyIdError(null);
      const storedSessionId = localStorage.getItem('activeCashSessionId');

      try {
        if (storedSessionId) {
          const { data } = await supabase
            .from('cash_sessions')
            .select('*')
            .eq('id', storedSessionId)
            .eq('id_farmacia', currentPharmacyId)
            .eq('estado', 'abierta')
            .single();

          if (data) {
            setActiveCashSession(data as CashSession);
            toast.success("Sesión de caja restaurada.", { id: 'session-restored' });
            setIsCheckingSession(false);
            setShowOpenCashSessionModal(false);
            return;
          } else {
            localStorage.removeItem('activeCashSessionId');
            console.log(`[Caja] ID de sesión ${storedSessionId} no encontrado o cerrado. Limpiando storage.`);
          }
        }

        const { data: anyOpenSession } = await supabase
          .from('cash_sessions')
          .select('id, id_trabajador, trabajadores(nombre)')
          .eq('id_farmacia', currentPharmacyId)
          .eq('estado', 'abierta')
          .maybeSingle();

        if (anyOpenSession) {
             const anyOpenSessionTyped = anyOpenSession as any;
             const worker = Array.isArray(anyOpenSessionTyped.trabajadores) ? anyOpenSessionTyped.trabajadores[0] : anyOpenSessionTyped.trabajadores;
             const workerName = worker?.nombre || `Trabajador ID: ${anyOpenSessionTyped.id_trabajador?.substring(0,6) || 'N/A'}`;
             const msg = `La caja ya fue abierta por ${workerName}. Debes cerrar esa sesión antes de poder iniciar una nueva en este dispositivo o con este usuario.`;
            setPharmacyIdError(msg);
            setActiveCashSession(null);
            setShowOpenCashSessionModal(false);
             console.warn(`[Caja] Found another open session: ${anyOpenSession.id} by worker ${anyOpenSession.id_trabajador}`);

        } else {
            setActiveCashSession(null);
            setShowOpenCashSessionModal(true);
             console.log("[Caja] No active session found for pharmacy. Prompting to open.");
        }

      } catch (error: any) {
        console.error("Error durante la verificación/restauración de sesión de caja:", error);
        setPharmacyIdError(`Error al verificar la sesión de caja: ${error.message}`);
        setActiveCashSession(null);
        setShowOpenCashSessionModal(false);
      } finally {
        setIsCheckingSession(false);
      }
    };
    if (!isLoadingPharmacyId && !pharmacyIdError) {
         initializeSession();
    }
  }, [currentPharmacyId, currentWorkerId, isLoadingPharmacyId, pharmacyIdError]);


  // --- Funciones Auxiliares UI ---
  const getStockPercentage = (current: number, max: number): number => {
      if (max <= 0) return 100;
      return Math.min(100, Math.max(0, (current / max) * 100));
  };
  const getStockLevelColor = (percentage: number): string => {
      if (percentage <= 20) return "bg-red-500 dark:bg-red-600";
      if (percentage <= 50) return "bg-amber-500 dark:bg-amber-600";
      return "bg-emerald-500 dark:bg-emerald-600";
  };
  const formatDate = (dateString: string | null | undefined): string => {
      if (!dateString) return 'N/A';
      try {
          const date = dateString.includes('T') ? new Date(dateString) : new Date(dateString + 'T00:00:00Z');
          if (isNaN(date.getTime())) return 'Fecha Inválida';
           const parts = date.toLocaleDateString('es-ES', { year: 'numeric', month: 'long', day: 'numeric' }).split(' ');
           return `${parts[0]} de ${parts[2]} de ${parts[4]}`;
      } catch (e) { console.error("Error formateando fecha:", dateString, e); return 'Error Fecha'; }
  };
  const formatTime = (timeString: string | null | undefined): string => {
    if (!timeString) return 'N/A';
    try {
        const [hours, minutes, seconds] = timeString.split(':').map(Number);
        if (isNaN(hours) || isNaN(minutes) || hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
            return 'Hora Inválida';
        }
        const date = new Date();
        date.setHours(hours, minutes, seconds || 0, 0);

        return date.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', hour12: true });
    } catch (e) { console.error("Error formateando hora:", timeString, e); return 'Error Hora'; }
  };


  const getTodayDateString = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return today.toISOString().split('T')[0];
  }, []);

  // --- Funciones POS (Carrito Actual) ---
  const handleProductSearch = useCallback(async (query: string) => {
    setProductSearch(query);
    setSearchResults([]);
    if (!currentPharmacyId || query.length < 1) {
        setIsSearchingDb(false);
        return;
    }
    setIsSearchingDb(true);
    try {
      let data;
      let error;
      const isUPC = /^[0-9A-Z\-\.\s]+$/.test(query) && query.length >= 6 && query.length <= 20;

      if (isUPC) {
        ({ data, error } = await supabase.from("medicamentos").select("upc, nombre_medicamento, precio_en_pesos, unidades, id_farmacia").eq("id_farmacia", currentPharmacyId).eq("upc", query.trim()).limit(1));
      } else {
        ({ data, error } = await supabase.from("medicamentos").select("upc, nombre_medicamento, precio_en_pesos, unidades, id_farmacia").eq("id_farmacia", currentPharmacyId).ilike("nombre_medicamento", `%${query.trim()}%`).order("nombre_medicamento").limit(15));
      }
      if (error) throw error;
      setSearchResults(data || []);
    } catch (error) { console.error("Error buscando productos:", error); setSearchResults([]); }
    finally { setIsSearchingDb(false); }
  }, [currentPharmacyId]);


  const handleSelectProduct = (product: Product) => {
    setSelectedProduct(product); setSearchResults([]); setProductSearch(product.nombre_medicamento);
    setProductQuantity(1); setIsSearchFocused(false); setStockWarning(null);
  };

  const handleAddToCart = useCallback((product: Product, quantityToAdd: number, prescriptionLink?: PrescriptionLink) => {
     const itemKey = `${product.upc}-${prescriptionLink?.receta_id || 'no-rx'}-${prescriptionLink?.medicamento_recetado.nombre || 'no-rx-med'}`;

    const existingCartItemIndex = cartItems.findIndex(item =>
         `${item.upc}-${item.prescriptionLink?.receta_id || 'no-rx'}-${item.prescriptionLink?.medicamento_recetado.nombre || 'no-rx-med'}` === itemKey
    );

    const currentQuantityInCart = existingCartItemIndex !== -1 ? cartItems[existingCartItemIndex].cantidad : 0;
    const totalQuantity = currentQuantityInCart + quantityToAdd;

    if (totalQuantity > product.unidades) {
      setStockWarning({ message: `Stock: ${product.unidades}. Tienes ${currentQuantityInCart} en carrito.`, productId: product.upc });
      toast.error(`Stock insuficiente para ${product.nombre_medicamento}. Disponible: ${product.unidades}`, { id: `stock-warn-${product.upc}` });
      setTimeout(() => { setStockWarning(current => current?.productId === product.upc ? null : current); }, 5000);
      return false;
    }
    if (existingCartItemIndex !== -1) {
      const updatedCartItems = [...cartItems];
      updatedCartItems[existingCartItemIndex].cantidad = totalQuantity;
      setCartItems(updatedCartItems);
    } else {
      setCartItems(prevCart => [...prevCart, { ...product, cantidad: quantityToAdd, prescriptionLink }]);
    }
    setStockWarning(null);
    toast.success(`${quantityToAdd}x ${product.nombre_medicamento} añadido al carrito.`, { id: `add-to-cart-${product.upc}`, duration: 3000 });
    return true;
  }, [cartItems]);


  const handleAddSelectedProductToCart = () => {
    if (!selectedProduct) return;
    const success = handleAddToCart(selectedProduct, productQuantity, undefined);
    if (success) {
      setSelectedProduct(null); setProductSearch(""); setProductQuantity(1); setSearchResults([]);
    }
  };

  const handleRemoveFromCart = (itemToRemove: CartItem) => {
     const itemKeyToRemove = `${itemToRemove.upc}-${itemToRemove.prescriptionLink?.receta_id || 'no-rx'}-${itemToRemove.prescriptionLink?.medicamento_recetado.nombre || 'no-rx-med'}`;
    setCartItems(prevCart => prevCart.filter(item =>
        `${item.upc}-${item.prescriptionLink?.receta_id || 'no-rx'}-${item.prescriptionLink?.medicamento_recetado.nombre || 'no-rx-med'}` !== itemKeyToRemove
    ));
    setStockWarning(current => current?.productId === itemToRemove.upc ? null : current);
     toast(`"${itemToRemove.nombre_medicamento}" quitado del carrito.`, { icon: '🛒', id: `remove-from-cart-${itemToRemove.upc}` });
  };

  const handleUpdateQuantity = (itemToUpdate: CartItem, newQuantity: number) => {
    if (newQuantity < 1) { handleRemoveFromCart(itemToUpdate); return; }

    const itemKeyToUpdate = `${itemToUpdate.upc}-${itemToUpdate.prescriptionLink?.receta_id || 'no-rx'}-${itemToUpdate.prescriptionLink?.medicamento_recetado.nombre || 'no-rx-med'}`;
    const itemIndex = cartItems.findIndex(item =>
        `${item.upc}-${item.prescriptionLink?.receta_id || 'no-rx'}-${item.prescriptionLink?.medicamento_recetado.nombre || 'no-rx-med'}` === itemKeyToUpdate
    );

    if (itemIndex === -1) return;
    const item = cartItems[itemIndex];
    if (newQuantity > item.unidades) {
      setStockWarning({ message: `Máx: ${item.unidades}`, productId: item.upc });
      toast.error(`Máximo stock para ${item.nombre_medicamento}: ${item.unidades}`, { id: `stock-warn-${item.upc}` });
       setTimeout(() => { setStockWarning(current => current?.productId === item.upc ? null : current); }, 5000);
       return;
    }
    const updatedCartItems = [...cartItems]; updatedCartItems[itemIndex] = { ...item, cantidad: newQuantity }; setCartItems(updatedCartItems);
    setStockWarning(current => current?.productId === item.upc ? null : current);
  };


  const calculateTotal = useCallback((): number => cartItems.reduce((total, item) => total + (item.precio_en_pesos || 0) * item.cantidad, 0), [cartItems]);


  // --- Búsqueda Paciente por Código ---
  const handlePatientSearchSubmit = async (event?: React.FormEvent) => {
      if (event) event.preventDefault();
      const query = patientSearchQuery.trim();
      if (!query) { setPatientSearchError("Ingrese un código (Surecode)."); return; }
      setIsSearchingPatient(true); setPatientSearchError(null); setSelectedPatientData(null);
      try {
          const { data, error: _error } = await supabase.from("patients").select("id, name, surecode, phone, allergies, Foto_paciente").eq("surecode", query).single();
          if (_error) { if (_error.code === "PGRST116") { setPatientSearchError(`Código "${query}" no encontrado.`); } else { throw _error; } setSelectedPatientData(null);
          } else if (data) { setSelectedPatientData(data as Patient); setPatientSearchError(null); closeSearchModal(); toast.success(`Paciente ${data.name} identificado.`, {id: 'patient-found'});
          } else { setPatientSearchError(`Código "${query}" no encontrado.`); setSelectedPatientData(null); }
      } catch (err: any) { console.error("Error buscando código:", err); setPatientSearchError(`Error: ${err.message || "?"}.`); setSelectedPatientData(null);
      } finally { setIsSearchingPatient(false); }
  };

  // --- Cámara ---
  const startCamera = useCallback(async () => {
    if (!navigator.mediaDevices?.getUserMedia) { setPatientSearchError("Cámara no soportada."); setIsCameraLoading(false); setShowCamera(false); return; }
    setPatientSearchError(null); setIsCameraLoading(true); setShowCamera(true);
    try {
        const mediaStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user" } });
        if (videoRef.current) { videoRef.current.srcObject = mediaStream; await videoRef.current.play(); console.log("[Camera] Playing."); setStream(mediaStream); }
        else { throw new Error("<video> ref not found."); }
    } catch (error: any) {
        console.error("Error cámara:", error); let msg = `Error (${error.name || '?'}).`;
        if (error.name === "NotAllowedError") msg = "Permiso cámara denegado."; else if (error.name === "NotFoundError") msg = "No se encontró cámara."; else if (error.name === "NotReadableError") msg = "Cámara ocupada.";
        setPatientSearchError(msg); setShowCamera(false); setStream(null);
        if (videoRef.current?.srcObject) { (videoRef.current.srcObject as MediaStream).getTracks().forEach(t => t.stop()); videoRef.current.srcObject = null; }
    } finally { setIsCameraLoading(false); }
  }, []);

  const stopCamera = useCallback(() => {
      if (stream) { stream.getTracks().forEach(t => t.stop()); console.log("[Camera] Stopped."); }
      if (videoRef.current) { videoRef.current.srcObject = null; videoRef.current.load(); }
      setStream(null); setShowCamera(false); setIsCameraLoading(false);
  }, [stream]);

  const closeSearchModal = useCallback(() => {
    if (stream) stopCamera();
    setActiveIdentificationModal(null);
    setPatientSearchQuery(""); setPatientSearchError(null);
    setIsSearchingPatient(false); setIsIdentifyingFace(false);
  }, [stream, stopCamera]);

  // --- FACIAL RECOGNITION ---
  const handleIdentifyFace = useCallback(async () => {
      if (!videoRef.current || !canvasRef.current || !stream || isIdentifyingFace) { console.warn("Prereq ID Facial fail."); if (!stream) setPatientSearchError("Cámara inactiva."); return; }
      setIsIdentifyingFace(true); setPatientSearchError(null);
      try {
          const video = videoRef.current; const canvas = canvasRef.current; canvas.width = video.videoWidth; canvas.height = video.videoHeight;
          const context = canvas.getContext('2d'); if (!context) throw new Error("No context 2D");
          context.translate(canvas.width, 0); context.scale(-1, 1); context.drawImage(video, 0, 0, canvas.width, canvas.height); context.setTransform(1, 0, 0, 1, 0, 0);
          const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.9)); if (!blob) throw new Error("Blob fail");
          const formData = new FormData(); formData.append('image', blob, 'face_capture.jpg');
          const facialApiUrl = `${BACKEND_API_FACE_URL}/identify`;
          console.log("-> Facial API:", facialApiUrl);
          const response = await fetch(facialApiUrl, { method: "POST", body: formData });
          if (!response.ok) { let err = `Err ${response.status}`; try { err = (await response.json()).detail || err; } catch (e) {} throw new Error(err); }
          const result: IdentifyResponse = await response.json(); console.log("<- Facial API:", result);
          if (result.found && result.patient) {
              const { data: patientFullData, error: patientError } = await supabase.from('patients').select('*').eq('id', result.patient.id).single();
              if (patientError) throw patientError;
              const found: Patient = patientFullData as Patient;
              setSelectedPatientData(found); setPatientSearchError(null); closeSearchModal();
              toast.success(`Paciente ${found.name} identificado (Facial).`, {id: 'patient-found-facial'});
          } else { setPatientSearchError(`No encontrado. (Emoción: ${result.current_emotion.dominant_emotion})`); setSelectedPatientData(null); toast.error("Rostro no reconocido.", {id: 'face-not-found'});}
      } catch (error: any) { console.error("Error ID Facial:", error); setPatientSearchError(`Error ID Facial: ${error.message || "?"}`); setSelectedPatientData(null);
      } finally { setIsIdentifyingFace(false); }
  }, [stream, isIdentifyingFace, closeSearchModal, BACKEND_API_FACE_URL]);


  // --- RFID Identification ---
  const handleRFIDPatientIdentified = useCallback(async (rfidData: RFIDPatientData | null) => {
    // If rfidData is null, it means there was a read error or no patient was found for the tag.
    if (!rfidData) {
        setPatientSearchError("Lectura RFID fallida o tag no asociado a un paciente.");
        setSelectedPatientData(null);
        return;
    }

    setIsSearchingPatient(true);
    setPatientSearchError(null);
    try {
        const { data: patientFullData, error: patientError } = await supabase.from('patients').select('*').eq('id', rfidData.id).single();
        if (patientError) {
            console.error("Error fetching patient details after RFID:", patientError);
            setPatientSearchError(`Error al obtener datos del paciente: ${patientError.message}`);
            setSelectedPatientData(null);
        } else if (patientFullData) {
            setSelectedPatientData(patientFullData as Patient);
            setPatientSearchError(null);
            toast.success(`Paciente ${patientFullData.name} identificado (RFID).`, { id: 'patient-found-rfid' });
            setTimeout(closeSearchModal, 300);
        } else {
            setPatientSearchError("Paciente no encontrado en la base de datos.");
            setSelectedPatientData(null);
        }
    } catch (err: any) {
        console.error("Unexpected error during RFID patient lookup:", err);
        setPatientSearchError(`Error inesperado: ${err.message}`);
        setSelectedPatientData(null);
    } finally {
        setIsSearchingPatient(false);
    }
}, [closeSearchModal]);


  // --- Otros Handlers UI ---
  const deselectPatient = () => {
    setSelectedPatientData(null);
    setPatientSearchQuery("");
    setPatientSearchError(null);
    setShowValidationMessage(false);
    setActiveIdentificationModal(null);

    if (activePrescription) {
        toast.error("Paciente desvinculado. La receta ya no está activa para esta venta.", { id: 'prescription-unlinked', duration: 5000 });
        setActivePrescription(null);
         setCartItems(prev => prev.map(item => {
             // eslint-disable-next-line @typescript-eslint/no-unused-vars
             const { prescriptionLink, ...rest } = item;
             return rest as CartItem;
         }));
    }
     toast("Paciente deseleccionado.", { icon: '👤', id: 'patient-deselected' });
  };

  const validateClientInfo = (): boolean => { const i = buyWithoutAccount || !!selectedPatientData; if (cartItems.length > 0) { setShowValidationMessage(!i); } else { setShowValidationMessage(false); } return i; };
  const handleBuyWithoutAccount = () => { const n = !buyWithoutAccount; setBuyWithoutAccount(n); if (n) { setSelectedPatientData(null); setActivePrescription(null); setPatientSearchError(null); toast("Venta General activada.", {icon: '🏷️'});} else { toast("Venta General desactivada.", {icon: '👤'});} setShowValidationMessage(false); };


    // --- NUEVAS FUNCIONES PARA RECETAS ---

    const handleLoadPrescriptionToCart = useCallback(async (receta: RecetaHistorial) => {
      if (!currentPharmacyId) { toast.error("ID de farmacia no disponible."); return; }
      if (activePrescription && activePrescription.id !== receta.id) {
          toast.error("Ya hay otra receta activa. Finalice o cancele la venta actual para cargar una nueva.", { duration: 5000 });
          return;
      }

      toast.loading("Cargando medicamentos de la receta...", { id: 'loading-prescription-items'});
      const itemsToAdd: { product: Product, quantity: number, prescriptionLink: PrescriptionLink }[] = [];
      const missingItems: string[] = [];
      let allFoundAndStock = true;

      for (const med of receta.medicamentos) {
        const { data: productData, error: productError } = await supabase
          .from("medicamentos")
          .select("upc, nombre_medicamento, precio_en_pesos, unidades, id_farmacia")
          .eq("id_farmacia", currentPharmacyId)
          .eq("nombre_medicamento", med.nombre)
          .maybeSingle();

        if (productError || !productData) {
          console.warn(`Medicamento "${med.nombre}" de la receta no encontrado en el inventario de la farmacia.`, productError);
          missingItems.push(med.nombre);
          allFoundAndStock = false; continue;
        }
        const quantityPrescribed = parseInt(med.cantidad_a_dispensar, 10);
        if (isNaN(quantityPrescribed) || quantityPrescribed <= 0) {
          console.warn(`Cantidad inválida para ${med.nombre}: ${med.cantidad_a_dispensar}. Saltando.`);
          continue;
        }

        const existingCartItem = cartItems.find(item =>
            item.upc === productData.upc &&
            item.prescriptionLink?.receta_id === receta.id &&
            item.prescriptionLink?.medicamento_recetado.nombre === med.nombre
        );
        const currentQuantityInCart = existingCartItem ? existingCartItem.cantidad : 0;
        const neededQuantity = quantityPrescribed - currentQuantityInCart;

        if (neededQuantity <= 0) {
            console.log(`${med.nombre} ya está en carrito a la cantidad recetada o más.`);
            continue;
        }

        if (productData.unidades < neededQuantity) {
          toast.error(`Stock insuficiente para ${med.nombre}. Recetado pendiente: ${neededQuantity}, Disponible: ${productData.unidades}.`, { id: `stock-issue-${productData.upc}`, duration: 5000});
          missingItems.push(`${med.nombre} (stock insuficiente: ${productData.unidades})`);
          allFoundAndStock = false; continue;
        }

         itemsToAdd.push({
             product: productData as Product,
             quantity: quantityPrescribed,
             prescriptionLink: { receta_id: receta.id, medicamento_recetado: med }
         });
      }

      let successfullyAddedCount = 0;
      for (const item of itemsToAdd) {
          const existingItem = cartItems.find(cartI =>
             cartI.upc === item.product.upc &&
             cartI.prescriptionLink?.receta_id === item.prescriptionLink.receta_id &&
             cartI.prescriptionLink?.medicamento_recetado.nombre === item.prescriptionLink.medicamento_recetado.nombre
          );
          const currentQty = existingItem ? existingItem.cantidad : 0;
          const qtyToAdd = item.quantity - currentQty;

          if (qtyToAdd > 0) {
               const success = handleAddToCart(item.product, qtyToAdd, item.prescriptionLink);
                if (success) { successfullyAddedCount++; }
           } else {
               successfullyAddedCount++;
           }
      }

      toast.dismiss('loading-prescription-items');
      const totalPrescribedItems = receta.medicamentos.filter(med => {
            const quantity = parseInt(med.cantidad_a_dispensar, 10);
            return !isNaN(quantity) && quantity > 0;
      }).length;

      if (totalPrescribedItems === 0) {
           toast('La receta no especifica medicamentos.', { icon: 'ℹ️', id: 'empty-prescription', duration: 3000 });
      } else if (successfullyAddedCount === totalPrescribedItems && missingItems.length === 0 && allFoundAndStock) {
          setActivePrescription(receta);
          toast.success('Todos los medicamentos de la receta cargados al carrito.', { id: 'all-prescription-items-loaded', duration: 3000 });
      } else if (successfullyAddedCount > 0) {
           setActivePrescription(receta);
           toast('Algunos medicamentos de la receta no pudieron cargarse (stock insuficiente o no encontrados).', { icon: '⚠️', id: 'partial-prescription-items-loaded', duration: 5000 });
      } else if (missingItems.length > 0) {
          toast.error('No se pudo cargar ningún medicamento de la receta (no encontrados o stock insuficiente).', { id: 'no-prescription-items-loaded', duration: 5000 });
      } else {
           toast('No se añadieron nuevos medicamentos de la receta (ya estaban en el carrito).', { icon: 'ℹ️', id: 'no-new-prescription-items', duration: 3000 });
      }

      setSelectedPrescription(receta);
      setShowPrescriptionModal(false);

    }, [currentPharmacyId, handleAddToCart, activePrescription, cartItems]);


    const fetchPatientPrescriptions = useCallback(async () => {
      if (!selectedPatientData?.id) { setPrescriptionFetchError("Paciente no seleccionado."); return; }
      setIsFetchingPrescriptions(true); setPrescriptionFetchError(null); setPatientPrescriptions([]);
      try {
        const sixtyDaysAgo = new Date(); sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60);
        const sixtyDaysAgoISO = sixtyDaysAgo.toISOString().split('T')[0];

        const { data, error } = await supabase.from('recetas')
          .select(`id, fecha_consulta, diagnostico, medicamentos, fecha_emision, estado_dispensacion`)
          .eq('paciente_id', selectedPatientData.id)
          .gte('fecha_consulta', sixtyDaysAgoISO)
          .order('fecha_consulta', { ascending: false });

        if (error) throw error;

        const validPrescriptions = (data as RecetaHistorial[]).filter(r =>
             r.estado_dispensacion !== 'dispensada' &&
             (r.medicamentos?.length > 0 || r.estado_dispensacion === 'incompleta')
        );

        setPatientPrescriptions(validPrescriptions);

        const todayPrescription = validPrescriptions.find( (receta) => receta.fecha_consulta === getTodayDateString );
        if (todayPrescription && !activePrescription) {
          toast('Receta del día detectada. Intentando cargar al carrito...', { icon: '📝', id: 'today-prescription-auto-load', duration: 4000});
          setTimeout(() => { handleLoadPrescriptionToCart(todayPrescription); }, 150);
        } else if (todayPrescription && activePrescription && activePrescription.id === todayPrescription.id) {
             toast('La receta del día ya está cargada.', { icon: 'ℹ️', id: 'today-prescription-already-loaded'});
        } else if (!todayPrescription && validPrescriptions.length > 0) {
             toast(`Encontradas ${validPrescriptions.length} recetas pendientes o incompletas (últimos 60 días).`, { icon: '📋', id: 'old-pending-prescriptions', duration: 4000});
        } else if (validPrescriptions.length === 0) {
             toast('No se encontraron recetas recientes pendientes o incompletas.', { icon: '👍', id: 'no-pending-prescriptions', duration: 3000});
        }
      } catch (err: any) {
        console.error("Error fetching patient prescriptions:", err);
        setPrescriptionFetchError(`Error al cargar recetas: ${err.message || "Error desconocido"}`);
        toast.error("Error al cargar recetas del paciente.", { id: 'prescriptions-fetch-fail'});
      } finally { setIsFetchingPrescriptions(false); }
    }, [selectedPatientData, getTodayDateString, handleLoadPrescriptionToCart, activePrescription]);


  const openPrescriptionsModal = useCallback(() => {
    if (!selectedPatientData?.id) { toast.error("Selecciona un paciente para ver sus recetas.", { id: 'no-patient-for-recipes'}); return; }
    setShowPrescriptionModal(true);
    fetchPatientPrescriptions();
  }, [selectedPatientData, fetchPatientPrescriptions]);


  // --- Lógica de Pago (Carrito Actual) ---
  const generateMercadoPagoQrCode = useCallback(async () => {
    if (isGeneratingQR || (mercadoPagoQrUrl && !qrError)) return;

    const total = calculateTotal();
    if (total <= 0) { setQrError("Monto a pagar debe ser mayor que cero."); return; }
    if (!currentPharmacyId || !currentWorkerId || !activeCashSession?.id) {
         setQrError("Faltan datos de sesión o trabajador.");
         console.error("Missing session/worker data for MP QR.");
         return;
    }

    const desc = `Venta Farmacia ID ${currentPharmacyId} por Trabajador ${currentWorkerId.substring(0,6)}`;
    setIsGeneratingQR(true);
    setQrError(null);
    setCurrentOrderId(null);

     let prescriptionUpdateData = null;
       const dispensedItems = cartItems.filter( item => item.prescriptionLink?.receta_id === activePrescription?.id );
       if (activePrescription && dispensedItems.length > 0) {
           const medicamentos_dispensados_detalle = dispensedItems.map(item => ({
               upc: item.upc,
               nombre: item.nombre_medicamento,
               cantidad_dispensada: item.cantidad,
               precio_unitario: item.precio_en_pesos,
               receta_detalle: item.prescriptionLink?.medicamento_recetado
           }));

            const originalMedicamentos = activePrescription.medicamentos;
            let allPrescribedItemsFullyDispensados = true;

            if (originalMedicamentos.length > 0) {
                for (const originalMed of originalMedicamentos) {
                    const prescribedQuantity = parseInt(originalMed.cantidad_a_dispensar, 10);
                    const dispensedItem = dispensedItems.find(item =>
                        item.prescriptionLink?.medicamento_recetado.nombre === originalMed.nombre
                    );
                    if (!dispensedItem || dispensedItem.cantidad < prescribedQuantity) {
                         allPrescribedItemsFullyDispensados = false;
                        break;
                    }
                }
            } else {
                 allPrescribedItemsFullyDispensados = (dispensedItems.length === 0);
            }

           let estado_dispensacion_final;
           if (allPrescribedItemsFullyDispensados && originalMedicamentos.length > 0) {
               estado_dispensacion_final = 'dispensada';
           } else if (dispensedItems.length > 0) {
               estado_dispensacion_final = 'incompleta';
           } else {
               estado_dispensacion_final = 'no dispensada';
           }

           if (medicamentos_dispensados_detalle.length > 0) {
               prescriptionUpdateData = {
                   receta_id: activePrescription.id,
                   estado_dispensacion: estado_dispensacion_final,
                   medicamentos_dispensados_detalle,
               };
           } else {
               prescriptionUpdateData = null;
           }
       }


    try {
        const payload = {
            amount: total,
            description: desc,
            paciente_id: selectedPatientData?.id || null,
            compra_sin_cuenta: buyWithoutAccount,
            cartItems: cartItems.map(i => ({
                upc: i.upc,
                nombre: i.nombre_medicamento,
                cantidad: i.cantidad,
                precio_unitario: i.precio_en_pesos,
                id_farmacia: i.id_farmacia,
                prescriptionLink: i.prescriptionLink ? {
                     receta_id: i.prescriptionLink.receta_id,
                     medicamento_recetado: i.prescriptionLink.medicamento_recetado
                 } : undefined,
             })),
             id_farmacia: currentPharmacyId,
             payment_method: paymentMethod,
             prescription_update_data: prescriptionUpdateData,
             cash_session_id: activeCashSession.id,
             id_trabajador: currentWorkerId,
         };

        console.log("Payload para MP QR:", JSON.stringify(payload, null, 2));
        const res = await fetch(`${BACKEND_API_BASE_URL}/create_order`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload)
        });

        const data = await res.json();
        if (!res.ok) throw new Error(data.message || `Err ${res.status}`);

        if (data.init_point_url && data.order_id) {
            setCurrentOrderId(data.order_id);
            const qr = await QRCode.toDataURL(data.init_point_url, { errorCorrectionLevel: "L", margin: 1, scale: 5 });
            setMercadoPagoQrUrl(qr);
             toast.success("QR generado. Esperando pago...", { id: 'mpqr-generated' });
        } else {
            throw new Error("Respuesta de Mercado Pago inválida o faltan datos (init_point_url/order_id).");
        }
    } catch (e: any) {
        console.error("Error generando QR MP:", e);
        setQrError(e.message || "Error de red o al generar QR.");
        setMercadoPagoQrUrl(null);
        setCurrentOrderId(null);
         toast.error("Error al generar QR. Intente de nuevo.", { id: 'mpqr-gen-fail' });
    }
    finally {
        setIsGeneratingQR(false);
    }
  }, [cartItems, selectedPatientData, buyWithoutAccount, isGeneratingQR, mercadoPagoQrUrl, qrError, calculateTotal, currentPharmacyId, BACKEND_API_BASE_URL, activePrescription, activeCashSession, currentWorkerId, paymentMethod]);


  const handleCheckout = () => {
    if (!activeCashSession || activeCashSession.estado !== 'abierta') {
         toast.error("No hay una sesión de caja activa. Por favor, abre la caja primero.", {id: 'no-cash-session-checkout'});
         return;
     }
    if (cartItems.length === 0) {
         toast.error("El carrito está vacío.", { id: 'checkout-precheck-empty'});
         return;
    }
    if (!validateClientInfo()) {
         toast.error("Selecciona un paciente o marca 'Venta General'.", { id: 'checkout-precheck-patient'});
         setShowValidationMessage(true);
         return;
    }
    setShowValidationMessage(false);

    setMercadoPagoQrUrl(null); setQrError(null); setIsGeneratingQR(false); setCurrentOrderId(null);
    setCashConfirmationError(null); setIsConfirmingCash(false); setAmountPaid(""); setReceiptNumber(null);
    setCardConfirmationError(null); setIsConfirmingCardPayment(false); setCountdownForCard(0); setCardPaymentReference("");
    if (countdownIntervalRef.current) { clearInterval(countdownIntervalRef.current); countdownIntervalRef.current = null; }

    setShowPaymentModal(true);
  };

  useEffect(() => {
    if (showPaymentModal) {
        if (paymentMethod === "mercadoPagoQR") {
             if (!mercadoPagoQrUrl || qrError) {
                 generateMercadoPagoQrCode();
             }
        } else {
            setMercadoPagoQrUrl(null); setQrError(null); setIsGeneratingQR(false);
        }

        if (paymentMethod === "tarjeta") {
            setCountdownForCard(10); setIsConfirmingCardPayment(false); setCardConfirmationError(null);
            if (countdownIntervalRef.current) { clearInterval(countdownIntervalRef.current); }
            countdownIntervalRef.current = setInterval(() => {
                setCountdownForCard(prev => {
                    if (prev <= 1) { clearInterval(countdownIntervalRef.current!); countdownIntervalRef.current = null; return 0; }
                    return prev - 1;
                });
            }, 1000);
        } else {
            if (countdownIntervalRef.current) { clearInterval(countdownIntervalRef.current); countdownIntervalRef.current = null; }
            setCountdownForCard(0);
            setIsConfirmingCardPayment(false);
            setCardConfirmationError(null);
        }
    } else {
        if (countdownIntervalRef.current) { clearInterval(countdownIntervalRef.current); countdownIntervalRef.current = null; }
        setCountdownForCard(0);
        setIsConfirmingCardPayment(false);
    }
  }, [showPaymentModal, paymentMethod, generateMercadoPagoQrCode, qrError, mercadoPagoQrUrl]);


  const resetPOSState = useCallback(() => {
    console.log("Resetting POS state...");
    stopCamera();
    setCartItems([]); setSelectedProduct(null); setProductSearch(""); setProductQuantity(1); setSearchResults([]); setStockWarning(null); setIsSearchingDb(false); setIsSearchFocused(false);
    setSelectedPatientData(null); setPatientSearchQuery(""); setPatientSearchError(null); setActiveIdentificationModal(null); setBuyWithoutAccount(false); setShowValidationMessage(false); setIsSearchingPatient(false); setIsIdentifyingFace(false);
    setShowPaymentModal(false); setReceiptNumber(null); setAmountPaid("");
    setMercadoPagoQrUrl(null); setIsGeneratingQR(false); setQrError(null); setCurrentOrderId(null);
    setIsConfirmingCash(false); setCashConfirmationError(null);
    setIsConfirmingCardPayment(false); setCardConfirmationError(null); setCardPaymentReference("");
    if (countdownIntervalRef.current) { clearInterval(countdownIntervalRef.current); countdownIntervalRef.current = null; }

    setReceiptSearchQuery(""); setFoundAppointmentPayment(null); setAppointmentPrice(""); setAppointmentPaymentMethod("efectivo"); setAppointmentCardReference("");
    setIsSearchingReceipt(false); setReceiptSearchError(null); setIsUpdatingPayment(false); setPaymentUpdateError(null); setPaymentUpdateSuccess(null);

    setShowPrescriptionModal(false); setPatientPrescriptions([]); setIsFetchingPrescriptions(false); setPrescriptionFetchError(null); setSelectedPrescription(null);
    setActivePrescription(null);
  }, [stopCamera]);

  const handleCompletePayment = async () => {
      if (!activeCashSession || activeCashSession.estado !== 'abierta') {
          toast.error("No hay una sesión de caja activa. Por favor, abre la caja primero.", {id: 'no-cash-session-complete'});
           setShowPaymentModal(false);
           setShowOpenCashSessionModal(true);
          return;
      }
       if (!currentWorkerId) {
           toast.error("Datos de trabajador no disponibles.", {id: 'no-worker-id-complete'});
           return;
       }

      setCashConfirmationError(null); setQrError(null); setCardConfirmationError(null);

      const total = calculateTotal();
      if (cartItems.length === 0 || total <= 0) {
           toast.error("El carrito está vacío o el total es cero.", { id: 'complete-payment-empty-cart' });
           return;
      }
       if (!buyWithoutAccount && !selectedPatientData) {
           toast.error("Selecciona un paciente o marca 'Venta General'.", { id: 'complete-payment-no-patient' });
           setShowValidationMessage(true);
           return;
       }
      setShowValidationMessage(false);

      if (paymentMethod === "tarjeta" && !cardPaymentReference.trim()) {
           setCardConfirmationError("Ingresa el número de referencia de la transacción con tarjeta.");
           toast.error("Referencia de tarjeta requerida.", { id: 'card-ref-missing'});
           return;
      }
       if (paymentMethod === "efectivo") {
           const paid = parseFloat(amountPaid);
           if (isNaN(paid) || paid < total) {
                setCashConfirmationError("Monto recibido insuficiente.");
                toast.error("Monto recibido insuficiente.", { id: 'cash-amount-insufficient'});
                return;
           }
       }
       if (paymentMethod === "mercadoPagoQR") {
            if (!mercadoPagoQrUrl || !!qrError || !currentOrderId) {
                setQrError(qrError || "QR no generado o con error.");
                 toast.error("El QR de pago no está listo.", { id: 'mpqr-not-ready'});
                return;
            }
            console.log(`Completing UI for MP QR order ${currentOrderId}. Backend relies on webhook.`);
             setReceiptNumber(currentOrderId);
             toast("Venta marcada como en proceso de pago QR. Esperando confirmación final por Mercado Pago...", { icon: '⏳', id: 'mpqr-final-confirm', duration: 8000 });
             setTimeout(resetPOSState, 8000);
             return;
       }


      let prescriptionUpdateData = null;
       const dispensedItems = cartItems.filter(item => item.prescriptionLink?.receta_id === activePrescription?.id);
       if (activePrescription && dispensedItems.length > 0) {
           const medicamentos_dispensados_detalle = dispensedItems.map(item => ({
               upc: item.upc,
               nombre: item.nombre_medicamento,
               cantidad_dispensada: item.cantidad,
               precio_unitario: item.precio_en_pesos,
               receta_detalle: item.prescriptionLink?.medicamento_recetado
           }));

           const originalMedicamentos = activePrescription.medicamentos;
           let allPrescribedItemsFullyDispensados = true;

           if (originalMedicamentos.length > 0) {
               for (const originalMed of originalMedicamentos) {
                   const prescribedQuantity = parseInt(originalMed.cantidad_a_dispensar, 10);
                    if (isNaN(prescribedQuantity) || prescribedQuantity <= 0) continue;

                   const dispensedItem = dispensedItems.find(item =>
                       item.prescriptionLink?.medicamento_recetado.nombre === originalMed.nombre
                   );
                   if (!dispensedItem || dispensedItem.cantidad < prescribedQuantity) {
                        allPrescribedItemsFullyDispensados = false;
                       break;
                   }
               }
           } else {
                allPrescribedItemsFullyDispensados = (originalMedicamentos.length === 0 && dispensedItems.length === 0);
                if (originalMedicamentos.length === 0 && dispensedItems.length > 0) {
                     console.warn("Recipe has no prescribed meds, but items linked to it were dispensed. Marking as incomplete.");
                     allPrescribedItemsFullyDispensados = false;
                }
           }


          let estado_dispensacion_final;
          if (allPrescribedItemsFullyDispensados && originalMedicamentos.length > 0) {
              estado_dispensacion_final = 'dispensada';
          } else if (dispensedItems.length > 0) {
              estado_dispensacion_final = 'incompleta';
          } else {
               estado_dispensacion_final = 'no dispensada';
          }
          if (medicamentos_dispensados_detalle.length > 0 || (estado_dispensacion_final === 'dispensada' && originalMedicamentos.length > 0)) {
              prescriptionUpdateData = {
                  receta_id: activePrescription.id,
                  estado_dispensacion: estado_dispensacion_final,
                  medicamentos_dispensados_detalle,
              };
          } else {
              prescriptionUpdateData = null;
          }
       }


      const payload = {
          amount: total,
          description: `Venta POS (${paymentMethod}) #${Date.now().toString().slice(-5)}`,
          paciente_id: selectedPatientData?.id || null,
          compra_sin_cuenta: Boolean(buyWithoutAccount),
          cartItems: cartItems.map(i => ({
              upc: i.upc,
              nombre: i.nombre_medicamento,
              cantidad: i.cantidad,
              precio_unitario: i.precio_en_pesos,
              id_farmacia: i.id_farmacia,
              prescriptionLink: i.prescriptionLink ? {
                   receta_id: i.prescriptionLink.receta_id,
                   medicamento_recetado: i.prescriptionLink.medicamento_recetado
               } : undefined,
           })),
           id_farmacia: currentPharmacyId,
           payment_method: paymentMethod,
           prescription_update_data: prescriptionUpdateData,
           cash_session_id: activeCashSession.id,
           id_trabajador: currentWorkerId,
           referencia_tarjeta: paymentMethod === "tarjeta" ? cardPaymentReference.trim() : null,
       };

      console.log("Payload enviado al backend (/create_order):", JSON.stringify(payload, null, 2));

      const processPayment = async () => {
          try {
              const res = await fetch(`${BACKEND_API_BASE_URL}/create_order`, {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify(payload)
              });

              const data = await res.json();
              if (!res.ok) {
                  let errorMessage = data.message || `Error HTTP: ${res.status}`;
                  if (res.status === 409 && data.stockErrors) {
                      errorMessage = `Errores de Stock: ${data.stockErrors.map((e: any) => `${e.nombre || 'UPC '+e.upc}: ${e.message}`).join("; ")}`;
                  } else if (res.status === 400 && data.message.includes('cash session')) {
                       errorMessage = `Error de caja: ${data.message}`;
                  }
                  throw new Error(errorMessage);
              }

              const receipt = data.receipt_number || data.order_id || `${paymentMethod.toUpperCase()}-${Date.now()}`;
              setReceiptNumber(receipt);
              toast.success(`Venta procesada con ${paymentMethod}. Recibo: ${receipt}`, { id: 'payment-success-frontend', duration: 4000});

              setCardPaymentReference("");
              setTimeout(resetPOSState, 4000);

          } catch (e: any) {
              console.error(`Error procesando pago (${paymentMethod}):`, e);
              const errorMsg = e.message || "Error desconocido al procesar el pago.";
              if (paymentMethod === "efectivo") setCashConfirmationError(errorMsg);
              else if (paymentMethod === "tarjeta") setCardConfirmationError(errorMsg);
              else if (paymentMethod === "mercadoPagoQR") setQrError(errorMsg);

               if (!cashConfirmationError && !cardConfirmationError && !qrError) {
                   toast.error(`Fallo en la venta: ${errorMsg}`, { id: 'payment-fail-frontend', duration: 5000 });
               }

              throw e;
          }
      };

      if (paymentMethod === "efectivo") {
          setIsConfirmingCash(true);
          try { await processPayment(); }
          catch (e) { /* Error already handled */ }
          finally { setIsConfirmingCash(false); }

      } else if (paymentMethod === "tarjeta") {
          if (countdownForCard > 0) {
               setCardConfirmationError(`Espera ${countdownForCard}s para confirmar.`);
               toast.error("Espera que el contador termine antes de confirmar.", { id: 'card-countdown-final'});
               return;
           }
          setIsConfirmingCardPayment(true);
          try { await processPayment(); }
          catch (e) { /* Error already handled */ }
          finally { setIsConfirmingCardPayment(false); }
      }
  };


  // --- MODAL Management ---
  const openSearchModal = (type: 'code' | 'facial' | 'rfid') => {
    setPatientSearchQuery(""); setPatientSearchError(null); setIsSearchingPatient(false); setIsIdentifyingFace(false);
    if (type !== 'facial' && stream) stopCamera();
    setActiveIdentificationModal(type);
    if (type === 'facial') setTimeout(startCamera, 150);
  };

  useEffect(() => {
    const isFacialModalOpen = activeIdentificationModal === "facial";
    if (!isFacialModalOpen && stream) { stopCamera(); }
    return () => { if (stream) { stopCamera(); } };
  }, [activeIdentificationModal, stream, stopCamera]);


  // --- FUNCIONES: Pago de Citas Pendientes ---
  const handleReceiptSearch = async () => {
      const q = receiptSearchQuery.trim();
      if (!q) { setReceiptSearchError("Ingrese el número de recibo de la cita."); return; }

      setIsSearchingReceipt(true);
      setReceiptSearchError(null);
      setPaymentUpdateError(null);
      setPaymentUpdateSuccess(null);
      setFoundAppointmentPayment(null);
      setAppointmentPrice("");
      setAppointmentPaymentMethod("efectivo");
      setAppointmentCardReference("");

      try {
          const { data, error } = await supabase.from('pago_e_cita')
              .select(`id, cita_id, metodo_pago, numero_recibo, estado_pago, precio, fecha_creacion, id_farmacia, referencia_tarjeta,
                       citas (horario_cita, dia_atencion, id_usuario, motivo_cita, patients (name))`)
              .eq('numero_recibo', q)
              .maybeSingle();

          if (error && error.code !== 'PGRST116') {
              console.error("Error buscando recibo:", error);
              setReceiptSearchError(`Error en la base de datos: ${error.message}`);
               toast.error("Error en la base de datos al buscar recibo.", { id: 'receipt-search-db-fail'});
          } else if (data) {
              const citaObject = Array.isArray(data.citas) && data.citas.length > 0 ? data.citas[0] : null;
              const d: FoundAppointmentPayment = { ...data, citas: citaObject ? { ...citaObject, patients: (citaObject as any).patients || null } : null };
              
              setFoundAppointmentPayment(d);
              if(d.precio !== null) setAppointmentPrice(String(d.precio));
              if(d.metodo_pago !== null) setAppointmentPaymentMethod(d.metodo_pago);
              if(d.referencia_tarjeta) setAppointmentCardReference(d.referencia_tarjeta);

              setReceiptSearchError(null);
              toast.success(`Recibo ${q} encontrado.`, { id: 'receipt-found'});

              if (data.estado_pago === 'pagado') {
                  toast(`Este recibo (${q}) ya ha sido marcado como pagado.`, { icon: 'ℹ️', id: 'receipt-already-paid', duration: 5000 });
              }

          } else {
               setReceiptSearchError(`Recibo "${q}" no encontrado.`);
               setFoundAppointmentPayment(null);
               toast.error(`Recibo ${q} no encontrado.`, { id: 'receipt-not-found'});
          }
      } catch (e: any) {
          console.error("Excepción al buscar recibo:", e);
          setReceiptSearchError("Error inesperado al buscar el recibo.");
          setFoundAppointmentPayment(null);
           toast.error("Error inesperado al buscar el recibo.", { id: 'receipt-search-exception'});
      }
      finally {
          setIsSearchingReceipt(false);
      }
  };

  const handleConfirmAppointmentPayment = async () => {
      if (!activeCashSession || activeCashSession.estado !== 'abierta') {
          toast.error("No hay una sesión de caja activa. Por favor, abre la caja primero.", {id: 'no-cash-session-app-complete'});
           setShowOpenCashSessionModal(true);
          return;
      }
       if (!currentWorkerId) {
           toast.error("Datos de trabajador no disponibles.", {id: 'no-worker-id-app-complete'});
           return;
       }


      if (!foundAppointmentPayment || foundAppointmentPayment.estado_pago !== 'pendiente') {
          setPaymentUpdateError("No hay cita pendiente seleccionada para confirmar.");
          return;
      }
      const p = parseFloat(appointmentPrice);
      if (isNaN(p) || p <= 0) {
          setPaymentUpdateError("Precio cobrado inválido.");
          return;
      }

       if (appointmentPaymentMethod === "tarjeta" && !appointmentCardReference.trim()) {
           setPaymentUpdateError("Ingresa el número de referencia de la transacción con tarjeta.");
           return;
       }

      setIsUpdatingPayment(true);
      setPaymentUpdateError(null);
      setPaymentUpdateSuccess(null);

      try {
          const { error } = await supabase.from('pago_e_cita')
              .update({
                  precio: p,
                  estado_pago: 'pagado',
                  fecha_pago: new Date().toISOString().split('T')[0],
                  id_farmacia: currentPharmacyId,
                  cash_session_id: activeCashSession.id,
                  id_trabajador: currentWorkerId,
                  metodo_pago: appointmentPaymentMethod,
                  referencia_tarjeta: appointmentPaymentMethod === "tarjeta" ? appointmentCardReference.trim() : null,
              })
              .eq('id', foundAppointmentPayment.id)
              .eq('estado_pago', 'pendiente');

          if (error) {
              console.error("Error DB al actualizar pago de cita:", error);
              if (error.code === '23503') {
                   setPaymentUpdateError("Error al asociar pago con caja o trabajador. Contacta a soporte.");
              } else {
                   setPaymentUpdateError(`Error al guardar pago: ${error.message}`);
              }
              throw error;
          } else {
              setFoundAppointmentPayment(prev => prev ? {
                  ...prev,
                  estado_pago: 'pagado',
                  precio: p,
                  metodo_pago: appointmentPaymentMethod,
                  referencia_tarjeta: appointmentPaymentMethod === "tarjeta" ? appointmentCardReference.trim() : null
              } : null);
              setPaymentUpdateSuccess(`Pago de cita ${foundAppointmentPayment.numero_recibo} marcado como PAGADO.`);
              toast.success("Pago de cita completado.", { id: 'appointment-payment-success-db', duration: 4000 });
              setTimeout(() => {
                  setReceiptSearchQuery(""); setFoundAppointmentPayment(null); setAppointmentPrice("");
                  setAppointmentPaymentMethod("efectivo"); setAppointmentCardReference("");
                  setPaymentUpdateSuccess(null); setReceiptSearchError(null);
              }, 4000);
          }
      } catch (e: any) {
          console.error("Error en try/catch de update pago de cita:", e);
           toast.error("Error al confirmar pago de cita.", { id: 'appointment-payment-fail', duration: 5000 });
      } finally {
          setIsUpdatingPayment(false);
      }
  };


  // --- FUNCIONES DE CAJA ---
  const handleOpenCashSession = async () => {
    const amount = parseFloat(initialAmount);
    if (isNaN(amount) || amount < 0) {
        toast.error("Por favor, ingresa un monto inicial válido."); return;
    }
    if (!currentPharmacyId || !currentWorkerId) {
        toast.error("Faltan datos del trabajador o farmacia."); return;
    }

    setIsOpeningSession(true);
    const { data: newSession, error } = await supabase
        .from('cash_sessions')
        .insert({
            id_farmacia: currentPharmacyId,
            id_trabajador: currentWorkerId,
            monto_inicial_pesos: amount,
            estado: 'abierta',
        })
        .select()
        .single();

    if (error) {
        console.error("Error al abrir la caja:", error);
        if (error.code === '23505') {
             toast.error("Ya hay una sesión de caja abierta para esta farmacia o trabajador.", {id: 'session-already-open'});
        } else {
            toast.error("Error al abrir la caja: " + error.message, {id: 'open-session-db-error'});
        }
    } else if (newSession) {
        setActiveCashSession(newSession as CashSession);
        localStorage.setItem('activeCashSessionId', newSession.id);
        setShowOpenCashSessionModal(false);
        setInitialAmount("");
        toast.success(`Caja abierta con $${amount.toFixed(2)}`);
    }
    setIsOpeningSession(false);
  };

  const handleInitiateClosure = async () => {
    if (!activeCashSession) {
        toast.error("No hay una sesión de caja activa para cerrar.", {id: 'no-session-to-close'});
        return;
    }
    setIsFetchingSummary(true);
    setShowCloseCashSessionModal(true);

    try {
        const { data, error } = await supabase.rpc('get_cash_session_summary', {
          p_session_id: activeCashSession.id
        });

        if (error) {
            console.error("Error al calcular resumen de caja:", error);
            toast.error("Error al calcular el resumen de caja: " + error.message, {id: 'summary-rpc-error'});
            setSessionSummary(null);
        } else if (data && data.length > 0) {
            setSessionSummary(data[0] as CashSessionSummary);
        } else {
             console.warn("RPC get_cash_session_summary returned no data.", data);
             toast.error("El resumen de caja devolvió datos vacíos.", {id: 'summary-no-data'});
             setSessionSummary(null);
        }
    } catch (e: any) {
        console.error("Unexpected error fetching summary:", e);
        toast.error("Error inesperado al obtener resumen de caja.", {id: 'summary-unexpected-error'});
        setSessionSummary(null);
    }
    finally {
        setIsFetchingSummary(false);
    }
  };

  const handleConfirmClosure = async () => {
    const realAmount = parseFloat(realAmountCounted);
    if (isNaN(realAmount) || realAmount < 0) {
        toast.error("Ingresa el monto contado físicamente válido."); return;
    }
    if (!activeCashSession || !sessionSummary) {
         toast.error("No hay datos de sesión o resumen para cerrar."); return;
    }

    setIsClosingSession(true);

    const totalCalculadoEnCaja = sessionSummary.monto_inicial + sessionSummary.total_ventas_efectivo + sessionSummary.total_citas_efectivo;
    const diferencia = realAmount - totalCalculadoEnCaja;

    try {
        const { error } = await supabase
            .from('cash_sessions')
            .update({
                fecha_cierre: new Date().toISOString(),
                monto_final_calculado_pesos: totalCalculadoEnCaja,
                monto_final_real_pesos: realAmount,
                diferencia_pesos: diferencia,
                notas_cierre: closeNotes,
                estado: 'cerrada'
            })
            .eq('id', activeCashSession.id)
            .eq('estado', 'abierta');

        if (error) {
            console.error("Error al cerrar la caja en BD:", error);
            toast.error("Error al cerrar la caja en BD: " + error.message, {id: 'close-session-db-error'});
        } else {
            toast.success(`Caja cerrada. Diferencia: $${diferencia.toFixed(2)}`, {duration: 5000});
            localStorage.removeItem('activeCashSessionId');
            setActiveCashSession(null);
            setShowCloseCashSessionModal(false);
            setRealAmountCounted("");
            setCloseNotes("");
            setSessionSummary(null);
            setShowOpenCashSessionModal(true);
        }
    } catch (e: any) {
        console.error("Unexpected error during session closure:", e);
        toast.error("Error inesperado al cerrar la caja.", {id: 'close-session-unexpected-error'});
    }
    finally {
        setIsClosingSession(false);
    }
  };


  // --- RENDERIZADO ---
   const bgColorLight = "#e0e7ff";
   const bgColorDark = "#1a2b4a";

   if (isLoadingPharmacyId || isCheckingSession || pharmacyIdError) {
    return (
        <div className="min-h-screen bg-gray-100 dark:bg-gray-900 flex items-center justify-center">
            <Loader2 className="h-12 w-12 text-blue-600 animate-spin" />
            <span className="ml-4 text-lg text-gray-700 dark:text-gray-300">
                {isLoadingPharmacyId ? "Cargando datos iniciales..." : isCheckingSession ? "Verificando sesión de caja..." : "Error crítico..."}
            </span>
             {pharmacyIdError && (
                <div className="fixed inset-0 bg-black bg-opacity-75 dark:bg-opacity-90 flex items-center justify-center p-4 z-[100]">
                     <div className="text-center bg-white dark:bg-gray-800 p-8 rounded-xl shadow-lg border border-red-200 dark:border-red-700 max-w-md">
                        <AlertTriangle className="h-12 w-12 text-red-500 dark:text-red-400 mx-auto mb-4" />
                        <h2 className="text-xl font-semibold text-red-800 dark:text-red-300">Error Crítico</h2>
                        <p className="text-red-600 dark:text-red-400 mt-2">{pharmacyIdError}</p>
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-4">
                             {pharmacyIdError.includes("La caja ya fue abierta")
                                ? "Esta farmacia tiene una sesión de caja activa por otro usuario. Cierra la sesión existente o contacta a soporte."
                                : "No se pudo iniciar la aplicación. Verifica tu conexión o perfil de trabajador."
                             }
                        </p>
                        <button onClick={() => window.location.reload()} className="mt-6 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 active:bg-red-800 text-sm font-medium transition">Reintentar</button>
                    </div>
                </div>
             )}
        </div>
    );
  }

  if (showOpenCashSessionModal || !activeCashSession) {
      return (
          <AnimatePresence>
              <motion.div
                  initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                  className="fixed inset-0 bg-black bg-opacity-75 dark:bg-opacity-90 flex items-center justify-center p-4 z-[100] backdrop-blur-sm"
              >
                  <motion.div
                      initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }}
                      className="bg-white dark:bg-gray-900 rounded-xl max-w-md w-full p-8 shadow-2xl"
                  >
                      <h3 className="text-2xl font-bold text-gray-800 dark:text-white mb-6 text-center">Abrir Caja</h3>
                      <p className="text-sm text-gray-600 dark:text-gray-400 mb-4 text-center">
                          Debes abrir la caja para comenzar a registrar ventas en Farmacia ID <b className="text-blue-600 dark:text-blue-400">{currentPharmacyId}</b>.
                      </p>
                       {!currentPharmacyId && !currentWorkerId && (
                            <p className="text-red-500 dark:text-red-400 text-center mb-4">Error: Datos de farmacia o trabajador no disponibles. Recarga la página.</p>
                       )}
                      <div className="space-y-4">
                          <div>
                              <label htmlFor="initial-amount" className="block text-sm font-medium text-gray-700 dark:text-gray-200">Monto Inicial en Caja ($)</label>
                              <input
                                  type="number" id="initial-amount" min="0" step="0.01" placeholder="Ej: 500.00"
                                  className="mt-1 block w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-lg bg-gray-50 dark:bg-gray-800 dark:text-white"
                                  value={initialAmount} onChange={(e) => setInitialAmount(e.target.value)}
                                  disabled={isOpeningSession || !currentPharmacyId || !currentWorkerId} autoFocus
                              />
                          </div>
                          <button
                              onClick={handleOpenCashSession}
                              disabled={isOpeningSession || !initialAmount.trim() || parseFloat(initialAmount) < 0 || !currentPharmacyId || !currentWorkerId}
                              className="w-full px-6 py-3 bg-blue-600 text-white rounded-xl hover:bg-blue-700 active:bg-blue-800 flex items-center justify-center gap-2 text-lg font-semibold shadow-md transition disabled:bg-gray-400 dark:disabled:bg-gray-600"
                          >
                              {isOpeningSession ? <Loader2 className="h-5 w-5 animate-spin" /> : "Abrir Caja"}
                          </button>
                      </div>
                  </motion.div>
              </motion.div>
          </AnimatePresence>
      );
  }

  return (
    <div className={`min-h-screen bg-[${bgColorLight}] dark:bg-[${bgColorDark}] text-gray-900 dark:text-gray-100 font-sans`}>
      <canvas ref={canvasRef} style={{ display: 'none' }}></canvas>

      <header className="bg-white dark:bg-gray-800 shadow-md sticky top-0 z-30">
          <div className="container mx-auto px-4 py-3 lg:px-8 flex flex-wrap justify-between items-center gap-3">
              <h1 className="text-2xl font-extrabold text-gray-900 dark:text-white"></h1>
              <div className="flex items-center gap-4">
                  {activeCashSession && (
                      <div className="text-xs font-medium text-gray-500 dark:text-gray-400 hidden sm:block">
                          <span>Farmacia: <b className="text-blue-600 dark:text-blue-400">{activeCashSession.id_farmacia}</b></span>
                          <span className="mx-1">|</span>
                          <span> Sesión: <b className="text-green-600 dark:text-green-400">{activeCashSession.id.substring(0,8)}...</b></span>
                           {currentWorkerId && (
                             <>
                              <span className="mx-1">|</span>
                              <span> Cajero: <b className="text-gray-700 dark:text-gray-200">{currentWorkerId?.substring(0,8)}...</b></span>
                             </>
                           )}
                      </div>
                  )}
                  <button
                      onClick={handleInitiateClosure}
                      disabled={isFetchingSummary || isClosingSession}
                      className="px-3 py-1.5 sm:px-4 sm:py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 active:bg-orange-800 text-xs sm:text-sm font-semibold flex items-center gap-1.5 shadow transition disabled:opacity-60 disabled:cursor-not-allowed"
                  >
                      {isFetchingSummary || isClosingSession ? <Loader2 size={16} className="animate-spin"/> : <XCircle size={16}/>} {isFetchingSummary ? 'Cargando...' : isClosingSession ? 'Cerrando...' : 'Cerrar Caja'}
                  </button>
              </div>
          </div>
      </header>

      <div className="container mx-auto px-4 py-8 lg:px-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2 space-y-8">
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-6 border border-gray-200 dark:border-gray-700 relative">
               <h2 className="text-xl font-bold mb-4 text-gray-800 dark:text-white flex items-center gap-2"><Search className="h-6 w-6 text-blue-500" /> Buscar Producto</h2>
               <div className="relative">
                 <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">{isSearchingDb ? <Loader2 className="h-5 w-5 text-gray-400 dark:text-gray-500 animate-spin" /> : <Package className="h-5 w-5 text-gray-400 dark:text-gray-500" />}</div>
                 <input type="text" placeholder="Buscar medicamento por nombre o UPC..." className="w-full pl-12 pr-10 py-3.5 border border-gray-300 dark:border-gray-600 rounded-xl focus:outline-none focus:ring-3 focus:ring-blue-500/50 dark:focus:ring-blue-400/50 focus:border-blue-500 dark:focus:border-blue-400 bg-gray-50 dark:bg-gray-700 text-base dark:text-white placeholder-gray-500 dark:placeholder-gray-400 transition" value={productSearch} onChange={(e) => handleProductSearch(e.target.value)} onFocus={() => setIsSearchFocused(true)} onBlur={() => setTimeout(() => setIsSearchFocused(false), 200)} />
                 {productSearch && (<button onClick={() => { setProductSearch(""); setSearchResults([]); setIsSearchingDb(false); }} className="absolute inset-y-0 right-0 pr-4 flex items-center text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 transition" title="Limpiar"><X className="h-5 w-5" /></button> )}
               </div>
               <AnimatePresence>{isSearchFocused && productSearch.length >= 1 && (searchResults.length > 0 || isSearchingDb) && ( <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="absolute z-20 mt-2 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-xl overflow-hidden left-0 right-0 mx-6">
                   <div className="max-h-80 overflow-y-auto divide-y divide-gray-100 dark:divide-gray-700 custom-scrollbar">{isSearchingDb && searchResults.length === 0 && (<div className="p-4 text-center text-sm text-gray-500 dark:text-gray-400 flex items-center justify-center gap-2"><Loader2 className="h-5 w-5 animate-spin"/> Buscando...</div>)} {!isSearchingDb && searchResults.length === 0 && (<div className="p-4 text-center text-sm text-gray-500 dark:text-gray-400">No hay resultados. Intenta otra palabra o UPC.</div>)}
                     {searchResults.map((p) => ( <div key={`${p.upc}-${p.id_farmacia}`} className="p-4 hover:bg-blue-50 dark:hover:bg-blue-900 cursor-pointer transition-colors" onClick={() => handleSelectProduct(p)}>
                       <div className="flex justify-between items-center gap-3"><div className="flex-1 min-w-0"><h4 className="font-semibold text-lg text-gray-800 dark:text-gray-100 truncate" title={p.nombre_medicamento}>{p.nombre_medicamento}</h4><p className="text-sm text-gray-600 dark:text-gray-400 flex items-center gap-1"><Tag size={16}/>UPC: {p.upc}</p></div>
                         <div className="text-right flex-shrink-0 ml-4"><p className="font-bold text-xl text-blue-600 dark:text-blue-400">${p.precio_en_pesos?.toFixed(2) ?? 'N/A'}</p><span className={`text-xs px-2 py-0.5 rounded-full font-medium ${p.unidades > 20 ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-800 dark:text-emerald-300' : p.unidades > 5 ? 'bg-amber-100 text-amber-700 dark:bg-amber-800 dark:text-amber-300' : 'bg-red-100 text-red-700 dark:bg-red-800 dark:text-red-300'}`}>{p.unidades} disp.</span></div>
                       </div></div> ))}</div></motion.div> )}</AnimatePresence>
            </div>
            <AnimatePresence>{selectedProduct && ( <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} transition={{ duration: 0.2 }} className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-6 border border-gray-200 dark:border-gray-700">
                <div className="flex flex-col sm:flex-row justify-between items-start mb-4 gap-3 border-b pb-4 border-gray-100 dark:border-gray-700"><div className="flex-1"><h2 className="text-xl font-bold text-gray-800 dark:text-white">{selectedProduct.nombre_medicamento}</h2><p className="text-sm text-gray-500 dark:text-gray-400 flex items-center gap-1"><Tag size={16}/>UPC: {selectedProduct.upc}</p></div><div className="flex items-center gap-3 flex-shrink-0 ml-4 pt-1 sm:pt-0"><span className="text-2xl font-bold text-blue-600 dark:text-blue-400">${selectedProduct.precio_en_pesos?.toFixed(2) ?? 'N/A'}</span><button onClick={() => setSelectedProduct(null)} className="p-2 text-gray-400 hover:text-red-500 dark:hover:text-red-400 rounded-full hover:bg-red-50 dark:hover:bg-red-900 transition" title="Deseleccionar"><X className="h-5 w-5" /></button></div></div>
                <div className="flex flex-wrap gap-6 items-center justify-between"><div className="flex-grow min-w-[150px]"><label className="text-sm font-medium text-gray-600 dark:text-gray-400 block mb-1">Stock Disponible: <span className="font-semibold">{selectedProduct.unidades}</span></label><div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden h-2.5"><div className={`h-full rounded-full transition-all duration-300 ${getStockLevelColor(getStockPercentage(selectedProduct.unidades, selectedProduct.unidades || 1))}`} style={{ width: `${getStockPercentage(selectedProduct.unidades, Math.max(1, selectedProduct.unidades))}%` }}></div></div></div>
                  <div className="flex items-center border border-gray-300 dark:border-gray-600 rounded-xl overflow-hidden bg-gray-50 dark:bg-gray-700"><button onClick={() => productQuantity > 1 && setProductQuantity(q => q - 1)} className="px-4 py-2 text-gray-600 hover:bg-gray-200 dark:text-gray-300 dark:hover:bg-gray-600 transition disabled:opacity-50 disabled:cursor-not-allowed" disabled={productQuantity <= 1 || selectedProduct.unidades <= 0}><Minus className="h-5 w-5" /></button><input type="number" min="1" max={selectedProduct.unidades} value={productQuantity} onChange={(e) => { const v = parseInt(e.target.value, 10); if (!isNaN(v)) { setProductQuantity(Math.max(1, Math.min(v, selectedProduct.unidades))); } else if(e.target.value === '') { setProductQuantity(1); } }} onBlur={(e) => { const v = parseInt(e.target.value, 10); if (isNaN(v) || v < 1) setProductQuantity(1); }} className="w-20 text-center border-x border-gray-300 dark:border-gray-600 focus:outline-none focus:ring-1 focus:ring-inset focus:ring-blue-500 dark:focus:ring-blue-400 py-2.5 text-lg font-semibold bg-gray-50 dark:bg-gray-700 dark:text-white disabled:bg-gray-100 dark:disabled:bg-gray-700" disabled={selectedProduct.unidades <= 0}/><button onClick={() => productQuantity < selectedProduct.unidades && setProductQuantity(q => q + 1)} className="px-4 py-2 text-gray-600 hover:bg-gray-200 dark:text-gray-300 dark:hover:bg-gray-600 transition disabled:opacity-50 disabled:cursor-not-allowed" disabled={productQuantity >= selectedProduct.unidades || selectedProduct.unidades <= 0}><Plus className="h-5 w-5" /></button></div>
                  <button onClick={handleAddSelectedProductToCart} className="px-6 py-3 bg-blue-600 text-white rounded-xl hover:bg-blue-700 active:bg-blue-800 flex items-center justify-center gap-2 text-lg font-semibold shadow-md hover:shadow-lg transition-all duration-200 disabled:bg-gray-400 dark:disabled:bg-gray-600 disabled:cursor-not-allowed" disabled={selectedProduct.unidades <= 0 || productQuantity <= 0}><ShoppingCart className="h-5 w-5" /><span>Añadir al Carrito</span></button>
                </div>{stockWarning && stockWarning.productId === selectedProduct.upc && (<motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="mt-4 p-3 bg-yellow-50 dark:bg-yellow-900 border border-yellow-200 dark:border-yellow-700 rounded-lg text-sm text-yellow-800 dark:text-yellow-200 flex items-center gap-2"><AlertCircle className="h-5 w-5 flex-shrink-0" /><p>{stockWarning.message}</p></motion.div>)}
              </motion.div> )}</AnimatePresence>
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-6 border border-gray-200 dark:border-gray-700">
               <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-5 gap-4 border-b pb-4 border-gray-100 dark:border-gray-700"><h2 className="text-xl font-bold text-gray-800 dark:text-white flex items-center gap-2"><User className="h-6 w-6 text-blue-500" /> Cliente / Paciente</h2><button onClick={handleBuyWithoutAccount} className={`px-4 py-2 rounded-xl text-sm font-semibold transition flex-shrink-0 shadow ${buyWithoutAccount ? "bg-blue-600 text-white ring-2 ring-offset-2 ring-blue-600 dark:ring-offset-gray-800" : "bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-600"}`}>{buyWithoutAccount ? "Venta General ✓" : "Venta General"}</button></div>
               {showValidationMessage && (<motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="mb-5 p-4 bg-red-50 dark:bg-red-900 border border-red-200 dark:border-red-700 rounded-lg text-sm text-red-700 dark:text-red-200 flex items-center gap-2"><AlertCircle className="h-5 w-5 flex-shrink-0" /><span>Seleccione un paciente o marque "Venta General" para continuar.</span></motion.div>)}
               <AnimatePresence>{selectedPatientData && !buyWithoutAccount ? (
                   <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.3 }} className="mb-4 overflow-hidden">
                       <div className="p-4 bg-green-50 dark:bg-green-900 border border-green-200 dark:border-green-700 rounded-xl relative flex flex-wrap items-center space-x-4 shadow-sm">
                           <button onClick={deselectPatient} title="Quitar paciente" className="absolute top-3 right-3 p-1.5 text-red-500 hover:text-red-700 dark:hover:text-red-400 rounded-full hover:bg-red-100 dark:hover:bg-red-900 z-10 transition"><X className="h-6 w-6" /></button>
                           <div className="flex-shrink-0">
                               {selectedPatientData.Foto_paciente ? (
                                   <img
                                       src={selectedPatientData.Foto_paciente}
                                       alt={`Foto ${selectedPatientData.name}`}
                                       className="h-40 w-40 rounded-xl object-cover border-2 border-white dark:border-gray-600 shadow-md bg-gray-200"
                                       onError={(e) => {
                                           e.currentTarget.src = '/placeholder-user.png';
                                           e.currentTarget.onerror = null;
                                       }}
                                   />
                               ) : (
                                   <div className="h-40 w-40 rounded-xl bg-gray-200 dark:bg-gray-700 flex items-center justify-center border border-gray-300 dark:border-gray-600">
                                       <User className="h-20 w-20 text-gray-400 dark:text-gray-500" />
                                   </div>
                               )}
                           </div>
                           <div className="flex-1 min-w-0">
                               <p className="font-bold text-lg text-green-800 dark:text-green-200 truncate" title={selectedPatientData.name}>{selectedPatientData.name}</p>
                               <p className="text-sm text-gray-600 dark:text-gray-300">ID: {selectedPatientData.id.substring(0, 8)}...</p>
                               {selectedPatientData.surecode && <p className="text-sm text-gray-600 dark:text-gray-300">Código: {selectedPatientData.surecode}</p>}
                               <p className="text-sm text-gray-600 dark:text-gray-300">Tel: {selectedPatientData.phone || 'N/A'}</p>
                           </div>
                           <button onClick={openPrescriptionsModal} disabled={isFetchingPrescriptions || !!activePrescription} className="mt-4 sm:mt-0 px-4 py-2 border border-blue-300 dark:border-blue-600 rounded-xl text-blue-700 dark:text-blue-200 bg-blue-50 dark:bg-blue-800 hover:bg-blue-100 dark:hover:bg-blue-700 transition text-sm font-semibold flex items-center justify-center gap-2 shadow-sm disabled:opacity-60 disabled:cursor-not-allowed">
                               <BookOpen className="h-5 w-5" /> {isFetchingPrescriptions ? 'Cargando...' : 'Ver Recetas'}
                           </button>
                           {activePrescription && ( <div className="w-full mt-3 p-2 bg-blue-100 dark:bg-blue-800/50 border border-blue-200 dark:border-blue-700/50 rounded-lg text-sm text-blue-800 dark:text-blue-200 font-semibold flex items-center justify-center gap-2">
                               <CheckCircle className="h-5 w-5 flex-shrink-0" /> Receta del {formatDate(activePrescription.fecha_consulta)} cargada en el carrito.
                           </div> )}
                       </div>
                   </motion.div>
               ) : ( !buyWithoutAccount && ( <div className="pt-2"><label className="block text-base font-semibold text-gray-700 dark:text-gray-200 mb-3">Identificar paciente por:</label><div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                 <button onClick={() => openSearchModal('code')} className="flex items-center justify-center gap-2 px-5 py-3 border border-gray-300 dark:border-gray-600 rounded-xl text-gray-700 dark:text-gray-200 bg-gray-50 dark:bg-gray-700 hover:bg-gray-100 dark:hover:bg-gray-600 hover:border-blue-400 transition text-base font-medium shadow-sm"><Search className="h-5 w-5 text-blue-500"/> Código</button>
                 <button onClick={() => openSearchModal('facial')} className="flex items-center justify-center gap-2 px-5 py-3 border border-gray-300 dark:border-gray-600 rounded-xl text-gray-700 dark:text-gray-200 bg-gray-50 dark:bg-gray-700 hover:bg-gray-100 dark:hover:bg-gray-600 hover:border-blue-400 transition text-base font-medium shadow-sm"><Camera className="h-5 w-5 text-blue-500"/> Facial</button>
                 <button onClick={() => openSearchModal("rfid")} className="flex items-center justify-center gap-2 px-5 py-3 border border-gray-300 dark:border-gray-600 rounded-xl text-gray-700 dark:text-gray-200 bg-gray-50 dark:bg-gray-700 hover:bg-gray-100 dark:hover:bg-gray-600 hover:border-blue-400 transition text-base font-medium shadow-sm"><Fingerprint className="h-5 w-5 text-blue-500"/> RFID</button>
               </div></div> ))}</AnimatePresence>
            </div>
          </div>

          <div className="lg:col-span-1">
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-6 border border-gray-200 dark:border-gray-700 sticky top-[70px] space-y-8">
              <div>
                 <div className="flex justify-between items-center mb-5 pb-4 border-b border-gray-200 dark:border-gray-700"><h2 className="text-xl font-bold text-gray-800 dark:text-white flex items-center gap-2"><ShoppingCart className="h-6 w-6 text-blue-500" /> Carrito de Compras</h2><span className="px-3 py-1.5 bg-blue-100 text-blue-700 dark:bg-blue-800 dark:text-blue-200 rounded-full text-sm font-semibold">{cartItems.reduce((acc, item) => acc + item.cantidad, 0)} items</span></div>
                 {cartItems.length === 0 ? (<div className="py-12 text-center text-gray-500 dark:text-gray-400"><ShoppingCart className="h-12 w-12 mx-auto mb-3 text-gray-400 dark:text-gray-600" /><p className="text-base font-medium">Tu carrito está vacío.</p><p className="text-sm">Agrega productos para iniciar la venta.</p></div>
                 ) : (<div className="space-y-4 max-h-[calc(100vh-450px)] lg:max-h-[300px] overflow-y-auto pr-2 -mr-2 mb-6 custom-scrollbar">{cartItems.map((item) => (
                     <motion.div key={`${item.upc}-${item.prescriptionLink?.receta_id || 'no-rx'}-${item.prescriptionLink?.medicamento_recetado.nombre || 'no-rx-med'}`} layout initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, x: -10 }} transition={{ duration: 0.2 }} className="p-4 border border-gray-200 dark:border-gray-700 rounded-lg flex gap-3 items-center relative bg-gray-50 dark:bg-gray-700 shadow-sm">
                       <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5">
                              {item.prescriptionLink && <span title={`Item de Receta #${item.prescriptionLink.receta_id.substring(0, 6)}...`}><BookOpen className="h-4 w-4 text-blue-500 flex-shrink-0" /></span>}
                              <p className="font-semibold text-base text-gray-800 dark:text-white truncate" title={item.nombre_medicamento}>{item.nombre_medicamento}</p>
                          </div>
                          <p className="text-sm text-gray-600 dark:text-gray-300 flex items-center gap-1"><Tag size={14} />${item.precio_en_pesos.toFixed(2)} c/u</p>
                           {item.prescriptionLink?.medicamento_recetado.cantidad_a_dispensar && (
                               <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                                   Recetado: {item.prescriptionLink.medicamento_recetado.cantidad_a_dispensar} {item.prescriptionLink.medicamento_recetado.unidad_cantidad}
                               </p>
                           )}
                       </div>
                       <div className="flex items-center border border-gray-300 dark:border-gray-600 rounded-lg overflow-hidden bg-white dark:bg-gray-800"><button onClick={() => handleUpdateQuantity(item, item.cantidad - 1)} className="px-2.5 py-1.5 text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700 transition disabled:opacity-50" disabled={item.cantidad <= 1}><Minus className="h-4 w-4" /></button><span className="px-2.5 text-sm font-medium border-x border-gray-300 dark:border-gray-600 dark:text-white">{item.cantidad}</span><button onClick={() => handleUpdateQuantity(item, item.cantidad + 1)} className="px-2.5 py-1.5 text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700 transition disabled:opacity-50" disabled={item.cantidad >= item.unidades}><Plus className="h-4 w-4" /></button></div>
                       <p className="font-bold text-base w-20 text-right text-blue-600 dark:text-blue-400">${(item.precio_en_pesos * item.cantidad).toFixed(2)}</p>
                       <button onClick={() => handleRemoveFromCart(item)} className="p-2 text-gray-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900 rounded-full flex-shrink-0 transition" title="Quitar"><Trash2 className="h-4 w-4" /></button>
                       {stockWarning && stockWarning.productId === item.upc && (<div className="absolute -bottom-6 right-10 p-1.5 bg-yellow-100 dark:bg-yellow-900 border border-yellow-300 dark:border-yellow-700 rounded text-xs text-yellow-800 dark:text-yellow-200 z-10 shadow-md"><span>{stockWarning.message}</span></div>)}
                     </motion.div> ))}</div> )}
              </div>
              <div className="pt-6 border-t border-gray-200 dark:border-gray-700">
                  <h3 className="text-xl font-bold text-gray-800 dark:text-white mb-4 flex items-center gap-2"><Receipt className="h-6 w-6 text-orange-500"/> Pagar Cita Pendiente</h3>
                  <div className="space-y-4">
                    <div className="flex items-center gap-3"><input type="text" placeholder="Nº Recibo Cita" className={`flex-grow px-4 py-2.5 border rounded-xl text-base bg-gray-50 dark:bg-gray-700 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 ${ isSearchingReceipt ? 'bg-gray-100 dark:bg-gray-600 cursor-wait' : 'border-gray-300 dark:border-gray-600 focus:ring-2 focus:ring-blue-500/50 dark:focus:ring-blue-400/50 focus:border-blue-500 dark:focus:border-blue-400 focus:outline-none' } ${receiptSearchError ? 'border-red-500 dark:border-red-400 ring-red-500 dark:ring-red-400' : ''}`} value={receiptSearchQuery} onChange={(e) => { setReceiptSearchQuery(e.target.value); setReceiptSearchError(null); }} disabled={isSearchingReceipt || isUpdatingPayment} onKeyDown={(e) => e.key === 'Enter' && !isSearchingReceipt && receiptSearchQuery.trim() && handleReceiptSearch()} /><button onClick={handleReceiptSearch} className={`px-5 py-2.5 rounded-xl text-white flex items-center justify-center text-base font-semibold transition shadow-md ${ isSearchingReceipt || !receiptSearchQuery.trim() || isUpdatingPayment ? 'bg-gray-400 dark:bg-gray-600 cursor-not-allowed' : 'bg-orange-600 hover:bg-orange-700 active:bg-orange-800' }`} disabled={isSearchingReceipt || !receiptSearchQuery.trim() || isUpdatingPayment} title="Buscar Recibo">{isSearchingReceipt ? <Loader2 className="h-5 w-5 animate-spin" /> : <Search className="h-5 w-5" />}</button></div>
                    {!isSearchingReceipt && receiptSearchError && (<p className="text-sm text-red-600 dark:text-red-400 flex items-center gap-2 mt-2"><AlertCircle size={16} /> {receiptSearchError}</p>)}
                    <AnimatePresence>{foundAppointmentPayment && ( <motion.div layout initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} transition={{ duration: 0.2 }} className={`p-4 border rounded-xl space-y-3 text-base ${ foundAppointmentPayment.estado_pago === 'pagado' ? 'bg-green-50 dark:bg-green-900 border-green-200 dark:border-green-700' : 'bg-blue-50 dark:bg-blue-900 border-blue-200 dark:border-blue-700'}`}>
                        <p className="font-semibold text-gray-700 dark:text-gray-200">Recibo: <span className="font-bold text-blue-700 dark:text-blue-300">{foundAppointmentPayment.numero_recibo}</span></p>
                        <div className="text-sm text-gray-600 dark:text-gray-300 space-y-1 border-t border-b py-3 my-2 border-dashed border-gray-300 dark:border-gray-600"><p>Paciente: <span className="font-medium text-gray-800 dark:text-white">{foundAppointmentPayment.citas?.patients?.name ?? 'N/A'}</span></p><p>Fecha Cita: <span className="font-medium">{formatDate(foundAppointmentPayment.citas?.dia_atencion)}</span> @ <span className="font-medium">{formatTime(foundAppointmentPayment.citas?.horario_cita)}</span></p><p className="flex items-center gap-1">Motivo: <span className="font-medium truncate block flex-1" title={foundAppointmentPayment.citas?.motivo_cita || ''}>{foundAppointmentPayment.citas?.motivo_cita || 'N/E'}</span></p>{foundAppointmentPayment.id_farmacia && (<p>Farmacia: <span className="font-medium">{foundAppointmentPayment.id_farmacia}</span></p>)}</div>
                        <p>Estado: <span className={`font-bold ${ foundAppointmentPayment.estado_pago === 'pagado' ? 'text-green-600 dark:text-green-400' : 'text-orange-600 dark:text-orange-400' }`}>{foundAppointmentPayment.estado_pago.toUpperCase()}</span></p>{foundAppointmentPayment.precio !== null && <p>Precio Original: <span className="font-bold">${foundAppointmentPayment.precio.toFixed(2)}</span></p>}
                        {foundAppointmentPayment.estado_pago === 'pagado' && (
                             <div className="mt-3 pt-3 border-t border-green-200 dark:border-green-700 text-sm text-gray-700 dark:text-gray-200">
                                <p className="font-semibold">Detalles del Pago:</p>
                                 <p>Método: <span className="font-medium capitalize">{foundAppointmentPayment.metodo_pago || 'N/A'}</span></p>
                                 {foundAppointmentPayment.referencia_tarjeta && (<p>Ref. Tarjeta: <span className="font-medium">{foundAppointmentPayment.referencia_tarjeta}</span></p>)}
                             </div>
                        )}
                        {foundAppointmentPayment.estado_pago === 'pendiente' && (<div className="pt-3 border-t border-blue-200 dark:border-blue-700 mt-3 space-y-3">
                           <label htmlFor="app-price" className="block text-sm font-medium text-gray-700 dark:text-gray-200">Precio Cobrado:</label><div className="relative"><span className="absolute inset-y-0 left-0 pl-3 flex items-center text-gray-500 dark:text-gray-400 text-base">$</span><input id="app-price" type="number" min="0.01" step="0.01" placeholder="0.00" className={`block w-full pl-8 pr-4 py-2.5 border rounded-xl shadow-sm text-lg bg-gray-50 dark:bg-gray-700 dark:text-white ${ paymentUpdateError ? 'border-red-500 dark:border-red-400 ring-1 ring-red-500 dark:ring-red-400' : 'border-gray-300 dark:border-gray-600 focus:ring-2 focus:ring-blue-500/50 dark:focus:ring-blue-400/50 focus:border-blue-500 dark:focus:border-blue-400 focus:outline-none' } disabled:bg-gray-100 dark:disabled:bg-gray-600`} value={appointmentPrice} onChange={(e) => setAppointmentPrice(e.target.value)} disabled={isUpdatingPayment} /></div>
                           {!isUpdatingPayment && paymentUpdateError && (<p className="text-sm text-red-600 dark:text-red-400 mt-2 flex items-center gap-2"><AlertCircle size={16} /> {paymentUpdateError}</p>)}
                             <div>
                                 <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1">Método de Pago:</label>
                                 <div className="grid grid-cols-2 gap-3">
                                     <button onClick={() => setAppointmentPaymentMethod("efectivo")} className={`py-2 px-3 rounded-lg border text-sm font-semibold transition flex items-center justify-center gap-1 ${appointmentPaymentMethod === "efectivo" ? "bg-blue-600 text-white ring-2 ring-blue-500 ring-offset-1 dark:ring-offset-gray-800" : "bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-600 border-gray-300 dark:border-gray-600"}`} disabled={isUpdatingPayment}><DollarSign size={16} /> Efectivo</button>
                                     <button onClick={() => setAppointmentPaymentMethod("tarjeta")} className={`py-2 px-3 rounded-lg border text-sm font-semibold transition flex items-center justify-center gap-1 ${appointmentPaymentMethod === "tarjeta" ? "bg-blue-600 text-white ring-2 ring-blue-500 ring-offset-1 dark:ring-offset-gray-800" : "bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-600 border-gray-300 dark:border-gray-600"}`} disabled={isUpdatingPayment}><CreditCard size={16} /> Tarjeta</button>
                                 </div>
                             </div>
                              {appointmentPaymentMethod === "tarjeta" && (
                                <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
                                  <label htmlFor="app-card-ref" className="block text-sm font-medium text-gray-700 dark:text-gray-200 mt-2">Referencia Tarjeta:</label>
                                  <input id="app-card-ref" type="text" placeholder="Nº de autorización" className={`mt-1 block w-full px-3 py-2 border rounded-md shadow-sm bg-gray-50 dark:bg-gray-700 dark:text-white text-sm ${ paymentUpdateError && !appointmentCardReference.trim() ? 'border-red-500 dark:border-red-400 ring-1 ring-red-500 dark:ring-red-400' : 'border-gray-300 dark:border-gray-600 focus:ring-blue-500 focus:border-blue-500 focus:outline-none'}`} value={appointmentCardReference} onChange={(e) => {setAppointmentCardReference(e.target.value); if(paymentUpdateError && e.target.value.trim()) setPaymentUpdateError(null);}} disabled={isUpdatingPayment} />
                                </motion.div>
                              )}

                           <button onClick={handleConfirmAppointmentPayment} disabled={isUpdatingPayment || !appointmentPrice || parseFloat(appointmentPrice) <= 0 || (appointmentPaymentMethod === 'tarjeta' && !appointmentCardReference.trim())} className={`w-full px-5 py-2.5 rounded-xl text-white flex items-center justify-center text-base font-semibold transition shadow-md ${ isUpdatingPayment || !appointmentPrice || parseFloat(appointmentPrice) <= 0 || (appointmentPaymentMethod === 'tarjeta' && !appointmentCardReference.trim()) ? 'bg-gray-400 dark:bg-gray-600 cursor-not-allowed' : 'bg-green-600 hover:bg-green-700 active:bg-green-800'}`}>{isUpdatingPayment ? <Loader2 className="h-5 w-5 animate-spin" /> : <CheckCircle className="h-5 w-5" />}<span className="ml-2">{isUpdatingPayment ? 'Guardando...' : 'Confirmar Pago'}</span></button>
                           </div> )}
                        {foundAppointmentPayment.estado_pago === 'pagado' && (<div className="pt-3 border-t border-green-200 dark:border-green-700 mt-3 text-center text-green-700 dark:text-green-300 text-sm font-semibold flex items-center justify-center gap-2"><CheckCircle className="h-4 w-4 mr-1 align-text-bottom"/> Pago Completado.</div> )}
                      </motion.div> )} </AnimatePresence>
                    {!isUpdatingPayment && paymentUpdateSuccess && (<motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mt-4 p-3 bg-green-100 dark:bg-green-900 border border-green-300 dark:border-green-700 rounded-md text-sm text-green-800 dark:text-green-200 font-semibold flex items-center gap-2"><CheckCircle className="h-5 w-5 flex-shrink-0" />{paymentUpdateSuccess}</motion.div>)}
                 </div>
              </div>
              {cartItems.length > 0 && ( <div className="mt-8 pt-6 border-t border-gray-200 dark:border-gray-700 space-y-6">
                  <div className="flex justify-between font-bold text-2xl text-gray-800 dark:text-white"><span className="text-gray-700 dark:text-gray-200">Total a Pagar:</span><span className="text-blue-600 dark:text-blue-400">${calculateTotal().toFixed(2)}</span></div>
                  <div className="space-y-3"><label className="block text-sm font-bold text-gray-700 dark:text-gray-200 uppercase tracking-wider">Selecciona Método de Pago</label><div className="grid grid-cols-3 gap-3">
                    <button onClick={() => setPaymentMethod("efectivo")} className={`py-3 px-3 rounded-xl border flex flex-col items-center justify-center gap-1 text-sm font-semibold transition shadow ${ paymentMethod === "efectivo" ? "bg-blue-600 border-blue-600 text-white ring-2 ring-offset-2 ring-blue-500 dark:ring-offset-gray-800" : "bg-white dark:bg-gray-700 border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:border-blue-400 hover:bg-gray-50 dark:hover:bg-gray-600" }`}><DollarSign className="h-6 w-6 mb-1" /><span>Efectivo</span></button>
                    <button onClick={() => setPaymentMethod("mercadoPagoQR")} className={`py-3 px-3 rounded-xl border flex flex-col items-center justify-center gap-1 text-sm font-semibold transition shadow ${ paymentMethod === "mercadoPagoQR" ? "bg-blue-600 border-blue-600 text-white ring-2 ring-offset-2 ring-blue-500 dark:ring-offset-gray-800" : "bg-white dark:bg-gray-700 border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:border-blue-400 hover:bg-gray-50 dark:hover:bg-gray-600" }`}><QrCode className="h-6 w-6 mb-1" /><span>MP QR</span></button>
                    <button onClick={() => setPaymentMethod("tarjeta")} className={`py-3 px-3 rounded-xl border flex flex-col items-center justify-center gap-1 text-sm font-semibold transition shadow ${ paymentMethod === "tarjeta" ? "bg-blue-600 border-blue-600 text-white ring-2 ring-offset-2 ring-blue-500 dark:ring-offset-gray-800" : "bg-white dark:bg-gray-700 border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:border-blue-400 hover:bg-gray-50 dark:hover:bg-gray-600" }`}><CreditCard className="h-6 w-6 mb-1" /><span>Tarjeta</span></button>
                  </div></div>
                  <button onClick={handleCheckout} disabled={!buyWithoutAccount && !selectedPatientData} className={`w-full py-4 rounded-xl font-extrabold flex items-center justify-center gap-3 text-xl shadow-lg transition-all duration-200 ${ (!buyWithoutAccount && !selectedPatientData) ? "bg-gray-300 text-gray-500 dark:bg-gray-600 dark:text-gray-400 cursor-not-allowed" : "bg-green-600 text-white hover:bg-green-700 active:bg-green-800" }`}><CheckCircle className="h-6 w-6" /><span>Proceder al Pago</span></button>
                  {showValidationMessage && (<p className="text-xs text-red-600 dark:text-red-400 text-center mt-2">¡Atención! Selecciona un paciente o activa "Venta General".</p> )}
                </div> )}
            </div>
          </div>
        </div>
      </div>

      <AnimatePresence>{activeIdentificationModal && ( <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-black bg-opacity-75 dark:bg-opacity-90 flex items-center justify-center p-4 z-40 backdrop-blur-sm" onClick={closeSearchModal}>
          <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }} transition={{ type: "spring", stiffness: 300, damping: 25 }} className="bg-white dark:bg-gray-900 rounded-xl max-w-lg w-full p-8 shadow-2xl relative" onClick={(e) => e.stopPropagation()}>
            <button onClick={closeSearchModal} className="absolute top-4 right-4 p-2 text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 transition" title="Cerrar"><X className="h-6 w-6" /></button>
            {activeIdentificationModal === 'code' && ( <div className="space-y-6"><h3 className="text-2xl font-bold text-gray-800 dark:text-white mb-4 flex items-center gap-3"><Search className="h-7 w-7 text-blue-500" /> Buscar por Código</h3><form onSubmit={handlePatientSearchSubmit}><label htmlFor="p-code-search" className="block text-base font-medium text-gray-700 dark:text-gray-200 mb-2">Código de Paciente (Surecode)</label><div className="flex gap-3"><input id="p-code-search" type="text" placeholder="Ingrese el código del paciente..." className={`flex-grow px-4 py-3 border rounded-xl text-lg bg-gray-50 dark:bg-gray-800 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 ${ isSearchingPatient ? 'bg-gray-100 dark:bg-gray-700 cursor-wait' : 'border-gray-300 dark:border-gray-600 focus:ring-2 focus:ring-blue-500/50 dark:focus:ring-blue-400/50 focus:border-blue-500 dark:focus:border-blue-400 focus:outline-none' } ${patientSearchError ? 'border-red-500 dark:border-red-400 ring-red-500 dark:ring-red-400' : ''}`} value={patientSearchQuery} onChange={(e) => { setPatientSearchQuery(e.target.value); setPatientSearchError(null); }} disabled={isSearchingPatient} autoFocus /><button type="submit" className={`px-6 py-3 rounded-xl text-white flex items-center justify-center gap-2 text-base font-semibold shadow-md transition ${ isSearchingPatient || !patientSearchQuery.trim() ? 'bg-gray-400 dark:bg-gray-600 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-700 active:bg-blue-800' }`} disabled={isSearchingPatient || !patientSearchQuery.trim()}>{isSearchingPatient ? <Loader2 className="h-5 w-5 animate-spin"/> : <Search className="h-5 w-5" />}<span>Buscar</span></button></div></form>{!isSearchingPatient && patientSearchError && (<p className="text-base text-red-600 dark:text-red-400 mt-3 flex items-center gap-2"><AlertCircle size={20}/> {patientSearchError}</p>)}</div> )}
            {activeIdentificationModal === 'rfid' && ( <div className="space-y-6 text-center"><h3 className="text-2xl font-bold text-gray-800 dark:text-white mb-4 flex items-center justify-center gap-3"><Fingerprint className="h-7 w-7 text-blue-500" /> Identificación RFID</h3><RFIDReader onPatientIdentified={handleRFIDPatientIdentified} onError={(message) => { console.error("RFID Err:", message); setPatientSearchError(`Error de lectura RFID: ${message}`); setSelectedPatientData(null); }} />{patientSearchError && (<p className="text-base text-red-600 dark:text-red-400 mt-3 flex items-center justify-center gap-2"><AlertCircle size={20}/> {patientSearchError}</p>)}<p className="text-sm text-gray-500 dark:text-gray-400 mt-4">Acerque la tarjeta o pulsera RFID del paciente al lector.</p></div> )}
            {activeIdentificationModal === 'facial' && ( <div className="space-y-6 text-center">
                 <h3 className="text-2xl font-bold text-gray-800 dark:text-white mb-4 flex items-center justify-center gap-3"><Camera className="h-7 w-7 text-blue-500" /> Reconocimiento Facial</h3>
                 <div className="relative rounded-xl overflow-hidden bg-gray-800 aspect-[9/16] w-80 mx-auto border-2 border-gray-600 dark:border-gray-500 shadow-inner">
                   <video ref={videoRef} autoPlay playsInline muted className={`w-full h-full object-cover block transform scale-x-[-1] transition-opacity duration-300 ${ showCamera && !isCameraLoading && stream ? 'opacity-100' : 'opacity-0' }`} onLoadedMetadata={() => console.log("[Cam] Meta loaded")} onError={(e) => console.error("[Cam] Video err:", e)}></video>
                   <div className={`absolute inset-0 flex flex-col items-center justify-center p-6 transition-opacity duration-300 text-center ${ showCamera && !isCameraLoading && stream && !isIdentifyingFace ? 'opacity-0 pointer-events-none' : 'opacity-100 bg-black bg-opacity-70 dark:bg-opacity-80' }`}>{isIdentifyingFace ? (<><Loader2 className="h-10 w-10 text-blue-300 animate-spin mb-3" /><span className="text-lg text-gray-300">Identificando rostro...</span></>) : isCameraLoading ? (<><Loader2 className="h-10 w-10 text-blue-300 animate-spin mb-3" /><span className="text-lg text-gray-300">Iniciando cámara...</span></>) : patientSearchError ? (<><AlertTriangle className="h-10 w-10 text-red-400 mb-3 mx-auto"/><span className="text-sm text-red-300 px-4">{patientSearchError}</span></>) : !stream ? (<><Camera className="h-14 w-14 text-gray-500 opacity-50 mb-3" /><span className="text-lg text-gray-400">Cámara Apagada</span></>) : null }</div></div>
              <div className="flex flex-col sm:flex-row justify-center items-center gap-4">{!showCamera && !isCameraLoading && (<button onClick={startCamera} className="px-6 py-3 bg-blue-600 text-white rounded-xl hover:bg-blue-700 text-base flex items-center justify-center gap-2 w-full sm:w-auto shadow-md"><Camera className="h-5 w-5"/>Activar Cámara</button>)}{showCamera && !isCameraLoading && stream && (<button onClick={stopCamera} className="px-6 py-3 bg-orange-600 text-white rounded-xl hover:bg-orange-700 text-base flex items-center justify-center gap-2 w-full sm:w-auto shadow-md"><X className="h-5 w-5"/>Detener Cámara</button>)}{isCameraLoading && (<button className="px-6 py-3 bg-gray-500 text-white rounded-xl cursor-wait text-base flex items-center justify-center gap-2 w-full sm:w-auto" disabled><Loader2 className="h-5 w-5 animate-spin"/> Cargando...</button>)}{showCamera && !isCameraLoading && stream && (<button onClick={handleIdentifyFace} disabled={isIdentifyingFace} className={`px-6 py-3 rounded-xl text-white text-base flex items-center justify-center gap-2 w-full sm:w-auto shadow-md ${ isIdentifyingFace ? 'bg-gray-400 dark:bg-gray-600 cursor-wait' : 'bg-green-600 hover:bg-green-700 active:bg-green-800' }`}>{isIdentifyingFace ? <Loader2 className="h-5 w-5 animate-spin"/> : <ScanFace className="h-5 w-5"/>} {isIdentifyingFace ? 'Identificando...' : 'Identificar Rostro'} </button>)}</div>
              {!isCameraLoading && !patientSearchError && showCamera && stream && !isIdentifyingFace && (<p className="text-sm text-gray-500 dark:text-gray-400 mt-4">Alinee el rostro del paciente en el centro del cuadro y presione "Identificar".</p>)}{patientSearchError && !isCameraLoading && !isIdentifyingFace && (<p className="text-base text-red-600 dark:text-red-400 mt-4 flex items-center justify-center gap-2"><AlertCircle size={20}/> {patientSearchError}</p>)}</div> )}
          </motion.div>
        </motion.div>)}</AnimatePresence>
      <AnimatePresence>{showPaymentModal && ( <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-black bg-opacity-75 dark:bg-opacity-90 flex items-center justify-center p-4 z-50 backdrop-blur-sm">
          <motion.div initial={{ scale: 0.95, opacity: 0, y: 20 }} animate={{ scale: 1, opacity: 1, y: 0 }} exit={{ scale: 0.95, opacity: 0, y: 20 }} transition={{ type: "spring", stiffness: 300, damping: 25 }} className="bg-white dark:bg-gray-900 rounded-xl max-w-sm w-full p-8 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            {receiptNumber ? ( <motion.div initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} className="text-center">
                  <div className="w-20 h-20 mx-auto bg-green-100 dark:bg-green-800 rounded-full flex items-center justify-center mb-6 border-4 border-green-200 dark:border-green-700"><CheckCircle className="h-10 w-10 text-green-600 dark:text-green-300" /></div><h3 className="text-2xl font-bold text-gray-800 dark:text-white">¡Venta Completada!</h3><p className="text-base text-gray-500 dark:text-gray-400 mt-2">{paymentMethod === 'mercadoPagoQR' ? 'Orden MP' : 'Recibo'} #<span className="font-semibold text-gray-700 dark:text-gray-200">{receiptNumber}</span></p><p className="mt-5 text-3xl font-extrabold text-gray-900 dark:text-white">Total: <span className="text-blue-600 dark:text-blue-400">${calculateTotal().toFixed(2)}</span></p>{paymentMethod === "efectivo" && amountPaid && parseFloat(amountPaid) >= calculateTotal() && (<div className="mt-4 text-base text-gray-600 dark:text-gray-300 bg-gray-50 dark:bg-gray-700 p-3 rounded-lg border border-gray-200 dark:border-gray-600 font-medium"><span>Pagado: ${parseFloat(amountPaid).toFixed(2)}</span> | <span className="font-semibold">Cambio: ${(parseFloat(amountPaid) - calculateTotal()).toFixed(2)}</span></div> )}{paymentMethod === "mercadoPagoQR" && (<p className="mt-4 text-base text-blue-600 dark:text-blue-400 flex items-center justify-center gap-2 font-medium"><QrCode size={20}/> (Pago con Mercado Pago iniciado)</p> )}{paymentMethod === "tarjeta" && (<p className="mt-4 text-base text-blue-600 dark:text-blue-400 flex items-center justify-center gap-2 font-medium"><CreditCard size={20}/> (Pago con terminal confirmado)</p> )}<div className="mt-6 p-3 bg-gray-100 dark:bg-gray-700 rounded-lg text-sm text-gray-500 dark:text-gray-400 flex items-center justify-center gap-2"><Loader2 className="h-4 w-4 animate-spin"/> Cerrando la transacción...</div></motion.div>
            ) : ( <> <div className="flex justify-between items-center mb-6 pb-4 border-b border-gray-200 dark:border-gray-700"><h3 className="text-2xl font-bold text-gray-800 dark:text-white">Confirmar Pago</h3><button onClick={() => setShowPaymentModal(false)} className="p-2 text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 transition" title="Cancelar" disabled={isConfirmingCash || isGeneratingQR || isConfirmingCardPayment}><X className="h-6 w-6" /></button></div>
                <div className="space-y-6"><div className="text-center"><span className="text-base text-gray-500 dark:text-gray-400 block">Total a Pagar</span><span className="text-4xl font-extrabold text-blue-600 dark:text-blue-400">${calculateTotal().toFixed(2)}</span></div>
                  {paymentMethod === "efectivo" && (<div className="space-y-3"><label htmlFor="amount-paid-in" className="block text-base font-medium text-gray-700 dark:text-gray-200">Monto Recibido</label><div className="relative"><span className="absolute inset-y-0 left-0 pl-4 flex items-center text-gray-500 dark:text-gray-400 text-lg">$</span><input id="amount-paid-in" type="number" min={0} step="0.01" placeholder={`Mínimo: ${calculateTotal().toFixed(2)}`} className={`block w-full pl-10 pr-4 py-3 border rounded-xl shadow-sm text-2xl font-bold bg-gray-50 dark:bg-gray-800 dark:text-white ${ cashConfirmationError ? 'border-red-500 dark:border-red-400 ring-1 ring-red-500 dark:ring-red-400' : 'border-gray-300 dark:border-gray-600 focus:ring-2 focus:ring-blue-500/50 dark:focus:ring-blue-400/50 focus:border-blue-500 dark:focus:border-blue-400 focus:outline-none' } disabled:bg-gray-100 dark:disabled:bg-gray-700`} value={amountPaid} onChange={(e) => { setAmountPaid(e.target.value); setCashConfirmationError(null); }} disabled={isConfirmingCash} autoFocus /></div>{cashConfirmationError && (<p className="text-sm text-red-600 dark:text-red-400 mt-2 flex items-center gap-2"><AlertCircle size={16} /> {cashConfirmationError}</p>)}{amountPaid && parseFloat(amountPaid) >= calculateTotal() && !isConfirmingCash && (<motion.div initial={{ opacity: 0 }} animate={{ opacity: 1}} className="bg-green-50 dark:bg-green-900 p-3 rounded-lg text-center mt-3 border border-green-200 dark:border-green-700"><span className="text-base text-green-700 dark:text-green-300 block">Cambio a dar</span><span className="text-2xl font-bold text-green-600 dark:text-green-400">${(parseFloat(amountPaid) - calculateTotal()).toFixed(2)}</span></motion.div> )}</div> )}
                  {paymentMethod === "mercadoPagoQR" && (<div className="text-center py-5 min-h-[280px] flex flex-col justify-center items-center">
                      <p className="mb-3 text-lg font-medium text-gray-700 dark:text-gray-200">Escanear código QR con App Mercado Pago</p>
                      {isGeneratingQR && (<div className="flex flex-col items-center text-gray-500 dark:text-gray-400 py-5"><Loader2 className="h-8 w-8 animate-spin mb-3" /><p className="text-base">Generando QR de pago...</p></div>)}{qrError && (<div className="p-4 bg-red-50 dark:bg-red-900 border border-red-200 dark:border-red-700 rounded-lg text-red-700 dark:text-red-200 text-sm text-left w-full"><p className="font-semibold mb-2 flex items-center gap-2"><AlertTriangle size={18}/> Error al generar QR:</p><p className="text-xs">{qrError}</p><button onClick={generateMercadoPagoQrCode} className="mt-3 text-sm text-blue-600 dark:text-blue-400 hover:underline font-medium" disabled={isGeneratingQR}>Reintentar</button></div>)}{mercadoPagoQrUrl && !isGeneratingQR && !qrError && (<motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1}} className="flex flex-col items-center"><img src={mercadoPagoQrUrl} alt="QR Mercado Pago" className="w-56 h-56 border-4 border-gray-300 dark:border-gray-600 p-1 rounded-lg bg-white shadow-xl" /><p className="text-sm text-gray-500 dark:text-gray-400 mt-4">Esperando confirmación de pago...</p></motion.div> )}</div> )}
                  {paymentMethod === "tarjeta" && (<div className="text-center py-5 min-h-[280px] flex flex-col justify-center items-center">
                      <CreditCard className="h-10 w-10 text-blue-500 mb-4"/>
                      <p className="text-lg font-semibold text-gray-700 dark:text-gray-200 mb-3">Instrucciones para la terminal:</p>
                      <p className="text-base text-gray-600 dark:text-gray-300 mb-4">Introduce <span className="font-bold text-blue-600 dark:text-blue-400">${calculateTotal().toFixed(2)}</span> en tu terminal de pago y procesa la transacción.</p>
                      <div className="w-full max-w-xs mb-3">
                          <label htmlFor="pos-card-ref" className="block text-sm font-medium text-gray-700 dark:text-gray-200 text-left">Referencia de Transacción:</label>
                          <input id="pos-card-ref" type="text" placeholder="Nº de autorización"
                                 className={`block w-full mt-1 px-3 py-2 border rounded-md shadow-sm text-base bg-gray-50 dark:bg-gray-800 dark:text-white ${ cardConfirmationError && !cardPaymentReference.trim() ? 'border-red-500 dark:border-red-400 ring-1 ring-red-500' : 'border-gray-300 dark:border-gray-600 focus:ring-blue-500 focus:border-blue-500 focus:outline-none'}`}
                                 value={cardPaymentReference} onChange={(e) => {setCardPaymentReference(e.target.value); if(cardConfirmationError && e.target.value.trim()) setCardConfirmationError(null);}}
                                 disabled={isConfirmingCardPayment || countdownForCard > 0} />
                          {cardConfirmationError && (<p className="text-sm text-red-600 dark:text-red-400 mt-1 flex items-center gap-2"><AlertCircle size={16} /> {cardConfirmationError}</p>)}
                      </div>
                      {countdownForCard > 0 ? (
                          <p className="text-xl font-extrabold text-blue-600 dark:text-blue-400 flex items-center gap-2"><Loader2 className="animate-spin h-6 w-6"/> Espera {countdownForCard}s para confirmar...</p>
                      ) : (
                          <p className="text-lg font-bold text-green-600 dark:text-green-400 flex items-center gap-2"><CheckCircle className="h-6 w-6"/> ¡Listo para confirmar pago!</p>
                      )}
                  </div>)}
                </div>
                <div className="mt-8 flex flex-col sm:flex-row gap-4">
                    <button onClick={() => setShowPaymentModal(false)} className="flex-1 px-6 py-3 bg-gray-200 text-gray-700 dark:bg-gray-700 dark:text-gray-200 rounded-xl hover:bg-gray-300 dark:hover:bg-gray-600 text-base font-semibold order-2 sm:order-1 transition shadow-md disabled:opacity-60 disabled:cursor-not-allowed" disabled={isConfirmingCash || isGeneratingQR || isConfirmingCardPayment}>Cancelar Venta</button>
                    <button onClick={handleCompletePayment}
                            disabled={
                                isConfirmingCash || isGeneratingQR || isConfirmingCardPayment ||
                                cartItems.length === 0 ||
                                (!buyWithoutAccount && !selectedPatientData) ||
                                (paymentMethod === 'efectivo' && (!amountPaid || parseFloat(amountPaid) < calculateTotal())) ||
                                (paymentMethod === 'mercadoPagoQR' && (!mercadoPagoQrUrl || !!qrError)) ||
                                (paymentMethod === 'tarjeta' && (countdownForCard > 0 || !cardPaymentReference.trim()))
                            }
                            className={`flex-1 px-6 py-3 rounded-xl text-white flex items-center justify-center gap-2 text-base font-semibold order-1 sm:order-2 shadow-lg transition-all duration-200 ${
                                (isConfirmingCash || isGeneratingQR || isConfirmingCardPayment) ? 'bg-yellow-500 dark:bg-yellow-700 cursor-wait' :
                                ((!buyWithoutAccount && !selectedPatientData) || cartItems.length === 0 ||
                                (paymentMethod === 'efectivo' && (!amountPaid || parseFloat(amountPaid) < calculateTotal())) ||
                                (paymentMethod === 'mercadoPagoQR' && (!mercadoPagoQrUrl || !!qrError)) ||
                                (paymentMethod === 'tarjeta' && (countdownForCard > 0 || !cardPaymentReference.trim()))) ?
                                'bg-gray-400 dark:bg-gray-600 cursor-not-allowed' :
                                'bg-green-600 hover:bg-green-700 active:bg-green-800'
                            }`}
                    >
                        {isConfirmingCash || isConfirmingCardPayment || (paymentMethod === 'mercadoPagoQR' && isGeneratingQR) ? <Loader2 className="h-5 w-5 animate-spin"/> : <CheckCircle className="h-5 w-5" />}
                        <span>{isConfirmingCash || isConfirmingCardPayment ? 'Confirmando...' : paymentMethod === 'mercadoPagoQR' ? 'Iniciar Pago QR' : 'Completar Venta'}</span>
                    </button>
                </div> </> )}
          </motion.div>
        </motion.div> )} </AnimatePresence>

      <AnimatePresence>{showPrescriptionModal && ( <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-black bg-opacity-75 dark:bg-opacity-90 flex items-center justify-center p-4 z-40 backdrop-blur-sm" onClick={() => setShowPrescriptionModal(false)}>
          <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }} transition={{ type: "spring", stiffness: 300, damping: 25 }} className="bg-white dark:bg-gray-900 rounded-xl max-w-2xl w-full p-8 shadow-2xl relative max-h-[90vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
            <button onClick={() => setShowPrescriptionModal(false)} className="absolute top-4 right-4 p-2 text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 transition" title="Cerrar"><X className="h-6 w-6" /></button>
            <h3 className="text-2xl font-bold text-gray-800 dark:text-white mb-4 flex items-center gap-3"><BookOpen className="h-7 w-7 text-blue-500" /> Recetas de {selectedPatientData?.name || 'Paciente'}</h3>
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-6">Mostrando recetas pendientes o incompletas de los últimos 60 días.</p>

            {isFetchingPrescriptions && ( <div className="text-center py-12"><Loader2 className="h-10 w-10 text-blue-600 animate-spin mx-auto mb-4" /><span className="text-lg text-gray-700 dark:text-gray-300">Cargando recetas...</span></div> )}
            {!isFetchingPrescriptions && prescriptionFetchError && ( <div className="text-center py-12 text-red-600 dark:text-red-400"><AlertCircle className="h-10 w-10 mx-auto mb-4" /><p className="text-lg">{prescriptionFetchError}</p></div> )}
            {!isFetchingPrescriptions && !prescriptionFetchError && patientPrescriptions.length === 0 && ( <div className="text-center py-12 text-gray-500 dark:text-gray-400"><BookOpen className="h-10 w-10 mx-auto mb-4 opacity-50" /><p className="text-lg">No se encontraron recetas recientes pendientes para este paciente.</p></div> )}

            {!isFetchingPrescriptions && !prescriptionFetchError && patientPrescriptions.length > 0 && (
              <div className="flex-grow overflow-y-auto pr-2 custom-scrollbar space-y-4">
                {patientPrescriptions.map((receta) => (
                  <div key={receta.id} className={`p-4 border rounded-xl flex flex-col gap-3 transition-colors ${activePrescription?.id === receta.id ? 'bg-blue-50 dark:bg-blue-900 border-blue-500' : 'bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700'}`}>
                    <div className="flex flex-wrap justify-between items-center text-sm gap-2">
                      <span className="font-semibold text-gray-800 dark:text-gray-100">Receta ID: {receta.id.substring(0,6)}...</span>
                       <span className="font-semibold text-gray-800 dark:text-gray-100">Fecha: {formatDate(receta.fecha_consulta)}</span>
                      {receta.fecha_consulta === getTodayDateString && ( <span className="px-2 py-0.5 bg-green-100 text-green-800 dark:bg-green-800 dark:text-green-200 rounded-full text-xs font-semibold">Hoy</span> )}
                      {receta.estado_dispensacion && receta.estado_dispensacion !== 'no dispensada' && (
                           <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${receta.estado_dispensacion === 'dispensada' ? 'bg-green-100 text-green-800 dark:bg-green-800 dark:text-green-200' : 'bg-amber-100 text-amber-800 dark:bg-amber-800 dark:text-amber-200'}`}>
                               {receta.estado_dispensacion === 'dispensada' ? 'Dispensada' : 'Incompleta'}
                           </span>
                      )}
                    </div>
                    <div><p className="font-medium text-gray-700 dark:text-gray-200">Diagnóstico:</p><p className="text-sm text-gray-600 dark:text-gray-300 truncate">{receta.diagnostico || 'N/E'}</p></div>
                    <div>
                      <p className="font-medium text-gray-700 dark:text-gray-200">Medicamentos ({receta.medicamentos?.length || 0}):</p>
                      <ul className="list-disc list-inside text-sm text-gray-600 dark:text-gray-300 ml-2 space-y-1">
                        {receta.medicamentos?.map((med, i) => (
                          <li key={i}>
                              <span className="font-semibold">{med.nombre}:</span> {med.cantidad_a_dispensar} {med.unidad_cantidad} ({med.dosis}, {med.frecuencia})
                          </li>
                        ))}
                        {receta.medicamentos?.length === 0 && <li>Sin medicamentos especificados.</li>}
                      </ul>
                    </div>
                    <button onClick={() => handleLoadPrescriptionToCart(receta)} disabled={activePrescription?.id === receta.id || receta.estado_dispensacion === 'dispensada'} className="mt-3 w-full px-4 py-2 bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition text-base font-semibold shadow-md disabled:bg-gray-400 dark:disabled:bg-gray-600 disabled:cursor-not-allowed">
                      {activePrescription?.id === receta.id ? 'Receta Cargada' : receta.estado_dispensacion === 'dispensada' ? 'Ya Dispensada' : 'Cargar al Carrito'}
                    </button>
                  </div>
                ))}
              </div>
            )}
          </motion.div>
        </motion.div> )} </AnimatePresence>

      {showCloseCashSessionModal && activeCashSession && (
        <AnimatePresence>
            <motion.div
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                className="fixed inset-0 bg-black bg-opacity-75 dark:bg-opacity-90 flex items-center justify-center p-4 z-[100] backdrop-blur-sm"
                onClick={() => !isClosingSession && !isFetchingSummary && setShowCloseCashSessionModal(false)}
            >
                <motion.div
                    initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }}
                    onClick={(e) => e.stopPropagation()}
                    className="bg-white dark:bg-gray-900 rounded-xl max-w-lg w-full p-6 sm:p-8 shadow-2xl max-h-[90vh] flex flex-col"
                >
                    <div className="flex justify-between items-center mb-6 pb-4 border-b dark:border-gray-700">
                        <h3 className="text-xl sm:text-2xl font-bold text-gray-800 dark:text-white">Cerrar Caja (Corte)</h3>
                        <button onClick={() => setShowCloseCashSessionModal(false)} disabled={isClosingSession || isFetchingSummary} className="p-2 text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 transition disabled:opacity-60 disabled:cursor-not-allowed"><X className="h-6 w-6" /></button>
                    </div>

                    <div className="flex-grow overflow-y-auto pr-2 custom-scrollbar">
                    {isFetchingSummary ? (
                        <div className="text-center py-10 flex flex-col items-center justify-center"><Loader2 className="h-10 w-10 text-blue-600 animate-spin mb-4" /><span className="text-lg text-gray-700 dark:text-gray-300">Cargando resumen de caja...</span></div>
                    ) : sessionSummary ? (
                        <div className="space-y-3 sm:space-y-4 text-sm sm:text-base">
                             <p className="text-gray-600 dark:text-gray-400 text-center">Resumen de la sesión <b>{activeCashSession.id.substring(0,8)}...</b></p>
                             <div className="grid grid-cols-2 gap-x-4 gap-y-2 p-3 bg-gray-50 dark:bg-gray-800 rounded-lg border dark:border-gray-700">
                                <span className="font-medium text-gray-600 dark:text-gray-300">Monto Inicial:</span><span className="text-right font-semibold text-gray-800 dark:text-gray-100">${(sessionSummary.monto_inicial || 0).toFixed(2)}</span>
                                <span className="font-medium text-gray-600 dark:text-gray-300">Ventas Efectivo (POS):</span><span className="text-right font-semibold text-gray-800 dark:text-gray-100">${(sessionSummary.total_ventas_efectivo || 0).toFixed(2)}</span>
                                <span className="font-medium text-gray-600 dark:text-gray-300">Ventas Tarjeta (POS):</span><span className="text-right font-semibold text-gray-800 dark:text-gray-100">${(sessionSummary.total_ventas_tarjeta || 0).toFixed(2)}</span>
                                <span className="font-medium text-gray-600 dark:text-gray-300">Ventas QR (POS):</span><span className="text-right font-semibold text-gray-800 dark:text-gray-100">${(sessionSummary.total_ventas_qr || 0).toFixed(2)}</span>
                                <span className="font-medium text-gray-600 dark:text-gray-300">Citas Pagadas Efectivo:</span><span className="text-right font-semibold text-gray-800 dark:text-gray-100">${(sessionSummary.total_citas_efectivo || 0).toFixed(2)}</span>
                                <span className="font-medium text-gray-600 dark:text-gray-300">Citas Pagadas Otros:</span><span className="text-right font-semibold text-gray-800 dark:text-gray-100">${(sessionSummary.total_citas_otros_metodos || 0).toFixed(2)}</span>
                            </div>

                            <p className="text-lg font-bold pt-2 text-blue-600 dark:text-blue-400">Total Esperado en Efectivo: <span className="float-right">${((sessionSummary.monto_inicial || 0) + (sessionSummary.total_ventas_efectivo || 0) + (sessionSummary.total_citas_efectivo || 0)).toFixed(2)}</span></p>
                            <hr className="my-2 sm:my-3 dark:border-gray-700"/>

                            <div>
                                <label htmlFor="real-amount" className="block text-sm font-medium text-gray-700 dark:text-gray-200">Monto Contado Físicamente ($)</label>
                                <input type="number" id="real-amount" min="0" step="0.01" value={realAmountCounted} onChange={e => setRealAmountCounted(e.target.value)} disabled={isClosingSession} className="mt-1 block w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-lg bg-gray-50 dark:bg-gray-800 dark:text-white"/>
                            </div>
                            {realAmountCounted.trim() && parseFloat(realAmountCounted) >= 0 && (
                                <p className={`text-lg font-bold ${parseFloat(realAmountCounted) - ((sessionSummary.monto_inicial || 0) + (sessionSummary.total_ventas_efectivo || 0) + (sessionSummary.total_citas_efectivo || 0)) >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                                    Diferencia: <span className="float-right">${(parseFloat(realAmountCounted) - ((sessionSummary.monto_inicial || 0) + (sessionSummary.total_ventas_efectivo || 0) + (sessionSummary.total_citas_efectivo || 0))).toFixed(2)}</span>
                                </p>
                            )}
                            <div>
                                <label htmlFor="close-notes" className="block text-sm font-medium text-gray-700 dark:text-gray-200">Notas de Cierre (opcional)</label>
                                <textarea id="close-notes" value={closeNotes} onChange={e => setCloseNotes(e.target.value)} disabled={isClosingSession} rows={2} className="mt-1 block w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 bg-gray-50 dark:bg-gray-800 dark:text-white"></textarea>
                            </div>
                        </div>
                    ) : (
                        <div className="text-red-500 dark:text-red-400 text-center py-10 space-y-4">
                             <AlertCircle className="h-10 w-10 mx-auto"/>
                             <p className="text-lg">No se pudo cargar el resumen de la caja.</p>
                              {!isFetchingSummary && (
                                 <button onClick={handleInitiateClosure} className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 text-sm font-semibold">Reintentar Resumen</button>
                              )}
                         </div>
                    )}
                    </div>

                    <div className="mt-6 pt-4 border-t dark:border-gray-700">
                        <button
                            onClick={handleConfirmClosure}
                            disabled={isClosingSession || isFetchingSummary || !sessionSummary || !realAmountCounted.trim() || parseFloat(realAmountCounted) < 0}
                            className="w-full px-6 py-3 bg-red-600 text-white rounded-xl hover:bg-red-700 active:bg-red-800 flex items-center justify-center gap-2 text-lg font-semibold shadow-md transition disabled:bg-gray-400 dark:disabled:bg-gray-600 disabled:cursor-not-allowed"
                        >
                            {isClosingSession ? <Loader2 className="h-5 w-5 animate-spin" /> : <CheckCircle className="h-5 w-5" />}
                            Confirmar Cierre de Caja
                        </button>
                    </div>
                </motion.div>
            </motion.div>
        </AnimatePresence>
      )}
    </div>
  );
};

export default PointOfSale;
