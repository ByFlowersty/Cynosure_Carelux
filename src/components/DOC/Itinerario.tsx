import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { User } from '@supabase/supabase-js';
import supabase from '../../lib/supabaseClient';
import Calendar from 'react-calendar';
import 'react-calendar/dist/Calendar.css';
import { Collapse } from 'react-collapse';

// --- Interfaces Necesarias ---
interface Trabajador {
    id: string;
    user_id: string;
    nombre: string;
    id_farmacia: number;
    rol: string;
}

interface PagoECita {
    estado_pago: string;
}

interface Cita {
    id: number;
    horario_cita: string;
    dia_atencion: string;
    id_usuario: string;
    created_at: string;
    last_updated_at: string;
    id_farmacias: number;
    status?: 'Activo' | 'En consulta' | 'Terminada' | 'Pendiente' | null;
    patients?: { name: string } | null;
    doctor_id?: string | null;
    trabajadores?: { nombre: string } | null;
    pago_e_cita?: PagoECita[] | null;
}
// --- Fin de Interfaces ---

const Itinerario: React.FC = () => {
    // --- Hooks de Estado ---
    const [loading, setLoading] = useState<boolean>(true);
    const [error, setError] = useState<string | null>(null);
    const [doctor, setDoctor] = useState<Trabajador | null>(null);
    const [dailyAppointments, setDailyAppointments] = useState<Cita[]>([]);
    const [monthlyAppointments, setMonthlyAppointments] = useState<Cita[]>([]);
    const [isUpdating, setIsUpdating] = useState<boolean>(false);
    const [selectedDate, setSelectedDate] = useState<Date>(new Date());
    const [activeMonth, setActiveMonth] = useState<Date>(new Date());
    const [localNotification, setLocalNotification] = useState<{ message: string; type: 'success' | 'error' | 'info' | 'warning' } | null>(null);
    const notificationTimerRef = useRef<NodeJS.Timeout | null>(null);
    const [isMyAssignedOpen, setIsMyAssignedOpen] = useState(true);
    const [isUnassignedOpen, setIsUnassignedOpen] = useState(true);
    const [isOtherAssignedOpen, setIsOtherAssignedOpen] = useState(false);
    const isMountedRef = useRef(true);

    // --- Memoización de Citas Filtradas ---
    const { unassignedDailyAppointments, myAssignedDailyAppointments, otherAssignedDailyAppointments } = useMemo(() => {
        const unassigned = dailyAppointments.filter(cita => cita.doctor_id === null);
        const myAssigned = dailyAppointments.filter(cita => cita.doctor_id === doctor?.id);
        const others = dailyAppointments.filter(cita => cita.doctor_id !== null && cita.doctor_id !== doctor?.id);
        return {
            unassignedDailyAppointments: unassigned,
            myAssignedDailyAppointments: myAssigned,
            otherAssignedDailyAppointments: others,
        };
    }, [dailyAppointments, doctor]);

    // --- Funciones de Notificación ---
    const showLocalNotification = useCallback((type: 'success' | 'error' | 'info' | 'warning', message: string, duration: number = 4000) => {
        if (notificationTimerRef.current) clearTimeout(notificationTimerRef.current);
        setLocalNotification({ message, type });
        notificationTimerRef.current = setTimeout(() => {
            setLocalNotification(null);
        }, duration);
    }, []);

    useEffect(() => {
        return () => {
            if (notificationTimerRef.current) clearTimeout(notificationTimerRef.current);
        };
    }, []);

    const getNotificationIcon = (type: 'success' | 'error' | 'info' | 'warning') => {
        switch (type) {
            case 'success': return <svg className="w-5 h-5 mr-2" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd"></path></svg>;
            case 'error': return <svg className="w-5 h-5 mr-2" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd"></path></svg>;
            case 'info': return <svg className="w-5 h-5 mr-2" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd"></path></svg>;
            case 'warning': return <svg className="w-5 h-5 mr-2" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M8.257 3.099c.765-1.3 2.671-1.3 3.436 0L14.469 10H5.53l2.727-6.901zM10 15a1 1 0 110-2 1 1 0 010 2zm0 0a1 1 0 110-2 1 1 0 010 2z" clipRule="evenodd"></path></svg>;
            default: return null;
        }
    };

    // --- Funciones de Fetch ---
    const fetchDoctorData = useCallback(async (user: User) => {
        if (!isMountedRef.current) return;
        setLoading(true);
        setError(null);
        try {
            const { data: dD, error: dE } = await supabase.from('trabajadores').select('*').eq('user_id', user.id).single();
            if (!isMountedRef.current) return;
            if (dE) throw dE;
            if (dD && dD.rol === 'Doctor') {
                setDoctor(dD as Trabajador);
            } else {
                throw new Error("Usuario no es Doctor o no encontrado.");
            }
        } catch (err: any) {
            console.error('Error fetching doctor data:', err);
            if (isMountedRef.current) {
                setError(`Error al cargar información del doctor: ${err.message}`);
                showLocalNotification('error', `Error al cargar información del doctor: ${err.message}`);
            }
        } finally {
            if (isMountedRef.current) setLoading(false);
        }
    }, [showLocalNotification]);
    
    const fetchAppointmentsForDay = useCallback(async (pharmacyId: number, date: Date) => {
        if (!isMountedRef.current) return;
        setIsUpdating(true);
        setError(null);

        const startOfDayLocal = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0, 0, 0);
        const endOfDayLocal = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 23, 59, 59, 999);
        const startOfDayUTC = startOfDayLocal.toISOString();
        const endOfDayUTC = endOfDayLocal.toISOString();

        try {
            const { data: citasData, error: citasError } = await supabase
                .from('citas')
                .select(`id, horario_cita, dia_atencion, id_usuario, id_farmacias, status, doctor_id, created_at, last_updated_at, patients ( name ), trabajadores ( nombre ), pago_e_cita ( estado_pago )`)
                .eq('id_farmacias', pharmacyId)
                .gte('horario_cita', startOfDayUTC)
                .lte('horario_cita', endOfDayUTC)
                .order('horario_cita', { ascending: true });

            if (!isMountedRef.current) return;
            if (citasError) throw citasError;
            
            const processedData = (citasData as any[]).map(cita => ({
                ...cita,
                patients: Array.isArray(cita.patients) ? cita.patients[0] : cita.patients,
                trabajadores: Array.isArray(cita.trabajadores) ? cita.trabajadores[0] : cita.trabajadores,
            }));

            const paidAppointments = (processedData as Cita[]).filter(cita =>
                cita.pago_e_cita && cita.pago_e_cita.length > 0
                    ? cita.pago_e_cita[0].estado_pago === 'pagado'
                    : false
            );
            setDailyAppointments(paidAppointments);

        } catch (err: any) {
            console.error("Error fetching daily appointments:", err);
            if (isMountedRef.current) {
                setError(`Error al cargar citas para ${date.toLocaleDateString()}: ${err.message}`);
                showLocalNotification('error', `Error al cargar citas para ${date.toLocaleDateString()}: ${err.message}`);
            }
        } finally {
            if (isMountedRef.current) setIsUpdating(false);
        }
    }, [showLocalNotification]);

    const fetchAppointmentsForMonth = useCallback(async (pharmacyId: number, date: Date) => {
        if (!isMountedRef.current) return;
        const year = date.getFullYear();
        const month = date.getMonth();
        const firstDayOfMonthLocal = new Date(year, month, 1, 0, 0, 0, 0);
        const lastDayOfMonthLocal = new Date(year, month + 1, 0, 23, 59, 59, 999);
        const firstDayOfMonthUTC = firstDayOfMonthLocal.toISOString();
        const lastDayOfMonthUTC = lastDayOfMonthLocal.toISOString();

        try {
            const { data, error } = await supabase
                .from('citas')
                .select(`id, horario_cita, pago_e_cita ( estado_pago )`)
                .eq('id_farmacias', pharmacyId)
                .gte('horario_cita', firstDayOfMonthUTC)
                .lte('horario_cita', lastDayOfMonthUTC);

            if (!isMountedRef.current) return;
            if (error) throw error;
            
            const paidAppointments = (data as Cita[]).filter(cita =>
                cita.pago_e_cita && cita.pago_e_cita.length > 0
                    ? cita.pago_e_cita[0].estado_pago === 'pagado'
                    : false
            );
            setMonthlyAppointments(paidAppointments);
        } catch (err: any) {
            console.error("Error fetching monthly appointments:", err);
            if (isMountedRef.current) {
                showLocalNotification('error', `Error al cargar citas del mes: ${err.message}`);
            }
        }
    }, [showLocalNotification]);

    // --- Efectos de Carga y Sincronización ---
    useEffect(() => {
        isMountedRef.current = true;
        supabase.auth.getSession().then(({ data: { session } }) => {
            if (session?.user) fetchDoctorData(session.user);
            else {
                setError("No hay sesión. Por favor, inicia sesión.");
                setLoading(false);
            }
        });
        const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
            if (!isMountedRef.current) return;
            if (session?.user) fetchDoctorData(session.user);
            else {
                setError("Sesión cerrada.");
                setDoctor(null);
                setDailyAppointments([]);
                setMonthlyAppointments([]);
                setLoading(false);
            }
        });
        return () => {
            isMountedRef.current = false;
            subscription?.unsubscribe();
        };
    }, [fetchDoctorData]);
    
    useEffect(() => {
        if (doctor && doctor.id_farmacia && !loading) {
            fetchAppointmentsForMonth(doctor.id_farmacia, activeMonth);
        }
    }, [doctor, loading, activeMonth, fetchAppointmentsForMonth]);
    
    useEffect(() => {
        if (doctor && doctor.id_farmacia && selectedDate) {
            fetchAppointmentsForDay(doctor.id_farmacia, selectedDate);
        }
    }, [selectedDate, doctor, fetchAppointmentsForDay]);

    // --- Handlers de Interacción ---
    const handleAssignCita = useCallback(async (citaId: number) => {
        if (!doctor?.id || isUpdating) return;
        setIsUpdating(true);
        try {
            const { error: updateError } = await supabase
                .from('citas')
                .update({ doctor_id: doctor.id, status: 'Activo', last_updated_at: new Date().toISOString() })
                .eq('id', citaId);
            if (updateError) throw updateError;
            showLocalNotification('success', "Cita asignada con éxito.");
            if(doctor.id_farmacia) {
                await Promise.all([
                    fetchAppointmentsForDay(doctor.id_farmacia, selectedDate),
                    fetchAppointmentsForMonth(doctor.id_farmacia, activeMonth)
                ]);
            }
        } catch (err: any) {
            showLocalNotification('error', `Error al asignar cita: ${err.message}`);
        } finally {
            setIsUpdating(false);
        }
    }, [doctor, isUpdating, fetchAppointmentsForDay, fetchAppointmentsForMonth, selectedDate, activeMonth, showLocalNotification]);

    const handleReleaseCita = useCallback(async (citaId: number) => {
        if (!doctor?.id || isUpdating) return;
        setIsUpdating(true);
        try {
            const { error: updateError } = await supabase
                .from('citas')
                .update({ doctor_id: null, status: 'Pendiente', last_updated_at: new Date().toISOString() })
                .eq('id', citaId)
                .eq('doctor_id', doctor.id);
            if (updateError) throw updateError;
            showLocalNotification('info', "Cita liberada con éxito.");
            if(doctor.id_farmacia) {
                await Promise.all([
                    fetchAppointmentsForDay(doctor.id_farmacia, selectedDate),
                    fetchAppointmentsForMonth(doctor.id_farmacia, activeMonth)
                ]);
            }
        } catch (err: any) {
            showLocalNotification('error', `Error al liberar cita: ${err.message}`);
        } finally {
            setIsUpdating(false);
        }
    }, [doctor, isUpdating, fetchAppointmentsForDay, fetchAppointmentsForMonth, selectedDate, activeMonth, showLocalNotification]);

    const handleCalendarChange = (value: any) => {
        if (value instanceof Date) {
            setSelectedDate(value);
        }
    };

    const tileContent = ({ date, view }: { date: Date; view: string }) => {
        if (view === 'month') {
            const calendarTileLocalString = date.toDateString();
            const dayHasAppointments = monthlyAppointments.some(
                (cita) => new Date(cita.horario_cita).toDateString() === calendarTileLocalString
            );
            if (dayHasAppointments) {
                return (
                    <div className="flex justify-center items-center mt-1">
                        <span className="dot bg-green-500 rounded-full h-2 w-2"></span>
                    </div>
                );
            }
        }
        return null;
    };

    const handleActiveStartDateChange = useCallback(({ activeStartDate }: { activeStartDate: Date | null }) => {
        if (activeStartDate && doctor?.id_farmacia) {
            setActiveMonth(activeStartDate);
            fetchAppointmentsForMonth(doctor.id_farmacia, activeStartDate);
        }
    }, [doctor, fetchAppointmentsForMonth]);

    const NotificationDisplay: React.FC<{ message: string; type: 'success' | 'error' | 'info' | 'warning' }> = ({ message, type }) => {
        const bgColorClass = {
            success: 'bg-green-100 border-green-400 text-green-800', error: 'bg-red-100 border-red-400 text-red-800',
            info: 'bg-blue-100 border-blue-400 text-blue-800', warning: 'bg-yellow-100 border-yellow-400 text-yellow-800',
        }[type];
        return <div className={`fixed top-4 right-4 z-50 flex items-center p-4 rounded-lg shadow-xl border ${bgColorClass} transition-transform transform translate-y-0 opacity-100 ease-out duration-300`} role="alert"> {getNotificationIcon(type)} <div>{message}</div> <button onClick={() => { if (notificationTimerRef.current) clearTimeout(notificationTimerRef.current); setLocalNotification(null); }} className={`ml-4 p-1 rounded-full opacity-75 hover:opacity-100 transition-opacity duration-200 ${type === 'success' ? 'text-green-800 hover:bg-green-200' : ''} ${type === 'error' ? 'text-red-800 hover:bg-red-200' : ''} ${type === 'info' ? 'text-blue-800 hover:bg-blue-200' : ''} ${type === 'warning' ? 'text-yellow-800 hover:bg-yellow-200' : ''} `}><svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd"></path></svg></button> </div>;
    };

    if (loading) return <div className="flex justify-center items-center h-screen text-2xl font-semibold text-indigo-700">Cargando itinerario...</div>;
    if (error) return <div className="flex justify-center items-center h-screen text-2xl text-red-600 font-semibold">{error}</div>;
    if (!doctor) return <div className="flex justify-center items-center h-screen text-2xl text-red-600 font-semibold">No se pudo cargar la información del doctor o no tienes permisos.</div>;

    return (
        <div className="p-8 bg-gray-50 min-h-screen font-sans antialiased text-gray-800">
            <h1 className="text-3xl font-extrabold text-gray-900 mb-8 flex items-center">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-9 w-9 mr-3 text-indigo-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                Itinerario de Citas - {selectedDate.toLocaleDateString('es-MX', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
            </h1>
            {isUpdating && <div className="fixed inset-0 bg-gray-900 bg-opacity-50 flex justify-center items-center z-50"><div className="bg-white p-6 rounded-lg shadow-xl flex items-center text-indigo-700 font-medium"><svg className="animate-spin h-6 w-6 mr-3" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>Actualizando citas...</div></div>}
            {localNotification && <NotificationDisplay message={localNotification.message} type={localNotification.type} />}
            <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-8">
                <div className="bg-white rounded-xl shadow-lg p-6 flex flex-col items-center col-span-1 xl:col-span-1">
                    <h2 className="text-2xl font-semibold text-gray-900 mb-6 flex items-center border-b pb-3 w-full justify-center">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 mr-2 text-indigo-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                        Calendario de Citas
                    </h2>
                    <Calendar
                        onChange={handleCalendarChange}
                        value={selectedDate}
                        locale="es-MX"
                        className="react-calendar-custom"
                        tileContent={tileContent}
                        onActiveStartDateChange={handleActiveStartDateChange}
                    />
                     <div className="flex flex-col items-center mt-4 text-gray-700 text-sm">
                        <p className="mb-2 font-medium">Leyenda:</p>
                        <p className="flex items-center">
                            <span className="inline-block bg-green-500 rounded-full h-3 w-3 mr-2"></span>
                            Días con citas
                        </p>
                    </div>
                </div>

                <div className="lg:col-span-1 xl:col-span-2 overflow-y-auto max-h-[calc(100vh-180px)] space-y-8">
                    <div className="bg-white rounded-xl shadow-lg">
                        <button onClick={() => setIsMyAssignedOpen(!isMyAssignedOpen)} className="w-full flex justify-between items-center px-6 py-4 text-left font-semibold text-gray-900 text-xl border-b pb-3 rounded-t-xl hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-indigo-500">
                            <span className="flex items-center">
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 mr-2 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.001 12.001 0 002.92 12c0 1.944.925 3.74 2.418 4.904a11.945 11.945 0 014.12 2.871 11.945 11.945 0 014.12-2.87C18.075 15.74 19 13.944 19 12c0-2.404-.925-4.604-2.418-6.104z" /></svg>
                                Mis Citas Asignadas ({myAssignedDailyAppointments.length})
                            </span>
                            <svg className={`h-5 w-5 transition-transform ${isMyAssignedOpen ? 'rotate-180' : 'rotate-0'}`} xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" /></svg>
                        </button>
                        <Collapse isOpened={isMyAssignedOpen}>
                            <div className="p-6">
                                {myAssignedDailyAppointments.length === 0 ? (
                                    <p className="text-gray-500 text-center py-4">No tienes citas asignadas para este día.</p>
                                ) : (
                                    <ul className="space-y-4">
                                        {myAssignedDailyAppointments.map(cita => (
                                            <li key={cita.id} className="bg-blue-50 p-4 rounded-lg shadow-sm flex items-center justify-between border border-blue-200 transition-all duration-200 hover:bg-blue-100">
                                                <div>
                                                    <p className="text-lg font-medium">{new Date(cita.horario_cita).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p>
                                                    <p className="text-blue-800 font-semibold">{cita.patients?.name ?? 'Paciente Desconocido'}</p>
                                                </div>
                                                <button onClick={() => handleReleaseCita(cita.id)} disabled={isUpdating} className="btn-danger" title="Liberar esta cita (desasignarme)"><svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>Liberar</button>
                                            </li>
                                        ))}
                                    </ul>
                                )}
                            </div>
                        </Collapse>
                    </div>
                    <div className="bg-white rounded-xl shadow-lg">
                        <button onClick={() => setIsUnassignedOpen(!isUnassignedOpen)} className="w-full flex justify-between items-center px-6 py-4 text-left font-semibold text-gray-900 text-xl border-b pb-3 rounded-t-xl hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-indigo-500">
                            <span className="flex items-center"><svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 mr-2 text-yellow-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>Citas Pendientes de Asignación ({unassignedDailyAppointments.length})</span>
                            <svg className={`h-5 w-5 transition-transform ${isUnassignedOpen ? 'rotate-180' : 'rotate-0'}`} xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" /></svg>
                        </button>
                        <Collapse isOpened={isUnassignedOpen}>
                            <div className="p-6">
                                {unassignedDailyAppointments.length === 0 ? (
                                    <p className="text-gray-500 text-center py-4">No hay citas pendientes de asignación para este día.</p>
                                ) : (
                                    <ul className="space-y-4">
                                        {unassignedDailyAppointments.map(cita => (
                                            <li key={cita.id} className="bg-gray-50 p-4 rounded-lg shadow-sm flex items-center justify-between transition-all duration-200 hover:bg-gray-100">
                                                <div>
                                                    <p className="text-lg font-medium">{new Date(cita.horario_cita).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p>
                                                    <p className="text-gray-700">{cita.patients?.name ?? 'Paciente Desconocido'}</p>
                                                </div>
                                                <button onClick={() => handleAssignCita(cita.id)} disabled={isUpdating} className="btn-primary" title="Asignarme esta cita"><svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM12 14c-1.49 0-3.13-.814-4-1.834V18h8v-4.834c-.87.97-2.51 1.834-4 1.834z" /></svg>Asignarme</button>
                                            </li>
                                        ))}
                                    </ul>
                                )}
                            </div>
                        </Collapse>
                    </div>
                    <div className="bg-white rounded-xl shadow-lg">
                        <button onClick={() => setIsOtherAssignedOpen(!isOtherAssignedOpen)} className="w-full flex justify-between items-center px-6 py-4 text-left font-semibold text-gray-900 text-xl border-b pb-3 rounded-t-xl hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-indigo-500">
                            <span className="flex items-center">
                                {/* FIX: Replaced the broken SVG with a correct one */}
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 mr-2 text-orange-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.653-.16-1.277-.45-1.856M17 20H7" />
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 13a3 3 0 01-3-3m0 0a3 3 0 013-3m0 3h6m-6 0a3 3 0 01-3 3m0 0V7m0 6a3 3 0 003 3m0 0h6m-6 0a3 3 0 003-3m0 0V7" />
                                </svg>
                                Citas Asignadas a Otros Doctores ({otherAssignedDailyAppointments.length})
                            </span>
                            <svg className={`h-5 w-5 transition-transform ${isOtherAssignedOpen ? 'rotate-180' : 'rotate-0'}`} xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" /></svg>
                        </button>
                        <Collapse isOpened={isOtherAssignedOpen}>
                            <div className="p-6">
                                {otherAssignedDailyAppointments.length === 0 ? (
                                    <p className="text-gray-500 text-center py-4">No hay citas asignadas a otros doctores para este día.</p>
                                ) : (
                                    <ul className="space-y-4">
                                        {otherAssignedDailyAppointments.map(cita => (
                                            <li key={cita.id} className="bg-orange-50 p-4 rounded-lg shadow-sm flex items-center justify-between border border-orange-200 opacity-90 cursor-not-allowed">
                                                <div>
                                                    <p className="text-lg font-medium">{new Date(cita.horario_cita).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p>
                                                    <p className="text-orange-800 font-semibold">{cita.patients?.name ? `Paciente: ${cita.patients.name}` : 'Paciente Desconocido'}</p>
                                                    <p className="text-sm text-orange-700 mt-1">Asignada a: {cita.trabajadores?.nombre ?? 'Desconocido'}</p>
                                                </div>
                                            </li>
                                        ))}
                                    </ul>
                                )}
                            </div>
                        </Collapse>
                    </div>
                </div>
            </div>
            <style>{`
                /* Button styles */
                .btn-primary { display: inline-flex; justify-content: center; align-items: center; padding: 0.6rem 1.2rem; border: none; border-radius: 0.5rem; font-size: 0.9rem; font-weight: 600; color: #FFFFFF; background-color: #4F46E5; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06); transition: all 0.2s ease-in-out; }
                .btn-primary:hover { background-color: #4338CA; transform: translateY(-1px); box-shadow: 0 6px 10px -1px rgba(0, 0, 0, 0.15), 0 3px 6px -1px rgba(0, 0, 0, 0.08); }
                .btn-primary:disabled { background-color: #A5B4FC; cursor: not-allowed; transform: translateY(0); box-shadow: none; }
                .btn-danger { display: inline-flex; justify-content: center; align-items: center; padding: 0.6rem 1.2rem; border: none; border-radius: 0.5rem; font-size: 0.9rem; font-weight: 600; color: #FFFFFF; background-color: #EF4444; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06); transition: all 0.2s ease-in-out; }
                .btn-danger:hover { background-color: #DC2626; transform: translateY(-1px); box-shadow: 0 6px 10px -1px rgba(0, 0, 0, 0.15), 0 3px 6px -1px rgba(0, 0, 0, 0.08); }
                .btn-danger:disabled { background-color: #FCA5A5; cursor: not-allowed; transform: translateY(0); box-shadow: none; }
                .react-calendar-custom { border: none !important; font-family: 'Inter', sans-serif !important; width: 100%; max-width: 400px; border-radius: 0.75rem; box-shadow: 0 4px 10px rgba(0, 0, 0, 0.05); }
                .react-calendar-custom .react-calendar__navigation button { color: #4F46E5; font-weight: 600; }
                .react-calendar-custom .react-calendar__month-view__weekdays__weekday { font-size: 0.8rem; color: #6B7280; }
                .react-calendar-custom .react-calendar__tile { padding: 0.5em; height: 5em; display: flex; flex-direction: column; justify-content: flex-start; align-items: center; border-radius: 0.5rem; font-weight: 500; }
                .react-calendar-custom .react-calendar__tile--now { background-color: #E0E7FF; border: 1px solid #6366F1; }
                .react-calendar-custom .react-calendar__tile--active { background-color: #4F46E5 !important; color: white !important; border-radius: 0.5rem; }
                .react-calendar-custom .react-calendar__tile:enabled:hover, .react-calendar-custom .react-calendar__tile:enabled:focus { background-color: #EEF2FF; }
                .react-calendar-custom .react-calendar__tile--active:enabled:hover, .react-calendar-custom .react-calendar__tile--active:enabled:focus { background-color: #4338CA !important; }
                .react-calendar-custom .dot { display: inline-block; margin-top: 5px; }
            `}</style>
        </div>
    );
};

export default Itinerario;