import React, { useState, useEffect, ChangeEvent, FormEvent, useCallback, useRef } from 'react';
import { User } from '@supabase/supabase-js';
import supabase from '../../lib/supabaseClient';
import { toast } from 'react-hot-toast';

// --- Interfaces ---
interface Patient {
    id: string; user_id?: string | null; name: string; date_of_birth?: string | null; gender?: string | null; email?: string | null; phone?: string | null; address?: string | null; emergency_contact?: string | null; blood_type?: string | null; allergies?: string | null; profile_image?: string | null; frecuencia_cardiaca?: number | null; frecuencia_respiratoria?: number | null; temperatura_corporal?: number | null; tension_arterial?: string | null; altura?: number | null; talla?: string | null; peso?: number | null; edad?: number | null; correo_electronico?: string | null; nombre_completo?: string | null; proxima_consulta?: string | null; ultima_consulta?: string | null; tag_rfid?: string | null; vector_facial?: any | null; doctor_id?: string | null; created_at?: string | null; updated_at?: string | null; surecode?: string | null; emocion_registro?: string | null;
}
interface Trabajador {
    id: string; user_id: string; nombre: string; telefono?: string | null; email?: string | null; cedula_prof?: string | null; especialidad?: string | null; id_farmacia: number; rol: string; key_lux?: string | null; "CedulaProf"?: string | null; created_at?: string | null;
}
interface PagoECita {
    id?: number;
    cita_id?: number;
    estado_pago: string;
    numero_recibo?: string | null;
}
interface Cita {
    id: number; horario_cita: string; dia_atencion: string; id_usuario: string; created_at: string; last_updated_at: string; id_farmacias: number; status?: 'Activo' | 'En consulta' | 'Terminada' | 'Pendiente' | null;
    patient?: { name: string; date_of_birth?: string | null; peso?: number | null; altura?: number | null; blood_type?: string | null; allergies?: string | null; } | null;
    pago_e_cita?: PagoECita[] | null;
    doctor_id?: string | null;
}

interface MedicamentoDBInfo {
    id_farmaco: number;
    marca_comercial: string;
    nombre_medicamento: string;
    precio_en_pesos?: number;
    upc?: string | null;
    unidades: number;
    lote?: string | null;
    ubicacion_stand?: string | null;
    fecha_caducidad?: string | null;
    fecha_ingreso?: string | null;
    fraccion?: string | null;
    stock_minimo?: number;
    categoria?: string | null;
    id_farmacia: number;
}

interface MedicamentoConceptInfo {
    concept_id: string;
    nombre_generico: string;
    principio_activo: string;
    presentacion_forma: string;
    concentracion_ej: string;
    via_administracion_default: string[];
    dosis_min_adulto_mg?: number;
    dosis_max_adulto_mg?: number;
    frecuencia_adulto_text?: string;
    dosis_pediatrica_mg_kg?: {
        min: number;
        max: number;
        unit: string;
    };
    concentracion_ml_para_calc?: string;
    efectos_secundarios?: string[];
    contraindicaciones?: string[];
}
const CONCEPTUAL_MEDICINE_DATA: MedicamentoConceptInfo[] = [
    {
        concept_id: 'paracetamol_tab', nombre_generico: 'Paracetamol', principio_activo: 'Paracetamol', presentacion_forma: 'Tableta', concentracion_ej: '500mg', via_administracion_default: ['Oral'], dosis_min_adulto_mg: 250, dosis_max_adulto_mg: 1000, frecuencia_adulto_text: 'cada 4-6 horas', dosis_pediatrica_mg_kg: { min: 10, max: 15, unit: 'mg/kg/dosis' }, concentracion_ml_para_calc: '100mg/ml', efectos_secundarios: ['Hepatotoxicidad (dosis altas)'], contraindicaciones: ['Insuficiencia hepática severa'],
    },
    {
        concept_id: 'amoxicilina_cap', nombre_generico: 'Amoxicilina', principio_activo: 'Amoxicilina', presentacion_forma: 'Cápsula', concentracion_ej: '500mg', via_administracion_default: ['Oral'], dosis_min_adulto_mg: 250, dosis_max_adulto_mg: 500, frecuencia_adulto_text: 'cada 8 horas', dosis_pediatrica_mg_kg: { min: 25, max: 45, unit: 'mg/kg/dia' }, concentracion_ml_para_calc: '250mg/5ml', efectos_secundarios: ['Náuseas', 'Diarrea', 'Reacciones alérgicas'], contraindicaciones: ['Alergia a penicilinas'],
    },
];
interface RecetaMedicamento {
    nombre: string;
    principio_activo: string;
    dosis: string;
    via: string;
    frecuencia: string;
    duracion: string;
    cantidad_a_dispensar: string;
    unidad_cantidad: string;
}
interface FormMedicamento extends RecetaMedicamento {
    db_id?: number;
    concept_id?: string;
    alerta_dosis?: string | null;
    stock_disponible?: number | null;
    in_pharmacy_inventory?: boolean;
    suggestion_id_farmacia?: number;
}
interface RecetaBase {
    paciente_id: string; doctor_id: string; fecha_consulta: string; proxima_consulta?: string | null; medicamentos: RecetaMedicamento[]; indicaciones: string; diagnostico: string; descargable?: boolean | null; frecuencia_cardiaca?: number | null; frecuencia_respiratoria?: number | null; temperatura_corporal?: number | null; tension_arterial?: string | null; peso?: number | null; altura?: number | null; blood_type: string;
    allergies?: string | null; motivo_consulta: string; antecedentes?: string | null; exploracion_fisica: string | null; plan_tratamiento?: string | null; recomendaciones: string | null; observaciones: string | null;
}

interface RecetaInsert extends RecetaBase {
    id_farmacia?: number | null;
}

interface RecetaHistorial extends Omit<RecetaBase,
    'doctor_id' | 'paciente_id' | 'indicaciones' | 'descargable' |
    'motivo_consulta' | 'antecedentes' | 'exploracion_fisica' | 'plan_tratamiento' |
    'recomendaciones' | 'observaciones' | 'frecuencia_cardiaca' | 'frecuencia_respiratoria' |
    'temperatura_corporal' | 'tension_arterial' | 'peso' | 'altura' | 'blood_type' |
    'allergies' | 'proxima_consulta' | 'medicamentos'
> {
    id: string;
    fecha_emision: string;
    medicamentos: RecetaMedicamento[];
    trabajadores?: { nombre: string }[] | null;
}
const initialFormMedicamentoState: FormMedicamento = {
    nombre: '', principio_activo: '', dosis: '', via: 'Oral', frecuencia: '', duracion: '', cantidad_a_dispensar: '', unidad_cantidad: 'unidades', db_id: undefined, concept_id: undefined, alerta_dosis: null, stock_disponible: null, in_pharmacy_inventory: false, suggestion_id_farmacia: undefined,
};
const initialPrescriptionState: Omit<RecetaInsert, 'doctor_id' | 'paciente_id'> = {
    fecha_consulta: new Date().toISOString().split('T')[0], proxima_consulta: null, medicamentos: [], indicaciones: '', diagnostico: '', motivo_consulta: '', frecuencia_cardiaca: null, frecuencia_respiratoria: null, temperatura_corporal: null, tension_arterial: '', peso: null, altura: null, blood_type: '', allergies: '', antecedentes: '', exploracion_fisica: '', plan_tratamiento: '', recomendaciones: '', observaciones: '', descargable: true,
};
const REFRESH_INTERVAL_MS = 5 * 60 * 1000;
const AUTOSAVE_KEY = 'doctor_prescription_draft';

const DoctorPrescription: React.FC = () => {
    const [loadingState, setLoadingState] = useState({ initial: true, patient: false });
    const [isRefreshingAppointments, setIsRefreshingAppointments] = useState<boolean>(false);
    const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
    const [error, setError] = useState<string | null>(null);
    const [authUser, setAuthUser] = useState<User | null>(null);
    const [doctor, setDoctor] = useState<Trabajador | null>(null);
    const [appointments, setAppointments] = useState<Cita[]>([]);
    const [selectedAppointmentId, setSelectedAppointmentId] = useState<number | null>(null);
    const [selectedPatient, setSelectedPatient] = useState<Patient | null>(null);

    const [prescriptionData, setPrescriptionData] = useState<RecetaInsert>({ ...initialPrescriptionState, paciente_id: '', doctor_id: '', id_farmacia: null, });

    const [showRefreshReminder, setShowRefreshReminder] = useState<boolean>(false);
    const [isCarnetVisible, setIsCarnetVisible] = useState<boolean>(false);
    const [prescriptionHistory, setPrescriptionHistory] = useState<RecetaHistorial[]>([]);
    const [isFetchingHistory, setIsFetchingHistory] = useState<boolean>(false);
    const [historyError, setHistoryError] = useState<string | null>(null);
    const [autocompleteSuggestions, setAutocompleteSuggestions] = useState<MedicamentoDBInfo[]>([]);
    const [activeSuggestionIndex, setActiveSuggestionIndex] = useState<number>(-1);
    const [favoriteMedicines, setFavoriteMedicines] = useState<number[]>([]);
    const isMountedRef = useRef(true);
    const refreshTimerRef = useRef<NodeJS.Timeout | null>(null);
    const autocompleteRefs = useRef<(HTMLInputElement | null)[]>([]);

    const getTodayDateString = () => new Date().toISOString().split('T')[0];
    const formatDate = (dateString: string | null | undefined) => {
        if (!dateString) return 'N/A';
        try { const date = new Date(dateString.includes('T') ? dateString : dateString + 'T00:00:00'); return date.toLocaleDateString('es-MX', { year: 'numeric', month: 'short', day: 'numeric' }); }
        catch { return dateString; }
    };
    const calculateAge = (dateOfBirth: string | null | undefined): number | null => {
        if (!dateOfBirth) return null;
        const dob = new Date(dateOfBirth);
        const diffMs = Date.now() - dob.getTime();
        const ageDate = new Date(diffMs);
        return Math.abs(ageDate.getUTCFullYear() - 1970);
    };

    const getMedicamentoConceptInfo = useCallback((name: string): MedicamentoConceptInfo | undefined => {
        return CONCEPTUAL_MEDICINE_DATA.find(med => med.nombre_generico.toLowerCase() === name.toLowerCase() || (med.nombre_generico && name.toLowerCase().includes(med.nombre_generico.toLowerCase())));
    }, []);

    const checkDoseAlert = useCallback((index: number) => {
        const currentMed = prescriptionData.medicamentos[index] as FormMedicamento;
        const medConceptInfo = getMedicamentoConceptInfo(currentMed.nombre);
        if (!medConceptInfo || !selectedPatient) {
            setPrescriptionData(prev => {
                const updatedMedicamentos = [...prev.medicamentos] as FormMedicamento[];
                if (updatedMedicamentos[index]) { updatedMedicamentos[index] = { ...updatedMedicamentos[index], alerta_dosis: null }; }
                return { ...prev, medicamentos: updatedMedicamentos as RecetaMedicamento[] };
            });
            return;
        }
        let alertMessage: string | null = null;
        if (selectedPatient.allergies && (selectedPatient.allergies.toLowerCase().includes(medConceptInfo.principio_activo.toLowerCase()) || selectedPatient.allergies.toLowerCase().includes(medConceptInfo.nombre_generico.toLowerCase()))) {
            alertMessage = (alertMessage ? alertMessage + " " : "") + `¡Alerta! Paciente con historial de alergia a ${medConceptInfo.principio_activo} o ${medConceptInfo.nombre_generico}.`;
        }
        setPrescriptionData(prev => {
            const updatedMedicamentos = [...prev.medicamentos] as FormMedicamento[];
            if (updatedMedicamentos[index]) { updatedMedicamentos[index] = { ...updatedMedicamentos[index], alerta_dosis: alertMessage }; }
            return { ...prev, medicamentos: updatedMedicamentos as RecetaMedicamento[] };
        });
    }, [prescriptionData.medicamentos, getMedicamentoConceptInfo, selectedPatient]);

    const fetchMedicamentoSuggestions = useCallback(async (query: string) => {
        if (query.length < 3 || !doctor?.id_farmacia) { setAutocompleteSuggestions([]); return; }
        try {
            const { data, error } = await supabase.from('medicamentos').select('id_farmaco, nombre_medicamento, unidades, marca_comercial, id_farmacia').eq('id_farmacia', doctor.id_farmacia).ilike('nombre_medicamento', `%${query}%`).limit(10);
            if (error) throw error;
            setAutocompleteSuggestions(data as MedicamentoDBInfo[]);
        } catch (err) { console.error('Error fetching medicine suggestions:', err); setAutocompleteSuggestions([]); }
    }, [doctor]);

    const handleMedicamentoNameChange = useCallback(async (index: number, value: string) => {
        setPrescriptionData(prev => {
            const updatedMedicamentos = [...prev.medicamentos] as FormMedicamento[];
            if (updatedMedicamentos[index]) { updatedMedicamentos[index] = { ...updatedMedicamentos[index], nombre: value, principio_activo: '', db_id: undefined, concept_id: undefined, stock_disponible: null, in_pharmacy_inventory: false, alerta_dosis: null, via: initialFormMedicamentoState.via, suggestion_id_farmacia: undefined }; }
            return { ...prev, medicamentos: updatedMedicamentos as RecetaMedicamento[] };
        });
        await fetchMedicamentoSuggestions(value);
        setActiveSuggestionIndex(-1);
    }, [fetchMedicamentoSuggestions]);

    const selectMedicamentoSuggestion = useCallback((index: number, dbInfo: MedicamentoDBInfo) => {
        const medConcept = getMedicamentoConceptInfo(dbInfo.nombre_medicamento);
        setPrescriptionData(prev => {
            const updatedMedicamentos = [...prev.medicamentos] as FormMedicamento[];
            if (updatedMedicamentos[index]) {
                updatedMedicamentos[index] = {
                    ...updatedMedicamentos[index], db_id: dbInfo.id_farmaco, nombre: dbInfo.nombre_medicamento, principio_activo: medConcept?.principio_activo || dbInfo.nombre_medicamento, concept_id: medConcept?.concept_id, stock_disponible: dbInfo.unidades, in_pharmacy_inventory: doctor?.id_farmacia === dbInfo.id_farmacia, suggestion_id_farmacia: dbInfo.id_farmacia, via: medConcept?.via_administracion_default?.[0] || initialFormMedicamentoState.via,
                };
            }
            return { ...prev, medicamentos: updatedMedicamentos as RecetaMedicamento[] };
        });
        setAutocompleteSuggestions([]);
        setTimeout(() => checkDoseAlert(index), 0);
    }, [checkDoseAlert, getMedicamentoConceptInfo, doctor]);

    const addMedicamento = useCallback(() => {
        setPrescriptionData(prev => ({ ...prev, medicamentos: [...prev.medicamentos, { ...initialFormMedicamentoState }] as RecetaMedicamento[] }));
    }, []);

    const removeMedicamento = useCallback((index: number) => {
        setPrescriptionData(prev => ({ ...prev, medicamentos: prev.medicamentos.filter((_, i) => i !== index) as RecetaMedicamento[] }));
    }, []);

    const fetchAppointmentsData = useCallback(async (pharmacyId: number, doctorId: string | undefined, isInitialLoad = false) => {
        if (!isMountedRef.current) return;
        if (!isInitialLoad) { setIsRefreshingAppointments(true); setShowRefreshReminder(false); }
        setError(null); const today = getTodayDateString();
        try {
            let query = supabase.from('citas').select(`
                id, horario_cita, dia_atencion, id_usuario, id_farmacias, status, doctor_id, created_at, last_updated_at,
                patient:patients ( name, date_of_birth, peso, altura, blood_type, allergies ),
                pago_e_cita ( estado_pago, numero_recibo )
            `).eq('id_farmacias', pharmacyId).eq('dia_atencion', today);

            if (doctorId) { query = query.or(`doctor_id.eq.${doctorId},doctor_id.is.null`); }
            query = query.order('horario_cita', { ascending: true });
            const { data: citasData, error: citasError } = await query;
            if (!isMountedRef.current) return; if (citasError) { throw citasError; }

            const paidAppointments = (citasData as unknown as Cita[]).filter(cita => cita.pago_e_cita && cita.pago_e_cita.length > 0 && cita.pago_e_cita[0].estado_pago === 'pagado');
            setAppointments(paidAppointments);
        } catch (err: any) { console.error("Error during fetchAppointmentsData:", err); if (isMountedRef.current) { setError(`Error al cargar citas: ${err.message}.`); setAppointments([]); } }
        finally { if (isMountedRef.current) { setIsRefreshingAppointments(false); } }
    }, []);

    const fetchPrescriptionHistory = useCallback(async (patientId: string) => {
        if (!isMountedRef.current) return;
        setIsFetchingHistory(true); setHistoryError(null); setPrescriptionHistory([]);
        try {
            const { data, error } = await supabase.from('recetas').select(`id, fecha_consulta, diagnostico, medicamentos, fecha_emision, trabajadores ( nombre )`).eq('paciente_id', patientId).order('fecha_consulta', { ascending: false });
            if (!isMountedRef.current) return; if (error) { throw error; }
            setPrescriptionHistory(data as unknown as RecetaHistorial[]);
        } catch (err: any) { console.error("Error fetching prescription history:", err); if (isMountedRef.current) setHistoryError(`Error al cargar historial: ${err.message}`); }
        finally { if (isMountedRef.current) setIsFetchingHistory(false); }
    }, []);

    const fetchPatientDetails = useCallback(async (patientId: string) => {
        if (!isMountedRef.current) return;
        setLoadingState(prev => ({ ...prev, patient: true })); setError(null);
        try {
            const { data: patientData, error: patientError } = await supabase.from('patients').select('*').eq('id', patientId).single();
            if (!isMountedRef.current) return; if (patientError) { throw patientError; }
            setSelectedPatient(patientData as Patient);
        } catch (err: any) {
            console.error('Error fetching patient details:', err);
            if (isMountedRef.current) {
                setError(`Error al cargar datos paciente: ${err.message}.`);
                setSelectedPatient(null);
            }
        } finally {
            if (isMountedRef.current) {
                setLoadingState(prev => ({ ...prev, patient: false }));
            }
        }
    }, []);
    
    const fetchDoctorAndLoadState = useCallback(async (user: User) => {
        if (!isMountedRef.current) return;
        try {
            const { data: dD, error: dE } = await supabase.from('trabajadores').select('*').eq('user_id', user.id).single();
            if (!isMountedRef.current) return;
            if (dE) throw dE;

            if (dD && dD.rol === 'Doctor') {
                setDoctor(dD as Trabajador);
                await fetchAppointmentsData(dD.id_farmacia, dD.id, true);

                const draftKey = `${AUTOSAVE_KEY}_${dD.id}`;
                const savedDraft = localStorage.getItem(draftKey);

                if (savedDraft) {
                    try {
                        const { prescriptionData: spd, selectedPatient: ssp, selectedAppointmentId: said } = JSON.parse(savedDraft);
                        setPrescriptionData(spd);
                        setSelectedPatient(ssp);
                        setSelectedAppointmentId(said);
                        toast("Borrador de receta recuperado.", { icon: 'ℹ️', duration: 3000, id: "draft-recovered" });
                    } catch (e) {
                        localStorage.removeItem(draftKey);
                        setPrescriptionData({ ...initialPrescriptionState, doctor_id: dD.id, id_farmacia: dD.id_farmacia, paciente_id: '' });
                    }
                } else {
                    setPrescriptionData({ ...initialPrescriptionState, doctor_id: dD.id, id_farmacia: dD.id_farmacia, paciente_id: '' });
                }

                const savedFavoritesRaw = localStorage.getItem(`doctor_favorite_medicines_${dD.id}`);
                if (savedFavoritesRaw) {
                    try {
                        const savedFavoritesParsed = JSON.parse(savedFavoritesRaw);
                        if (Array.isArray(savedFavoritesParsed)) setFavoriteMedicines(savedFavoritesParsed);
                    } catch (parseError) { setFavoriteMedicines([]); }
                }

            } else {
                throw new Error("Usuario no es Doctor o no encontrado.");
            }
        } catch (err: any) {
            console.error('Error en fetchDoctorAndLoadState:', err);
            if (isMountedRef.current) {
                setError(`Error al configurar el doctor: ${err.message}`);
                setDoctor(null);
            }
        } finally {
            if (isMountedRef.current) {
                setLoadingState(prev => ({ ...prev, initial: false }));
            }
        }
    }, [fetchAppointmentsData]);

    useEffect(() => {
        isMountedRef.current = true;
        setError(null);
        setLoadingState({ initial: true, patient: false });

        supabase.auth.getSession().then(({ data: { session } }) => {
            if (!isMountedRef.current) return;
            if (session?.user) { setAuthUser(session.user); fetchDoctorAndLoadState(session.user); }
            else { setError("No hay sesión. Inicia sesión."); setLoadingState({ initial: false, patient: false }); }
        });

        const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
            if (!isMountedRef.current) return;
            const currentUser = session?.user ?? null;
            setAuthUser(currentUser);
            const prevDocId = doctor?.id;
            setDoctor(null); setAppointments([]); setSelectedAppointmentId(null); setSelectedPatient(null);
            setShowRefreshReminder(false); setIsCarnetVisible(false); setLoadingState({ initial: true, patient: false });
            setFavoriteMedicines([]);
            if (prevDocId) { localStorage.removeItem(`${AUTOSAVE_KEY}_${prevDocId}`); }
            if (currentUser) { fetchDoctorAndLoadState(currentUser); }
            else { setError("Sesión cerrada."); setLoadingState({ initial: false, patient: false }); }
        });
        return () => { isMountedRef.current = false; subscription?.unsubscribe(); if (refreshTimerRef.current) clearInterval(refreshTimerRef.current); };
    }, [fetchDoctorAndLoadState]);

    useEffect(() => {
        if (refreshTimerRef.current) { clearInterval(refreshTimerRef.current); refreshTimerRef.current = null; }
        if (doctor && isMountedRef.current) {
            refreshTimerRef.current = setInterval(() => { if (isMountedRef.current) { setShowRefreshReminder(true); } else if (refreshTimerRef.current) clearInterval(refreshTimerRef.current); }, REFRESH_INTERVAL_MS);
        }
        return () => { if (refreshTimerRef.current) clearInterval(refreshTimerRef.current); }
    }, [doctor]);

    // --- SEPARACIÓN DE RESPONSABILIDADES PARA EVITAR BUCLES ---

    // useEffect #1: Reacciona al cambio de cita para buscar datos del paciente.
    useEffect(() => {
        if (!selectedAppointmentId) {
            if (selectedPatient) setSelectedPatient(null);
            return;
        }

        const selectedCita = appointments.find(c => c.id === selectedAppointmentId);
        const newPatientId = selectedCita?.id_usuario;

        if (newPatientId && newPatientId !== selectedPatient?.id) {
            const isDraftInProgress =
                prescriptionData.motivo_consulta.trim() !== '' ||
                prescriptionData.diagnostico.trim() !== '' ||
                prescriptionData.medicamentos.length > 0;
            
            if (isDraftInProgress) {
                if (!window.confirm("Tienes una receta en progreso. ¿Estás seguro de que quieres descartarla y empezar una nueva para este paciente?")) {
                    const previousAppointmentId = appointments.find(c => c.id_usuario === selectedPatient?.id)?.id ?? null;
                    setSelectedAppointmentId(previousAppointmentId);
                    return;
                }
            }
            fetchPatientDetails(newPatientId);
        }
    }, [selectedAppointmentId, appointments, fetchPatientDetails]); // Dependencias estables

    // useEffect #2: Reacciona cuando se carga un nuevo paciente para limpiar el formulario.
    useEffect(() => {
        if (!selectedPatient) return;

        if (prescriptionData.paciente_id !== selectedPatient.id) {
            setPrescriptionData({
                ...initialPrescriptionState,
                doctor_id: doctor?.id ?? '',
                id_farmacia: doctor?.id_farmacia ?? null,
                paciente_id: selectedPatient.id,
                fecha_consulta: getTodayDateString(),
                blood_type: selectedPatient.blood_type ?? '',
                allergies: selectedPatient.allergies ?? '',
                peso: selectedPatient.peso ?? null,
                altura: selectedPatient.altura ?? null,
            });
            toast("Formulario reiniciado para el paciente.", { icon: '💡', duration: 2500, id: "form-reset" });
        }
    }, [selectedPatient, doctor]); // Dependencias estables

    // useEffect #3: Lógica de Autoguardado.
    useEffect(() => {
        if (!doctor?.id || isSubmitting || loadingState.initial) {
            return;
        }

        const isDraftNotEmpty =
            selectedAppointmentId !== null ||
            selectedPatient !== null ||
            prescriptionData.motivo_consulta.trim() !== '' ||
            prescriptionData.diagnostico.trim() !== '' ||
            prescriptionData.indicaciones.trim() !== '' ||
            prescriptionData.medicamentos.length > 0;

        const draftKey = `${AUTOSAVE_KEY}_${doctor.id}`;

        if (isDraftNotEmpty) {
            const draft = { prescriptionData, selectedPatient, selectedAppointmentId };
            try {
                localStorage.setItem(draftKey, JSON.stringify(draft));
            } catch (error) {
                console.error("Error al autoguardar el borrador:", error);
            }
        } else {
            localStorage.removeItem(draftKey);
        }
    }, [prescriptionData, selectedPatient, selectedAppointmentId, doctor, isSubmitting, loadingState.initial]);

    const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>, index: number) => {
        if (autocompleteSuggestions.length === 0) return;
        if (e.key === 'ArrowDown') { e.preventDefault(); setActiveSuggestionIndex(prev => (prev < autocompleteSuggestions.length - 1 ? prev + 1 : prev)); }
        else if (e.key === 'ArrowUp') { e.preventDefault(); setActiveSuggestionIndex(prev => (prev > 0 ? prev - 1 : 0)); }
        else if (e.key === 'Enter' && activeSuggestionIndex !== -1 && autocompleteSuggestions[activeSuggestionIndex]) { e.preventDefault(); selectMedicamentoSuggestion(index, autocompleteSuggestions[activeSuggestionIndex]); }
        else if (e.key === 'Escape') { setAutocompleteSuggestions([]); }
    }, [autocompleteSuggestions, activeSuggestionIndex, selectMedicamentoSuggestion]);

    const handleSelectAppointment = (citaId: number | null) => {
        if (loadingState.patient || isRefreshingAppointments) return;
        if (citaId === null) {
            setSelectedAppointmentId(null);
            setSelectedPatient(null);
            setPrescriptionData(prev => ({ ...initialPrescriptionState, doctor_id: prev.doctor_id, id_farmacia: prev.id_farmacia, paciente_id: '' }));
            if (doctor?.id) { localStorage.removeItem(`${AUTOSAVE_KEY}_${doctor.id}`); toast("Borrador limpiado.", { icon: '💡', id: "draft-cleared" }); }
            if (isCarnetVisible) { setIsCarnetVisible(false); setPrescriptionHistory([]); setHistoryError(null); }
            return;
        }
        const targetAppointment = appointments.find(c => c.id === citaId);
        if (!targetAppointment) return;
        if (targetAppointment.doctor_id && targetAppointment.doctor_id !== doctor?.id) { toast.error("Cita asignada a otro Dr.", { id: "cita-other-doc" }); return; }
        const isFinished = targetAppointment.status === 'Terminada';
        if (isFinished) { toast("Consulta terminada.", { icon: 'ℹ️', id: "cita-finished" }); return; }
        if (citaId === selectedAppointmentId) { return; }
        setSelectedAppointmentId(citaId);
        if (isCarnetVisible) { setIsCarnetVisible(false); setPrescriptionHistory([]); setHistoryError(null); }
    };

    const handleRefreshAppointments = () => {
        if (doctor?.id_farmacia && !isRefreshingAppointments && isMountedRef.current) { fetchAppointmentsData(doctor.id_farmacia, doctor.id, false); toast("Actualizando citas...", { icon: '🔄', id: "refresh-citas" }); }
    };
    const dismissRefreshReminder = () => { setShowRefreshReminder(false); };

    const handleInputChange = (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
        const { name, value, type } = e.target;
        const isNumericField = ['frecuencia_cardiaca', 'frecuencia_respiratoria', 'temperatura_corporal', 'peso', 'altura'].includes(name);
        let parsedValue;
        if (type === 'checkbox') { parsedValue = (e.target as HTMLInputElement).checked; }
        else if (isNumericField) { parsedValue = value === '' ? null : parseFloat(value); }
        else { parsedValue = value; }
        setPrescriptionData(prev => ({ ...prev, [name]: parsedValue, }));
    };

    const handleMedicamentoChange = (index: number, field: keyof FormMedicamento, value: string | number | boolean) => {
        setPrescriptionData(prev => {
            const updatedMedicamentos = [...prev.medicamentos] as FormMedicamento[];
            if (updatedMedicamentos[index]) { updatedMedicamentos[index] = { ...updatedMedicamentos[index], [field]: value }; }
            return { ...prev, medicamentos: updatedMedicamentos as RecetaMedicamento[] };
        });
        if (field === 'nombre' || field === 'principio_activo') { checkDoseAlert(index); }
    };

    const toggleFavoriteMedicamento = useCallback((dbId: number) => {
        const doctorId = doctor?.id;
        if (!doctorId) { toast.error("ID de doctor no disponible.", { id: "fav-error-doctor-id" }); return; }
        setFavoriteMedicines(prevFavorites => {
            const newFavorites = prevFavorites.includes(dbId) ? prevFavorites.filter(id => id !== dbId) : [...prevFavorites, dbId];
            try { localStorage.setItem(`doctor_favorite_medicines_${doctorId}`, JSON.stringify(newFavorites)); toast(newFavorites.includes(dbId) ? "Añadido a favoritos." : "Eliminado de favoritos.", { icon: '⭐', id: `fav-toggle-${dbId}` }); }
            catch (error) { toast.error("Error al guardar favoritos.", { id: "fav-save-error" }); }
            return newFavorites;
        });
    }, [doctor]);

    const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        if (isSubmitting) return;

        if (!selectedPatient) { setError("Por favor, selecciona un paciente primero."); toast.error("Por favor, selecciona un paciente primero.", { id: "val-no-patient" }); return; }
        if (!doctor) { setError("Error: No se ha cargado la información del doctor."); toast.error("Error: No se ha cargado la información del doctor.", { id: "val-no-doctor" }); return; }
        if (prescriptionData.medicamentos.length === 0) { setError("Añade al menos un medicamento a la receta."); toast.error("Añade al menos un medicamento a la receta.", { id: "val-no-meds" }); return; }
        if (!prescriptionData.motivo_consulta.trim() || !prescriptionData.diagnostico.trim() || !prescriptionData.indicaciones.trim()) { setError("Los campos 'Motivo de Consulta', 'Diagnóstico' e 'Indicaciones Generales' son obligatorios."); toast.error("Complete los campos obligatorios: Motivo, Diagnóstico, Indicaciones.", { id: "val-required-fields", duration: 4000 }); return; }
        if (loadingState.patient) { setError("Los datos del paciente aún se están cargando. Por favor, espera."); toast.error("Los datos del paciente aún se están cargando. Por favor, espera.", { id: "val-patient-loading" }); return; }

        const hasAlerts = (prescriptionData.medicamentos as FormMedicamento[]).some(med => med.alerta_dosis);
        if (hasAlerts && !confirm("Hay advertencias de dosis o alergias en la receta. ¿Deseas continuar?")) { return; }

        setIsSubmitting(true); setError(null);

        const medicamentosForDB: RecetaMedicamento[] = (prescriptionData.medicamentos as FormMedicamento[]).map(med => ({
            nombre: med.nombre, principio_activo: med.principio_activo || med.nombre, dosis: med.dosis, via: med.via || 'Oral', frecuencia: med.frecuencia, duracion: med.duracion, cantidad_a_dispensar: med.cantidad_a_dispensar, unidad_cantidad: med.unidad_cantidad,
        }));

        const finalRecetaData: RecetaInsert = {
            ...prescriptionData,
            paciente_id: selectedPatient.id,
            doctor_id: doctor.id,
            id_farmacia: doctor.id_farmacia,
            medicamentos: medicamentosForDB,
            proxima_consulta: prescriptionData.proxima_consulta || null,
            frecuencia_cardiaca: prescriptionData.frecuencia_cardiaca || null,
            frecuencia_respiratoria: prescriptionData.frecuencia_respiratoria || null,
            temperatura_corporal: prescriptionData.temperatura_corporal || null,
            peso: prescriptionData.peso || null,
            altura: prescriptionData.altura || null,
        };

        try {
            const { data: recetaCreada, error: insertError } = await supabase.from('recetas').insert([finalRecetaData]).select().single();
            if (insertError) throw insertError;
            toast.success(`Receta creada! ID: ${recetaCreada?.id}`, { duration: 4000, id: `receta-ok-${recetaCreada?.id}` });

            if (finalRecetaData.proxima_consulta && recetaCreada) {
                const proximaConsultaDateStr = finalRecetaData.proxima_consulta;
                const proximaConsultaDateTime = new Date(`${proximaConsultaDateStr}T09:00:00Z`).toISOString();
                const { data: newCita, error: newCitaError } = await supabase.from('citas').insert({ horario_cita: proximaConsultaDateTime, dia_atencion: proximaConsultaDateStr, id_usuario: selectedPatient.id, id_farmacias: doctor.id_farmacia, status: 'Pendiente', motivo_cita: 'Consulta de seguimiento programada.', doctor_id: doctor.id }).select('id').single();
                if (newCitaError) { toast.error(`Error al crear próxima cita: ${newCitaError.message}`, { id: "prox-cita-err" }); }
                else if (newCita && newCita.id) {
                    toast.success(`Próxima cita para ${formatDate(proximaConsultaDateStr)} creada.`, { id: `prox-cita-ok-${newCita.id}` });
                    const uniqueReceiptNumber = `CIT-${newCita.id}-${Date.now()}`;
                    const { error: pagoError } = await supabase.from('pago_e_cita').insert({ cita_id: newCita.id, metodo_pago: 'Pendiente', numero_recibo: uniqueReceiptNumber, estado_pago: 'pendiente', precio: 0, id_farmacia: doctor.id_farmacia });
                    if (pagoError) { toast.error(`Error pago próx. cita: ${pagoError.message}`, { id: `pago-prox-cita-err-${newCita.id}` }); }
                    else { toast.success(`Pago próx. cita (REF: ${uniqueReceiptNumber}) creado.`, { id: `pago-prox-cita-ok-${newCita.id}` }); }
                }
            }

            if (selectedAppointmentId) {
                const { error: updateCitaError } = await supabase.from('citas').update({ status: 'Terminada', last_updated_at: new Date().toISOString() }).eq('id', selectedAppointmentId);
                if (updateCitaError) console.warn("Error actualizando cita:", updateCitaError);
                else { setAppointments(prev => prev.map(c => c.id === selectedAppointmentId ? { ...c, status: 'Terminada' } : c)); }
            }
            
            setPrescriptionData({ ...initialPrescriptionState, doctor_id: doctor.id, id_farmacia: doctor.id_farmacia, paciente_id: '' });
            
            setSelectedPatient(null); setSelectedAppointmentId(null);
            if (doctor?.id) { localStorage.removeItem(`${AUTOSAVE_KEY}_${doctor.id}`); }
        } catch (err: any) {
            console.error('Error creando receta:', err);
            setError(`Error al crear la receta: ${err.message}. Intente de nuevo.`);
            toast.error(`Error al crear la receta: ${err.message}`, { id: "submit-receta-error" });
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleOpenCarnet = () => { if (selectedPatient?.id && !isFetchingHistory) { setIsCarnetVisible(true); fetchPrescriptionHistory(selectedPatient.id); } };
    const handleCloseCarnet = () => { setIsCarnetVisible(false); setPrescriptionHistory([]); setHistoryError(null); };

    if (loadingState.initial) { return <div className="flex justify-center items-center h-screen text-2xl font-semibold text-indigo-700">Cargando datos iniciales...</div>; }
    if (!authUser) { return <div className="flex justify-center items-center h-screen text-2xl text-red-600 font-semibold">{error || "Por favor, inicia sesión."}</div>; }
    if (!doctor) { return <div className="flex justify-center items-center h-screen text-2xl text-red-600 font-semibold">{error || "No se pudo cargar info del doctor."}</div>; }

    return (
        <div className="flex h-screen bg-gray-50 font-sans antialiased text-gray-800">
            {/* Sidebar */}
            <aside className="w-72 bg-white border-r border-gray-200 flex flex-col shadow-lg">
                <div className="p-5 border-b border-gray-200 flex justify-between items-center bg-indigo-600 text-white">
                    <div>
                        <h3 className="text-xl font-bold">Citas del Día</h3>
                        <p className="text-sm opacity-90">{new Date().toLocaleDateString('es-MX', { year: 'numeric', month: 'long', day: 'numeric' })}</p>
                        {doctor && <p className="text-xs opacity-80 mt-1">Farmacia: #{doctor.id_farmacia} | Dr(a): {doctor.nombre.split(' ')[0]}</p>}
                    </div>
                    <button onClick={handleRefreshAppointments} disabled={isRefreshingAppointments || loadingState.initial} className={`p-2 rounded-full focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-300 transition-all duration-200 ${isRefreshingAppointments || loadingState.initial ? 'bg-indigo-700 text-indigo-400 cursor-wait' : 'bg-indigo-700 hover:bg-indigo-800 text-white'}`} title="Actualizar lista de citas">
                        <svg className={`h-5 w-5 ${isRefreshingAppointments ? 'animate-spin' : ''}`} xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" className="opacity-25"></circle><path fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                    </button>
                </div>
                {showRefreshReminder && (
                    <div className="p-3 bg-yellow-50 border-b border-yellow-200 text-yellow-700 text-sm flex justify-between items-center animate-pulse">
                        <span>¡Citas podrían estar desactualizadas!</span>
                        <button onClick={dismissRefreshReminder} className="p-1 rounded-full hover:bg-yellow-100 focus:outline-none focus:ring-2 focus:ring-yellow-300">
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                        </button>
                    </div>
                )}
                <div className="flex-1 overflow-y-auto p-4 space-y-3">
                    {isRefreshingAppointments && appointments.length === 0 && <p className="text-gray-500 p-4 text-center">Actualizando citas...</p>}
                    {!loadingState.initial && !isRefreshingAppointments && appointments.length === 0 && <p className="text-gray-500 p-4 text-center">No hay citas programadas para hoy.</p>}
                    {appointments.filter(cita => (cita.doctor_id === doctor?.id) || !cita.doctor_id).map((cita) => {
                        const isFinished = cita.status === 'Terminada';
                        const isAssignedToCurrentDoctor = cita.doctor_id === doctor?.id;
                        const isUnassigned = !cita.doctor_id;
                        const isSelected = cita.id === selectedAppointmentId;
                        const isLoadingPatient = loadingState.patient && isSelected;
                        return (
                            <div key={cita.id} className={`p-4 rounded-lg shadow-sm transition-all duration-200 relative ${isFinished ? 'bg-gray-100 text-gray-500 cursor-not-allowed opacity-70' : isSelected ? 'bg-indigo-50 border-2 border-indigo-500 shadow-md scale-105' : 'bg-white hover:bg-gray-50 hover:shadow-md cursor-pointer'}`} onClick={() => !isFinished && handleSelectAppointment(cita.id)} title={isFinished ? "Consulta terminada" : `Seleccionar cita de ${cita.patient?.name ?? ''}`}>
                                {isLoadingPatient && (<div className="absolute inset-0 flex justify-center items-center bg-white bg-opacity-70 rounded-lg z-10"> <svg className="animate-spin h-6 w-6 text-indigo-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" className="opacity-25"></circle><path fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg> </div>)}
                                <div className="flex justify-between items-center mb-1">
                                    <span className="font-semibold text-lg">{new Date(cita.horario_cita).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })}</span>
                                    <div className="flex items-center space-x-1">
                                        <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${cita.status === 'Activo' ? 'bg-green-100 text-green-800' : cita.status === 'En consulta' ? 'bg-yellow-100 text-yellow-800' : cita.status === 'Terminada' ? 'bg-gray-200 text-gray-600' : cita.status === 'Pendiente' ? 'bg-blue-100 text-blue-800' : 'bg-gray-100 text-gray-800'}`}>{cita.status ?? 'Desconocido'}</span>
                                        <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-green-100 text-green-800 flex items-center"><svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>Pagada</span>
                                    </div>
                                </div>
                                <p className="text-base text-gray-700 truncate">{cita.patient?.name ?? 'Paciente Desconocido'}</p>
                                {isAssignedToCurrentDoctor && <p className="text-xs text-blue-700 mt-1">Asignada a Mí</p>}
                                {isUnassigned && <p className="text-xs text-blue-500 mt-1">No asignada (disponible)</p>}
                            </div>
                        );
                    })}
                    {!isRefreshingAppointments && !loadingState.initial && appointments.filter(c => (c.doctor_id === doctor?.id) || !c.doctor_id).length === 0 && (<p className="p-4 text-gray-500 text-center">No hay citas asignadas o disponibles para usted hoy.</p>)}
                </div>
                {error && error.includes("citas") && <p className="p-4 text-sm text-red-600 text-center">{error}</p>}
            </aside>

            {/* Main Content */}
            <main className="flex-1 overflow-y-auto p-8 bg-gray-50 relative">
                {error && !error.includes("citas") && (<div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded-lg mb-6 shadow-sm" role="alert"><strong className="font-bold">Error: </strong><span className="block sm:inline">{error}</span></div>)}
                {loadingState.patient ? (
                    <div className="text-center text-gray-500 mt-20 p-6 rounded-lg bg-white shadow-md max-w-xl mx-auto">
                        <svg className="animate-spin h-10 w-10 text-indigo-600 mx-auto mb-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" className="opacity-25"></circle><path fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                        <p className="text-lg font-medium">Cargando datos del paciente...</p>
                    </div>
                ) : !selectedAppointmentId || !selectedPatient ? (
                    <div className="text-center text-gray-500 mt-20 p-6 rounded-lg bg-white shadow-md max-w-xl mx-auto">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-16 w-16 mx-auto text-gray-400 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" /></svg>
                        <p className="text-lg font-medium">Selecciona una cita de la barra lateral para empezar.</p>
                        <p className="text-sm mt-2 text-gray-600">Aquí podrás ver la información del paciente y crear una nueva receta.</p>
                    </div>
                ) : (
                    <div className="max-w-4xl mx-auto">
                        <div className="bg-white rounded-lg shadow-md mb-8">
                            <div className="px-6 py-5 border-b border-gray-200 flex justify-between items-center bg-indigo-50 rounded-t-lg">
                                <div><h3 className="text-xl leading-6 font-semibold text-gray-900">Información del Paciente</h3><p className="mt-1 text-sm text-gray-600">Detalles básicos del paciente seleccionado.</p></div>
                                {selectedPatient && (<button onClick={handleOpenCarnet} disabled={isFetchingHistory} className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-cyan-600 hover:bg-cyan-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-cyan-500 disabled:opacity-60 disabled:cursor-not-allowed transition-colors duration-200"><svg xmlns="http://www.w3.org/2000/svg" className="-ml-1 mr-2 h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19 20H5a2 2 0 01-2-2V6a2 2 0 012-2h10a2 2 0 012 2v1m2 13a2 2 0 01-2-2V7m2 13a2 2 0 002-2V9a2 2 0 00-2-2h-2m-4-3H9M7 16h6M7 8h6v4H7V8z" /></svg>{isFetchingHistory ? 'Cargando Historial...' : 'Ver Historial Médico'}</button>)}
                            </div>
                            <div className="px-6 py-5">
                                <dl className="grid grid-cols-1 md:grid-cols-2 gap-x-4 gap-y-4">
                                    <div><dt className="text-sm font-medium text-gray-500">Nombre Completo</dt><dd className="mt-1 text-lg font-semibold text-gray-900">{selectedPatient?.name ?? 'N/A'}</dd></div>
                                    <div><dt className="text-sm font-medium text-gray-500">Edad</dt><dd className="mt-1 text-base text-gray-900">{calculateAge(selectedPatient?.date_of_birth) ?? 'N/A'} años</dd></div>
                                    <div><dt className="text-sm font-medium text-gray-500">Tipo de Sangre</dt><dd className="mt-1 text-base text-gray-900">{prescriptionData.blood_type || 'N/A'}</dd></div>
                                    <div><dt className="text-sm font-medium text-gray-500">Peso</dt><dd className="mt-1 text-base text-gray-900">{prescriptionData.peso ? `${prescriptionData.peso} kg` : 'N/A'}</dd></div>
                                    <div className="md:col-span-2"><dt className="text-sm font-medium text-gray-500">Alergias</dt><dd className="mt-1 text-base text-gray-900">{prescriptionData.allergies || 'Ninguna registrada'}</dd></div>
                                </dl>
                            </div>
                        </div>

                        <form onSubmit={handleSubmit} className="space-y-8 bg-white rounded-lg shadow-md p-6">
                            <fieldset disabled={isSubmitting} className="space-y-8">
                                <h3 className="text-2xl font-bold leading-tight text-gray-900 mb-6">Crear Nueva Receta</h3>
                                <div><h4 className="text-xl font-semibold text-gray-800 mb-4 pb-2 border-b border-gray-200">Signos Vitales</h4><div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6"><div><label htmlFor="frecuencia_cardiaca" className="block text-sm font-medium text-gray-700">Frec. Cardíaca (lpm)</label><input type="number" name="frecuencia_cardiaca" id="frecuencia_cardiaca" value={prescriptionData.frecuencia_cardiaca ?? ''} onChange={handleInputChange} className="form-input" placeholder="Ej: 75" /></div><div><label htmlFor="frecuencia_respiratoria" className="block text-sm font-medium text-gray-700">Frec. Respiratoria (rpm)</label><input type="number" name="frecuencia_respiratoria" id="frecuencia_respiratoria" value={prescriptionData.frecuencia_respiratoria ?? ''} onChange={handleInputChange} className="form-input" placeholder="Ej: 16" /></div><div><label htmlFor="temperatura_corporal" className="block text-sm font-medium text-gray-700">Temp. Corporal (°C)</label><input type="number" step="0.1" name="temperatura_corporal" id="temperatura_corporal" value={prescriptionData.temperatura_corporal ?? ''} onChange={handleInputChange} className="form-input" placeholder="Ej: 36.8" /></div><div><label htmlFor="tension_arterial" className="block text-sm font-medium text-gray-700">Tensión Arterial (mmHg)</label><input type="text" name="tension_arterial" id="tension_arterial" placeholder="Ej: 120/80" value={prescriptionData.tension_arterial ?? ''} onChange={handleInputChange} className="form-input" /></div><div><label htmlFor="peso" className="block text-sm font-medium text-gray-700">Peso (kg)</label><input type="number" step="0.1" name="peso" id="peso" value={prescriptionData.peso ?? ''} onChange={handleInputChange} className="form-input" placeholder="Ej: 70.5" /></div><div><label htmlFor="altura" className="block text-sm font-medium text-gray-700">Altura (cm)</label><input type="number" name="altura" id="altura" value={prescriptionData.altura ?? ''} onChange={handleInputChange} className="form-input" placeholder="Ej: 175" /></div></div></div>
                                <div><h4 className="text-xl font-semibold text-gray-800 mb-4 pb-2 border-b border-gray-200">Detalles de la Consulta</h4><div className="space-y-6"><div><label htmlFor="motivo_consulta" className="block text-sm font-medium text-gray-700">Motivo de Consulta <span className="text-red-500">*</span></label><textarea id="motivo_consulta" name="motivo_consulta" rows={3} value={prescriptionData.motivo_consulta} onChange={handleInputChange} required className="form-textarea" placeholder="Breve descripción del motivo de la visita."></textarea></div><div><label htmlFor="antecedentes" className="block text-sm font-medium text-gray-700">Antecedentes Relevantes</label><textarea id="antecedentes" name="antecedentes" rows={3} value={prescriptionData.antecedentes ?? ''} onChange={handleInputChange} className="form-textarea" placeholder="Historial médico, enfermedades previas, cirugías, etc."></textarea></div><div><label htmlFor="exploracion_fisica" className="block text-sm font-medium text-gray-700">Exploración Física</label><textarea id="exploracion_fisica" name="exploracion_fisica" rows={3} value={prescriptionData.exploracion_fisica ?? ''} onChange={handleInputChange} className="form-textarea" placeholder="Resultados de la exploración física."></textarea></div><div><label htmlFor="diagnostico" className="block text-sm font-medium text-gray-700">Diagnóstico <span className="text-red-500">*</span></label><textarea id="diagnostico" name="diagnostico" rows={3} value={prescriptionData.diagnostico} onChange={handleInputChange} required className="form-textarea" placeholder="Diagnóstico principal del paciente."></textarea></div></div></div>
                                <div><h4 className="text-xl font-semibold text-gray-800 mb-4 pb-2 border-b border-gray-200">Medicamentos <span className="text-red-500">*</span></h4>
                                    {prescriptionData.medicamentos.length === 0 && !isSubmitting && (<p className="text-sm text-yellow-700 bg-yellow-50 border border-yellow-200 p-3 rounded-md mb-4 animate-pulse">Por favor, añade al menos un medicamento a la receta.</p>)}
                                    <div className="space-y-6">
                                        {(prescriptionData.medicamentos as FormMedicamento[]).map((med, index) => (<div key={index} className="p-4 border border-gray-300 rounded-lg bg-white shadow relative group"><div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-x-4 gap-y-3 items-end"><div className="lg:col-span-2 relative"><label htmlFor={`med-nombre-${index}`} className="block text-sm font-medium text-gray-700">Nombre (*)</label><input type="text" id={`med-nombre-${index}`} value={med.nombre} onChange={(e) => handleMedicamentoNameChange(index, e.target.value)} onKeyDown={(e) => handleKeyDown(e, index)} onBlur={() => setTimeout(() => { if (isMountedRef.current) setAutocompleteSuggestions([]) }, 150)} required className="form-input-sm mt-1" ref={el => { autocompleteRefs.current[index] = el; }} autoComplete="off" />{autocompleteSuggestions.length > 0 && med.nombre.length >= 3 && autocompleteRefs.current[index] === document.activeElement && (<ul className="absolute z-20 w-full bg-white border border-gray-300 rounded-md shadow-lg mt-1 max-h-60 overflow-y-auto">{autocompleteSuggestions.map((suggestion, sIndex) => { const isSelected = sIndex === activeSuggestionIndex; const medConcept = getMedicamentoConceptInfo(suggestion.nombre_medicamento); let displayStock: string, stockClass: string; if (suggestion.unidades > 0) { displayStock = `✅ Disponible (${suggestion.unidades} uds)`; stockClass = 'bg-green-100 text-green-800'; } else { displayStock = '❌ Sin stock'; stockClass = 'bg-red-100 text-red-800'; } return (<li key={suggestion.id_farmaco} className={`p-2 cursor-pointer flex justify-between items-center text-sm ${isSelected ? 'bg-indigo-100' : 'hover:bg-gray-100'}`} onMouseDown={() => selectMedicamentoSuggestion(index, suggestion)}><div><span className="font-medium">{suggestion.nombre_medicamento}</span>{medConcept?.principio_activo && <span className="text-gray-500 ml-2 text-xs">({medConcept.principio_activo})</span>}</div><div className={`text-xs px-2 py-0.5 rounded-full ${stockClass}`}>{displayStock}</div></li>); })}</ul>)}{med.db_id && (<button type="button" onClick={() => toggleFavoriteMedicamento(med.db_id!)} className={`absolute top-1 right-1 p-1 rounded-full transition-colors duration-150 ${favoriteMedicines.includes(med.db_id) ? 'text-yellow-500 hover:text-yellow-600' : 'text-gray-300 hover:text-yellow-400'}`} title={favoriteMedicines.includes(med.db_id) ? "Eliminar de favoritos" : "Añadir a favoritos"}><svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.538 1.118l-2.8-2.034a1 1 0 00-1.176 0l-2.8 2.034c-.783.57-1.838-.197-1.538-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.92 8.73c-.783-.57-.381-1.81.588-1.81h3.462a1 1 0 00.95-.69l1.07-3.292z" /></svg></button>)}</div><div><label htmlFor={`med-frecuencia-${index}`} className="block text-sm font-medium text-gray-700">Frecuencia (*)</label><input type="text" id={`med-frecuencia-${index}`} value={med.frecuencia} onChange={(e) => handleMedicamentoChange(index, 'frecuencia', e.target.value)} required className="form-input-sm mt-1" /></div><div><label htmlFor={`med-duracion-${index}`} className="block text-sm font-medium text-gray-700">Duración (*)</label><input type="text" id={`med-duracion-${index}`} value={med.duracion} onChange={(e) => handleMedicamentoChange(index, 'duracion', e.target.value)} required className="form-input-sm mt-1" /></div><div className="lg:col-span-1"><label htmlFor={`med-cantidad-${index}`} className="block text-sm font-medium text-gray-700">Cant. Disp. (*)</label><input type="text" id={`med-cantidad-${index}`} value={med.cantidad_a_dispensar} onChange={(e) => handleMedicamentoChange(index, 'cantidad_a_dispensar', e.target.value)} required className="form-input-sm mt-1" placeholder="Ej: 30" /></div><div className="lg:col-span-1"><label htmlFor={`med-unidad-${index}`} className="block text-sm font-medium text-gray-700">Unidad (*)</label><input type="text" id={`med-unidad-${index}`} value={med.unidad_cantidad} onChange={(e) => handleMedicamentoChange(index, 'unidad_cantidad', e.target.value)} required className="form-input-sm mt-1" placeholder="Ej: tabletas" /></div><div className="lg:col-span-1" style={{ display: med.principio_activo ? 'block' : 'none' }}><label htmlFor={`med-principio_activo-${index}`} className="block text-xs font-medium text-gray-500">P. Activo (Info)</label><input type="text" id={`med-principio_activo-${index}`} value={med.principio_activo} readOnly className="form-input-sm mt-1 bg-gray-100 border-gray-200 text-gray-600" /></div><div className="flex items-end justify-end lg:col-start-4"><button type="button" onClick={() => removeMedicamento(index)} className="p-2.5 rounded-md text-white bg-red-600 hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 transition-colors duration-200" title="Eliminar medicamento"><svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg></button></div></div>{(med.alerta_dosis || (med.db_id && med.in_pharmacy_inventory)) && (<div className="mt-3 flex flex-col sm:flex-row items-start sm:items-center justify-between text-xs gap-2">{med.alerta_dosis && (<p className="text-red-600 bg-red-50 border border-red-200 px-2 py-1 rounded-md shadow-sm flex items-center text-left"><svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-1.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>{med.alerta_dosis}</p>)}{med.db_id && med.in_pharmacy_inventory && (<p className={`ml-auto px-2 py-1 rounded-full font-medium whitespace-nowrap ${typeof med.stock_disponible === 'number' && med.stock_disponible > 0 ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>{typeof med.stock_disponible === 'number' && med.stock_disponible > 0 ? `En stock (${med.stock_disponible} uds)` : `Sin stock (0 uds)`}</p>)}</div>)}</div>))}
                                    </div><button type="button" onClick={addMedicamento} className="mt-6 inline-flex items-center px-4 py-2 border border-gray-300 shadow-sm text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 transition-colors duration-200"><svg xmlns="http://www.w3.org/2000/svg" className="-ml-1 mr-2 h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6m0 0v6m0-6h6m-6 0H6" /></svg>Añadir Medicamento</button>
                                </div>
                                <div><h4 className="text-xl font-semibold text-gray-800 mb-4 pb-2 border-b border-gray-200">Indicaciones y Seguimiento</h4><div className="space-y-6"><div><label htmlFor="indicaciones" className="block text-sm font-medium text-gray-700">Indicaciones Generales <span className="text-red-500">*</span></label><textarea id="indicaciones" name="indicaciones" rows={4} value={prescriptionData.indicaciones} onChange={handleInputChange} required className="form-textarea" placeholder="Instrucciones para el paciente sobre el tratamiento, dieta, ejercicio, etc."></textarea></div><div><label htmlFor="plan_tratamiento" className="block text-sm font-medium text-gray-700">Plan de Tratamiento Adicional</label><textarea id="plan_tratamiento" name="plan_tratamiento" rows={3} value={prescriptionData.plan_tratamiento ?? ''} onChange={handleInputChange} className="form-textarea" placeholder="Pruebas adicionales, interconsultas, terapias, etc."></textarea></div><div><label htmlFor="recomendaciones" className="block text-sm font-medium text-gray-700">Recomendaciones</label><textarea id="recomendaciones" name="recomendaciones" rows={3} value={prescriptionData.recomendaciones ?? ''} onChange={handleInputChange} className="form-textarea" placeholder="Recomendaciones de estilo de vida, prevención, etc."></textarea></div><div><label htmlFor="observaciones" className="block text-sm font-medium text-gray-700">Observaciones</label><textarea id="observaciones" name="observaciones" rows={3} value={prescriptionData.observaciones ?? ''} onChange={handleInputChange} className="form-textarea" placeholder="Cualquier otra observación relevante."></textarea></div><div><label htmlFor="proxima_consulta" className="block text-sm font-medium text-gray-700">Fecha Próxima Consulta (Opcional)</label><input type="date" id="proxima_consulta" name="proxima_consulta" value={prescriptionData.proxima_consulta ?? ''} min={getTodayDateString()} onChange={handleInputChange} className="form-input" /></div></div></div>
                                <div className="pt-8 border-t border-gray-300 flex justify-end items-center"><button type="submit" disabled={isSubmitting} className={`w-full sm:w-auto inline-flex items-center justify-center py-3 px-8 border border-transparent shadow-md text-lg font-medium rounded-md text-white transition-all duration-200 ease-in-out ${isSubmitting ? 'bg-indigo-300 cursor-not-allowed opacity-70 shadow-none' : 'bg-indigo-600 hover:bg-indigo-700 hover:-translate-y-0.5 hover:shadow-lg focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500'}`}>{isSubmitting ? (<><svg className="animate-spin h-5 w-5 mr-3 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>Guardando Receta...</>) : (<><svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.001 12.001 0 002.92 12c0 1.944.925 3.74 2.418 4.904a11.945 11.945 0 014.12 2.871 11.945 11.945 0 014.12-2.87C18.075 15.74 19 13.944 19 12c0-2.404-.925-4.604-2.418-6.104z" /></svg>Crear Receta</>)}</button></div>
                                {isSubmitting && <p className="text-sm text-gray-500 mt-3 text-right">Enviando datos, por favor espera...</p>}
                            </fieldset>
                        </form>
                    </div>
                )}
            </main>

            {/* Modal Carnet */}
            {isCarnetVisible && (
                <div className="fixed inset-0 bg-gray-900 bg-opacity-70 flex justify-center items-center p-4 z-50 animate-fade-in">
                    <div className="bg-white rounded-xl shadow-2xl w-full max-w-5xl max-h-[90vh] flex flex-col transform scale-95 animate-scale-up-fade-in">
                        <div className="px-6 py-4 border-b border-gray-200 flex justify-between items-center bg-indigo-600 text-white rounded-t-xl sticky top-0 z-10">
                            <h3 className="text-2xl font-bold">Historial de Recetas: {selectedPatient?.name ?? 'Paciente'}</h3>
                            <button onClick={handleCloseCarnet} className="p-2 rounded-full text-white hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-300 transition-colors duration-200"><span className="sr-only">Cerrar</span><svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg></button>
                        </div>
                        <div className="flex-1 overflow-y-auto p-6 space-y-8">
                            {isFetchingHistory && (<div className="text-center py-12"><svg className="animate-spin h-10 w-10 text-indigo-600 mx-auto" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" className="opacity-25"></circle><path fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg><p className="mt-4 text-lg text-gray-600">Cargando historial de recetas...</p></div>)}
                            {historyError && (<div className="text-center py-12 text-red-600 text-lg"><p>Error al cargar el historial: {historyError}</p></div>)}
                            {!isFetchingHistory && !historyError && prescriptionHistory.length === 0 && (<div className="text-center py-12 text-gray-500 text-lg"><p>No se encontraron recetas anteriores para este paciente.</p></div>)}
                            {!isFetchingHistory && !historyError && prescriptionHistory.length > 0 && (
                                <ul className="divide-y divide-gray-200 border-t border-gray-200">
                                    {prescriptionHistory.map((receta) => (
                                        <li key={receta.id} className="py-6 transition-all duration-300 hover:bg-gray-50 rounded-lg -mx-2 px-2">
                                            <div className="grid grid-cols-1 lg:grid-cols-12 gap-x-8 gap-y-4">
                                                <div className="lg:col-span-3 text-sm text-gray-700 space-y-2">
                                                    <p><strong className="text-gray-900 block mb-0.5">Fecha Consulta:</strong> {formatDate(receta.fecha_consulta)}</p>
                                                    <p><strong className="text-gray-900 block mb-0.5">Fecha Emisión:</strong> {formatDate(receta.fecha_emision)}</p>
                                                    <p><strong className="text-gray-900 block mb-0.5">Doctor:</strong> {receta.trabajadores?.[0]?.nombre ?? 'N/A'}</p>
                                                </div>
                                                <div className="lg:col-span-9 space-y-4">
                                                    <div><p className="text-base font-semibold text-gray-800 mb-2">Diagnóstico:</p><p className="text-sm text-gray-700 bg-gray-100 p-4 rounded-md border border-gray-200 whitespace-pre-wrap leading-relaxed">{receta.diagnostico || <span className="italic text-gray-400">No especificado</span>}</p></div>
                                                    <div><p className="text-base font-semibold text-gray-800 mb-2">Medicamentos:</p>{(Array.isArray(receta.medicamentos) && receta.medicamentos.length > 0) ? (<ul className="list-disc list-inside space-y-2 pl-4 text-sm text-gray-700 bg-indigo-50 p-4 rounded-md border border-indigo-100">{receta.medicamentos.map((med, medIndex) => (<li key={medIndex} className="break-words"><strong className="font-semibold">{med.nombre || 'Desconocido'}</strong>:{med.dosis && ` ${med.dosis}`}{med.frecuencia && ` (${med.frecuencia})`}{med.duracion && ` - ${med.duracion}`}{med.cantidad_a_dispensar && ` (${med.cantidad_a_dispensar} ${med.unidad_cantidad})`}</li>))}</ul>) : (<p className="text-sm text-gray-500 italic pl-4">No se especificaron medicamentos.</p>)}</div>
                                                </div>
                                            </div>
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </div>
                    </div>
                </div>
            )}
            <style>{`
                .form-input, .form-textarea, .form-input-sm, .form-select-sm { margin-top: 0.25rem; display: block; width: 100%; border: 1px solid #D1D5DB; border-radius: 0.375rem; box-shadow: 0 1px 2px 0 rgba(0, 0, 0, 0.05); padding: 0.625rem 1rem; font-size: 1rem; line-height: 1.5rem; outline: 2px solid transparent; outline-offset: 2px; transition: border-color 0.15s ease-in-out, box-shadow 0.15s ease-in-out; }
                .form-input:focus, .form-textarea:focus, .form-input-sm:focus, .form-select-sm:focus { border-color: #6366F1; box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.2); }
                .form-input-sm, .form-select-sm { padding: 0.5rem 0.75rem; font-size: 0.875rem; line-height: 1.25rem; }
                .form-select-sm { appearance: none; background-image: url("data:image/svg+xml,%3csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 20 20' fill='none'%3e%3cpath d='M7 7l3-3 3 3m0 6l-3 3-3-3' stroke='%239CA3AF' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'/%3e%3c/svg%3e"); background-repeat: no-repeat; background-position: right 0.75rem center; background-size: 1.2em; }
                .btn-secondary { display: inline-flex; justify-content: center; padding: 0.5rem 1rem; border: 1px solid #D1D5DB; border-radius: 0.375rem; font-size: 0.875rem; font-weight: 500; color: #4B5563; background-color: #FFFFFF; box-shadow: 0 1px 2px 0 rgba(0, 0, 0, 0.05); transition: background-color 0.15s ease-in-out, border-color 0.15s ease-in-out, box-shadow 0.15s ease-in-out; }
                .btn-secondary:hover { background-color: #F9FAFB; }
                .btn-secondary:focus { outline: none; box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.2); }
                @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
                @keyframes scaleUpFadeIn { from { opacity: 0; transform: scale(0.95); } to { opacity: 1; transform: scale(1); } }
                .animate-fade-in { animation: fadeIn 0.2s ease-out forwards; }
                .animate-scale-up-fade-in { animation: scaleUpFadeIn 0.3s ease-out forwards; }
            `}</style>
        </div>
    );
};

export default DoctorPrescription;