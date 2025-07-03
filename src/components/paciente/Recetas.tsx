import { useState, useEffect } from 'react';
import {
  Download,
  ChevronDown,
  ChevronUp,
  Calendar as CalendarIcon,
  X,
  ChevronRight,
  HeartPulse,
  Thermometer,
  Scale,
  Stethoscope,
  AlertCircle,
  ClipboardList,
  User,
  Building2, // Icono para Farmacia
  Search // FIX: Imported Search icon
} from 'lucide-react';
import supabase from '../../lib/supabaseClient'; // Asegúrate de que esta ruta sea correcta
import jsPDF from 'jspdf';

// Extend the autoTable type definition for jspdf
// This is needed for doc.lastAutoTable, though we avoided autoTable for vitals.
// Keeping it just in case it's used elsewhere or for compatibility.
declare module 'jspdf' {
    interface jsPDF {
        lastAutoTable: {
            finalY: number;
            // Also add the page number if using page breaks
            pageNumber?: number;
        };
    }
}

// Interfaz para la información detallada de la farmacia
interface FarmaciaInfo {
  nombre: string;
  ubicacion?: string | null;
  telefono?: string | null;
}

// Interfaz principal de la receta
interface Receta {
  id: string;
  fecha_emision: string; // timestamptz
  proxima_consulta?: string | null; // date
  paciente_id: string;
  paciente_nombre: string;
  doctor_id: string;
  doctor_nombre: string;
  doctor_cedula?: string | null; // FIX: Added doctor_cedula property
  // Ajusta el tipo 'any' si sabes la estructura exacta de medicamentos y medicamentos_dispensados_detalle
  medicamentos: Array<any> | null; // Assuming Array of objects { nombre, dosis, frecuencia, duracion } or just strings, allow null
  indicaciones: string | null;
  diagnostico: string | null; // Keeping this field as it's in your schema
  descargable: boolean;
  farmacia_info?: FarmaciaInfo | null;
  frecuencia_cardiaca?: number | null;
  frecuencia_respiratoria?: number | null;
  temperatura_corporal?: number | null;
  tension_arterial?: string | null;
  peso?: number | null;
  altura?: number | null;
  imc?: number | null; // Can be number or null
  blood_type?: string | null;
  allergies?: string | null;
  motivo_consulta: string | null;
  antecedentes?: string | null;
  exploracion_fisica?: string | null;
  plan_tratamiento?: string | null;
  recomendaciones?: string | null;
  observaciones?: string | null;
   // Añadidos basados en tu esquema DB si los necesitas en el frontend
  estado_dispensacion?: string | null;
  medicamentos_dispensados_detalle?: any | null; // Could be jsonb, allow any or more specific type
  fecha_dispensacion?: string | null; // timestamptz or date? Assuming timestamptz if fetched
  doctor_firma?: string | null; // Added for fetched data in handleDownload, but we are removing the fetch for now
}

const Recetas = () => {
  const [recetas, setRecetas] = useState<Receta[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [selectedReceta, setSelectedReceta] = useState<Receta | null>(null);
  const [fechaFilter, setFechaFilter] = useState<string>('');
  const [searchTerm, setSearchTerm] = useState<string>(''); // FIX: Uncommented and activated search term state
  // Sort key ahora puede ser fecha_emision, configurado por defecto descendente
  const [sortConfig, setSortConfig] = useState<{ key: keyof Receta; direction: 'asc' | 'desc' } | null>({ key: 'fecha_emision', direction: 'desc' });
  const [mobileView, setMobileView] = useState<'list' | 'detail'>('list');

  const fetchRecetas = async () => {
    try {
      setLoading(true);
      setRecetas([]); // Clear previous data

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Usuario no autenticado');

      const { data: pacienteData, error: pacienteError } = await supabase
        .from('patients')
        .select('id')
        .eq('user_id', user.id)
        .single();

      if (pacienteError || !pacienteData) {
          console.warn('Paciente no encontrado para el usuario autenticado:', pacienteError);
           setRecetas([]);
           setLoading(false);
           return;
      }

      // Consulta para traer recetas del paciente, incluyendo doctor y farmacia info
      // Esta consulta trae *todos* los campos que necesitará el PDF para el detalle/descarga.
      // Esto es más eficiente que hacer un fetch separado en handleDownload si el detalle se muestra de todos modos.
      // Sin embargo, si solo necesitas la lista, podrías optimizar el fetch inicial para traer menos campos.
      // Por ahora, mantendremos el fetch inicial detallado, asumiendo que la UI de detalle lo usa.
      let query = supabase
        .from('recetas')
        .select(`
          id, fecha_emision, proxima_consulta, paciente_id, doctor_id, medicamentos,
          indicaciones, diagnostico, descargable, frecuencia_cardiaca, frecuencia_respiratoria,
          temperatura_corporal, tension_arterial, peso, altura, imc, blood_type, allergies,
          motivo_consulta, antecedentes, exploracion_fisica, plan_tratamiento, recomendaciones,
          observaciones, estado_dispensacion, medicamentos_dispensados_detalle, fecha_dispensacion,
          pacientes:paciente_id(nombre_completo),
          doctores:doctor_id(nombre, cedula_prof), 
          farmacia_info:id_farmacia(nombre, ubicacion, telefono)
        `) // FIX: Fetched cedula_prof from doctores
        .eq('paciente_id', pacienteData.id)
        .order('fecha_emision', { ascending: false }); // Order by timestamptz

      if (fechaFilter) {
        // Filter by date part of emission date (timestamptz)
        const startOfDay = `${fechaFilter}T00:00:00.000Z`;
        const endOfDay = `${fechaFilter}T23:59:59.999Z`;

        query = query.gte('fecha_emision', startOfDay)
                     .lt('fecha_emision', endOfDay);
      }

      const { data, error } = await query;
      if (error) throw error;

      const formattedData: Receta[] = data.map((receta: any) => ({
        ...receta,
        // Ensure related data fields are correctly mapped and handle potential nulls/undefined
        paciente_nombre: receta.pacientes?.nombre_completo || 'Paciente no encontrado',
        doctor_nombre: receta.doctores?.nombre || 'Doctor no encontrado',
        doctor_cedula: receta.doctores?.cedula_prof ?? null, // FIX: Mapped cedula_prof to doctor_cedula
        medicamentos: Array.isArray(receta.medicamentos) ? receta.medicamentos : [], // Ensure medications is always an array
        farmacia_info: receta.farmacia_info, // Already object or null
        // Format proxima_consulta if it exists, keep as string 'YYYY-MM-DD' or null
        proxima_consulta: receta.proxima_consulta ? new Date(receta.proxima_consulta).toISOString().split('T')[0] : null,
        // Use ?? null to explicitly set to null if undefined/null
        frecuencia_cardiaca: receta.frecuencia_cardiaca ?? null,
        frecuencia_respiratoria: receta.frecuencia_respiratoria ?? null,
        temperatura_corporal: receta.temperatura_corporal ?? null,
        tension_arterial: receta.tension_arterial ?? null,
        peso: receta.peso ?? null,
        altura: receta.altura ?? null,
        imc: receta.imc ?? null, // Ensure IMC is null if not present (generated might be null)
        blood_type: receta.blood_type ?? null,
        allergies: receta.allergies ?? null,
        motivo_consulta: receta.motivo_consulta ?? null,
        indicaciones: receta.indicaciones ?? null,
        diagnostico: receta.diagnostico ?? null,
        antecedentes: receta.antecedentes ?? null,
        exploracion_fisica: receta.exploracion_fisica ?? null,
        plan_tratamiento: receta.plan_tratamiento ?? null,
        recomendaciones: receta.recomendaciones ?? null,
        observaciones: receta.observaciones ?? null,
        estado_dispensacion: receta.estado_dispensacion ?? null,
        medicamentos_dispensados_detalle: receta.medicamentos_dispensados_detalle ?? null,
        fecha_dispensacion: receta.fecha_dispensacion ?? null,
        doctor_firma: null, // Firma is not available in this list fetch
      }));

      setRecetas(formattedData);
    } catch (error) {
      console.error('Error fetching recetas:', error);
      setRecetas([]); // Ensure the list is empty in case of error
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // Initial fetch and re-fetch when fechaFilter changes
    fetchRecetas();
     // Including fetchRecetas in the dependency array might cause issues if it's not wrapped in useCallback.
     // However, fechaFilter needs to trigger the fetch. Let's keep fetchRecetas out for simplicity assuming it's stable enough,
     // but be aware this is a potential source of infinite loops if fetchRecetas changes on every render.
  }, [fechaFilter]); // Depend only on fechaFilter (and potentially other state that influences the query)


    // Effect to handle mobile view detail dismissal on orientation change or resize
     useEffect(() => {
         const handleResize = () => {
             // If switching to desktop (>= 768px) and detail view is active,
             // the modal handles closing, so no change needed to mobileView state.
             if (window.innerWidth >= 768) {
                  // If we are on desktop, ensure mobile view is list
                  if (mobileView === 'detail') {
                       // But only switch if no recipe is selected, otherwise the modal is open
                       if (!selectedReceta) {
                          setMobileView('list');
                       }
                  }
             } else { // Mobile view
                 // If on mobile and a recipe is selected, ensure mobileView is detail
                 if (selectedReceta) {
                     setMobileView('detail');
                 } else {
                     // If on mobile and no recipe is selected, ensure mobileView is list
                     setMobileView('list');
                 }
             }
         };

         window.addEventListener('resize', handleResize);

         // Cleanup
         return () => window.removeEventListener('resize', handleResize);
         // Depend on selectedReceta to react when modal is closed on desktop
     }, [selectedReceta, mobileView]); // Re-run if mobileView or selectedReceta changes

   // Effect to ensure mobile view is 'detail' when selectedReceta becomes non-null on mobile
    useEffect(() => {
        if (selectedReceta && window.innerWidth < 768) {
            setMobileView('detail');
        }
         // Note: Setting mobileView('list') when selectedReceta is null on desktop is handled by the resize observer now
    }, [selectedReceta]); // Depend on selectedReceta


  // Filtered and Sorted Recetas
  const filteredRecetas = recetas.filter(receta => {
    const searchLower = searchTerm.toLowerCase();
    if (!searchTerm) return true; // If no search term, include all

    // Search in doctor name, diagnosis, motivo, indications, and medication names
    const matchesSearch =
      (receta.doctor_nombre || '').toLowerCase().includes(searchLower) ||
      (receta.diagnostico || '').toLowerCase().includes(searchLower) ||
      (receta.motivo_consulta || '').toLowerCase().includes(searchLower) ||
      (receta.indicaciones || '').toLowerCase().includes(searchLower) || // Added indications to search
      (receta.medicamentos || []).some(m => // Check if medicamentos is an array and iterate
          typeof m === 'string'
            ? m.toLowerCase().includes(searchLower)
            : (m?.nombre || '').toLowerCase().includes(searchLower) // Use optional chaining and handle null name
         );
    return matchesSearch;
  });


  const sortedRecetas = [...filteredRecetas].sort((a, b) => {
    if (!sortConfig) {
         // If no sortConfig, maintain original fetch order (fecha_emision desc is default fetch)
         return 0;
    }

    const key = sortConfig.key;
    const direction = sortConfig.direction;

    const aValue = a[key];
    const bValue = b[key];

    // Handle null/undefined consistently for comparison
    const aIsNull = aValue == null;
    const bIsNull = bValue == null;

    if (aIsNull && bIsNull) return 0;
    if (aIsNull) return direction === 'asc' ? 1 : -1; // Nulls come after non-nulls in asc, before in desc
    if (bIsNull) return direction === 'asc' ? -1 : 1; // Nulls come before non-nulls in asc, after in desc

    // Date comparison for timestamptz (fecha_emision)
    if (key === 'fecha_emision') {
        const dateA = new Date(aValue as string).valueOf();
        const dateB = new Date(bValue as string).valueOf();
         if (isNaN(dateA) || isNaN(dateB)) {
             console.warn(`Fecha inválida encontrada durante la ordenación para la clave "${String(key)}":`, aValue, bValue);
             return 0; // Tratar como igual si las fechas son inválidas
         }
        if (dateA < dateB) return direction === 'asc' ? -1 : 1;
        if (dateA > dateB) return direction === 'asc' ? 1 : -1;
        return 0;
    }

     // Numeric comparison
     if (typeof aValue === 'number' && typeof bValue === 'number') {
         if (aValue < bValue) return direction === 'asc' ? -1 : 1;
         if (aValue > bValue) return direction === 'asc' ? 1 : -1;
         return 0;
     }

     // Fallback to string comparison
    const stringA = String(aValue || ''); // Use empty string for null/undefined for localeCompare
    const stringB = String(bValue || '');
    const comparison = stringA.localeCompare(stringB, undefined, { sensitivity: 'base' }); // Case-insensitive

    return direction === 'asc' ? comparison : -comparison;

  });

  const requestSort = (key: keyof Receta) => {
    let direction: 'asc' | 'desc' = 'asc';
    // If currently sorted by this key, toggle direction
    if (sortConfig?.key === key) {
        direction = sortConfig.direction === 'asc' ? 'desc' : 'asc';
    } else {
        // If sorting by a new key, default is asc, UNLESS it's fecha_emision (default desc in fetch/UI)
        direction = (key === 'fecha_emision') ? 'desc' : 'asc';
    }
    setSortConfig({ key, direction });
  };
  // --- FUNCIÓN handleRowClick (YA ESTABA AQUÍ EN TU CÓDIGO) ---
  // Asegúrate de que esta función esté definida dentro del componente Recetas
  // donde están los estados `selectedReceta` y `mobileView`.
  const handleRowClick = (receta: Receta) => {
    setSelectedReceta(receta);
    if (window.innerWidth < 768) {
      setMobileView('detail');
    }
  };


   // --- Funciones Auxiliares para el PDF (Definidas UNA VEZ dentro del componente Recetas) ---
   // ESTAS SON LAS FUNCIONES AÑADIDAS / CORREGIDAS PARA EL PDF

    // Helper para formatear fecha corta (DD/MM/YYYY) para PDF
    const formatDateShortPDF = (dateString: string | null | undefined): string => {
        if (!dateString) return 'N/A';
        try {
            const date = new Date(dateString);
             if (isNaN(date.getTime())) return 'Fecha inválida'; // Validar fecha
            const day = date.getDate().toString().padStart(2, '0');
            const month = (date.getMonth() + 1).toString().padStart(2, '0'); // Month is 0-indexed
            const year = date.getFullYear();
            return `${day}/${month}/${year}`;
        } catch (e) {
            console.error("Error formatting date for PDF:", dateString, e);
            return 'Fecha inválida';
        }
    };

    // Helper para formatear fecha y hora (DD/MM/YYYY HH:MM) para PDF
   const formatDateTimePDF = (dateString: string | null | undefined): string => {
       if (!dateString) return 'N/A';
       try {
           const date = new Date(dateString);
            if (isNaN(date.getTime())) return 'Fecha/Hora inválida'; // Validar fecha
           const day = date.getDate().toString().padStart(2, '0');
           const month = (date.getMonth() + 1).toString().padStart(2, '0'); // Month is 0-indexed
           const year = date.getFullYear();
           const hours = date.getHours().toString().padStart(2, '0');
           const minutes = date.getMinutes().toString().padStart(2, '0');
           return `${day}/${month}/${year} ${hours}:${minutes}`;
       } catch (e) {
           console.error("Error formatting date/time for PDF:", dateString, e);
           return 'Fecha/Hora inválida';
       }
   };

     // Helper para agregar texto general dentro de una columna específica en PDF, con salto de línea y alineación
     // Pasa la instancia de jsPDF como primer argumento
     const addColumnText = (docInstance: jsPDF, text: string | undefined | null, colX: number, startY: number, colWidth: number, fontStyle: 'normal' | 'bold' = 'normal', size: number = 9, align: 'left' | 'center' | 'right' = 'left'): number => {
          if (text === null || text === undefined || String(text).trim() === '') return startY;
          const textValue = String(text).trim();
          if (textValue === '') return startY;

          docInstance.setFontSize(size);
          docInstance.setFont('helvetica', fontStyle);
           // Asegurar que el ancho sea positivo para splitTextToSize
           const safeColWidth = Math.max(1, colWidth);
          const lines = docInstance.splitTextToSize(textValue, safeColWidth);

          let actualX = colX;
          // En jsPDF, para arrays de texto (resultado de splitTextToSize), align 'center'/'right'
          // NO centra/alinea cada línea, sino el bloque completo si se pasa width.
          // Si no se pasa width, simplemente pone el inicio/final de cada línea en X.
          // Para multi-línea centrada/derecha, X debe ser el centro/borde derecho de la columna.
          if (align === 'center') {
               actualX = colX + colWidth / 2;
          } else if (align === 'right') {
              actualX = colX + colWidth;
          }

          docInstance.text(lines, actualX, startY, { align: align });
          return startY + lines.length * (docInstance.getLineHeight() / docInstance.internal.scaleFactor);
    };

     // Helper para agregar pares Etiqueta: Valor en la columna izquierda del PDF (usado para vitales)
      // Pasa la instancia de jsPDF y las coordenadas/ancho de la columna
     const addLeftColLabelValue = (docInstance: jsPDF, label: string, value: string | number | null | undefined, startY: number, colX: number, colWidth: number): number => {
        const valueText = String(value ?? '').trim();
         if (valueText === '') return startY;

         let currentY = startY;
         const labelText = `${label}:`;
         const paddingAfterLabel = 2;
         docInstance.setFontSize(8); // Tamaño para vitals
         docInstance.setFont('helvetica', 'bold');
         const labelWidth = docInstance.getTextWidth(labelText);

         // Calcular espacio disponible para el valor
         const valueTextX = colX + labelWidth + paddingAfterLabel;
         const availableWidthForValue = colWidth - labelWidth - paddingAfterLabel;

          // Si la etiqueta es demasiado ancha, manejar el salto de línea para el valor
          if (availableWidthForValue <= 0) {
               console.warn(`Etiqueta "${labelText}" demasiado ancha para espacio disponible en columna izquierda.`);
                docInstance.text(labelText, colX, currentY);
               currentY += docInstance.getLineHeight() / docInstance.internal.scaleFactor;
               docInstance.setFont('helvetica', 'normal');
               const valueLines = docInstance.splitTextToSize(valueText, colWidth); // Usar ancho completo si no cabe al lado
               docInstance.text(valueLines, colX + 5, currentY); // Sangría para valor
               return currentY + valueLines.length * (docInstance.getLineHeight() / docInstance.internal.scaleFactor) + 2;
          }


         // Dibujar Etiqueta
         docInstance.text(labelText, colX, currentY);

         // Dibujar Valor
         docInstance.setFont('helvetica', 'normal');
         const safeAvailableWidth = Math.max(1, availableWidthForValue);
         const valueLines = docInstance.splitTextToSize(valueText, safeAvailableWidth);
         const textHeight = valueLines.length * (docInstance.getLineHeight() / docInstance.internal.scaleFactor);

         docInstance.text(valueLines, valueTextX, currentY);

         return currentY + textHeight + 2; // Agregar padding después del bloque
     };

     // Helper para agregar pares Etiqueta: Valor o bloques de texto en la columna derecha del PDF (usado para info clínica/farmacéutico)
      // Pasa la instancia de jsPDF y las coordenadas/ancho de la columna
     const addRightColTextBlock = (docInstance: jsPDF, label: string, text: string | undefined | null, startY: number, colX: number, colWidth: number, boldLabel: boolean = true): number => {
        const textValue = String(text || '').trim();
        if (textValue === '') return startY;

        let currentY = startY;
        const labelText = `${label}:`;
        docInstance.setFontSize(9); // Tamaño para texto clínico
        docInstance.setFont('helvetica', boldLabel ? 'bold' : 'normal');
        const labelWidth = docInstance.getTextWidth(labelText);
        const paddingAfterLabel = 2;

        // Posición y ancho disponible para el texto del valor
        const textX = colX + labelWidth + paddingAfterLabel;
        const availableWidth = colWidth - labelWidth - paddingAfterLabel;

         // Si la etiqueta es demasiado ancha, manejar el salto de línea para el valor
          if (availableWidth <= 0) {
              console.warn(`Etiqueta "${labelText}" demasiado ancha para espacio disponible en columna derecha.`);
              docInstance.setFont('helvetica', boldLabel ? 'bold' : 'normal');
              docInstance.text(labelText, colX, currentY);
              currentY += docInstance.getLineHeight() / docInstance.internal.scaleFactor;
              docInstance.setFont('helvetica', 'normal');
              const valueLines = docInstance.splitTextToSize(textValue, colWidth); // Usar ancho completo
              docInstance.text(valueLines, colX + 5, currentY); // Sangría
              return currentY + valueLines.length * (docInstance.getLineHeight() / docInstance.internal.scaleFactor) + 2;
          }


         // Dibujar Etiqueta
        docInstance.text(labelText, colX, currentY);

         // Dibujar Texto Valor
        docInstance.setFont('helvetica', 'normal'); // Fuente normal para el valor
        const safeAvailableWidth = Math.max(1, availableWidth);
        const lines = docInstance.splitTextToSize(textValue, safeAvailableWidth);
        const textHeight = lines.length * (docInstance.getLineHeight() / docInstance.internal.scaleFactor);

        docInstance.text(lines, textX, currentY);

        currentY += textHeight;

        return currentY + 2; // Agregar padding pequeño
    };


    // --- Función Principal de Descarga del PDF ---
    // Esta función ahora usa los datos ya cargados en el estado `recetas`
        const handleDownload = async (id: string, e: React.MouseEvent) => {
        e.stopPropagation(); // Prevenir clic en fila

        try {
            const receta = recetas.find(r => r.id === id);
            if (!receta) {
                 console.error(`Receta con ID ${id} no encontrada en el estado local.`);
                 alert('Datos de receta no disponibles para descarga. Inténtalo de nuevo.');
                 return;
            }
            const fullData: Receta = receta;

            const doc = new jsPDF();
            const margin = 15;
            const pageWidth = doc.internal.pageSize.width;
            const pageHeight = doc.internal.pageSize.height;
            const contentWidth = pageWidth - 2 * margin;

            // --- Definir Columnas ---
            const leftColumnX = margin;
            const leftColumnWidth = contentWidth * 0.55;
            const rightColumnWidth = contentWidth * 0.45 - 5;
            const separatorLineX = margin + leftColumnWidth + 2.5;
            const rightColumnX = margin + leftColumnWidth + 5;

            let currentYLeft = margin; // Cursor para el lado izquierdo superior
            let currentYRight = margin; // Cursor para el lado derecho superior (inicia en el margen superior)


            // --- Sección Superior ---

            // Bloque Izquierdo Superior (Institución)
            doc.setFontSize(8);
            doc.setFont('helvetica', 'normal');
            doc.text('POWERED BY CYNOSURE ', leftColumnX, currentYLeft);
            currentYLeft += 4;

            doc.setFontSize(10);
            doc.setFont('helvetica', 'normal');
            doc.text('DIRECCIÓN DE SALUD CARELUX', leftColumnX, currentYLeft);
            currentYLeft += 5;
            doc.setFont('helvetica', 'bold');
            doc.text('RECETA INDIVIDUAL', leftColumnX, currentYLeft);
            currentYLeft += 5;


            // --- Bloque Paciente (Ahora en la Columna Izquierda, debajo de RECETA INDIVIDUAL) ---
            


            // Info Farmacia (Debajo de Paciente, Columna Izquierda)
             if (fullData.farmacia_info?.nombre) {
                 currentYLeft += 4; // Espacio antes del bloque
                 doc.setFontSize(9);
                 doc.setFont('helvetica', 'bold');
                 doc.text('Farmacia de Emisión:', leftColumnX, currentYLeft);
                 currentYLeft += 5;

                 doc.setFontSize(8);
                 doc.setFont('helvetica', 'normal');
                 currentYLeft = addColumnText(doc, `Nombre: ${String(fullData.farmacia_info.nombre)}`, leftColumnX + 5, currentYLeft, leftColumnWidth - 5, 'normal', 8); // Con sangría
                 if (fullData.farmacia_info.ubicacion) {
                      currentYLeft = addColumnText(doc, `Ubicación: ${String(fullData.farmacia_info.ubicacion)}`, leftColumnX + 5, currentYLeft, leftColumnWidth - 5, 'normal', 8); // Con sangría
                 }
                  if (fullData.farmacia_info.telefono) {
                      currentYLeft = addColumnText(doc, `Teléfono: ${String(fullData.farmacia_info.telefono)}`, leftColumnX + 5, currentYLeft, leftColumnWidth - 5, 'normal', 8); // Con sangría
                  }
                  currentYLeft += 5; // Espacio después del bloque
             } else {
                  currentYLeft += 5; // Espacio si no hay info
             }
             doc.setFontSize(9);
            doc.setFont('helvetica', 'bold');
            doc.text('PACIENTE', leftColumnX, currentYLeft); // Dibujar en la columna izquierda
            currentYLeft += 4; // Actualizar cursor izquierdo

            doc.setFont('helvetica', 'normal');
            // Usar addColumnText para manejar posible salto de línea del nombre
            currentYLeft = addColumnText(doc, String(fullData.paciente_nombre), leftColumnX, currentYLeft, leftColumnWidth, 'normal', 9); // Usar ancho de columna izquierda
            currentYLeft += 5; // Espacio después del nombre

            // Signos Vitales (Debajo de Info Farmacia, Columna Izquierda, texto plano)
            doc.setFontSize(8); // Establecer tamaño base para vitals
            doc.setFont('helvetica', 'normal'); // Establecer estilo base para vitals

            currentYLeft = addLeftColLabelValue(doc, 'Temperatura', fullData.temperatura_corporal != null ? `${fullData.temperatura_corporal} °C` : null, currentYLeft, leftColumnX, leftColumnWidth);
            currentYLeft = addLeftColLabelValue(doc, 'Frec. Cardíaca', fullData.frecuencia_cardiaca != null ? `${fullData.frecuencia_cardiaca} lpm` : null, currentYLeft, leftColumnX, leftColumnWidth);
            currentYLeft = addLeftColLabelValue(doc, 'Frec. Respiratoria', fullData.frecuencia_respiratoria != null ? `${fullData.frecuencia_respiratoria} rpm` : null, currentYLeft, leftColumnX, leftColumnWidth);
            currentYLeft = addLeftColLabelValue(doc, 'Tensión Arterial', fullData.tension_arterial && String(fullData.tension_arterial).trim() !== '' ? `${fullData.tension_arterial} mmHg` : null, currentYLeft, leftColumnX, leftColumnWidth);
            currentYLeft = addLeftColLabelValue(doc, 'Peso', fullData.peso != null ? `${fullData.peso} kg` : null, currentYLeft, leftColumnX, leftColumnWidth);
            currentYLeft = addLeftColLabelValue(doc, 'Altura', fullData.altura != null ? `${fullData.altura} cm` : null, currentYLeft, leftColumnX, leftColumnWidth);
            currentYLeft = addLeftColLabelValue(doc, 'IMC', fullData.imc != null && typeof fullData.imc === 'number' && !isNaN(fullData.imc) ? `${fullData.imc.toFixed(2)} kg/m²` : null, currentYLeft, leftColumnX, leftColumnWidth);
            currentYLeft = addLeftColLabelValue(doc, 'Tipo de Sangre', fullData.blood_type && String(fullData.blood_type).trim() !== '' ? String(fullData.blood_type) : null, currentYLeft, leftColumnX, leftColumnWidth);
            currentYLeft = addLeftColLabelValue(doc, 'Alergias', fullData.allergies && String(fullData.allergies).trim() !== '' ? String(fullData.allergies) : null, currentYLeft, leftColumnX, leftColumnWidth);

            currentYLeft += 5; // Espacio después del bloque de signos vitales


             // --- Bloque Derecho Superior (Doctor, Fecha, Folio, Código de Barras - SIN PACIENTE AQUÍ) ---
             // currentYRight ya está inicializado en `margin` al principio del top section.
             // Ya no necesitamos el Math.max basado en la altura del bloque paciente.
             // El contenido empezará desde `margin` en el lado derecho.


            // Continuar dibujando el lado derecho desde currentYRight (que es `margin`)
            doc.setFontSize(9); // Aumentamos un poco la fuente
            doc.setFont('helvetica', 'normal');

            // Línea: Nombre del doctor
            currentYRight = addColumnText(doc, `Dr. ${String(fullData.doctor_nombre)}`, rightColumnX, currentYRight, rightColumnWidth, 'normal', 9);
            currentYRight += 2; // Menos espacio entre líneas

            // Línea: Especialidad
            doc.setFont('helvetica', 'normal');
            currentYRight = addColumnText(doc, 'Medicina general', rightColumnX, currentYRight, rightColumnWidth, 'normal', 9);
            currentYRight += 1; // Menos espacio vertical final

             if (fullData.doctor_cedula) { // Verificar si el campo tiene valor
            doc.setFontSize(9); // Tamaño de fuente para la cédula (ajústalo si prefieres 8)
            doc.setFont('helvetica', 'normal'); // Estilo de fuente
            // Dibujar el texto de la cédula
           
            currentYRight = addColumnText(doc, `Cédula Prof.: ${String(fullData.doctor_cedula)}`, rightColumnX, currentYRight, rightColumnWidth, 'normal', 9);
            currentYRight += 2; // Añadir un pequeño espacio después de la línea de la cédula
          }

            // Fecha de Emisión
            doc.setFontSize(8);
            doc.setFont('helvetica', 'normal');
            doc.text('Fecha de la prescripción:', rightColumnX, currentYRight);
            currentYRight += 4;
            doc.setFont('helvetica', 'bold');
            currentYRight = addColumnText(doc, formatDateShortPDF(fullData.fecha_emision), rightColumnX, currentYRight, rightColumnWidth, 'bold', 8);
            currentYRight += 4;


            // Estado Dispensación (Repetido aquí para el layout superior)
            if (fullData.estado_dispensacion && String(fullData.estado_dispensacion).trim() !== '') {
                doc.setFontSize(8);
                doc.setFont('helvetica', 'bold');
                doc.text('Estado Dispensación:', rightColumnX, currentYRight);
                currentYRight += 4;
                doc.setFont('helvetica', 'normal');
                currentYRight = addColumnText(doc, String(fullData.estado_dispensacion), rightColumnX, currentYRight, rightColumnWidth, 'normal', 8);
                currentYRight += 4;
            }


            // Folio y Código de Barras Placeholder
            const barcodeRefNumber = `REF: ${fullData.id.substring(0, 12).toUpperCase()}`;

             const barcodeHeight = 15;
             const barcodeWidth = rightColumnWidth;
             const barcodeX = rightColumnX;
             currentYRight += 6; // Espacio antes del recuadro
             const barcodeY = currentYRight;

             doc.setLineWidth(0.5);
             doc.rect(barcodeX, barcodeY, barcodeWidth, barcodeHeight);

             // Dibujar líneas horizontales dentro del recuadro para simular el diseño
             doc.setLineWidth(0.1);
             const lineCount = 5;
             const lineSpacing = barcodeHeight / (lineCount + 1);
             for(let i = 1; i <= lineCount; i++) {
                 const ly = barcodeY + i * lineSpacing;
                 doc.line(barcodeX, ly, barcodeX + barcodeWidth, ly);
             }

             currentYRight += barcodeHeight + 2; // Espacio debajo del recuadro

             // Dibujar el número de referencia debajo del recuadro
             const textY = barcodeY + barcodeHeight + 4; // 4 unidades de espacio debajo del recuadro

              doc.setFontSize(8);
              doc.setFont('helvetica', 'normal');
              doc.text(barcodeRefNumber, barcodeX + barcodeWidth / 2, textY, { align: 'center' });

              currentYRight = textY + 5; // si quieres seguir dibujando debajo de eso




            // Determinar el inicio del área de contenido principal
            // Es el máximo de las Y alcanzadas en ambos lados superiores
            // currentYLeft ahora incluye el bloque de paciente y vitales
            // currentYRight ahora incluye Doctor, Fecha, Estado, Barcode
            const startContentY = Math.max(currentYLeft, currentYRight) + 10; // Añadir padding

            // Línea Horizontal debajo de la sección superior
            doc.setLineWidth(0.1);
            doc.line(margin, startContentY - 10, pageWidth - margin, startContentY - 10);

            // Línea Separadora Vertical (inicio)
            const startSeparatorY = startContentY - 3;

            // --- Área de Contenido Principal (Prescripción Izq, Info Clínica Der) ---
            let leftContentY = startContentY; // Cursor para columna izquierda principal
            let rightContentY = startContentY; // Cursor para columna derecha principal


            // Lista de Medicamentos (Columna Izquierda: PRESCRIPCIÓN)
            doc.setFontSize(10);
            doc.setFont('helvetica', 'bold');
            doc.text('PRESCRIPCIÓN', leftColumnX, leftContentY);
            leftContentY += 6;

            // Asegurar que fullData.medicamentos es un array para iterar
            const medicamentosToPrint = Array.isArray(fullData.medicamentos) ? fullData.medicamentos : [];

            if (medicamentosToPrint.length > 0) {
                let medNumber = 1;
                const medIndent = 5;
                const lineSpacing = doc.getLineHeight() / doc.internal.scaleFactor;
                const medPadding = 4;

                 for (const med of medicamentosToPrint) {
                     let medName = '';
                     let dosis = '';
                     let frecuencia = '';
                     let duracion = '';

                     if (typeof med === 'string') {
                         medName = med;
                     } else if (med && typeof med === 'object') {
                         medName = med.nombre || 'Medicamento Anónimo';
                         dosis = med.dosis || '';
                         frecuencia = med.frecuencia || '';
                         duracion = med.duracion || '';
                     } else {
                          medName = 'Formato Inválido';
                     }

                    const medNameText = `${medNumber}. ${String(medName)}`;
                    let detailsCombined = '';
                    if (dosis) detailsCombined += String(dosis);
                    if (frecuencia) detailsCombined += (detailsCombined ? ' / ' : '') + String(frecuencia);
                    if (duracion) detailsCombined += (detailsCombined ? ' / ' : '') + String(duracion);
                    const detailsText = detailsCombined.trim();

                    // Calcular altura antes de dibujar
                     doc.setFontSize(9);
                     doc.setFont('helvetica', 'bold');
                     const nameAvailableWidth = leftColumnWidth;
                     const nameLines = doc.splitTextToSize(medNameText, nameAvailableWidth);
                     const nameHeight = nameLines.length * lineSpacing;

                     let detailsHeight = 0;
                     if (detailsText) {
                         doc.setFont('helvetica', 'normal');
                         const detailsLines = doc.splitTextToSize(detailsText, leftColumnWidth - medIndent);
                         detailsHeight = detailsLines.length * lineSpacing;
                     }

                     const unitsLineHeight = doc.getLineHeight() / doc.internal.scaleFactor;

                     const medBlockHeightEstimate = nameHeight + detailsHeight + unitsLineHeight + medPadding + 2;

                     // Verificar salto de página
                     const remainingSpace = pageHeight - leftContentY - margin - 50; // Buffer para pie de página/firma
                     if (medBlockHeightEstimate > remainingSpace && remainingSpace < pageHeight * 0.3) {
                         doc.addPage();
                         leftContentY = margin;
                         rightContentY = margin; // Mantener cursors sincronizados en salto de página
                         // La línea separadora vertical se dibujará más tarde hasta el maxY alcanzado en la nueva página

                         // Opcional: Título continuado
                         doc.setFontSize(10);
                         doc.setFont('helvetica', 'bold');
                         doc.text('PRESCRIPCIÓN (cont.)', leftColumnX, leftContentY);
                         leftContentY += 6;
                     }


                     // Dibujar Nombre
                     doc.setFontSize(9);
                     doc.setFont('helvetica', 'bold');
                     doc.text(nameLines, leftColumnX, leftContentY);
                     leftContentY += nameHeight;


                     // Dibujar Detalles
                     if (detailsText) {
                         doc.setFont('helvetica', 'normal');
                         const detailsLines = doc.splitTextToSize(detailsText, leftColumnWidth - medIndent);
                         doc.text(detailsLines, leftColumnX + medIndent, leftContentY);
                         leftContentY += detailsHeight;
                     }

                     // Dibujar "Núm. envases / unidades:" y recuadro
                     doc.setFontSize(8);
                     doc.setFont('helvetica', 'normal');
                     const unitsLabel = 'Núm. envases / unidades:';
                     const unitsLabelWidth = doc.getTextWidth(unitsLabel);
                     const unitsBoxSize = 5;
                     const unitsLabelX = leftColumnX + medIndent;
                     const unitsBoxX = unitsLabelX + unitsLabelWidth + 2;
                     const unitsLineY = leftContentY + 2;

                     doc.text(unitsLabel, unitsLabelX, unitsLineY);
                     doc.rect(unitsBoxX, unitsLineY - unitsBoxSize + 1, unitsBoxSize, unitsBoxSize);

                     leftContentY += unitsLineHeight + 4;

                     leftContentY += medPadding;

                     medNumber++;
                 }


            } else {
                doc.setFontSize(9);
                doc.setFont('helvetica', 'italic');
                doc.text('No se recetaron medicamentos.', leftColumnX, leftContentY);
                leftContentY += 10;
            }


            // --- Información Clínica e Instrucciones (Columna Derecha Principal) ---
            // Usar el helper addRightColTextBlock
            let currentRightColContentY = startContentY; // Cursor para este bloque

             // Información Clínica
             doc.setFontSize(10);
             doc.setFont('helvetica', 'bold');
             doc.text('Información Clínica', rightColumnX, currentRightColContentY);
             currentRightColContentY += 6;

             doc.setFontSize(9);
             doc.setFont('helvetica', 'normal');

             currentRightColContentY = addRightColTextBlock(doc, 'Motivo de Consulta', fullData.motivo_consulta, currentRightColContentY, rightColumnX, rightColumnWidth, false);
             currentRightColContentY = addRightColTextBlock(doc, 'Antecedentes', fullData.antecedentes, currentRightColContentY, rightColumnX, rightColumnWidth, false);
             currentRightColContentY = addRightColTextBlock(doc, 'Diagnóstico', fullData.diagnostico, currentRightColContentY, rightColumnX, rightColumnWidth, true);
             currentRightColContentY = addRightColTextBlock(doc, 'Exploración Física', fullData.exploracion_fisica, currentRightColContentY, rightColumnX, rightColumnWidth, false);
             currentRightColContentY = addRightColTextBlock(doc, 'Plan de Tratamiento', fullData.plan_tratamiento, currentRightColContentY, rightColumnX, rightColumnWidth, false);


            // --- Instrucciones y Notas ---
            currentRightColContentY += 5; // Espacio antes de esta sección

            doc.setFontSize(10);
            doc.setFont('helvetica', 'bold');
            doc.text('Información al Farmacéutico, en su caso', rightColumnX, currentRightColContentY);
            currentRightColContentY += 6;

            doc.setFontSize(9);
            doc.setFont('helvetica', 'normal');

            currentRightColContentY = addRightColTextBlock(doc, 'Indicaciones', fullData.indicaciones, currentRightColContentY, rightColumnX, rightColumnWidth, false);
            currentRightColContentY = addRightColTextBlock(doc, 'Recomendaciones', fullData.recomendaciones, currentRightColContentY, rightColumnX, rightColumnWidth, false);
            currentRightColContentY = addRightColTextBlock(doc, 'Observaciones', fullData.observaciones, currentRightColContentY, rightColumnX, rightColumnWidth, false);

            // Actualizar el cursor Y principal de la columna derecha
             rightContentY = currentRightColContentY;


            // Extender la línea separadora vertical
             doc.setLineWidth(0.1);
             const maxYAfterMainContent = Math.max(leftContentY, rightContentY);
             // La línea vertical se dibuja desde el inicio (donde comenzó la línea horizontal)
             // hasta el punto más bajo alcanzado por cualquiera de las columnas principales
             doc.line(separatorLineX, startSeparatorY, separatorLineX, maxYAfterMainContent);


             // Mover el cursor Y principal para lo que va debajo
             let mainCursorY = maxYAfterMainContent + 10;


             // --- Próxima Consulta (Opcional) ---
             if (fullData.proxima_consulta) {
                const nextConsultaHeight = doc.getLineHeight() / doc.internal.scaleFactor + 5;
                 if (mainCursorY + nextConsultaHeight > pageHeight - margin - 30) {
                     doc.addPage();
                     mainCursorY = margin;
                 }
                doc.setFontSize(10);
                doc.setFont('helvetica', 'bold');
                // Usar formatDateShortPDF aquí
                doc.text(`Próxima Consulta: ${formatDateShortPDF(fullData.proxima_consulta)}`, margin, mainCursorY);
                mainCursorY += 5;
             }


             // --- Información de Dispensación ---
             let currentDispensationY = mainCursorY + 5;

             // Check if any dispensation info is present
            const hasDetailedDispensationInfo = (fullData.estado_dispensacion !== null && fullData.estado_dispensacion !== undefined && String(fullData.estado_dispensacion).trim() !== '') || fullData.fecha_dispensacion || (Array.isArray(fullData.medicamentos_dispensados_detalle) && fullData.medicamentos_dispensados_detalle.length > 0) || (typeof fullData.medicamentos_dispensados_detalle === 'string' && String(fullData.medicamentos_dispensados_detalle).trim() !== '');

            if (hasDetailedDispensationInfo) {
                 // Estimar espacio necesario
                 const estimatedDispensationBlockHeight = 50; // Rough estimate
                 const remainingSpace = pageHeight - currentDispensationY - margin - 50; // Buffer para firma/pie de página

                 if (estimatedDispensationBlockHeight > remainingSpace && remainingSpace < pageHeight * 0.2) {
                      doc.addPage();
                      currentDispensationY = margin; // Resetear Y
                 }

                 // Dibujar línea encima si no está al inicio de página
                 if (currentDispensationY > margin + 10) {
                    doc.setLineWidth(0.1);
                    doc.line(margin, currentDispensationY - 3, pageWidth - margin, currentDispensationY - 3);
                    currentDispensationY += 7;
                 }

                 doc.setFontSize(12);
                 doc.setFont('helvetica', 'bold');
                 doc.text('Información de Dispensación', margin, currentDispensationY);
                 currentDispensationY += 7;

                 doc.setFontSize(9);
                 doc.setFont('helvetica', 'normal');

                  if (fullData.estado_dispensacion && String(fullData.estado_dispensacion).trim() !== '') {
                      currentDispensationY = addColumnText(doc, `Estado: ${String(fullData.estado_dispensacion)}`, margin, currentDispensationY, contentWidth);
                 }
                 if (fullData.fecha_dispensacion) {
                      currentDispensationY = addColumnText(doc, `Fecha de Dispensación: ${formatDateTimePDF(fullData.fecha_dispensacion)}`, margin, currentDispensationY, contentWidth);
                 }

                  const dispensedDetail = (Array.isArray(fullData.medicamentos_dispensados_detalle) && fullData.medicamentos_dispensados_detalle.length > 0) ?
                      fullData.medicamentos_dispensados_detalle.map(item => typeof item === 'string' ? item : (item?.nombre || 'Item sin nombre')).join(', ') : // Unir elementos del array
                      (typeof fullData.medicamentos_dispensados_detalle === 'string' && String(fullData.medicamentos_dispensados_detalle).trim() !== '') ?
                      String(fullData.medicamentos_dispensados_detalle).trim() : ''; // Usar String() por seguridad

                 if (dispensedDetail) {
                      currentDispensationY += 5;
                      doc.setFont('helvetica', 'bold');
                      doc.text('Detalle de Medicamentos Dispensados:', margin, currentDispensationY);
                      currentDispensationY += 4;
                      doc.setFont('helvetica', 'normal');
                      currentDispensationY = addColumnText(doc, dispensedDetail, margin, currentDispensationY, contentWidth);
                 } else if (fullData.estado_dispensacion || fullData.fecha_dispensacion) {
                     // Si hay estado o fecha pero no detalle específico, mostrar "No hay detalles"
                      currentDispensationY += 5;
                      doc.setFont('helvetica', 'bold');
                      doc.text('Detalle de Medicamentos Dispensados:', margin, currentDispensationY);
                      currentDispensationY += 4;
                      doc.setFont('helvetica', 'normal');
                      currentDispensationY = addColumnText(doc, 'No hay detalles de medicamentos dispensados.', margin, currentDispensationY, contentWidth, 'normal', 9, 'left');
                 }


                 mainCursorY = currentDispensationY + 10;

            }


            // --- Firma del Doctor ---
             const signatureBlockHeight = 40;
             const footerHeightEstimate = 30;
             if (mainCursorY > pageHeight - margin - signatureBlockHeight - footerHeightEstimate) {
                 doc.addPage();
                 mainCursorY = margin + 20;
             }

            mainCursorY += 20; // Espacio antes

            const signatureLineLength = 80;
            const signatureX = pageWidth - margin - signatureLineLength; // Alinear al borde derecho
            const signatureLineY = mainCursorY;

            doc.setLineWidth(0.1);
            doc.line(signatureX, signatureLineY, pageWidth - margin, signatureLineY); // Línea placeholder
            mainCursorY = signatureLineY + 5; // Mover Y debajo
            doc.setFontSize(10);
            doc.setFont('helvetica', 'normal');
            doc.text(`Dr(a). ${String(fullData.doctor_nombre)}`, pageWidth - margin, mainCursorY, { align: 'right' });
            mainCursorY += 5;


            // --- Pie de Página ---
             const footerText = "Esta es una receta generada digitalmente. Puedes consultar su autenticidad y detalle en el portal web o la aplicación móvil de la farmacia.";
             const pacienteLabel = "PACIENTE";
             const footerTextY = pageHeight - margin - 20; // Posición desde abajo


             // Dibujar texto estático del pie de página (alineado a la izquierda)
             doc.setFontSize(8);
             doc.setFont('helvetica', 'normal');
             const footerLines = doc.splitTextToSize(footerText, contentWidth * 0.7);
             doc.text(footerLines, margin, footerTextY);

             // Dibujar etiqueta PACIENTE abajo a la derecha
             doc.setFontSize(10);
             doc.setFont('helvetica', 'bold');
             doc.text(pacienteLabel, pageWidth - margin, pageHeight - margin - 5, { align: 'right' });


            // Guardar PDF
            doc.save(`receta-${fullData.id}.pdf`);

        } catch (error: any) {
            console.error('Error descargando PDF:', error?.message || error);
            alert('Hubo un error al generar la receta. Por favor, inténtalo de nuevo más tarde: ' + (error?.message || 'Error desconocido'));
        }
    };
    // ... resto del componente Recetas (UI y helpers UI) ...

    // --- Renderizado del Componente (Tu UI) ---

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 dark:text-white">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary"></div>
        <span className="ml-4">Cargando recetas...</span>
      </div>
    );
  }

   // Ensure recetas is an array before checking length


  return (
    <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
      {/* Header con filtros */}
      <div className="p-4 border-b border-gray-200 dark:border-gray-700">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
            <input
              type="text"
              placeholder="Buscar por médico, diagnóstico, etc."
              className="w-full border border-gray-200 rounded-lg pl-10 pr-4 py-2 focus:outline-none focus:ring-2 focus:ring-primary/50 bg-white dark:bg-gray-800 dark:border-gray-600 dark:text-white"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <div className="flex items-center gap-2">
            <CalendarIcon className="h-5 w-5 text-gray-500 dark:text-gray-400" />
             {/* Filter by date part of emission date */}
            <input
              type="date"
              className="border border-gray-200 rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-primary/50 bg-white dark:bg-gray-800 dark:border-gray-600 dark:text-white"
              value={fechaFilter}
              onChange={(e) => setFechaFilter(e.target.value)}
              max={new Date().toISOString().split('T')[0]} // Limit date picker to today
            />
            {fechaFilter && (
              <button onClick={() => setFechaFilter('')} className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200">
                <X className="h-5 w-5" />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Vista móvil o tabla principal */}
      {/* Hide the main table/list view when mobileView is 'detail' */}
      {(window.innerWidth >= 768 || mobileView === 'list') && (
         // Use a div with overflow-x-auto for scrollable table on smaller desktops
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
            <thead className="bg-gray-50 dark:bg-gray-800">
              <tr>
                {/* Displaying Date from Emission Date */}
                 <TableHeader title="Fecha Emisión" sortKey="fecha_emision" sortConfig={sortConfig} onSort={requestSort} className="pl-6 pr-3 py-3 w-1/6 min-w-[150px]"/> {/* Adjusted title and key */}
                <TableHeader title="Médico" sortKey="doctor_nombre" sortConfig={sortConfig} onSort={requestSort} className="px-3 py-3 w-1/6 min-w-[120px]"/>
                <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider w-1/4 min-w-[150px]">Diagnóstico</th>
                <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider w-1/4 min-w-[200px]">Medicamentos</th>
                <th className="pl-3 pr-6 py-4 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider w-[100px]">Acciones</th> {/* Fixed width for actions */}
              </tr>
            </thead>
            <tbody className="bg-white dark:bg-gray-900 divide-y divide-gray-200 dark:divide-gray-700">
              {sortedRecetas.length > 0 ? (
                sortedRecetas.map((receta) => (
                   
                  <tr key={receta.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50 cursor-pointer transition-colors" onClick={() => handleRowClick(receta)}>
                     {/* Displaying formatted Date/Time from Emission Date in UI list */}
                    <td className="pl-6 pr-3 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-gray-200">{formatDateTimeUI(receta.fecha_emision)}</td>
                    <td className="px-3 py-4 text-sm text-gray-900 dark:text-gray-200">{receta.doctor_nombre || 'N/A'}</td> 
                    {/* Added break-words for long diagnosis */}
                    <td className="px-3 py-4 text-sm text-gray-500 dark:text-gray-400 max-w-xs truncate md:max-w-sm break-words">{receta.diagnostico || 'N/A'}</td> 
                    <td className="px-3 py-4 text-sm text-gray-900 dark:text-gray-200">
                      <div className="flex flex-col space-y-1">
                        {(Array.isArray(receta.medicamentos) && receta.medicamentos.length > 0) ? (
                           receta.medicamentos.slice(0, 2).map((med, idx) => (
                             // Handle potential null med object or med.nombre
                             <span key={idx} className="bg-gray-100 dark:bg-gray-700 dark:text-gray-300 rounded px-2 py-1 text-xs">{typeof med === 'string' ? med : (med?.nombre || 'Medicamento Anónimo')}</span>
                            ))
                         ) : (
                             <span className="text-xs text-gray-500 dark:text-gray-400">-</span> // Show dash if no meds or not an array
                         )}
                        {(Array.isArray(receta.medicamentos) && receta.medicamentos.length > 2) && ( <span className="text-xs text-gray-500 dark:text-gray-400">+{receta.medicamentos.length - 2} más</span> )}
                      </div>
                    </td>
                    <td className="pl-3 pr-6 py-4 whitespace-nowrap text-sm">
                      {/* Botón de descarga que llama a handleDownload */}
                      <button onClick={(e) => handleDownload(receta.id, e)} disabled={!receta.descargable} className={`p-1.5 rounded-md ${receta.descargable ? 'text-primary hover:bg-primary/10' : 'text-gray-400 dark:text-gray-600 cursor-not-allowed'}`}>
                        <Download className="h-5 w-5" />
                      </button>
                    </td>
                  </tr>
                ))
              ) : (
                 // Show message if no recipes are found after loading
                <tr><td colSpan={5} className="px-6 py-4 text-center text-sm text-gray-500 dark:text-gray-400">No tienes recetas registradas.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}


      {/* Mobile detail view */}
      {window.innerWidth < 768 && mobileView === 'detail' && selectedReceta && (
        <div className="p-4">
           {/* -- AQUI SE USA setSelectedReceta(null) -- */}
          <button onClick={() => setSelectedReceta(null)} className="flex items-center mb-4 text-gray-600 hover:text-gray-900 dark:text-gray-300 dark:hover:text-white">
            <ChevronRight className="h-5 w-5 rotate-180 mr-1" />
            Volver a la lista
          </button>
           {/* Pasar la función handleDownload al componente de detalle */}
          <RecetaDetail receta={selectedReceta} onDownload={handleDownload} />
        </div>
      )}

      {/* Desktop modal view */}
      {selectedReceta && window.innerWidth >= 768 && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden">
            <div className="p-4 border-b dark:border-gray-700 flex-shrink-0">
              <div className="flex justify-between items-center">
                <h3 className="text-xl font-semibold text-gray-900 dark:text-white">Detalle de Receta Médica</h3>
                 {/* -- AQUI SE USA setSelectedReceta(null) -- */}
                <button onClick={() => setSelectedReceta(null)} className="text-gray-400 hover:text-gray-500 dark:hover:text-gray-300">
                  <X className="h-6 w-6" />
                </button>
              </div>
            </div>
            <div className="overflow-y-auto p-6">
              {/* Pasar la función handleDownload al componente de detalle */}
              <RecetaDetail receta={selectedReceta} onDownload={handleDownload} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// --- Componentes Auxiliares de UI (Ya estaban en tu código) ---

// Helper para renderizar medicamentos en el detalle (UI)
const renderMedicamentos = (medicamentos: any[] | null | undefined) => {
    const meds = Array.isArray(medicamentos) ? medicamentos : [];
    if (meds.length === 0) return <p className="text-sm text-gray-500 dark:text-gray-400">No se recetaron medicamentos.</p>;

    return meds.map((med, index) => (
      <div key={index} className="mb-4 p-4 bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700">
        <h4 className="font-semibold text-lg mb-2 text-gray-800 dark:text-gray-200">{typeof med === 'string' ? med : (med?.nombre || `Medicamento ${index + 1}`)}</h4>
        {typeof med === 'object' && med !== null && (
          <>
            {med.dosis && <p className="mb-1 text-sm text-gray-600 dark:text-gray-300"><span className="font-medium">Dosis:</span> {med.dosis}</p>}
            {med.frecuencia && <p className="mb-1 text-sm text-gray-600 dark:text-gray-300"><span className="font-medium">Frecuencia:</span> {med.frecuencia}</p>}
            {med.duracion && <p className="mb-1 text-sm text-gray-600 dark:text-gray-300"><span className="font-medium">Duración:</span> {med.duracion}</p>}
          </>
        )}
      </div>
    ));
};

// Helper para formatear fecha y hora para la UI
const formatDateTimeUI = (timestamp: string | undefined | null) => {
    if (!timestamp) return 'N/A';
     try {
          const date = new Date(timestamp);
          if (isNaN(date.getTime())) return 'Fecha inválida'; // Check for invalid date

         return date.toLocaleString('es-ES', {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            weekday: 'long',
        });
    } catch (e) {
         console.error("Error formatting date for UI", timestamp, e);
         return String(timestamp); // Fallback to raw string
    }
};

// Helper para formatear solo la fecha para la UI
const formatDateUI = (timestamp: string | undefined | null) => {
    if (!timestamp) return 'N/A';
    try {
        const date = new Date(timestamp);
         if (isNaN(date.getTime())) return 'Fecha inválida';
         return date.toLocaleDateString('es-ES', {
            year: 'numeric', month: 'long', day: 'numeric', weekday: 'long'
        });
    } catch (e) {
         console.error("Error formatting date only for UI", timestamp, e);
         return String(timestamp);
    }
};


const RecetaDetail = ({ receta, onDownload }: { receta: Receta, onDownload: (id: string, e: React.MouseEvent) => void }) => {

  return (
    <div className="space-y-6 text-gray-900 dark:text-gray-100">
      <div className="border-b dark:border-gray-700 pb-4">
        <div className="flex justify-between items-start">
          <div>
            <h3 className="text-xl font-semibold text-gray-900 dark:text-white">Receta Médica</h3>
            {/* Display formatted emission date with time */}
            <p className="text-sm text-gray-500 dark:text-gray-400">Emitida el {formatDateTimeUI(receta.fecha_emision)}</p>
          </div>
           {/* Pass event object to handler */}
          <button onClick={(e) => onDownload(receta.id, e)} disabled={!receta.descargable} className={`inline-flex items-center px-4 py-2 rounded-md text-sm font-medium transition-colors ${receta.descargable ? 'bg-primary text-white hover:bg-primary/90' : 'bg-gray-200 dark:bg-gray-700 text-gray-500 dark:text-gray-400 cursor-not-allowed'}`}>
            <Download className="mr-2 h-4 w-4" />Descargar
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4">
        <div className="space-y-4">
          <div><h4 className="text-sm font-medium text-gray-500 dark:text-gray-400 flex items-center"><User className="h-4 w-4 mr-2" /> Paciente</h4><p className="mt-1 text-sm text-gray-900 dark:text-gray-100 font-semibold">{receta.paciente_nombre || 'N/A'}</p></div>
          <div><h4 className="text-sm font-medium text-gray-500 dark:text-gray-400 flex items-center"><Stethoscope className="h-4 w-4 mr-2" /> Médico Tratante</h4><p className="mt-1 text-sm text-gray-900 dark:text-gray-100">{receta.doctor_nombre || 'N/A'}</p></div>
          {/* Pharmacy Info */}
          <div><h4 className="text-sm font-medium text-gray-500 dark:text-gray-400 flex items-center"><Building2 className="h-4 w-4 mr-2" /> Farmacia</h4>
            {/* Check if farmacia_info object exists and has a name property */}
            {receta.farmacia_info?.nombre ? (
                 <div className="mt-1 text-sm text-gray-900 dark:text-gray-100">
                     <p className="font-semibold">{receta.farmacia_info.nombre || 'N/A'}</p>
                     {receta.farmacia_info.ubicacion && <p className="text-xs text-gray-500 dark:text-gray-400">{receta.farmacia_info.ubicacion}</p>}
                     {receta.farmacia_info.telefono && <p className="text-xs text-gray-500 dark:text-gray-400">Tel: {receta.farmacia_info.telefono}</p>}
                 </div>
             ) : (
                 <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">No especificada</p>
            )}
          </div>
        </div>
        <div className="space-y-4">
           {receta.proxima_consulta && (<div><h4 className="text-sm font-medium text-gray-500 dark:text-gray-400">Próxima Consulta</h4><p className="mt-1 text-sm text-gray-900 dark:text-gray-100">{formatDateUI(receta.proxima_consulta)}</p></div>)}
            <div>
                <h4 className="text-sm font-medium text-gray-500 dark:text-gray-400">Fecha y Hora de Emisión</h4>
                 <p className="mt-1 text-sm text-gray-900 dark:text-gray-100">{formatDateTimeUI(receta.fecha_emision)}</p>
            </div>
        </div>
      </div>

      <div className="border-t dark:border-gray-700 pt-4"><h3 className="text-lg font-medium text-gray-900 dark:text-white mb-3 flex items-center"><HeartPulse className="h-5 w-5 mr-2 text-red-500" /> Signos Vitales y Datos</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <InfoCard icon={<Thermometer className="h-3 w-3 mr-1" />} label="Temperatura" value={receta.temperatura_corporal != null ? `${receta.temperatura_corporal} °C` : null} />
            <InfoCard label="Frec. Cardíaca" value={receta.frecuencia_cardiaca != null ? `${receta.frecuencia_cardiaca} lpm` : null} />
            <InfoCard label="Frec. Respiratoria" value={receta.frecuencia_respiratoria != null ? `${receta.frecuencia_respiratoria} rpm` : null} />
            <InfoCard label="Tensión Arterial" value={receta.tension_arterial ? `${receta.tension_arterial} mmHg` : null} />
            <InfoCard icon={<Scale className="h-3 w-3 mr-1" />} label="Peso" value={receta.peso != null ? `${receta.peso} kg` : null} />
            <InfoCard label="Altura" value={receta.altura != null ? `${receta.altura} cm` : null} />
            <InfoCard label="IMC" value={(receta.imc != null && typeof receta.imc === 'number' && !isNaN(receta.imc)) ? `${receta.imc.toFixed(2)} kg/m²` : null} />
            <InfoCard label="Tipo de Sangre" value={receta.blood_type} />
            <InfoCard icon={<AlertCircle className="h-3 w-3 mr-1 text-orange-500" />} label="Alergias" value={receta.allergies} fullWidth />
        </div>
      </div>

      <div className="border-t dark:border-gray-700 pt-4 space-y-4"><h3 className="text-lg font-medium text-gray-900 dark:text-white flex items-center"><ClipboardList className="h-5 w-5 mr-2 text-blue-500" /> Información Clínica</h3>
          <ClinicalInfo label="Motivo de Consulta" value={receta.motivo_consulta} />
          <ClinicalInfo label="Antecedentes" value={receta.antecedentes} />
          <ClinicalInfo label="Diagnóstico" value={receta.diagnostico} isImportant />
          <ClinicalInfo label="Exploración Física" value={receta.exploracion_fisica} />
          <ClinicalInfo label="Plan de Tratamiento" value={receta.plan_tratamiento} />
      </div>

      <div className="border-t dark:border-gray-700 pt-4"><h3 className="text-lg font-medium text-gray-900 dark:text-white mb-3">Medicamentos Recetados</h3><div className="bg-gray-50 dark:bg-gray-900/50 p-4 rounded-lg">{renderMedicamentos(receta.medicamentos)}</div></div>

      <div className="border-t dark:border-gray-700 pt-4 space-y-4">
        <ClinicalInfo label="Indicaciones" value={receta.indicaciones} />
        <ClinicalInfo label="Recomendaciones" value={receta.recomendaciones} />
        <ClinicalInfo label="Observaciones" value={receta.observaciones} />
      </div>
       {(receta.estado_dispensacion !== null && receta.estado_dispensacion !== undefined && String(receta.estado_dispensacion).trim() !== '') || receta.fecha_dispensacion || (Array.isArray(receta.medicamentos_dispensados_detalle) && receta.medicamentos_dispensados_detalle.length > 0) || (typeof receta.medicamentos_dispensados_detalle === 'string' && String(receta.medicamentos_dispensados_detalle).trim() !== '') ? (
           <div className="border-t dark:border-gray-700 pt-4 space-y-4">
              <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-3 flex items-center"><Building2 className="h-5 w-5 mr-2 text-green-500" /> Información de Dispensación</h3>
               
              <ClinicalInfo label="Estado" value={receta.estado_dispensacion} />
              {receta.fecha_dispensacion && <ClinicalInfo label="Fecha de Dispensación" value={formatDateTimeUI(receta.fecha_dispensacion)} />}
               
               {(Array.isArray(receta.medicamentos_dispensados_detalle) && receta.medicamentos_dispensados_detalle.length > 0) ? (
                    <div>
                         <h4 className="text-sm font-medium text-gray-500 dark:text-gray-400">Detalle de Medicamentos Dispensados</h4>
                         <ul className="mt-1 text-sm text-gray-900 dark:text-gray-100 list-disc list-inside">
                             
                             {receta.medicamentos_dispensados_detalle.map((item, idx) => (
                                 item !== null && item !== undefined && (typeof item !== 'string' || item.trim() !== '') ? (
                                      <li key={idx}>{typeof item === 'string' ? item : (item?.nombre || 'Item sin nombre')}</li>
                                 ) : null
                             ))}
                              {/* Add a fallback list item if the array is empty after filtering nulls */}
                              {(receta.medicamentos_dispensados_detalle.filter(item => item !== null && item !== undefined && (typeof item !== 'string' || item.trim() !== '')).length === 0) && <li>No hay detalles de medicamentos dispensados.</li>}
                         </ul>
                    </div>
               ) : (typeof receta.medicamentos_dispensados_detalle === 'string' && String(receta.medicamentos_dispensados_detalle).trim() !== '') ? (
                    <div>
                         <h4 className="text-sm font-medium text-gray-500 dark:text-gray-400">Detalle de Medicamentos Dispensados</h4>
                         <p className="mt-1 text-sm text-gray-900 dark:text-gray-100 whitespace-pre-line">{receta.medicamentos_dispensados_detalle}</p>
                    </div>
               ) : (receta.estado_dispensacion || receta.fecha_dispensacion) && (
                   // Only show "No hay detalles" if state or date are present but detail is not
                   <div>
                        <h4 className="text-sm font-medium text-gray-500 dark:text-gray-400">Detalle de Medicamentos Dispensados</h4>
                       <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">No hay detalles de medicamentos dispensados.</p>
                   </div>
               )}
           </div>
       ) : null} 

    </div>
  );
};

// InfoCard component for UI display
const InfoCard = ({ label, value, icon, fullWidth = false }: { label: string, value: string | number | undefined | null, icon?: React.ReactNode, fullWidth?: boolean }) => {
  // Explicitly check if value is not null AND not undefined, and if it's a string, ensure it's not just whitespace
   const shouldRender = value !== null && value !== undefined && (typeof value !== 'string' || String(value).trim() !== ''); // Use String(value) for safety

  return shouldRender ? (
    <div className={`bg-gray-50 dark:bg-gray-700/50 p-3 rounded-lg ${fullWidth ? 'md:col-span-2' : ''}`}>
      <h4 className="text-xs font-medium text-gray-500 dark:text-gray-400 flex items-center">{icon} {label}</h4>
       
      <p className={`mt-1 text-lg font-semibold ${icon ? 'flex items-center' : ''} text-gray-900 dark:text-gray-100 break-words`}>{icon && <span className="mr-1">{icon}</span>}{String(value)}</p>
    </div>
  ) : null;
};

// ClinicalInfo component for UI display
const ClinicalInfo = ({ label, value, isImportant = false }: { label: string, value: string | undefined | null, isImportant?: boolean }) => {
  // Explicitly check if value is not null AND not undefined, and if it's a string, ensure it's not just whitespace
   const shouldRender = value !== null && value !== undefined && String(value).trim() !== ''; // Use String(value) for safety

  return shouldRender ? (
    <div>
      <h4 className="text-sm font-medium text-gray-500 dark:text-gray-400">{label}</h4>
      
      <p className={`mt-1 text-sm text-gray-900 dark:text-gray-100 whitespace-pre-line ${isImportant ? 'font-semibold' : ''}`}>{String(value)}</p>
    </div>
  ) : null;
};


const TableHeader = ({ title, sortKey, sortConfig, onSort, className }: { title: string; sortKey: keyof Receta; sortConfig: { key: keyof Receta; direction: 'asc' | 'desc' } | null; onSort: (key: keyof Receta) => void; className?: string; }) => {
     const isSorted = sortConfig?.key === sortKey;
     const direction = sortConfig?.direction;
     // Determine if this is the active sort key or the default (fecha_emision desc)
     const isCurrentlySorted = isSorted || (!sortConfig && sortKey === 'fecha_emision');

    return (
        <th className={`text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider cursor-pointer ${className}`} onClick={() => onSort(sortKey)}>
          <div className="flex items-center">
            {title}
            {/* Show arrow only if actively sorted by this key OR if it's the default key and no other sort is active */}
            {isCurrentlySorted && (
                (isSorted ? direction : 'desc') === 'asc' ? <ChevronUp className="ml-1 h-4 w-4" /> : <ChevronDown className="ml-1 h-4 w-4" />
            )}
          </div>
        </th>
    );
};


export default Recetas;