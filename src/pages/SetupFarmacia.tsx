import { useState, useEffect, ChangeEvent, FormEvent, useMemo, ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import supabase from "../lib/supabaseClient";
import {
  Plus, Store, AlertCircle, ChevronDown, ChevronUp, Eye, EyeOff, Loader2,
  LogOut, Settings, Users, X, TrendingUp, DollarSign, ShoppingBag, ListChecks, Calendar
} from "lucide-react";
import FarmaciaForm from "../components/Farmacia/FarmaciaForm";
// 'React' ya no es necesario importarlo explícitamente en versiones modernas con el nuevo JSX transform.
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, LineChart, Line, TooltipProps
} from 'recharts';
import { NameType, ValueType } from "recharts/types/component/DefaultTooltipContent";

// --- Interfaces ---
interface Venta {
  id: number;
  created_at: string;
  monto_total: number | string;
  id_farmacia: number;
  items_json: ItemVenta[] | null;
  estado?: string;
  metodo_pago_solicitado?: string;
  nombre_cliente?: string | null;
  id_trabajador?: string | null;
  trabajador_nombre?: string | null;
}

interface DailySaleEntry {
  date: string;
  total: number;
  originalDate: Date;
}

interface MonthlySalesData {
  month: string;
  currentMonthTotal: number;
  comparisonMonthTotal: number;
  dayOfMonth?: number;
}

interface ItemVenta {
  upc: string;
  nombre_medicamento: string;
  cantidad: number | string;
  precio_en_pesos: number | string;
  presentacion?: string;
  laboratorio?: string;
}

interface ProductoVendido {
  upc: string;
  nombre: string;
  unidadesTotales: number;
  ventasTotales: number;
}

interface Worker {
  id?: string;
  user_id?: string;
  nombre: string;
  telefono: string;
  email: string;
  rol: 'farmaceutico' | 'Doctor';
  id_farmacia: string;
  cedula_prof?: string | null;
  especialidad?: string | null;
  key_lux?: string | null;
  created_at?: string;
}

interface Farmacia {
  id_farmacia: string;
  nombre: string;
  id_administrador: string;
  ubicacion?: string | null;
  telefono?: string | null;
}

interface PagoCita {
  id: number;
  cita_id: number;
  metodo_pago: string;
  numero_recibo?: string | null;
  estado_pago: string;
  fecha_creacion: string;
  precio: number | string;
  id_farmacia: number | null;
}

// --- Helpers ---
const getMonthYear = (date: Date): string => date.toLocaleDateString('es-MX', { month: 'short', year: 'numeric' });
const getStartOfWeek = (date: Date): Date => {
    const d = new Date(date);
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1);
    return new Date(d.setDate(diff));
};

// --- Color principal HEX ---
const ACCENT_COLOR_HEX = "#1995c8";
const ACCENT_COLOR_RGB = "25, 149, 200";

// --- Custom Tooltip Component for Recharts ---
const CustomTooltip = ({ active, payload, label }: TooltipProps<ValueType, NameType>) => {
  if (active && payload && payload.length) {
    return (
      <div className="p-3 bg-white/90 dark:bg-neutral-800/90 backdrop-blur-sm rounded-xl shadow-lg border border-neutral-200 dark:border-neutral-700">
        <p className="label text-sm font-semibold text-neutral-800 dark:text-neutral-100">{`${label}`}</p>
        {payload.map((pld, index) => (
          <div key={index} style={{ color: pld.color }} className="text-sm text-neutral-600 dark:text-neutral-300">
            {`${pld.name}: ${typeof pld.value === 'number' ? `$${pld.value.toLocaleString(undefined, {minimumFractionDigits:2, maximumFractionDigits:2})}`: pld.value}`}
          </div>
        ))}
      </div>
    );
  }
  return null;
};

export default function SetupFarmacia() {
  const navigate = useNavigate();
  const [ventas, setVentas] = useState<Venta[]>([]);
  const [productosPopulares, setProductosPopulares] = useState<ProductoVendido[]>([]);
  const [expandedVenta, setExpandedVenta] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [userData, setUserData] = useState<any>(null);
  const [farmacia, setFarmacia] = useState<Farmacia | null>(null);
  const [expandedSections, setExpandedSections] = useState({
    productosPopulares: true, ultimasVentas: true, salesChart: true,
    appointmentIncome: true, workersManagement: true, todaysSales: true,
  });
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [loadingWorkers, setLoadingWorkers] = useState(true);
  const [showPasswords, setShowPasswords] = useState<{ [key: string]: boolean }>({});
  const [tempPasswords, setTempPasswords] = useState<{ [key: string]: string }>({});
  const [showWorkerForm, setShowWorkerForm] = useState(false);
  const initialWorkerFormData: Worker = {
    nombre: '', telefono: '', email: '', rol: 'farmaceutico', id_farmacia: '',
    cedula_prof: '', especialidad: ''
  };
  const [workerFormData, setWorkerFormData] = useState<Worker>(initialWorkerFormData);
  const [workerFormError, setWorkerFormError] = useState('');
  const [isWorkerSubmitting, setIsWorkerSubmitting] = useState(false);
  const [salesViewMode, setSalesViewMode] = useState<'daily' | 'weekly' | 'all'>('daily');
  const [availableMonths, setAvailableMonths] = useState<string[]>([]);
  const [selectedComparisonMonth, setSelectedComparisonMonth] = useState<string>('');
  const [pagosCitas, setPagosCitas] = useState<PagoCita[]>([]);
  const [loadingPagosCitas, setLoadingPagosCitas] = useState(true);
  const [loadingSalesData, setLoadingSalesData] = useState(true);

  const currentMonthKey = useMemo(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  }, []);

  const processedSalesData = useMemo(() => {
    if (!ventas.length) return { daily: [], weekly: [], monthlyForChart: [], availableMonths: [], dailyComparisonData: [], todaySalesTotal: 0, todaySalesCount: 0 };
    const salesByExactDate: { [isoDate: string]: { total: number; originalDate: Date, count: number } } = {};
    const salesByMonth: { [key: string]: { total: number, daily: { [day: number]: number } } } = {};
    const allMonthsSet = new Set<string>();
    let todaySalesTotal = 0;
    let todaySalesCount = 0;
    const todayISOString = new Date().toISOString().split('T')[0];
    ventas.forEach(venta => {
        const amount = parseFloat(String(venta.monto_total)) || 0;
        if (!venta.created_at || amount <= 0) return;
        try {
            const saleDate = new Date(venta.created_at);
            const isoDateString = saleDate.toISOString().split('T')[0];
            const monthYearString = `${saleDate.getFullYear()}-${String(saleDate.getMonth() + 1).padStart(2, '0')}`;
            const dayOfMonth = saleDate.getDate();
            allMonthsSet.add(monthYearString);
            if (!salesByExactDate[isoDateString]) { salesByExactDate[isoDateString] = { total: 0, originalDate: saleDate, count: 0 }; }
            salesByExactDate[isoDateString].total += amount;
            salesByExactDate[isoDateString].count += 1;
            if (isoDateString === todayISOString) { todaySalesTotal += amount; todaySalesCount += 1; }
            if (!salesByMonth[monthYearString]) salesByMonth[monthYearString] = { total: 0, daily: {} };
            salesByMonth[monthYearString].total += amount;
            salesByMonth[monthYearString].daily[dayOfMonth] = (salesByMonth[monthYearString].daily[dayOfMonth] || 0) + amount;
        } catch (e) { console.error("Fecha inválida procesando venta:", venta.created_at, venta.id, e); }
    });
    const sortedDailySales: DailySaleEntry[] = Object.values(salesByExactDate).map(data => ({date: data.originalDate.toLocaleDateString('es-MX', { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' }),total: data.total,originalDate: data.originalDate})).sort((a, b) => b.originalDate.getTime() - a.originalDate.getTime());
    const salesByWeek: { [key: string]: { total: number; startDate: Date; endDate: Date } } = {};
    ventas.forEach(venta => {
        const amount = parseFloat(String(venta.monto_total)) || 0;
        if (!venta.created_at || amount <= 0) return;
        const saleDate = new Date(venta.created_at); const startOfWeek = getStartOfWeek(new Date(saleDate));
        const endOfWeek = new Date(startOfWeek); endOfWeek.setDate(startOfWeek.getDate() + 6);
        const weekKey = startOfWeek.toISOString().split('T')[0];
        if (!salesByWeek[weekKey]) salesByWeek[weekKey] = { total: 0, startDate: startOfWeek, endDate: endOfWeek };
        salesByWeek[weekKey].total += amount;
    });
    const sortedWeekly = Object.entries(salesByWeek).map(([_, weekData]) => ({...weekData, weekLabel: `Semana ${weekData.startDate.toLocaleDateString('es-MX', {day:'2-digit', month:'short'})} - ${weekData.endDate.toLocaleDateString('es-MX', {day:'2-digit', month:'short', year:'numeric'})}`})).sort((a,b) => b.startDate.getTime() - a.startDate.getTime()).slice(0, 8);
    const now = new Date();
    const currentMonthData = salesByMonth[currentMonthKey] || { total: 0, daily: {} };
    const comparisonMonthData = (selectedComparisonMonth && salesByMonth[selectedComparisonMonth]) ? salesByMonth[selectedComparisonMonth] : { total: 0, daily: {} };
    const monthlyChartData: MonthlySalesData[] = [];
    monthlyChartData.push({ month: getMonthYear(now), currentMonthTotal: currentMonthData.total || 0, comparisonMonthTotal: (selectedComparisonMonth === currentMonthKey) ? (comparisonMonthData.total || 0) : 0 });
    if (selectedComparisonMonth && selectedComparisonMonth !== currentMonthKey) { monthlyChartData.push({ month: getMonthYear(new Date(parseInt(selectedComparisonMonth.split('-')[0]), parseInt(selectedComparisonMonth.split('-')[1]) - 1, 1)), currentMonthTotal: 0, comparisonMonthTotal: comparisonMonthData.total || 0 });}
    const dailyComparisonData: MonthlySalesData[] = [];
    const daysInCurrentMonth = now.getDate(); const daysInComparisonMonth = selectedComparisonMonth ? new Date(parseInt(selectedComparisonMonth.split('-')[0]), parseInt(selectedComparisonMonth.split('-')[1]), 0).getDate() : 0;
    const maxDays = Math.max(daysInCurrentMonth, (selectedComparisonMonth && selectedComparisonMonth !== currentMonthKey) ? daysInComparisonMonth : 0);
    if (maxDays > 0) { for (let i = 1; i <= maxDays; i++) { dailyComparisonData.push({ month: `Día ${i}`, currentMonthTotal: (currentMonthData.daily[i] || 0), comparisonMonthTotal: (selectedComparisonMonth && selectedComparisonMonth !== currentMonthKey && comparisonMonthData.daily[i]) ? (comparisonMonthData.daily[i] || 0) : 0, dayOfMonth: i });}}
    const sortedAvailableMonths = Array.from(allMonthsSet).sort((a,b) => new Date(b).getTime() - new Date(a).getTime());
    return { daily: sortedDailySales, weekly: sortedWeekly, monthlyForChart: monthlyChartData, availableMonths: sortedAvailableMonths, dailyComparisonData, todaySalesTotal, todaySalesCount };
  }, [ventas, selectedComparisonMonth, currentMonthKey]);

  const citasStats = useMemo(() => {
    const totalIngresos = pagosCitas.reduce((acc, pago) => acc + (parseFloat(String(pago.precio)) || 0), 0);
    return { totalIngresosCitas: totalIngresos, numeroCitasCobradas: pagosCitas.length, ultimosPagos: pagosCitas.slice(0, 5) };
  }, [pagosCitas]);
  
  const todayTotalCombinedSales = useMemo(() => {
    const retailTotal = processedSalesData.todaySalesTotal || 0;
    const retailCount = processedSalesData.todaySalesCount || 0;
    
    const todayISOString = new Date().toISOString().split('T')[0];
    const todayCitaPayments = pagosCitas.filter(pago => {
      try {
        return new Date(pago.fecha_creacion).toISOString().split('T')[0] === todayISOString;
      } catch {
        return false;
      }
    });
    
    const citasTotalToday = todayCitaPayments.reduce((acc, pago) => acc + (parseFloat(String(pago.precio)) || 0), 0);
    const citasCountToday = todayCitaPayments.length;
    
    return {
      total: retailTotal + citasTotalToday,
      count: retailCount + citasCountToday,
    };
  }, [processedSalesData.todaySalesTotal, processedSalesData.todaySalesCount, pagosCitas]);

  useEffect(() => {
    let isMounted = true; setLoading(true);
    const checkAuthAndLoadFarmacia = async () => {
      try {
        const { data: { session }, error: sessionError } = await supabase.auth.getSession();
        if (sessionError) { throw sessionError; }
        if (!session?.user) { if (isMounted) navigate("/login"); return; }
        if (isMounted) setUserData(session.user);
        const { data: farmaciaData, error: farmaciaError } = await supabase.from('farmacias').select('*').eq('id_administrador', session.user.id).single();
        if (farmaciaError) {
          if (farmaciaError.code === 'PGRST116') { if (isMounted) setFarmacia(null); }
          else { if (isMounted) setFarmacia(null); throw farmaciaError; }
        } else { if (isMounted) setFarmacia(farmaciaData); }
      } catch (error) { console.error("Auth/Farmacia Load Error:", error); if (isMounted) setFarmacia(null); }
      finally { if (isMounted) setLoading(false); }
    };
    checkAuthAndLoadFarmacia();
    return () => { isMounted = false; };
  }, [navigate]);

  const analizarProductosPopulares = (ventasData: Venta[]): ProductoVendido[] => {
    const map = new Map<string, ProductoVendido>();
    ventasData.forEach(v => v.items_json?.forEach(i => {
      const q = parseFloat(String(i.cantidad))||0, p = parseFloat(String(i.precio_en_pesos))||0;
      if(!i.upc||!i.nombre_medicamento||q<=0) return;
      const e=map.get(i.upc); e?(e.unidadesTotales+=q,e.ventasTotales+=p*q):map.set(i.upc,{upc:i.upc,nombre:i.nombre_medicamento,unidadesTotales:q,ventasTotales:p*q});
    }));
    return Array.from(map.values()).sort((a,b)=>b.unidadesTotales-a.unidadesTotales);
  };

  useEffect(() => {
    if (!farmacia?.id_farmacia) { setVentas([]); setProductosPopulares([]); setLoadingSalesData(false); return; }
    if (loading) return;
    let isMounted = true; setLoadingSalesData(true);
    const loadVentas = async () => {
      try {
        const { data: ventasData, error: ventasError } = await supabase.from('ventas').select('*').eq('id_farmacia', Number(farmacia.id_farmacia)).order('created_at', { ascending: false }).limit(500);
        if (ventasError) throw ventasError;
        if (isMounted) { const validVentas = ventasData || []; setVentas(validVentas); setProductosPopulares(analizarProductosPopulares(validVentas)); }
      } catch (error) { if (isMounted) { setVentas([]); setProductosPopulares([]); } console.error("Error cargando ventas:", error); }
      finally { if (isMounted) setLoadingSalesData(false); }
    };
    loadVentas();
    return () => { isMounted = false; };
  }, [farmacia?.id_farmacia, loading]);
  
  useEffect(() => {
    if (!farmacia?.id_farmacia) { setWorkers([]); setLoadingWorkers(false); return; }
    let isMounted = true; setLoadingWorkers(true);
    const loadWorkers = async () => {
      try {
        const { data: workersData, error: workersError } = await supabase.from('trabajadores').select('*').eq('id_farmacia', farmacia.id_farmacia);
        if (workersError) throw workersError;
        if (isMounted) setWorkers(workersData || []);
      } catch (error) { if (isMounted) setWorkers([]); console.error("Error cargando workers:", error); }
      finally { if (isMounted) setLoadingWorkers(false); }
    };
    loadWorkers();
    return () => { isMounted = false; };
  }, [farmacia?.id_farmacia]);

  useEffect(() => {
    if (!farmacia?.id_farmacia) { setPagosCitas([]); setLoadingPagosCitas(false); return; }
    let isMounted = true; setLoadingPagosCitas(true);
    const loadPagosCitas = async () => {
      try {
        const { data, error } = await supabase.from('pago_e_cita').select('*').eq('id_farmacia', farmacia.id_farmacia).eq('estado_pago', 'pagado').order('fecha_creacion', { ascending: false }).limit(100);
        if (error) throw error;
        if (isMounted) setPagosCitas(data || []);
      } catch (error) { if (isMounted) setPagosCitas([]); console.error("Error cargando pagos de citas:", error); }
      finally { if (isMounted) setLoadingPagosCitas(false); }
    };
    loadPagosCitas();
    return () => { isMounted = false; };
  }, [farmacia?.id_farmacia]);

  useEffect(() => {
    if (loadingSalesData || !processedSalesData?.availableMonths || processedSalesData.availableMonths.length === 0) {
      if (!loadingSalesData && (!processedSalesData?.availableMonths || processedSalesData.availableMonths.length === 0)) {
          if (availableMonths.length > 0) setAvailableMonths([]);
          if (selectedComparisonMonth !== '') setSelectedComparisonMonth('');
      } return;
    }
    const available = processedSalesData.availableMonths;
    if (JSON.stringify(available) !== JSON.stringify(availableMonths)) { setAvailableMonths(available); }
    if (!selectedComparisonMonth || !available.includes(selectedComparisonMonth)) {
      let newDefaultMonth = '';
      const prevMonthDate = new Date(); prevMonthDate.setMonth(prevMonthDate.getMonth() - 1);
      const prevMonthKey = `${prevMonthDate.getFullYear()}-${String(prevMonthDate.getMonth() + 1).padStart(2, '0')}`;
      if (available.includes(prevMonthKey) && available.length > 1 && prevMonthKey !== currentMonthKey) { newDefaultMonth = prevMonthKey; }
      else { const firstAlternative = available.find(m => m !== currentMonthKey);
             if (firstAlternative) { newDefaultMonth = firstAlternative; }
             else if (available.length > 0) { newDefaultMonth = available[0]; }}
      if (selectedComparisonMonth !== newDefaultMonth) setSelectedComparisonMonth(newDefaultMonth);
    }
  }, [processedSalesData?.availableMonths, currentMonthKey, loadingSalesData, availableMonths, selectedComparisonMonth]);

  const toggleSection = (section: keyof typeof expandedSections) => setExpandedSections(prev => ({ ...prev, [section]: !prev[section] }));
  const handleLogout = async () => { setLoading(true); await supabase.auth.signOut(); navigate("/login"); };
  const toggleVenta = (id: number) => setExpandedVenta(prev => prev === id ? null : id);
  
  const handleWorkerSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setWorkerFormError('');
    setIsWorkerSubmitting(true);

    if (!workerFormData.nombre || !workerFormData.email || !workerFormData.telefono || !workerFormData.rol) {
      setWorkerFormError('Por favor complete nombre, email, teléfono y rol.');
      setIsWorkerSubmitting(false);
      return;
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(workerFormData.email)) {
      setWorkerFormError('Por favor ingrese un correo electrónico válido.');
      setIsWorkerSubmitting(false);
      return;
    }
    if (workerFormData.rol === 'Doctor' && (!workerFormData.especialidad || !workerFormData.cedula_prof)) {
      setWorkerFormError('La especialidad y cédula profesional son requeridas para doctores.');
      setIsWorkerSubmitting(false);
      return;
    }
    if (!farmacia?.id_farmacia) {
        setWorkerFormError('Error interno: No se pudo obtener el ID de la farmacia.');
        setIsWorkerSubmitting(false);
        return;
    }

    try {
      const tempPassword = Math.random().toString(36).slice(-10);
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email: workerFormData.email,
        password: tempPassword,
        options: { data: { role: workerFormData.rol, full_name: workerFormData.nombre } }
      });

      if (authError) {
        if (authError.message.includes("User already registered")) {
            setWorkerFormError("Este correo electrónico ya está registrado.");
        } else {
            setWorkerFormError(`Error de autenticación: ${authError.message}`);
        }
        throw authError;
      }

       if (!authData.user) {
           throw new Error("Usuario no creado en Supabase Auth a pesar de no haber error.");
       }

      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { id, ...restOfWorkerFormData } = workerFormData;
      const workerPayload: Omit<Worker, 'id'> & { user_id: string; id_farmacia: string; } = {
          ...restOfWorkerFormData,
          user_id: authData.user.id,
          id_farmacia: farmacia.id_farmacia,
          cedula_prof: workerFormData.rol === 'Doctor' ? workerFormData.cedula_prof || null : null,
          especialidad: workerFormData.rol === 'Doctor' ? workerFormData.especialidad || null : null,
          created_at: new Date().toISOString()
      };

      const { data: insertedWorker, error: workerError } = await supabase
        .from('trabajadores')
        .insert(workerPayload)
        .select()
        .single();

      if (workerError) {
        setWorkerFormError(`Error al guardar datos del trabajador: ${workerError.message}`);
        throw workerError;
      }

      setTempPasswords(prev => ({ ...prev, [authData.user!.id]: tempPassword }));
       if (insertedWorker) {
           setWorkers(prevWorkers => [...prevWorkers, insertedWorker as Worker]);
       } else {
            setWorkers(prevWorkers => [...prevWorkers, { ...workerPayload, id: `temp-${Date.now()}` } as Worker]);
       }

      setShowWorkerForm(false);
      setWorkerFormData(initialWorkerFormData);

    } catch (error) {
       if (!workerFormError) {
           setWorkerFormError('Ocurrió un error inesperado al registrar el trabajador.');
       }
    } finally {
      setIsWorkerSubmitting(false);
    }
  };

  const handleWorkerInputChange = (e: ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    if (name === 'rol') {
        if (value === 'farmaceutico' || value === 'Doctor') {
            setWorkerFormData(prev => ({ ...prev, [name]: value as 'farmaceutico' | 'Doctor' }));
        } else {
            setWorkerFormData(prev => ({ ...prev, [name]: 'farmaceutico' }));
        }
    } else {
        setWorkerFormData(prev => ({ ...prev, [name]: value }));
    }
  };

  if (loading) { return ( <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-neutral-900 via-neutral-800 to-gray-900 text-white dark:from-neutral-800 dark:via-neutral-900 dark:to-black"><div className="text-center p-10 space-y-6"><Loader2 className="w-20 h-20 text-[#1995c8] dark:text-[#1995c8] animate-spin mx-auto" strokeWidth={1.5} /><div><p className="text-neutral-200 dark:text-neutral-300 text-2xl font-semibold tracking-tight">Cargando tu panel de control...</p><p className="text-neutral-400 dark:text-neutral-500 text-base mt-2">Preparando los datos, un momento por favor.</p></div></div></div> ); }
  
  if (!farmacia) { return ( <div className="min-h-screen bg-neutral-100 dark:bg-neutral-900 p-4 sm:p-8 flex items-center justify-center"><div className="max-w-2xl w-full bg-white dark:bg-neutral-800 rounded-2xl shadow-2xl dark:shadow-neutral-700/50 p-8 sm:p-12 transform transition-all duration-500 ease-out hover:shadow-3xl"><div className="flex flex-col sm:flex-row items-center justify-between mb-10 gap-4"><div className="flex items-center gap-5"><div className="p-4 bg-[#1995c8]/10 dark:bg-[#1995c8]/10 rounded-xl shadow-sm"><Settings className="w-9 h-9 text-[#1995c8] dark:text-[#1995c8]" /></div><h1 className="text-3xl sm:text-4xl font-bold text-neutral-800 dark:text-neutral-100 tracking-tight">Configura tu Farmacia</h1></div><button onClick={handleLogout} title="Cerrar Sesión" className="p-2.5 text-neutral-500 dark:text-neutral-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-100 dark:hover:bg-red-500/20 rounded-xl transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-red-500 dark:focus-visible:ring-red-400 focus-visible:ring-offset-2 dark:ring-offset-neutral-800"><LogOut className="w-5 h-5" /></button></div><p className="text-neutral-600 dark:text-neutral-300 mb-10 text-lg leading-relaxed">¡Bienvenido! Para empezar a gestionar tu farmacia y acceder a todas las analíticas, por favor, completa los siguientes detalles.</p>{userData && userData.id ? ( <FarmaciaForm onFarmaciaSaved={(nuevaFarmacia) => setFarmacia(nuevaFarmacia)} /> ) : ( <p className="text-center text-red-500 dark:text-red-400 py-5">Error: No se pudo cargar la información del usuario. Recarga la página.</p> )}</div></div> ); }
  
  const CardSkeleton = ({ className = "", children }: { className?: string, children?: ReactNode }) => (<div className={`bg-neutral-100 dark:bg-neutral-700/50 p-6 rounded-xl animate-pulse ${className}`}>{children}</div>);
  const ListSkeleton = ({ items = 3, className = "" }: { items?: number, className?: string}) => (<div className={`space-y-3 ${className}`}>{Array.from({ length: items }).map((_, i) => (<div key={i} className="bg-neutral-100/70 dark:bg-neutral-700/40 p-4 rounded-lg animate-pulse"><div className="flex justify-between items-center"><div className="space-y-1.5"><div className="h-3 bg-neutral-200 dark:bg-neutral-600 rounded w-24"></div><div className="h-2 bg-neutral-200 dark:bg-neutral-600 rounded w-32"></div></div><div className="h-4 bg-neutral-300 dark:bg-neutral-500 rounded w-16"></div></div></div>))}</div>);
  const cardTitleBase = "text-2xl md:text-3xl font-bold tracking-tight text-neutral-800 dark:text-neutral-100";
  const cardSubtitleBase = "text-xs md:text-sm text-neutral-500 dark:text-neutral-400";
  const cardIconWrapperBase = "p-3 md:p-3.5 rounded-xl shadow-sm";
  const cardIconBase = "w-7 h-7 md:w-9 md:h-9";
  
  return (
    <div className="min-h-screen bg-neutral-100 dark:bg-neutral-900 p-4 md:p-6 lg:p-8 font-sans selection:bg-[#1995c8]/30 selection:text-neutral-900 dark:selection:bg-[#1995c8]/60 dark:selection:text-neutral-100">
      <div className="max-w-screen-2xl mx-auto">
        <header className="bg-gradient-to-r from-white via-neutral-50 to-white dark:from-neutral-800 dark:via-neutral-800/95 dark:to-neutral-800 rounded-2xl shadow-xl dark:shadow-neutral-700/30 p-6 md:p-10 mb-8 md:mb-12 border border-neutral-200/60 dark:border-neutral-700/80">
           <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-6">
            <div className="shrink-0 mb-4 lg:mb-0">
              <div className="h-[128px] w-[129px] rounded-md flex items-center justify-center text-neutral-400 dark:text-neutral-500 text-xs">
                <img src="/logo.png" alt="Carelux Point Logo" width="128" height="128" className="opacity-90"/>
              </div>
            </div>
            <div className="flex-grow text-center lg:text-left">
              <h1 className="text-3xl md:text-4xl lg:text-5xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-[#1995c8] via-[#1995c8]/80 to-[#1995c8]/60 dark:from-[#1995c8] dark:via-[#1995c8]/80 dark:to-[#1995c8]/60 tracking-tighter mb-1">{farmacia.nombre}</h1>
              <p className="text-sm text-neutral-500 dark:text-neutral-400">Panel de Administración</p>
            </div>
            <button onClick={handleLogout} className="flex items-center self-start lg:self-center shrink-0 gap-2.5 px-4 py-2.5 md:px-5 md:py-3 text-xs md:text-sm font-semibold text-red-500 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300 bg-red-50 dark:bg-red-500/10 hover:bg-red-100 dark:hover:bg-red-500/20 border border-red-200 dark:border-red-500/30 hover:border-red-300 dark:hover:border-red-500/50 rounded-xl transition-all duration-200 ease-in-out shadow-sm hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-red-400 dark:focus-visible:ring-red-500 focus-visible:ring-offset-2 dark:ring-offset-neutral-800">
              <LogOut className="w-4 h-4" />Cerrar Sesión
            </button>
          </div>
           <div className="mt-4 pt-3 border-t border-neutral-200 dark:border-neutral-700 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-neutral-500 dark:text-neutral-400">
                <span>ID: <span className="font-semibold text-neutral-700 dark:text-neutral-200">{farmacia.id_farmacia}</span></span>
                {farmacia.ubicacion && <span>Ubicación: <span className="font-semibold text-neutral-700 dark:text-neutral-200">{farmacia.ubicacion}</span></span>}
                {farmacia.telefono && <span>Tel: <span className="font-semibold text-neutral-700 dark:text-neutral-200">{farmacia.telefono}</span></span>}
            </div>
        </header>
        
        <section className="mb-6 md:mb-10">
            <div className={`${expandedSections.todaysSales ? 'pb-6' : ''} bg-white dark:bg-neutral-800 rounded-2xl shadow-lg dark:shadow-neutral-700/30 border border-neutral-200/60 dark:border-neutral-700/80 p-4 md:p-6 transition-all duration-300 ease-in-out`}>
                <div className="flex items-center justify-between cursor-pointer group" onClick={() => toggleSection('todaysSales')}>
                    <div className="flex items-center gap-3 md:gap-4">
                        <div className={`${cardIconWrapperBase} bg-gradient-to-br from-[rgba(${ACCENT_COLOR_RGB},0.15)] to-[rgba(${ACCENT_COLOR_RGB},0.05)] dark:from-[rgba(${ACCENT_COLOR_RGB},0.2)] dark:to-[rgba(${ACCENT_COLOR_RGB},0.1)]`}><ShoppingBag className={`${cardIconBase} text-[${ACCENT_COLOR_HEX}] dark:text-[${ACCENT_COLOR_HEX}]`} /></div>
                        <div>
                            <h2 className="text-xl md:text-2xl font-semibold text-neutral-800 dark:text-neutral-100 tracking-tight">Ventas de Hoy (Total)</h2>
                            <p className="text-xs md:text-sm text-neutral-500 dark:text-neutral-400">Ingresos combinados de POS (Retail) y Citas</p>
                        </div>
                    </div>
                    <ChevronDown className={`w-5 h-5 text-neutral-400 dark:text-neutral-500 group-hover:text-neutral-600 dark:group-hover:text-neutral-300 transition-transform duration-300 ${expandedSections.todaysSales ? 'rotate-180' : ''}`} />
                </div>
                {expandedSections.todaysSales && (
                    <div className="mt-4 pt-4 border-t border-neutral-200 dark:border-neutral-700 animate-fade-in-slow">
                        {loadingSalesData || loadingPagosCitas ? (
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4"><CardSkeleton className="!py-4"/><CardSkeleton className="!py-4"/></div>
                        ) : (
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 md:gap-6">
                                <div className={`bg-[rgba(${ACCENT_COLOR_RGB},0.05)] dark:bg-[rgba(${ACCENT_COLOR_RGB},0.1)] p-4 md:p-6 rounded-xl text-center ring-1 ring-[rgba(${ACCENT_COLOR_RGB},0.2)] dark:ring-[rgba(${ACCENT_COLOR_RGB},0.3)]`}><p className={`text-sm font-medium text-[rgba(${ACCENT_COLOR_RGB},0.9)] dark:text-[rgba(${ACCENT_COLOR_RGB},0.8)] uppercase tracking-wider`}>Ingreso Total Hoy</p><p className={`text-3xl md:text-4xl font-bold text-[${ACCENT_COLOR_HEX}] dark:text-[${ACCENT_COLOR_HEX}] mt-2`}>${todayTotalCombinedSales.total.toFixed(2)}</p></div>
                                <div className={`bg-[rgba(${ACCENT_COLOR_RGB},0.05)] dark:bg-[rgba(${ACCENT_COLOR_RGB},0.1)] p-4 md:p-6 rounded-xl text-center ring-1 ring-[rgba(${ACCENT_COLOR_RGB},0.2)] dark:ring-[rgba(${ACCENT_COLOR_RGB},0.3)]`}><p className={`text-sm font-medium text-[rgba(${ACCENT_COLOR_RGB},0.9)] dark:text-[rgba(${ACCENT_COLOR_RGB},0.8)] uppercase tracking-wider`}>Nº Transacciones Hoy</p><p className={`text-3xl md:text-4xl font-bold text-[${ACCENT_COLOR_HEX}] dark:text-[${ACCENT_COLOR_HEX}] mt-2`}>{todayTotalCombinedSales.count}</p></div>
                            </div>
                        )}
                    </div>
                )}
            </div>
        </section>

        <section className="bg-white dark:bg-neutral-800 rounded-2xl shadow-2xl dark:shadow-neutral-700/30 p-6 md:p-8 mb-8 md:mb-12 border border-neutral-200/60 dark:border-neutral-700/80 overflow-hidden hover:shadow-3xl transition-shadow duration-300">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-6">
                <div className="flex items-center gap-5"><div className={`${cardIconWrapperBase} bg-gradient-to-br from-[rgba(${ACCENT_COLOR_RGB},0.15)] to-[rgba(${ACCENT_COLOR_RGB},0.05)] dark:from-[rgba(${ACCENT_COLOR_RGB},0.2)] dark:to-[rgba(${ACCENT_COLOR_RGB},0.1)]`}><TrendingUp className={`${cardIconBase} text-[${ACCENT_COLOR_HEX}] dark:text-[${ACCENT_COLOR_HEX}]`} /></div><div><h2 className={cardTitleBase}>Análisis de Ventas</h2><p className={cardSubtitleBase}>Comparativa mensual y diaria (Retail)</p></div></div>
                <div className="flex items-center gap-3 w-full md:w-auto pt-2 md:pt-0">
                    <label htmlFor="comparisonMonth" className="text-sm font-medium text-neutral-600 dark:text-neutral-300 shrink-0">Comparar con:</label>
                    <select id="comparisonMonth" value={selectedComparisonMonth} onChange={(e) => setSelectedComparisonMonth(e.target.value)} className="form-select block w-full p-3 text-sm text-neutral-700 dark:text-neutral-200 bg-neutral-50 dark:bg-neutral-700 border-neutral-300 dark:border-neutral-600 rounded-xl shadow-sm focus:ring-2 focus:ring-[${ACCENT_COLOR_HEX}] dark:focus:ring-[${ACCENT_COLOR_HEX}] focus:border-[${ACCENT_COLOR_HEX}] dark:focus:border-[${ACCENT_COLOR_HEX}] transition-colors duration-150">
                        <option value="" disabled>Selecciona un mes</option>
                        {availableMonths.filter(m => m !== currentMonthKey).map(monthKey => (<option key={monthKey} value={monthKey}>{getMonthYear(new Date(parseInt(monthKey.split('-')[0]), parseInt(monthKey.split('-')[1]) - 1, 1))}</option>))}
                    </select>
                </div>
            </div>
            {loadingSalesData ? ( <div className="h-96 flex flex-col items-center justify-center text-neutral-400 dark:text-neutral-500 space-y-4"><Loader2 className="animate-spin w-12 h-12 text-[#1995c8] dark:text-[#1995c8]" strokeWidth={1.5}/><p>Cargando datos para los gráficos...</p></div> ) : 
            (processedSalesData.monthlyForChart && processedSalesData.monthlyForChart.length > 0 && processedSalesData.monthlyForChart.some(d => d.currentMonthTotal > 0 || d.comparisonMonthTotal > 0)) || (processedSalesData.dailyComparisonData && processedSalesData.dailyComparisonData.length > 0 && processedSalesData.dailyComparisonData.some(d => d.currentMonthTotal > 0 || d.comparisonMonthTotal > 0)) ? (
                <div className="grid grid-cols-1 xl:grid-cols-11 gap-8 items-start"> 
                    <div className="xl:col-span-6 min-h-[26rem] bg-neutral-50/50 dark:bg-neutral-700/30 p-4 rounded-xl border border-neutral-200/70 dark:border-neutral-700/50 flex flex-col"> 
                        <h3 className="text-sm font-semibold text-neutral-600 dark:text-neutral-300 mb-2 pl-2 shrink-0">Totales Mensuales</h3>
                        <div className="flex-grow h-full w-full">
                            <ResponsiveContainer width="100%" height={350}> 
                                <BarChart data={processedSalesData.monthlyForChart} margin={{ top: 5, right: 10, left: -20, bottom: 5 }} barGap={12}><CartesianGrid strokeDasharray="3 3" strokeOpacity={0.3} className="dark:stroke-neutral-600 stroke-neutral-300" /><XAxis dataKey="month" angle={0} textAnchor="middle" height={25} interval={0} tick={{fontSize: 10}} className="fill-neutral-600 dark:fill-neutral-400" dy={5} /><YAxis tickFormatter={(value) => `$${(value/1000).toFixed(0)}k`} tick={{fontSize: 10}} className="fill-neutral-600 dark:fill-neutral-400" width={55} /><Tooltip cursor={{fill: `rgba(${ACCENT_COLOR_RGB}, 0.05)`}} content={<CustomTooltip />} /> <Legend verticalAlign="top" height={36} wrapperStyle={{fontSize: "12px" }} iconSize={10} payload={processedSalesData.monthlyForChart.length > 1 && selectedComparisonMonth !== currentMonthKey ? undefined : [{value: `Mes Actual (${getMonthYear(new Date())})`, type: 'square', id: 'currentMonthTotal', color: ACCENT_COLOR_HEX}]} /> 
                                <defs><linearGradient id="mainGradient" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor={ACCENT_COLOR_HEX} stopOpacity={0.9}/><stop offset="95%" stopColor={ACCENT_COLOR_HEX} stopOpacity={0.7}/></linearGradient><linearGradient id="comparisonGradient" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#6366f1" stopOpacity={0.8}/><stop offset="95%" stopColor="#4f46e5" stopOpacity={0.6}/></linearGradient></defs>
                                <Bar dataKey="currentMonthTotal" name={`Mes Actual (${getMonthYear(new Date())})`} fill="url(#mainGradient)" radius={[8, 8, 0, 0]} barSize={35} />{selectedComparisonMonth && selectedComparisonMonth !== currentMonthKey && (<Bar dataKey="comparisonMonthTotal" name={`Comparación (${getMonthYear(new Date(parseInt(selectedComparisonMonth.split('-')[0]), parseInt(selectedComparisonMonth.split('-')[1]) - 1, 1))})`} fill="url(#comparisonGradient)" radius={[8, 8, 0, 0]} barSize={35} />)}</BarChart>
                            </ResponsiveContainer>
                        </div>
                    </div>
                    <div className="xl:col-span-5 min-h-[26rem] bg-neutral-50/50 dark:bg-neutral-700/30 p-4 rounded-xl border border-neutral-200/70 dark:border-neutral-700/50 flex flex-col"><h3 className="text-sm font-semibold text-neutral-600 dark:text-neutral-300 mb-2 pl-2 shrink-0">Tendencia Diaria</h3><div className="flex-grow h-full w-full"><ResponsiveContainer width="100%" height={350}><LineChart data={processedSalesData.dailyComparisonData} margin={{ top: 5, right: 10, left: -20, bottom: 20 }}><CartesianGrid strokeDasharray="3 3" strokeOpacity={0.3} className="dark:stroke-neutral-600 stroke-neutral-300" /><XAxis dataKey="dayOfMonth" label={{ value: 'Día del Mes', position: 'insideBottom', offset: -10, fontSize: 10 }} className="fill-neutral-600 dark:fill-neutral-400" tick={{fontSize: 10}} dy={5}/><YAxis tickFormatter={(value) => `$${(value/1000).toFixed(0)}k`} tick={{fontSize: 10}} className="fill-neutral-600 dark:fill-neutral-400" width={55}/><Tooltip content={<CustomTooltip />} /><Legend verticalAlign="top" height={36} wrapperStyle={{fontSize: "12px"}} iconSize={10}/><Line type="monotone" dataKey="currentMonthTotal" name={`Actual`} stroke={ACCENT_COLOR_HEX} strokeWidth={3} dot={{ r: 3, strokeWidth:1, fill: '#fff', stroke: ACCENT_COLOR_HEX }} activeDot={{ r: 6, strokeWidth:2, fill: '#fff', stroke: ACCENT_COLOR_HEX}} /><Line type="monotone" dataKey="comparisonMonthTotal" name={`Comparación`} stroke="#6366f1" strokeWidth={3} dot={{ r: 3, strokeWidth:1, fill: '#fff', stroke: '#6366f1' }} activeDot={{ r: 6, strokeWidth:2, fill: '#fff', stroke: '#6366f1' }} /></LineChart></ResponsiveContainer></div></div>
                </div>
            ) : ( <p className="text-center text-neutral-500 dark:text-neutral-400 py-20 text-lg italic">No hay datos suficientes para mostrar los gráficos o las ventas son cero.</p> )}
        </section>

        <section className="bg-gradient-to-tr from-[#1995c8] via-[#1995c8]/80 to-[#1995c8]/60 text-white rounded-3xl shadow-2xl p-6 md:p-10 mb-8 md:mb-12 relative overflow-hidden hover:shadow-3xl transition-shadow duration-300">
             <Users className="absolute -right-20 -bottom-20 w-64 h-64 text-white/5 transform rotate-[20deg] opacity-60" /><DollarSign className="absolute left-10 top-10 w-32 h-32 text-white/5 transform -rotate-[15deg] opacity-50" /><div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-6 relative z-10"><div className="flex items-center gap-5"><div className="p-3.5 bg-white/20 rounded-xl shadow-md backdrop-blur-md"><DollarSign className="w-9 h-9 text-white" /></div><div><h2 className={cardTitleBase + " !text-white"}>Ingresos por Citas</h2><p className="text-sm text-white/90">Pagos confirmados y estadísticas</p></div></div><button onClick={() => toggleSection('appointmentIncome')} className="p-2.5 bg-white/10 hover:bg-white/20 rounded-xl transition-colors backdrop-blur-sm self-start md:self-center" title={expandedSections.appointmentIncome ? "Colapsar" : "Expandir"}>{expandedSections.appointmentIncome ? <ChevronUp className="w-6 h-6 text-white/90" /> : <ChevronDown className="w-6 h-6 text-white/90" />}</button></div>
            {expandedSections.appointmentIncome && (<div className="relative z-10 transition-all duration-500 ease-in-out animate-fade-in-slow">{loadingPagosCitas ? (<div className="h-60 grid grid-cols-1 md:grid-cols-2 gap-6"><CardSkeleton className="!bg-white/5 !text-white"><div className="h-6 !bg-white/10 rounded w-3/4 mb-5"></div><div className="h-16 !bg-white/20 rounded w-1/2"></div></CardSkeleton><CardSkeleton className="!bg-white/5 !text-white"><div className="h-6 !bg-white/10 rounded w-3/4 mb-5"></div><div className="h-16 !bg-white/20 rounded w-1/2"></div></CardSkeleton></div>) : (<div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-10"><div className="bg-white/10 hover:bg-white/15 transition-all duration-300 p-8 rounded-2xl backdrop-blur-md shadow-xl transform hover:scale-[1.02]"><p className="text-base font-semibold text-white/90 uppercase tracking-wider">Total Ingresos (Citas)</p><p className="text-6xl font-extrabold text-white mt-3">${citasStats.totalIngresosCitas.toFixed(2)}</p></div><div className="bg-white/10 hover:bg-white/15 transition-all duration-300 p-8 rounded-2xl backdrop-blur-md shadow-xl transform hover:scale-[1.02]"><p className="text-base font-semibold text-white/90 uppercase tracking-wider">Citas Cobradas</p><p className="text-6xl font-extrabold text-white mt-3">{citasStats.numeroCitasCobradas}</p></div></div>)}
            {!loadingPagosCitas && citasStats.ultimosPagos.length > 0 && (<div><h3 className="text-xl font-semibold text-white mb-5">Últimos Pagos de Citas</h3><div className="space-y-4 max-h-80 overflow-y-auto pr-1">{citasStats.ultimosPagos.map(pago => (<div key={pago.id} className="bg-white/5 hover:bg-white/10 transition-colors duration-200 p-4 sm:p-5 rounded-xl backdrop-blur-sm border border-white/10"><div className="flex flex-wrap justify-between items-center gap-3 text-sm"><div className="flex-grow"><p className="font-semibold text-white">Cita ID: {pago.cita_id} {pago.numero_recibo && <span className="text-xs text-white/80 ml-1">(Rec: {pago.numero_recibo})</span>}</p><p className="text-xs text-white/90">{new Date(pago.fecha_creacion).toLocaleString('es-MX', {dateStyle: 'long', timeStyle: 'short'})}</p></div><div className="text-right shrink-0 ml-auto"><p className="text-xl font-bold text-white">${(parseFloat(String(pago.precio)) || 0).toFixed(2)}</p><p className="text-xs text-white/90 capitalize">{pago.metodo_pago.replace("_", " ")}</p></div></div></div>))}</div></div>)}
            {!loadingPagosCitas && pagosCitas.length === 0 && (<p className="text-center text-white/90 py-16 italic text-lg">No hay pagos de citas registrados para esta farmacia.</p>)}</div>)}
        </section>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 md:gap-10 mb-8 md:mb-12">
          <section className="bg-white dark:bg-neutral-800 rounded-2xl shadow-2xl dark:shadow-neutral-700/30 p-6 md:p-8 border border-neutral-200/60 dark:border-neutral-700/80 hover:shadow-3xl transition-shadow duration-300">
             <div className="flex items-center justify-between mb-6"><div className="flex items-center gap-5"><div className={`${cardIconWrapperBase} bg-neutral-800/10 dark:bg-neutral-100/10`}><Store className={`${cardIconBase} text-neutral-800 dark:text-neutral-100`} /></div><div><h2 className={cardTitleBase}>Top Productos</h2><p className={cardSubtitleBase}>Más vendidos recientemente</p></div></div><button onClick={() => toggleSection('productosPopulares')} className="p-2.5 text-neutral-400 dark:text-neutral-500 hover:text-neutral-600 dark:hover:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-700 rounded-xl transition-colors" title={expandedSections.productosPopulares ? "Colapsar" : "Expandir"}>{expandedSections.productosPopulares ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}</button></div>
            {expandedSections.productosPopulares && (<div className="space-y-4 max-h-[30rem] overflow-y-auto pr-1">
                {loadingSalesData ? <ListSkeleton items={5} /> : productosPopulares.length > 0 ? productosPopulares.slice(0, 10).map((producto, idx) => (<div key={producto.upc} className={`bg-neutral-50 dark:bg-neutral-700/40 hover:bg-neutral-100/70 dark:hover:bg-neutral-700/70 p-4 rounded-xl border border-neutral-200/80 dark:border-neutral-700/60 transition-all duration-200 hover:border-neutral-300 dark:hover:border-neutral-600 ${idx < 3 ? `ring-1 ring-[${ACCENT_COLOR_HEX}]/20 dark:ring-[${ACCENT_COLOR_HEX}]/30` : ''}`}><div className="flex justify-between items-start"><h3 className="font-semibold text-neutral-700 dark:text-neutral-200 text-[0.9rem] leading-snug flex-1 pr-2" title={producto.nombre}><span className={`text-[${ACCENT_COLOR_HEX}] dark:text-[${ACCENT_COLOR_HEX}] font-bold mr-1.5`}>#{idx+1}</span>{producto.nombre}</h3><span className={`font-bold text-[${ACCENT_COLOR_HEX}] dark:text-[${ACCENT_COLOR_HEX}] text-lg shrink-0`}>${producto.ventasTotales.toFixed(2)}</span></div><p className="text-xs text-neutral-500 dark:text-neutral-400 mt-1">Unidades: <span className="font-medium text-neutral-600 dark:text-neutral-300">{producto.unidadesTotales}</span> | UPC: <span className="font-mono text-xs text-neutral-400 dark:text-neutral-500">{producto.upc}</span></p></div>)) : (<p className="text-sm text-neutral-500 dark:text-neutral-400 text-center py-12 italic">No hay datos de productos populares.</p>)}
            </div>)}
          </section>
          
          <section className="bg-white dark:bg-neutral-800 rounded-2xl shadow-2xl dark:shadow-neutral-700/30 p-6 md:p-8 border border-neutral-200/60 dark:border-neutral-700/80 hover:shadow-3xl transition-shadow duration-300">
             <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-4"><div className="flex items-center gap-5"><div className={`${cardIconWrapperBase} bg-[#1995c8]/10 dark:bg-[#1995c8]/10`}><ListChecks className={`${cardIconBase} text-[#1995c8] dark:text-[#1995c8]`} /></div><div><h2 className={cardTitleBase}>Ventas (Retail)</h2><p className={cardSubtitleBase}>Registro diario, semanal o completo</p></div></div><div className="flex items-center gap-2 self-start sm:self-center"><button onClick={() => {toggleSection('ultimasVentas'); if (!expandedSections.ultimasVentas) setSalesViewMode('daily')}} className="p-2.5 text-neutral-400 dark:text-neutral-500 hover:text-neutral-600 dark:hover:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-700 rounded-xl transition-colors mr-1" title={expandedSections.ultimasVentas ? "Colapsar" : "Expandir"}>{expandedSections.ultimasVentas ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}</button>{expandedSections.ultimasVentas && (<><button onClick={() => setSalesViewMode('daily')} className={`px-3 py-2 text-xs font-semibold rounded-lg transition-all duration-200 ${salesViewMode === 'daily' ? `bg-[${ACCENT_COLOR_HEX}] dark:bg-[${ACCENT_COLOR_HEX}] text-white shadow-md ring-1 ring-[${ACCENT_COLOR_HEX}]/30 dark:ring-[${ACCENT_COLOR_HEX}]/50 ring-offset-1 dark:ring-offset-neutral-800` : 'bg-neutral-100 dark:bg-neutral-700 text-neutral-600 dark:text-neutral-300 hover:bg-neutral-200 dark:hover:bg-neutral-600 border border-neutral-200 dark:border-neutral-600'}`}>Diario</button><button onClick={() => setSalesViewMode('weekly')} className={`px-3 py-2 text-xs font-semibold rounded-lg transition-all duration-200 ${salesViewMode === 'weekly' ? `bg-[${ACCENT_COLOR_HEX}] dark:bg-[${ACCENT_COLOR_HEX}] text-white shadow-md ring-1 ring-[${ACCENT_COLOR_HEX}]/30 dark:ring-[${ACCENT_COLOR_HEX}]/50 ring-offset-1 dark:ring-offset-neutral-800` : 'bg-neutral-100 dark:bg-neutral-700 text-neutral-600 dark:text-neutral-300 hover:bg-neutral-200 dark:hover:bg-neutral-600 border border-neutral-200 dark:border-neutral-600'}`}>Semanal</button><button onClick={() => setSalesViewMode('all')} className={`px-3 py-2 text-xs font-semibold rounded-lg transition-all duration-200 ${salesViewMode === 'all' ? `bg-[${ACCENT_COLOR_HEX}] dark:bg-[${ACCENT_COLOR_HEX}] text-white shadow-md ring-1 ring-[${ACCENT_COLOR_HEX}]/30 dark:ring-[${ACCENT_COLOR_HEX}]/50 ring-offset-1 dark:ring-offset-neutral-800` : 'bg-neutral-100 dark:bg-neutral-700 text-neutral-600 dark:text-neutral-300 hover:bg-neutral-200 dark:hover:bg-neutral-600 border border-neutral-200 dark:border-neutral-600'}`}>Todas</button></>)}</div></div>
            {expandedSections.ultimasVentas && (<div className="space-y-4 max-h-[30rem] overflow-y-auto pr-1">
                {loadingSalesData ? <ListSkeleton /> : (salesViewMode === 'daily' && processedSalesData.daily.length > 0) ? processedSalesData.daily.slice(0,15).map((daySale, index) => (<div key={daySale.date + index} className="bg-neutral-50 dark:bg-neutral-700/40 hover:bg-neutral-100/70 dark:hover:bg-neutral-700/70 p-4 rounded-xl border border-neutral-200/80 dark:border-neutral-700/60 transition-colors"><div className="flex justify-between items-center"><p className="font-semibold text-neutral-700 dark:text-neutral-200 text-[0.9rem]">{daySale.date}</p><p className={`text-[${ACCENT_COLOR_HEX}] dark:text-[${ACCENT_COLOR_HEX}] font-bold text-lg`}>${daySale.total.toFixed(2)}</p></div></div>)) : (salesViewMode === 'daily' ) ? (<p className="text-sm text-neutral-500 dark:text-neutral-400 text-center py-12 italic">No hay datos de ventas diarias.</p>) : (salesViewMode === 'weekly' && processedSalesData.weekly.length > 0) ? processedSalesData.weekly.map((weekSale, index) => (<div key={weekSale.weekLabel + index} className="bg-neutral-50 dark:bg-neutral-700/40 hover:bg-neutral-100/70 dark:hover:bg-neutral-700/70 p-4 rounded-xl border border-neutral-200/80 dark:border-neutral-700/60 transition-colors"><div className="flex justify-between items-center"><p className="font-semibold text-neutral-700 dark:text-neutral-200 text-[0.9rem]">{weekSale.weekLabel}</p><p className={`text-[${ACCENT_COLOR_HEX}] dark:text-[${ACCENT_COLOR_HEX}] font-bold text-lg`}>${weekSale.total.toFixed(2)}</p></div></div>)) : (salesViewMode === 'weekly' ) ? (<p className="text-sm text-neutral-500 dark:text-neutral-400 text-center py-12 italic">No hay datos de ventas semanales.</p>) : (salesViewMode === 'all' && ventas.length > 0) ? ventas.map((venta) => (<div key={venta.id} className="bg-neutral-50 dark:bg-neutral-700/40 p-4 rounded-xl border border-neutral-200/80 dark:border-neutral-700/60 hover:shadow-md transition-shadow duration-200"><div className="flex items-center justify-between cursor-pointer group/venta" onClick={() => toggleVenta(venta.id)}><div><p className="font-semibold text-neutral-700 dark:text-neutral-200 text-sm">Venta #{venta.id} - <span className={`text-[${ACCENT_COLOR_HEX}] dark:text-[${ACCENT_COLOR_HEX}]`}>${(parseFloat(String(venta.monto_total)) || 0).toFixed(2)}</span></p><p className="text-xs text-neutral-400 dark:text-neutral-500 mt-0.5"><Calendar className="inline w-3 h-3 mr-1 text-neutral-400 dark:text-neutral-500" />{venta.created_at ? new Date(venta.created_at).toLocaleString('es-MX', {dateStyle: 'medium', timeStyle: 'short'}) : 'Fecha inválida'}</p></div>{expandedVenta === venta.id ? <ChevronUp className="w-4 h-4 text-neutral-500 dark:text-neutral-400 group-hover/venta:text-neutral-700 dark:group-hover/venta:text-neutral-200" /> : <ChevronDown className="w-4 h-4 text-neutral-500 dark:text-neutral-400 group-hover/venta:text-neutral-700 dark:group-hover/venta:text-neutral-200" />}</div>{expandedVenta === venta.id && ( <div className="mt-4 pt-4 border-t border-neutral-200 dark:border-neutral-700 text-xs space-y-3 animate-fade-in-slow"><div className="grid grid-cols-2 gap-x-4 gap-y-1"><p><strong className="font-medium text-neutral-600 dark:text-neutral-300">Estado:</strong> <span className="text-neutral-500 dark:text-neutral-400 capitalize">{venta.estado || 'N/A'}</span></p><p><strong className="font-medium text-neutral-600 dark:text-neutral-300">Método Pago:</strong> <span className="text-neutral-500 dark:text-neutral-400 capitalize">{(venta.metodo_pago_solicitado || 'N/A').replace("_", " ")}</span></p>{venta.nombre_cliente && <p><strong className="font-medium text-neutral-600 dark:text-neutral-300">Cliente:</strong> <span className="text-neutral-500 dark:text-neutral-400">{venta.nombre_cliente}</span></p>}{venta.trabajador_nombre && <p><strong className="font-medium text-neutral-600 dark:text-neutral-300">Atendió:</strong> <span className="text-neutral-500 dark:text-neutral-400">{venta.trabajador_nombre}</span></p>}</div>{venta.items_json?.length ? (<div className="pt-1"><p className="font-medium mb-2 text-neutral-600 dark:text-neutral-300">Productos Vendidos ({venta.items_json.length}):</p><ul className="space-y-2.5 text-neutral-600 dark:text-neutral-300 max-h-48 overflow-y-auto pr-1">{venta.items_json.map((item: ItemVenta, idx: number) => (<li key={item.upc + idx} className="bg-neutral-100/80 dark:bg-neutral-700/60 p-2.5 rounded-lg border border-neutral-200/70 dark:border-neutral-600/50 text-[0.7rem] leading-tight"><div className="flex justify-between items-center font-semibold text-neutral-700 dark:text-neutral-200 mb-0.5"><span className="truncate pr-2">{item.nombre_medicamento || 'Producto Desconocido'}</span><span className={`whitespace-nowrap text-[${ACCENT_COLOR_HEX}] dark:text-[${ACCENT_COLOR_HEX}]`}>${((parseFloat(String(item.cantidad)) || 0) * (parseFloat(String(item.precio_en_pesos)) || 0)).toFixed(2)}</span></div><div className="flex justify-between items-center text-neutral-500 dark:text-neutral-400 text-[0.65rem]"><span>Cant: {item.cantidad || 0} @ ${(parseFloat(String(item.precio_en_pesos)) || 0).toFixed(2)} c/u</span>{item.upc && <span className="font-mono">UPC: {item.upc}</span>}</div></li>))}</ul></div>) : ( <p className="text-neutral-400 italic text-center py-2">No hay detalles de productos para esta venta.</p> )}</div>)}</div>)) : 
                 (salesViewMode === 'all' && !loadingSalesData && (<p className="text-sm text-neutral-500 dark:text-neutral-400 text-center py-12 italic">No hay ventas (retail) registradas.</p>))
                }
            </div>)}
          </section>
        </div>

        <section className="bg-white dark:bg-neutral-800 rounded-2xl shadow-2xl dark:shadow-neutral-700/30 p-6 md:p-8 border border-neutral-200/60 dark:border-neutral-700/80 hover:shadow-3xl transition-shadow duration-300">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-6">
            <div className="flex items-center gap-5">
              <div className={`${cardIconWrapperBase} bg-gradient-to-br from-[rgba(${ACCENT_COLOR_RGB},0.15)] to-[rgba(${ACCENT_COLOR_RGB},0.05)] dark:from-[rgba(${ACCENT_COLOR_RGB},0.2)] dark:to-[rgba(${ACCENT_COLOR_RGB},0.1)]`}>
                <Users className={`${cardIconBase} text-[${ACCENT_COLOR_HEX}] dark:text-[${ACCENT_COLOR_HEX}]`} />
              </div>
              <div>
                <h2 className={cardTitleBase}>Equipo de Trabajo</h2>
                <p className={cardSubtitleBase}>Administra farmacéuticos y doctores</p>
              </div>
            </div>

            <button onClick={() => toggleSection('workersManagement')} className="p-2.5 text-neutral-400 dark:text-neutral-500 hover:text-neutral-600 dark:hover:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-700 rounded-xl transition-colors mr-1" title={expandedSections.workersManagement ? "Colapsar" : "Expandir"}>
              {expandedSections.workersManagement ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
            </button>
            <button onClick={() => { setWorkerFormData(initialWorkerFormData); setWorkerFormError(''); setShowWorkerForm(true); }} className="flex items-center gap-2.5 px-5 py-3 text-sm font-semibold text-white bg-gradient-to-r from-[#1995c8] to-[#1995c8]/80 hover:from-[#1995c8]/80 hover:to-[#1995c8] rounded-xl transition-all duration-200 ease-in-out shadow-lg hover:shadow-xl focus:outline-none focus-visible:ring-2 focus-visible:ring-[#1995c8]/60 dark:focus-visible:ring-[#1995c8]/60 focus-visible:ring-offset-2 dark:ring-offset-neutral-800 transform hover:-translate-y-0.5">
              <Plus className="w-5 h-5" strokeWidth={2.5} />Agregar
            </button>
          </div>

          {expandedSections.workersManagement && (
            <>
              {loadingWorkers ? (
                <ListSkeleton items={2} className="md:grid md:grid-cols-2 xl:grid-cols-3 gap-x-6 gap-y-8" />
              ) : workers.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-x-6 gap-y-8">
                  {workers.map((worker) => (
                    <div key={worker.id || worker.user_id} className="bg-neutral-50/80 dark:bg-neutral-700/50 p-6 rounded-xl border border-neutral-200 dark:border-neutral-700 hover:border-neutral-300/80 dark:hover:border-neutral-600 transition-all duration-200 ease-in-out shadow-lg hover:shadow-xl transform hover:scale-[1.01]">
                      <div className="flex flex-col justify-between h-full">
                        <div>
                          <h3 className="font-bold text-lg text-neutral-800 dark:text-neutral-100 truncate group" title={worker.nombre}>
                            {worker.nombre}
                            <span className="font-normal text-sm text-neutral-400 dark:text-neutral-500 ml-1 group-hover:text-neutral-500 dark:group-hover:text-neutral-400">({worker.rol === 'Doctor' ? 'Doctor' : 'Farmacéutico'})</span>
                          </h3>
                          <a href={`mailto:${worker.email}`} className={`text-sm text-[${ACCENT_COLOR_HEX}] dark:text-[${ACCENT_COLOR_HEX}] hover:text-[#1995c8]/80 dark:hover:text-[#1995c8]/80 hover:underline transition-colors truncate block my-1`}>{worker.email}</a>
                          <p className="text-xs text-neutral-500 dark:text-neutral-400">Tel: {worker.telefono}</p>
                          <span className={`mt-3 inline-block px-3 py-1.5 rounded-full text-xs font-semibold ${ worker.rol === 'Doctor' ? 'bg-purple-100 dark:bg-purple-500/20 text-purple-700 dark:text-purple-300 ring-1 ring-purple-200/70 dark:ring-purple-500/30' : `bg-[${ACCENT_COLOR_HEX}]/10 dark:bg-[${ACCENT_COLOR_HEX}]/10 text-[${ACCENT_COLOR_HEX}] dark:text-[${ACCENT_COLOR_HEX}] ring-1 ring-[${ACCENT_COLOR_HEX}]/20 dark:ring-[${ACCENT_COLOR_HEX}]/30` }`}>
                            {worker.rol === 'Doctor' ? 'Doctor/a' : 'Farmacéutico/a'}
                          </span>
                          {worker.rol === 'Doctor' && (
                            <div className="text-xs text-neutral-500 dark:text-neutral-400 mt-3 space-y-1.5 border-t border-neutral-200 dark:border-neutral-700 pt-3">
                              <p>Cédula: <span className="font-medium text-neutral-600 dark:text-neutral-300">{worker.cedula_prof || 'N/A'}</span></p>
                              <p>Especialidad: <span className="font-medium text-neutral-600 dark:text-neutral-300">{worker.especialidad || 'N/A'}</span></p>
                            </div>
                          )}
                        </div>
                        {worker.user_id && tempPasswords[worker.user_id] && (
                          <div className="mt-5 pt-4 border-t border-neutral-200 dark:border-neutral-700">
                            <label className="block text-xs font-medium text-neutral-500 dark:text-neutral-400 mb-1.5">Contraseña Temporal:</label>
                            <div className="flex items-center gap-2 bg-white dark:bg-neutral-900/50 px-3.5 py-2.5 rounded-lg border border-neutral-300 dark:border-neutral-600 shadow-sm w-full justify-between">
                              <span className="text-sm font-mono text-neutral-700 dark:text-neutral-200 tracking-wider">{showPasswords[worker.user_id] ? tempPasswords[worker.user_id] : '••••••••'}</span>
                              <button onClick={() => setShowPasswords((prev) => ({...prev, [worker.user_id!]: !prev[worker.user_id!]}))} className={`text-neutral-400 dark:text-neutral-500 hover:text-[${ACCENT_COLOR_HEX}] dark:hover:text-[${ACCENT_COLOR_HEX}] transition-colors`} title={showPasswords[worker.user_id!] ? 'Ocultar' : 'Mostrar'}>
                                {showPasswords[worker.user_id!] ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                              </button>
                            </div>
                            <p className="text-[0.7rem] text-red-500/90 dark:text-red-400/90 mt-2 text-center font-medium leading-tight">¡Asegúrate de compartir esta contraseña de forma segura y pedir que la cambien!</p>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-16">
                  <Users className="w-20 h-20 text-neutral-300 dark:text-neutral-600 mx-auto mb-6" />
                  <p className="text-xl text-neutral-500 dark:text-neutral-400 italic">Aún no hay trabajadores registrados.</p>
                  <p className="text-base text-neutral-400 dark:text-neutral-500 mt-3">Utiliza el botón "Agregar" para añadir miembros a tu equipo.</p>
                </div>
              )}
            </>
          )}
        </section>

        {showWorkerForm && (
           <div className="fixed inset-0 bg-black/70 backdrop-blur-md flex items-center justify-center p-4 z-[100] transition-opacity duration-300" style={{ animation: 'fade-in 0.3s ease-out forwards' }}>
             <div className="bg-white dark:bg-neutral-800 rounded-2xl shadow-2xl p-7 sm:p-10 max-w-lg w-full m-4 max-h-[95vh] overflow-y-auto" style={{ animation: 'slide-up-modal 0.4s ease-out forwards' }}>
                <div className="flex justify-between items-center mb-8"><h3 className="text-2xl font-bold text-neutral-800 dark:text-neutral-100 tracking-tight">Agregar Nuevo Trabajador</h3><button onClick={() => setShowWorkerForm(false)} className="text-neutral-400 dark:text-neutral-500 hover:text-neutral-600 dark:hover:text-neutral-300 p-2 rounded-full hover:bg-neutral-100 dark:hover:bg-neutral-700 transition-colors -mr-2"><X className="h-6 w-6" /></button></div>
                <form onSubmit={handleWorkerSubmit} className="space-y-6">{[{ label: "Nombre Completo", name: "nombre", type: "text", required: true },{ label: "Email", name: "email", type: "email", required: true },{ label: "Teléfono", name: "telefono", type: "tel", required: true },].map(field => (<div key={field.name}><label htmlFor={`${field.name}_worker`} className="block text-sm font-semibold text-neutral-700 dark:text-neutral-200 mb-1.5">{field.label}</label><input type={field.type} name={field.name} id={`${field.name}_worker`} value={(workerFormData as any)[field.name]} onChange={handleWorkerInputChange} className="form-input mt-1 block w-full px-4 py-3 border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-700 text-neutral-900 dark:text-neutral-100 rounded-xl shadow-sm focus:outline-none focus:ring-2 focus:ring-[#1995c8] dark:focus:ring-[#1995c8] focus:border-[#1995c8] dark:focus:border-[#1995c8] sm:text-sm placeholder-neutral-400 dark:placeholder-neutral-500 transition-shadow focus:shadow-md" required={field.required} placeholder={`Escribe el ${field.label.toLowerCase()}...`}/></div>))}<div><label htmlFor="rol_worker" className="block text-sm font-semibold text-neutral-700 dark:text-neutral-200 mb-1.5">Rol Principal</label><select name="rol" id="rol_worker" value={workerFormData.rol} onChange={handleWorkerInputChange} className="form-select mt-1 block w-full px-4 py-3 border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-700 text-neutral-900 dark:text-neutral-100 rounded-xl shadow-sm focus:outline-none focus:ring-2 focus:ring-[#1995c8] dark:focus:ring-[#1995c8] focus:border-[#1995c8] dark:focus:border-[#1995c8] sm:text-sm transition-shadow focus:shadow-md"><option value="farmaceutico">Farmacéutico/a</option><option value="Doctor">Doctor/a</option></select></div>{workerFormData.rol === 'Doctor' && (<><div><label htmlFor="cedula_prof_worker" className="block text-sm font-semibold text-neutral-700 dark:text-neutral-200 mb-1.5">Cédula Profesional (Doctor)</label><input type="text" name="cedula_prof" id="cedula_prof_worker" value={workerFormData.cedula_prof || ''} onChange={handleWorkerInputChange} className="form-input mt-1 block w-full px-4 py-3 border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-700 text-neutral-900 dark:text-neutral-100 rounded-xl shadow-sm focus:outline-none focus:ring-2 focus:ring-[#1995c8] dark:focus:ring-[#1995c8] focus:border-[#1995c8] dark:focus:border-[#1995c8] sm:text-sm placeholder-neutral-400 dark:placeholder-neutral-500 transition-shadow focus:shadow-md" placeholder="Cédula Profesional" required /></div><div><label htmlFor="especialidad_worker" className="block text-sm font-semibold text-neutral-700 dark:text-neutral-200 mb-1.5">Especialidad (Doctor)</label><input type="text" name="especialidad" id="especialidad_worker" value={workerFormData.especialidad || ''} onChange={handleWorkerInputChange} className="form-input mt-1 block w-full px-4 py-3 border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-700 text-neutral-900 dark:text-neutral-100 rounded-xl shadow-sm focus:outline-none focus:ring-2 focus:ring-[#1995c8] dark:focus:ring-[#1995c8] focus:border-[#1995c8] dark:focus:border-[#1995c8] sm:text-sm placeholder-neutral-400 dark:placeholder-neutral-500 transition-shadow focus:shadow-md" placeholder="Ej. Cardiología, Pediatría" required /></div></>)}{workerFormError && (<div className="text-red-600 dark:text-red-400 text-sm font-medium p-4 bg-red-50 dark:bg-red-500/20 rounded-xl border border-red-200 dark:border-red-500/30 flex items-start gap-2.5 shadow-sm"><AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5 text-red-500 dark:text-red-400" /> <span className="leading-snug">{workerFormError}</span></div>)}<div className="flex justify-end gap-4 pt-6"><button type="button" onClick={() => setShowWorkerForm(false)} disabled={isWorkerSubmitting} className="px-6 py-3 text-sm font-semibold text-neutral-700 dark:text-neutral-200 bg-neutral-100 dark:bg-neutral-700 hover:bg-neutral-200 dark:hover:bg-neutral-600 rounded-xl transition-colors disabled:opacity-70 border border-neutral-200 dark:border-neutral-600 shadow-sm">Cancelar</button><button type="submit" disabled={isWorkerSubmitting} className="px-6 py-3 text-sm font-semibold text-white bg-gradient-to-r from-[#1995c8] to-[#1995c8]/80 hover:from-[#1995c8]/80 hover:to-[#1995c8] rounded-xl transition-all duration-200 flex items-center justify-center disabled:opacity-70 disabled:cursor-wait shadow-lg hover:shadow-xl focus:outline-none focus-visible:ring-2 focus-visible:ring-[#1995c8]/60 dark:focus-visible:ring-[#1995c8]/60 focus-visible:ring-offset-2 dark:ring-offset-neutral-800 transform hover:-translate-y-0.5">{isWorkerSubmitting ? (<><Loader2 className="w-5 h-5 mr-2.5 animate-spin" strokeWidth={2.5}/> Guardando...</>) : ('Guardar Trabajador')}</button></div></form>
            </div>
           </div>
        )}
      </div>
      <style>{`
        .form-select { background-image: url("data:image/svg+xml,%3csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 20 20'%3e%3cpath stroke='%2364748b' stroke-linecap='round' stroke-linejoin='round' stroke-width='1.5' d='M6 8l4 4 4-4'/%3e%3c/svg%3e"); background-position: right 0.75rem center; background-repeat: no-repeat; background-size: 1.25em 1.25em; -webkit-appearance: none; -moz-appearance: none; appearance: none; padding-right: 2.75rem; }
        html.dark .form-select { background-image: url("data:image/svg+xml,%3csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 20 20'%3e%3cpath stroke='%239ca3af' stroke-linecap='round' stroke-linejoin='round' stroke-width='1.5' d='M6 8l4 4 4-4'/%3e%3c/svg%3e"); }
        @keyframes fade-in { from { opacity: 0; } to { opacity: 1; } }
        .animate-fade-in-slow { animation: fade-in 0.5s ease-out forwards; }
        @keyframes slide-up-modal { from { opacity: 0.5; transform: translateY(30px) scale(0.98); } to { opacity: 1; transform: translateY(0) scale(1); } }
        .recharts-default-legend { padding-top: 10px !important; }
        .recharts-tooltip-wrapper { outline: none !important; z-index: 1000 !important; }
        .recharts-cartesian-axis-tick-value { font-family: inherit; } 
        .overflow-y-auto.pr-1::-webkit-scrollbar { display: none; }
        .overflow-y-auto.pr-1 { -ms-overflow-style: none; scrollbar-width: none; }
      `}</style>
    </div>
  );
}