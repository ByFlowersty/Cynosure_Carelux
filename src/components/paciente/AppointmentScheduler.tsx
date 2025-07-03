import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Calendar, Clock, User as UserIcon, FileText, Building, ChevronDown, ChevronUp, List, CreditCard, DollarSign, AlertTriangle, Info, X 
} from 'lucide-react';
import supabase from '../../lib/supabaseClient'; 
import { toast, Toaster } from 'react-hot-toast'; 
import { User } from '@supabase/supabase-js';
import Barcode from 'react-barcode'; 
import { motion, AnimatePresence } from 'framer-motion';

// --- Interfaces ---
interface AppointmentFormData { pharmacyId: number | null; date: string; time: string; reason: string; }
interface Pharmacy { id_farmacia: number; nombre: string; horario_atencion: string; }
interface UpcomingAppointment {
  id: number; 
  horario_cita: string;
  dia_atencion: string; // Este es el string YYYY-MM-DD de la fecha local
  status: string | null;
  motivo_cita: string | null;
  farmacias: { nombre: string; } | null;
  pago_e_cita: {
    numero_recibo: string | null;
    estado_pago: string;
   }[] | null;
}
interface PagoECita {
  id?: number | string;
  cita_id: number | string;
  metodo_pago: string;
  numero_recibo?: string | null;
  estado_pago: string;
}

// --- Component ---
const AppointmentScheduler = () => {
  // --- State Variables ---
  const [selectedPharmacy, setSelectedPharmacy] = useState<Pharmacy | null>(null);
  const [availableTimes, setAvailableTimes] = useState<string[]>([]);
  const [formData, setFormData] = useState<AppointmentFormData>({ pharmacyId: null, date: '', time: '', reason: '' });
  const [currentStep, setCurrentStep] = useState(1);
  const totalSteps = 4;
  const [pharmacies, setPharmacies] = useState<Pharmacy[]>([]);
  const [loadingPharmacies, setLoadingPharmacies] = useState(true);
  const [upcomingAppointments, setUpcomingAppointments] = useState<UpcomingAppointment[]>([]);
  const [loadingAppointments, setLoadingAppointments] = useState(true);
  const [isAppointmentsVisible, setIsAppointmentsVisible] = useState(false);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [loadingUser, setLoadingUser] = useState(true); 
  const [patientId, setPatientId] = useState<string | null>(null); 
  const [paymentMethod, setPaymentMethod] = useState<'cash' | null>(null);
  const [receiptNumber, setReceiptNumber] = useState<string | null>(null);
  const [isBarcodeModalOpen, setIsBarcodeModalOpen] = useState(false);
  const [selectedAppointmentForBarcode, setSelectedAppointmentForBarcode] = useState<UpcomingAppointment | null>(null);

  // --- Helper Functions ---
  const generateDates = useCallback(() => { 
    const dates: { date: string, display: string, isToday: boolean }[] = []; 
    const today = new Date(); 
    
    // Generar fechas para los próximos 14 días (incluyendo sábados y domingos)
    for (let i = 0; i < 14; i++) { 
      const date = new Date(today); // Crear una nueva fecha para cada iteración basada en 'today'
      date.setDate(today.getDate() + i); // Añadir 'i' días a la fecha actual
      
      // *** CAMBIO CLAVE: Corregir la obtención de la fecha en formato YYYY-MM-DD localmente ***
      // En lugar de toISOString().split('T')[0] que puede cambiar el día debido a la zona horaria
      const year = date.getFullYear();
      const month = (date.getMonth() + 1).toString().padStart(2, '0'); // Meses son 0-indexados, añadir 1 y pad
      const day = date.getDate().toString().padStart(2, '0'); // Pad para días de un solo dígito
      const dS = `${year}-${month}-${day}`; // Esto es la fecha en YYYY-MM-DD local para el formulario

      const isT = i === 0; // Es hoy si es el primer día (i=0)
      const dO: Intl.DateTimeFormatOptions = { weekday: 'short', day: 'numeric', month: 'short' }; 
      let dispS = date.toLocaleDateString('es-ES', dO).replace('.', ''); 
      if (isT) { 
        dispS = `Hoy (${dispS})`; 
      } 
      dates.push({ date: dS, display: dispS, isToday: isT }); 
    } 
    return dates; 
  }, []);

  const availableDates = useMemo(() => generateDates(), [generateDates]);

  const parseBusinessHours = useCallback((horarioAtencion: string | undefined): string[] => { 
    if (!horarioAtencion) return []; 
    const times: string[] = []; 
    const ranges = horarioAtencion.split(/ y |,|;/); 
    
    const parseTimeRange = (range: string) => { 
      const tM = range.match(/\d{1,2}:\d{2}/g); 
      if (tM && tM.length >= 2) { 
        const s = tM[0]; 
        const eT = tM[tM.length - 1]; 
        try { 
          let cT = new Date(`1970-01-01T${s}:00`); 
          const eD = new Date(`1970-01-01T${eT}:00`); 
          
          if (isNaN(cT.getTime()) || eD <= cT) { 
            console.warn(`Invalid time range: ${range}`); 
            return; 
          } 
          
          while (cT < eD) { 
            times.push(cT.toTimeString().slice(0, 5)); 
            cT.setMinutes(cT.getMinutes() + 30); 
          } 
        } catch (e) { 
          console.error("Time parse error:", range, e); 
        } 
      } else { 
        console.warn(`Cannot parse time range: "${range}"`); 
      } 
    }; 
    ranges.forEach(range => parseTimeRange(range.trim())); 
    return Array.from(new Set(times)).sort(); 
  }, []);

  // *** CAMBIO CLAVE: Formateo de fecha para mostrar correctamente el día local ***
  const formatDate = (dateString: string | null | undefined) => { 
    if (!dateString) return 'N/A'; 
    try { 
      let date: Date;
      if (dateString.includes('T')) {
        // Si el string incluye 'T' (ej. de horario_cita, que es UTC), lo parseamos directamente
        date = new Date(dateString);
      } else {
        // Si es solo 'YYYY-MM-DD' (como dia_atencion), lo parseamos como una fecha LOCAL
        // para que toLocaleDateString no la desplace por la zona horaria.
        const parts = dateString.split('-').map(Number);
        // new Date(year, monthIndex, day) crea la fecha en la zona horaria local.
        date = new Date(parts[0], parts[1] - 1, parts[2]); 
      }
      
      if (isNaN(date.getTime())) return 'Fecha Inválida'; 
      return date.toLocaleDateString('es-ES', { year: 'numeric', month: 'long', day: 'numeric' }); 
    } catch (e) { 
      console.error("Error formatting date:", dateString, e); 
      return 'Error Fecha'; 
    } 
  };

  const formatTime = (timeString: string | null | undefined) => { 
    if (!timeString) return 'N/A'; 
    try { 
      const date = timeString.includes('T') ? new Date(timeString) : new Date(`1970-01-01T${timeString}:00`);
      if (isNaN(date.getTime())) return 'Hora Inválida'; 
      return date.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', hour12: true }); 
    } catch (e) { 
      console.error("Error formatting time:", timeString, e); 
      return 'Error Hora'; 
    } 
  };

  // --- Effects ---

  // useEffect para Auth & Patient ID 
  useEffect(() => {
    let isMounted = true;
    setLoadingUser(true); 
    setPatientId(null); 
    setCurrentUser(null); 

    const fetchUserAndPatient = async () => {
      if (!isMounted) { return; }
      try {
        const { data: { session }, error: sessionError } = await supabase.auth.getSession();
        
        if (sessionError) {
            console.error("AUTH fetchUserAndPatient: Error getting session", sessionError);
             throw new Error(`Error de sesión: ${sessionError.message}`);
        }

        const user = session?.user ?? null;
        if (isMounted) {
            setCurrentUser(user);
        } else {
            return; 
        }

        if (user?.id) {
          const { data: patientData, error: patientError } = await supabase
            .from('patients')
            .select('id') 
            .eq('user_id', user.id) 
            .single(); 

          if (patientError && patientError.code !== 'PGRST116') { 
            console.error("AUTH fetchUserAndPatient: Patient query failed", patientError);
            throw new Error(`Error buscando paciente: ${patientError.message}`);
          }

          if (patientData && patientData.id) {
            if (isMounted) {
                setPatientId(patientData.id); 
            } else {
                 return;
            }
          } else {
            if (isMounted) {
                 setPatientId(null);
            } else {
                 return;
            }
          }
        } else {
          if (isMounted) {
            setPatientId(null); 
          } else {
             return;
          }
        }
      } catch (error: any) {
        console.error("AUTH fetchUserAndPatient: CATCH BLOCK ERROR:", error);
        if (isMounted) {
          setCurrentUser(null);
          setPatientId(null);
        }
      } finally {
        if (isMounted) {
          setLoadingUser(false); 
        } 
      }
    };

    fetchUserAndPatient(); 

    const { data: authListener } = supabase.auth.onAuthStateChange((_event, session) => {
       if (isMounted) {
          fetchUserAndPatient(); 
          if (!session?.user) {
             setUpcomingAppointments([]);
             setLoadingAppointments(false);
          }
       } 
    });

    return () => {
      isMounted = false;
      authListener?.subscription.unsubscribe();
    };
  }, []); 

  // useEffect para Pharmacies
  useEffect(() => {
    let isMounted = true; 
    const fetchPharmacies = async () => { 
      if (!isMounted) return; 
      setLoadingPharmacies(true); 
      try { 
        const { data, error } = await supabase.from('farmacias').select('id_farmacia, nombre, horario_atencion'); 
        if (error) throw error; 
        if (isMounted) setPharmacies(data || []); 
      } catch (error: any) { 
        console.error('Pharmacies Error:', error); 
        if (isMounted) toast.error(`Error farmacias: ${error.message}`); 
      } finally { 
        if (isMounted) setLoadingPharmacies(false); 
      } 
    }; 
    fetchPharmacies(); 
    return () => { isMounted = false; };
  }, []);

  // useEffect para Occupied Times y disponibilidad
  useEffect(() => {
    let isMounted = true;
    const fetchOccupiedTimes = async () => { 
      // Si no hay farmacia seleccionada o fecha, limpiar horarios y salir
      if (!formData.date || !formData.pharmacyId || !selectedPharmacy || !isMounted) { 
        if (isMounted) setAvailableTimes(selectedPharmacy ? parseBusinessHours(selectedPharmacy.horario_atencion) : []); 
        return; 
      } 
      console.log(`Checking occupied times for pharmacy ${formData.pharmacyId} on selected date: ${formData.date}`); 
      try { 
        // Obtener citas ya agendadas para la farmacia en la fecha seleccionada (usando dia_atencion)
        const { data: bookedCitas, error } = await supabase 
          .from("citas")
          .select("horario_cita") // Solo necesitamos la hora de la cita
          .eq("id_farmacias", formData.pharmacyId)
          .eq("dia_atencion", formData.date); // Filtrar por la fecha local exacta almacenada en DB

        if (error) throw error; 
        if (!isMounted) return; 
        
        // Convertir los horario_cita (UTC) de las citas reservadas a strings de hora local (HH:MM) para comparar
        const bookedTimes = bookedCitas.map((cita) => { 
          try { 
            const d = new Date(cita.horario_cita); 
            return d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }); 
          } catch (e) { 
            console.error("Error parsing booked time:", cita.horario_cita, e); 
            return null; 
          } 
        }).filter(t => t !== null); 
        
        // Obtener todos los horarios posibles de la farmacia según su horario de atención
        const allPossibleTimes = parseBusinessHours(selectedPharmacy.horario_atencion); 
        
        // Filtrar los horarios que ya están ocupados por otras citas
        let availableFilteredTimes = allPossibleTimes.filter(time => !bookedTimes.includes(time)); 
        
        const todayLocal = new Date();
        // Obtener la fecha actual en formato YYYY-MM-DD para comparar con formData.date
        const todayStr = `${todayLocal.getFullYear()}-${(todayLocal.getMonth() + 1).toString().padStart(2, '0')}-${todayLocal.getDate().toString().padStart(2, '0')}`;

        // *** CAMBIO CLAVE: Solo filtra horarios que ya pasaron si la fecha seleccionada es HOY ***
        if (formData.date === todayStr) { 
          const now = new Date(); // Hora y fecha actuales del cliente
          const currentTimeStr = now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }); 
          // Filtrar los horarios que ya pasaron HOY (ej. si son las 10:00 AM, no mostrar 9:00, 9:30)
          availableFilteredTimes = availableFilteredTimes.filter(time => time >= currentTimeStr); 
        } 
        // Si formData.date es un día FUTURO, se muestran todos los horarios disponibles para ese día,
        // sin importar la hora actual del reloj del cliente.

        if (isMounted) setAvailableTimes(availableFilteredTimes); 
      } catch (error: any) { 
        console.error("Booked Times Error:", error); 
        if (isMounted) { 
          toast.error(`Error al obtener horas disponibles: ${error.message}`); 
          setAvailableTimes(selectedPharmacy ? parseBusinessHours(selectedPharmacy.horario_atencion) : []); 
        } 
      } 
    };
    fetchOccupiedTimes(); 
    return () => { isMounted = false; };
  }, [formData.date, formData.pharmacyId, selectedPharmacy, parseBusinessHours]);

  // fetchUpcomingAppointments (para la lista del usuario)
  const fetchUpcomingAppointments = useCallback(async () => {
    if (!patientId) { setUpcomingAppointments([]); setLoadingAppointments(false); return; }
    setLoadingAppointments(true);
    try {
      // Obtener la fecha actual en formato YYYY-MM-DD para filtrar citas futuras
      const today = new Date();
      const todayStr = `${today.getFullYear()}-${(today.getMonth() + 1).toString().padStart(2, '0')}-${today.getDate().toString().padStart(2, '0')}`;

      const { data, error, status } = await supabase
        .from('citas')
        .select(`
          id, horario_cita, dia_atencion, status, motivo_cita,
          farmacias ( nombre ),
          pago_e_cita ( numero_recibo, estado_pago )
        `)
        .eq('id_usuario', patientId)
        .gte('dia_atencion', todayStr) // Filtra las citas futuras a partir de hoy (basado en dia_atencion)
        .order('dia_atencion')
        .order('horario_cita');
      if (error && status !== 406) throw error; 

      // FIX: Ensure farmacias is an object, not an array of objects
      const formattedData = (data || []).map(appt => ({
          ...appt,
          farmacias: Array.isArray(appt.farmacias) ? appt.farmacias[0] : appt.farmacias,
          pago_e_cita: Array.isArray(appt.pago_e_cita) ? appt.pago_e_cita : null,
      })).filter(appt => appt.farmacias); // Filter out appointments without a valid pharmacy link

      setUpcomingAppointments(formattedData);
    } catch (error: any) { console.error('FETCH_APPTS Error:', error); toast.error(`Error cargando citas: ${error.message}`); setUpcomingAppointments([]); }
    finally { setLoadingAppointments(false); }
  }, [patientId]);

  // Trigger Fetch Upcoming Appointments
  useEffect(() => {
    if (!loadingUser && patientId) {
        fetchUpcomingAppointments();
    } else if (!loadingUser && !patientId && currentUser) {
        setUpcomingAppointments([]);
        setLoadingAppointments(false);
    } else if (!loadingUser && !currentUser) {
        setUpcomingAppointments([]);
        setLoadingAppointments(false);
    } 
  }, [loadingUser, patientId, fetchUpcomingAppointments, currentUser]); 


  // --- Manejadores de Eventos ---
  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => { 
    const { name, value } = e.target; 
    if (name === 'pharmacyId') { 
      const id = value ? parseInt(value) : null; 
      const sel = pharmacies.find(p => p.id_farmacia === id); 
      setSelectedPharmacy(sel || null); 
      setFormData(prev => ({ ...prev, pharmacyId: id, time: '', date: '', reason: prev.reason })); 
      setAvailableTimes([]); 
    } else if (name === 'date') { 
      setFormData(prev => ({ ...prev, date: value, time: '' })); 
    } else { 
      setFormData(prev => ({ ...prev, [name]: value })); 
    } 
  };

  const handleNext = () => { 
    if (currentStep === 1 && !formData.pharmacyId) { toast.error('Selecciona una farmacia para continuar.'); return; } 
    if (currentStep === 2 && !formData.date) { toast.error('Selecciona una fecha para tu cita.'); return; } 
    if (currentStep === 2 && !formData.time) { toast.error('Selecciona una hora para tu cita.'); return; } 
    if (currentStep === 3 && !paymentMethod) { toast.error('Selecciona un método de pago.'); return; } 
    if (currentStep < totalSteps) setCurrentStep(prev => prev + 1); 
  };

  const handleBack = () => { if (currentStep > 1) setCurrentStep(prev => prev - 1); };

  const handlePaymentMethodChange = (method: 'cash') => { 
    setPaymentMethod(method); 
    const newReceipt = `REC-EF-${Date.now().toString().slice(-6)}`; 
    setReceiptNumber(newReceipt); 
    console.log("Generated Cash Receipt (not saved yet):", newReceipt); 
  };

  const handleOpenBarcodeModal = (appointment: UpcomingAppointment) => { 
    setSelectedAppointmentForBarcode(appointment); 
    setIsBarcodeModalOpen(true); 
  };

  // --- Submit FINAL (Paso 4) ---
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // VALIDACIONES FINALES
    if (!currentUser || !currentUser.id) { toast.error("Error de sesión. Por favor, vuelve a iniciar."); return; }
    if (!patientId) { toast.error("Error: ID de paciente no disponible. Por favor, contacta a soporte."); return; }
    if (!formData.pharmacyId || !formData.date || !formData.time || !formData.reason.trim()) { toast.error("Por favor, completa todos los campos requeridos (Farmacia, Fecha, Hora, Motivo de consulta)."); return; }
    if (!paymentMethod) { toast.error("Selecciona un método de pago para tu cita."); return; }
    if (paymentMethod === 'cash' && !receiptNumber) { toast.error("Error: No se pudo generar el número de recibo."); return; }
    
    const localDateStr = formData.date; 
    const localTimeStr = formData.time; 

    // *** DEPURACIÓN CRÍTICA: Loggear los valores de entrada antes de la conversión ***
    console.log("--- DEBUG SUBMIT START ---");
    console.log("formData.date (string from picker):", localDateStr); // Ej: "2024-05-27"
    console.log("formData.time (string from picker):", localTimeStr);   // Ej: "08:00"
    console.log("selectedPharmacy?.nombre:", selectedPharmacy?.nombre);
    console.log("Motivo de la cita:", formData.reason.trim());

    // Crear un objeto Date en la zona horaria LOCAL del cliente
    // Esto es crucial para que la hora 08:00 se entienda como 8 AM local
    const apptDTLocal = new Date(`${localDateStr}T${localTimeStr}:00`);
    
    // Verificar si la fecha/hora construida es válida
    if (isNaN(apptDTLocal.getTime())) { 
      console.error("Error: Fecha/hora construida es inválida.", { localDateStr, localTimeStr, apptDTLocal });
      toast.error("Fecha u hora seleccionada inválida."); 
      return; 
    }

    // Convertir el objeto Date local a un string ISO 8601 en UTC para almacenar en la base de datos
    // Supabase (PostgreSQL TIMESTAMPTZ) espera UTC para almacenamiento correcto
    // Ej: Si apptDTLocal es 2024-05-28 08:00:00 GMT-0500, isoToSave será "2024-05-28T13:00:00.000Z"
    const isoToSave = apptDTLocal.toISOString();

    console.log("apptDTLocal (Date object as interpreted by browser's local timezone):", apptDTLocal.toString()); 
    console.log("isoToSave (UTC string that will be sent to DB):", isoToSave); 
    console.log("--- DEBUG SUBMIT END ---");

    const citaData = { 
      horario_cita: isoToSave, 
      dia_atencion: formData.date, // Se envía la fecha local (YYYY-MM-DD) tal cual se seleccionó
      id_usuario: patientId, 
      id_farmacias: formData.pharmacyId, 
      status: 'Activo', 
      motivo_cita: formData.reason.trim(), 
    };

    const tIdSubmit = toast.loading("Agendando cita...");
    let newCitaId: number | string | null = null;

    try {
      const { data: insertedCitaData, error: insertError } = await supabase.from("citas").insert([citaData]).select('id').single();
      
      if (insertError) { 
        console.error("Submit Error - Appointment insertion failed:", insertError); 
        if (insertError.code === '23505') { 
          toast.error("Horario no disponible. Ya existe una cita para esta hora.", { id: tIdSubmit }); 
        } else { 
          toast.error(`Error al agendar cita: ${insertError.message}`, { id: tIdSubmit }); 
        } 
        return; 
      }
      
      if (!insertedCitaData || !insertedCitaData.id) { throw new Error("No se obtuvo ID de la cita insertada."); }
      
      newCitaId = insertedCitaData.id;
      toast.loading("Registrando pago...", { id: tIdSubmit });
      
      // FIX: Ensure newCitaId is not null before creating pagoData
      if (newCitaId !== null) {
        const pagoData: PagoECita = { cita_id: newCitaId, metodo_pago: 'efectivo', numero_recibo: receiptNumber, estado_pago: 'pendiente' };
        const { error: pagoError } = await supabase.from("pago_e_cita").insert([pagoData]);
        
        if (pagoError) { 
          console.error("Submit Error - Payment insertion failed:", pagoError); 
          toast.error(`Cita agendada (ID: ${newCitaId})! PERO hubo un error registrando el pago: ${pagoError.message}.`, { id: tIdSubmit, duration: 8000 }); 
        } else { 
          toast.success(`¡Cita agendada con éxito! Pago Pendiente. Recibo: ${receiptNumber}.`, { id: tIdSubmit, duration: 6000 }); 
        }
      } else {
        throw new Error("ID de la cita es nulo, no se puede registrar el pago.");
      }
    } catch (error: any) { 
      console.error("Submit Error - General catch block:", error); 
      if (newCitaId) { 
        toast.error(`Cita agendada (ID: ${newCitaId}), pero ocurrió un error durante el proceso: ${error.message || 'Error desconocido'}.`, { id: tIdSubmit, duration: 8000 }); 
      } else { 
        toast.error(`No se pudo completar la operación: ${error.message || 'Error desconocido'}.`, { id: tIdSubmit }); 
      } 
    } finally { 
      if (newCitaId) { 
        setFormData({ pharmacyId: null, date: '', time: '', reason: '' }); 
        setSelectedPharmacy(null); 
        setAvailableTimes([]); 
        setPaymentMethod(null); 
        setReceiptNumber(null); 
        setCurrentStep(1); 
        fetchUpcomingAppointments(); 
      } 
    }
  };

  // --- Lógica de Renderizado ---
  const renderStepContent = () => {
    switch (currentStep) {
       case 1: return ( <div className="space-y-6"> <label htmlFor="pharmacyId" className="block text-sm font-medium text-gray-700"> <Building className="inline-block w-5 h-5 mr-2 align-text-bottom text-gray-500" /> Selecciona farmacia </label> {loadingPharmacies ? ( <div className="loading-msg">Cargando farmacias...</div> ) : ( <select id="pharmacyId" name="pharmacyId" value={formData.pharmacyId || ''} onChange={handleChange} className="input-std"> <option value="" disabled>-- Elige una opción --</option> {pharmacies.map((p) => ( <option key={p.id_farmacia} value={p.id_farmacia}>{p.nombre}</option> ))} </select> )} {selectedPharmacy && ( <div className="details-box"> <p><strong>Horario General:</strong> {selectedPharmacy.horario_atencion}</p> </div> )} </div> );
       case 2: return ( <div className="space-y-8"> <div> <h4 className="h4-label"><Calendar className="icon-label" />Fecha</h4> <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-7 gap-3"> {availableDates.map((d) => ( <label key={d.date} className={`date-label ${formData.date === d.date ? 'selected' : 'available'} ${d.isToday ? 'border-indigo-400' : ''}`} title={d.isToday ? "Hoy" : ""}> <input type="radio" name="date" value={d.date} checked={formData.date === d.date} onChange={handleChange} className="sr-only" /> <span className={`date-display ${formData.date === d.date ? 'selected' : ''} ${d.isToday ? 'font-semibold' : ''}`}>{d.display}</span> </label> ))} </div> </div> {formData.date && ( <div> <h4 className="h4-label"><Clock className="icon-label" />Hora</h4> <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-3"> {!selectedPharmacy ? ( <div className="col-span-full empty-slot-msg">Selecciona farmacia primero.</div> ) : availableTimes.length > 0 ? ( availableTimes.map((t, i) => ( <label key={`${t}-${i}`} className={`time-label ${formData.time === t ? 'selected' : 'available'}`}> <input type="radio" name="time" value={t} checked={formData.time === t} onChange={handleChange} className="sr-only" /> <span>{t}</span> </label> )) ) : ( <div className="col-span-full empty-slot-msg">No hay horarios disponibles para esta fecha o ya están todos reservados/pasados.</div> )} </div> </div> )} </div> );
       case 3: return ( <div className="space-y-6"> <h4 className="h4-label"><CreditCard className="icon-label" />Método de Pago</h4> <div className="flex flex-col sm:flex-row gap-4"> <button type="button" onClick={() => handlePaymentMethodChange('cash')} className={`flex-1 p-4 border rounded-lg flex flex-col items-center justify-center transition-all duration-150 ${ paymentMethod === 'cash' ? 'border-green-500 bg-green-50 ring-2 ring-green-300' : 'border-gray-300 hover:border-gray-400 hover:bg-gray-50' }`}> <DollarSign className={`w-8 h-8 mb-2 ${paymentMethod === 'cash' ? 'text-green-600' : 'text-gray-500'}`} /> <span className={`font-medium ${paymentMethod === 'cash' ? 'text-green-700' : 'text-gray-700'}`}>Efectivo</span> </button> </div> {paymentMethod === 'cash' && ( <div className="p-4 bg-green-100 border border-green-300 rounded-md text-center"> <Info className="inline-block w-5 h-5 mr-2 text-blue-600"/> <span className="text-sm font-medium text-green-800"> Seleccionado: Pago en Efectivo. Nº Recibo (Temporal): <strong className="font-bold">{receiptNumber}</strong> </span> <p className="text-xs text-green-700 mt-1">El pago se realizará en la farmacia. Presenta este número al llegar. Se registrará como <strong className='font-semibold'>pendiente</strong> hasta tu visita.</p> </div> )} </div> );
       case 4: return ( <div className="space-y-6"> <div> <label htmlFor="reason" className="h4-label"><FileText className="icon-label" />Motivo de la Consulta</label> <textarea id="reason" name="reason" value={formData.reason} onChange={handleChange} rows={4} required className="input-std" placeholder="Describe brevemente el motivo de tu visita..." /> </div> <div className="summary-box"> <h4 className="summary-title">Confirmar Detalles de la Cita</h4> <div className="summary-item"><UserIcon className="summary-icon" /><p><strong className="font-medium">Paciente:</strong> {currentUser?.email || 'Usuario'}</p></div> <div className="summary-item"><Building className="summary-icon" /><p><strong className="font-medium">Farmacia:</strong> {selectedPharmacy?.nombre || 'N/A'}</p></div> <div className="summary-item"><Calendar className="summary-icon" /><p><strong className="font-medium">Fecha:</strong> {formData.date ? formatDate(formData.date) : 'N/A'}</p></div> <div className="summary-item"><Clock className="summary-icon" /><p><strong className="font-medium">Hora:</strong> { formData.time ? formatTime(formData.time) : 'N/A' }</p></div> <div className="summary-item"><CreditCard className="summary-icon" /><p><strong className="font-medium">Pago:</strong> {paymentMethod === 'cash' ? <>Efectivo (Recibo: {receiptNumber}) - <span className="font-semibold text-orange-600">Pendiente</span></> : 'No seleccionado'}</p></div><div className="summary-item"><FileText className="summary-icon" /><p><strong className="font-medium">Motivo:</strong> {formData.reason || <span className="italic text-gray-500">(No especificado)</span>}</p></div> </div> </div> );
       default: return null;
    }
   };

  // --- Renderizado Principal ---
  if (loadingUser) {
    return <div className="loading-msg">Verificando sesión...</div>;
  }

  if (!currentUser) {
    return ( <div className="login-prompt"><h3 className="login-title">Acceso Requerido</h3><p>Necesitas iniciar sesión para agendar citas.</p></div> );
  }
  if (!patientId) {
    return ( <div className="login-prompt"><h3 className="login-title">Registro Incompleto</h3><p>No se encontró un registro de paciente asociado a tu cuenta. Contacta a soporte.</p></div> );
  }

  return (
    <div className="max-w-3xl mx-auto space-y-8 p-4 sm:p-6 lg:p-8">
      <Toaster position="top-center" reverseOrder={false} toastOptions={{ duration: 5000 }} />
      {/* Agendar Cita */}
      <div className="card-container">
         <div className="card-header"><h3 className="card-title">Agendar Nueva Cita</h3><p className="card-subtitle">¡Hola, {currentUser.email?.split('@')[0] || 'usuario'}!</p></div>
         <div className="step-indicator-container"><nav aria-label="Progress"><ol role="list" className="step-list">{[1, 2, 3, 4].map((step) => (<li key={step} className="flex-1">{step < currentStep ? (<div className="step completed"><span className="step-text">Paso {step}</span></div>) : step === currentStep ? (<div className="step current" aria-current="step"><span className="step-text">Paso {step}</span></div>) : (<div className="step upcoming"><span className="step-text">Paso {step}</span></div>)}</li>))}</ol></nav></div>
         <form onSubmit={currentStep === totalSteps ? handleSubmit : (e) => e.preventDefault()} className="card-form">
             <div className="min-h-[300px]">{renderStepContent()}</div>
             <div className="card-footer">
                 <button type="button" onClick={handleBack} disabled={currentStep === 1} className="btn-secondary">Atrás</button>
                 {currentStep < totalSteps ? (
                     <button type="button" onClick={handleNext} className="btn-primary">Siguiente</button>
                 ) : (
                     <button type="submit" className="btn-confirm">Confirmar Cita</button>
                 )}
            </div>
         </form>
      </div>

       {/* Mis Citas (con items clickables) */}
       <div className="card-container">
         <button onClick={() => setIsAppointmentsVisible(!isAppointmentsVisible)} className="accordion-button" aria-expanded={isAppointmentsVisible} aria-controls="upcoming-appointments-list"><div className="flex items-center"><List className="w-5 h-5 mr-3 text-gray-600" /><h4 className="accordion-title">Mis Próximas Citas</h4></div>{isAppointmentsVisible ? (<ChevronUp className="accordion-icon" />) : (<ChevronDown className="accordion-icon" />)}</button>
         {isAppointmentsVisible && (
           <div id="upcoming-appointments-list" className="accordion-content">
              {loadingAppointments ? (<div className="loading-msg">Cargando citas...</div>) : upcomingAppointments.length > 0 ? (<ul className="appointment-list">{upcomingAppointments.map((appt) => { const receiptInfo = appt.pago_e_cita?.[0]; const numeroRecibo = receiptInfo?.numero_recibo; return (<li key={appt.id} className="appointment-item cursor-pointer hover:bg-gray-50 transition-colors duration-150" onClick={() => handleOpenBarcodeModal(appt)} title={numeroRecibo ? "Ver código de barras del recibo" : "Ver detalles"}> <div className="appt-icon-container"><Calendar className="appt-icon" /></div> <div className="appt-details"> <p className="appt-pharmacy">{appt.farmacias?.nombre || 'N/A'}</p> <p className="appt-date">{formatDate(appt.dia_atencion)}</p> <p className="appt-time"> <Clock className="inline-block w-4 h-4 mr-1 align-text-bottom"/> {formatTime(appt.horario_cita)} {appt.status && <span className={`status-badge status-${appt.status.toLowerCase().replace(' ','-')}`}>{appt.status}</span>} {receiptInfo && (<span className={`status-badge ml-2 ${receiptInfo.estado_pago === 'pagado' ? 'status-pagado' : 'status-pendiente'}`}> {receiptInfo.estado_pago === 'pagado' ? 'Pagado' : 'Pendiente'} </span>)} </p> {appt.motivo_cita && <p className="appt-reason text-sm text-gray-500 mt-1"><FileText className="inline-block w-4 h-4 mr-1 align-text-bottom"/>Motivo: {appt.motivo_cita}</p>} {numeroRecibo && <p className="text-xs text-gray-400 mt-1">Recibo: {numeroRecibo}</p>} </div> </li>); })}</ul>) : (<div className="empty-list-msg">No tienes citas programadas.</div>)}
           </div>
         )}
       </div>

       {/* Modal Código de Barras */}
       <AnimatePresence>
         {isBarcodeModalOpen && selectedAppointmentForBarcode && (
           <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center p-4 z-50 backdrop-blur-sm" onClick={() => setIsBarcodeModalOpen(false)}>
             <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }} className="bg-white rounded-lg max-w-md w-full p-6 shadow-xl relative text-center" onClick={(e) => e.stopPropagation()}>
               <button onClick={() => setIsBarcodeModalOpen(false)} className="absolute top-2 right-2 p-1.5 text-gray-400 hover:text-gray-600 rounded-full hover:bg-gray-100" aria-label="Cerrar modal"> <X className="h-5 w-5" /> </button>
               <h3 className="text-lg font-semibold mb-2 text-gray-800">Detalles de la Cita</h3>
               <p className="text-sm text-gray-600 mb-1"> {selectedAppointmentForBarcode.farmacias?.nombre || 'Farmacia N/A'} </p>
               <p className="text-sm text-gray-600 mb-4"> {formatDate(selectedAppointmentForBarcode.dia_atencion)} - {formatTime(selectedAppointmentForBarcode.horario_cita)} </p>
               {selectedAppointmentForBarcode.pago_e_cita?.[0]?.numero_recibo ? (
                 <div className="barcode-container bg-white p-4 inline-block border">
                    <Barcode value={selectedAppointmentForBarcode.pago_e_cita[0].numero_recibo} format="CODE128" width={2} height={80} displayValue={true} fontSize={14} margin={10} />
                 </div>
               ) : (
                 <div className="my-8 p-4 bg-yellow-50 border border-yellow-200 rounded-md text-yellow-700 text-sm"> <AlertTriangle className="inline-block w-5 h-5 mr-2 align-text-bottom"/> No se encontró un número de recibo para esta cita. </div>
               )}
                <p className={`mt-3 text-sm font-medium ${selectedAppointmentForBarcode.pago_e_cita?.[0]?.estado_pago === 'pagado' ? 'text-green-600' : 'text-orange-600'}`}> Estado del Pago: {selectedAppointmentForBarcode.pago_e_cita?.[0]?.estado_pago?.toUpperCase() ?? 'Desconocido'} </p>
             </motion.div>
           </motion.div>
         )}
       </AnimatePresence>

       {/* Estilos */}
       <style>{`
         .input-std { width: 100%; padding: 0.5rem 0.75rem; border: 1px solid #d1d5db; border-radius: 0.375rem; box-shadow: 0 1px 2px 0 rgba(0, 0, 0, 0.05); } .input-std:focus { outline: 2px solid transparent; outline-offset: 2px; border-color: #6366f1; --tw-ring-color: #6366f1; box-shadow: var(--tw-ring-offset-shadow, 0 0 #0000), var(--tw-ring-shadow, 0 0 #0000), var(--tw-shadow); }
         .loading-msg { text-align: center; padding: 2.5rem; color: #6b7280; }
         .login-prompt { max-width: 36rem; margin: 2.5rem auto; padding: 1.5rem; background-color: white; border-radius: 0.5rem; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -2px rgba(0, 0, 0, 0.1); text-align: center; }
         .login-title { font-size: 1.125rem; font-weight: 600; color: #374151; margin-bottom: 1rem; } .login-prompt p { color: #4b5563; margin-bottom: 1.25rem; }
         .btn-primary { padding: 0.5rem 1rem; background-color: #4f46e5; color: white; border-radius: 0.375rem; font-weight: 500; transition: background-color 0.15s ease-in-out; display: inline-block; text-decoration: none; cursor: pointer; border: none;} .btn-primary:hover { background-color: #4338ca; } .btn-primary:disabled { opacity: 0.6; cursor: not-allowed; }
         .btn-secondary { padding: 0.5rem 1rem; background-color: white; color: #374151; border: 1px solid #d1d5db; border-radius: 0.375rem; font-weight: 500; transition: background-color 0.15s ease-in-out; cursor: pointer;} .btn-secondary:hover { background-color: #f9fafb; } .btn-secondary:disabled { opacity: 0.6; cursor: not-allowed; }
         .btn-confirm { padding: 0.5rem 1rem; background-color: #16a34a; color: white; border-radius: 0.375rem; font-weight: 500; transition: background-color 0.15s ease-in-out; cursor: pointer; border: none;} .btn-confirm:hover { background-color: #15803d; } .btn-confirm:disabled { opacity: 0.6; cursor: not-allowed; }
         .card-container { background-color: white; border-radius: 0.75rem; box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -4px rgba(0, 0, 0, 0.1); overflow: hidden; margin-bottom: 2rem; }
         .card-header { padding: 1.25rem 1.5rem; background-color: #f9fafb; border-bottom: 1px solid #e5e7eb; } .card-title { font-size: 1.25rem; font-weight: 600; color: #111827; } .card-subtitle { margin-top: 0.25rem; font-size: 0.875rem; color: #6b7280; }
         .step-indicator-container { padding: 1rem 1.5rem; } .step-list { display: flex; align-items: center; gap: 1rem; } .step { flex: 1; display: flex; flex-direction: column; border-left-width: 4px; padding-left: 1rem; padding-top: 0.5rem; padding-bottom: 0.5rem; border-color: #e5e7eb; } .step.completed { border-color: #4f46e5; } .step.current { border-color: #4f46e5; } .step-text { font-size: 0.75rem; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; color: #6b7280; } .step.completed .step-text, .step.current .step-text { color: #4f46e5; } @media (min-width: 768px) { .step { border-left-width: 0; border-top-width: 4px; padding-left: 0; padding-top: 1rem; padding-bottom: 0; } }
         .card-form { padding: 1.5rem; } .card-footer { display: flex; justify-content: space-between; align-items: center; padding: 1.5rem; margin-top: 1.5rem; border-top: 1px solid #e5e7eb; }
         .h4-label { display: block; font-size: 0.875rem; font-weight: 500; color: #374151; margin-bottom: 0.75rem; display: flex; align-items: center; } .icon-label { width: 1.25rem; height: 1.25rem; margin-right: 0.5rem; color: #6b7280; vertical-align: bottom; }
         .date-label { display: flex; flex-direction: column; align-items: center; padding: 0.5rem; border: 1px solid #d1d5db; border-radius: 0.5rem; cursor: pointer; transition: all 0.15s ease-in-out; text-align: center; min-height: 4rem; justify-content: center;} .date-label.available:hover { border-color: #a5b4fc; background-color: #eef2ff; } .date-label.selected { border-color: #6366f1; background-color: #e0e7ff; box-shadow: 0 0 0 2px #a5b4fc; } .date-label.border-indigo-400 { border-color: #818cf8; }
         .date-display { font-size: 0.8rem; font-weight: 500; color: #374151; line-height: 1.2; } .date-display.selected { color: #4338ca; } .date-label.available:hover .date-display { color: #4f46e5; } .date-display.font-semibold { font-weight: 600; }
         .time-label { display: flex; align-items: center; justify-content: center; padding: 0.75rem; border: 1px solid #d1d5db; border-radius: 0.5rem; cursor: pointer; transition: all 0.15s ease-in-out; text-align: center; font-size: 0.875rem; } .time-label.available:hover { border-color: #a5b4fc; background-color: #eef2ff; color: #4f46e5; } .time-label.selected { border-color: #6366f1; background-color: #e0e7ff; box-shadow: 0 0 0 2px #a5b4fc; color: #4338ca; font-weight: 600; }
         .empty-slot-msg { text-align: center; padding: 1rem; color: #6b7280; background-color: #f9fafb; border-radius: 0.5rem; border: 1px solid #e5e7eb; }
         .summary-box { background-color: #f3f4f6; border: 1px solid #e5e7eb; padding: 1rem; border-radius: 0.5rem; space-y: 0.75rem; } .summary-title { font-size: 1rem; font-weight: 600; color: #1f2937; margin-bottom: 0.5rem; } .summary-item { display: flex; align-items: flex-start; font-size: 0.875rem; color: #4b5563; } .summary-icon { width: 1.25rem; height: 1.25rem; color: #4f46e5; margin-right: 0.75rem; flex-shrink: 0; margin-top: 0.125rem; }
         .accordion-button { width: 100%; display: flex; justify-content: space-between; align-items: center; padding: 1rem 1.5rem; text-align: left; transition: background-color 0.15s ease-in-out; border: none; background: none;} .accordion-button:hover { background-color: #f9fafb; } .accordion-title { font-size: 1.125rem; font-weight: 500; color: #1f2937; } .accordion-icon { width: 1.5rem; height: 1.5rem; color: #6b7280; }
         .accordion-content { padding: 0 1.5rem 1.5rem 1.5rem; border-top: 1px solid #e5e7eb; }
         .appointment-list { list-style: none; padding: 0; margin: 0; padding-top: 1rem;}
         .appointment-item { display: flex; align-items: flex-start; gap: 1rem; padding: 1rem 0.5rem; border-bottom: 1px solid #e5e7eb; border-radius: 0.375rem; }
         .appointment-item:last-child { border-bottom: none; }
         .appointment-item.cursor-pointer:hover { background-color: #f9fafb; }
         .appt-icon-container { flex-shrink: 0; width: 2.5rem; height: 2.5rem; border-radius: 9999px; background-color: #e0e7ff; display: flex; align-items: center; justify-content: center; } .appt-icon { width: 1.25rem; height: 1.25rem; color: #4f46e5; } .appt-details { flex: 1; min-width: 0; } .appt-pharmacy { font-size: 0.875rem; font-weight: 500; color: #111827; } .appt-date { font-size: 0.875rem; color: #6b7280; } .appt-time { font-size: 0.875rem; color: #6b7280; }
         .status-badge { display: inline-flex; align-items: center; padding: 0.125rem 0.625rem; border-radius: 9999px; font-size: 0.75rem; font-weight: 500; line-height: 1; }
         .status-activo { background-color: #dbeafe; color: #1e40af; }
         .status-pendiente { background-color: #ffedd5; color: #9a3412; }
         .status-pagado { background-color: #dcfce7; color: #166534; }
         .empty-list-msg { text-align: center; padding: 1.5rem; color: #6b7280; } .details-box { font-size: 0.875rem; color: #4b5563; background-color: #f9fafb; padding: 0.75rem; border-radius: 0.375rem; border: 1px solid #e5e7eb; }
         .appt-reason { font-style: italic; }
         .text-orange-600 { color: #ea580c; }
         .barcode-container svg { display: block; margin: auto; }
       `}</style>
    </div>
  );
};

export default AppointmentScheduler;