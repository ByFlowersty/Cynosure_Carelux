// src/components/EditMedicineModal.tsx

import React, { useState, useEffect } from 'react';
import supabase from '../../lib/supabaseClient'; // Adjust path as needed
import { X } from 'lucide-react'; // Assuming you use lucide-react for icons

// Reuse the same FormData interface
interface MedicineFormData {
  id_farmaco?: number; // Use number based on DB serial
  marca_comercial: string;
  nombre_medicamento: string;
  precio_en_pesos: number;
  upc?: string | null; // Allow null
  unidades: number;
  lote?: string | null; // Allow null
  ubicacion_stand?: string | null; // Allow null
  fecha_caducidad?: string | null; // Allow null (YYYY-MM-DD string)
  fecha_ingreso?: string | null; // Assuming this might be in the data but not edited
  fraccion?: string | null; // Allow null
  stock_minimo: number;
  categoria?: string | null; // Allow null
  id_farmacia?: number; // Not updated here, but might be in itemToEdit
  // Add fecha_ultimo_movimiento here if it's in your DB and you need to see it in the modal form
  // fecha_ultimo_movimiento?: string | null;
}

interface EditMedicineModalProps {
  isOpen: boolean;
  onClose: () => void;
  itemToEdit: MedicineFormData | null; // The specific medicine object to edit
  onMedicineEdited: () => void; // Callback after successful edit
}

const EditMedicineModal: React.FC<EditMedicineModalProps> = ({
  isOpen,
  onClose,
  itemToEdit,
  onMedicineEdited
}) => {
  // Initialize state with default empty values
  const [formData, setFormData] = useState<MedicineFormData>({
    id_farmaco: undefined,
    marca_comercial: '',
    nombre_medicamento: '',
    precio_en_pesos: 0,
    upc: null,
    unidades: 0,
    lote: null,
    ubicacion_stand: null,
    fecha_caducidad: null,
    fraccion: null,
    stock_minimo: 0,
    categoria: null
  });

  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Effect to populate the form when the itemToEdit prop changes
  useEffect(() => {
    if (itemToEdit) {
      // Map the itemToEdit properties to the formData state
      // Ensure date is formatted correctly for the input type="date" (YYYY-MM-DD)
      let formattedDate = null; // Initialize as null
      if (itemToEdit.fecha_caducidad) {
        try {
          const date = new Date(itemToEdit.fecha_caducidad);
          // Check if date is valid
          if (!isNaN(date.getTime())) {
            formattedDate = date.toISOString().split('T')[0];
          } else {
             // If date is invalid, just set to null or handle error if preferred
             console.warn('Invalid date format for fecha_caducidad:', itemToEdit.fecha_caducidad);
             formattedDate = null;
          }
        } catch (e) {
          console.error('Error processing fecha_caducidad:', e);
          formattedDate = null;
        }
      }

      setFormData({
        id_farmaco: itemToEdit.id_farmaco,
        marca_comercial: itemToEdit.marca_comercial || '',
        nombre_medicamento: itemToEdit.nombre_medicamento || '',
        precio_en_pesos: Number(itemToEdit.precio_en_pesos) || 0,
        upc: itemToEdit.upc || null,
        unidades: Number(itemToEdit.unidades) || 0,
        lote: itemToEdit.lote || null,
        ubicacion_stand: itemToEdit.ubicacion_stand || null,
        fecha_caducidad: formattedDate, // Use the potentially null formattedDate
        fraccion: itemToEdit.fraccion || null, // <-- CORRECTED TYPO HERE
        stock_minimo: Number(itemToEdit.stock_minimo) || 0,
        categoria: itemToEdit.categoria || null
      });
      setError(null); // Reset error when item changes
    } else {
      // Reset form data if itemToEdit is null (modal closing or initial state)
      setFormData({
        id_farmaco: undefined,
        marca_comercial: '',
        nombre_medicamento: '',
        precio_en_pesos: 0,
        upc: null,
        unidades: 0,
        lote: null,
        ubicacion_stand: null,
        fecha_caducidad: null,
        fraccion: null,
        stock_minimo: 0,
        categoria: null
      });
      setError(null);
    }
  }, [itemToEdit]); // Effect runs when itemToEdit prop changes

  // Input change handler
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value, type } = e.target;

    let processedValue: string | number | null;

    if (type === 'number') {
      // For number inputs, convert to number or default to 0
      const numValue = parseFloat(value);
      // Use numValue directly, parseFloat(null) or parseFloat('') results in NaN
      // If input is empty for a number field, parseFloat('') gives NaN, we can default to 0 or null depending on intent
      // Assuming numbers should not be null in formData based on interface default values (0), except for nullable DB fields if treated differently
      // Let's stick to the interface definition: precio_en_pesos, unidades, stock_minimo are numbers, rest optional strings/numbers/null
       processedValue = isNaN(numValue) ? 0 : numValue;
       // Special case: If the input is empty string for a required number field, maybe default to 0?
       // The `required` attribute handles empty string validation on submit, so parseFloat(value) resulting in NaN is fine during input
       // We'll rely on submit validation for required number fields
       processedValue = parseFloat(value);

    } else if (value === '') {
      // For empty strings in optional fields, set to null
      // List names of fields that can be null in the DB
      const nullableFields = ['upc', 'lote', 'ubicacion_stand', 'fecha_caducidad', 'fraccion', 'categoria'];
      processedValue = nullableFields.includes(name) ? null : '';
    } else {
      processedValue = value;
    }

    // Handle specific number fields to ensure they are numbers in state, even if input initially is empty string (which gives NaN for parseFloat)
    // This prevents setting NaN into state for number fields.
    if (type === 'number') {
        const numValue = parseFloat(value);
        // If the input was cleared (value is ''), set to 0 for number fields
        if (value === '') {
             processedValue = 0;
        } else {
            // Otherwise, use the parsed number (will be NaN if invalid input)
            processedValue = numValue;
        }
    }


    setFormData(prev => ({
      ...prev,
      [name]: processedValue
    }));
  };

  // Submit handler for updating
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      // --- Validation ---
      // Ensure itemToEdit and its ID exist
      if (!itemToEdit || !itemToEdit.id_farmaco) {
        throw new Error("Error interno: No se ha seleccionado un medicamento válido para editar.");
      }

      // Check required fields and validate data types
      if (!formData.marca_comercial?.trim()) { // Use optional chaining and nullish coalescing for safety
        throw new Error('La marca comercial es requerida.');
      }

      if (!formData.nombre_medicamento?.trim()) { // Use optional chaining
        throw new Error('El nombre del medicamento es requerido.');
      }

      // Validate numbers - Check if they are finite numbers and meet min requirements
      if (typeof formData.precio_en_pesos !== 'number' || !isFinite(formData.precio_en_pesos) || formData.precio_en_pesos <= 0) {
        throw new Error('El precio debe ser un número válido mayor a 0.');
      }

      if (typeof formData.unidades !== 'number' || !isFinite(formData.unidades) || formData.unidades < 0) {
        throw new Error('Las unidades deben ser un número válido mayor o igual a 0.');
      }

      if (typeof formData.stock_minimo !== 'number' || !isFinite(formData.stock_minimo) || formData.stock_minimo < 0) {
        throw new Error('El stock mínimo debe ser un número válido mayor o igual a 0.');
      }

      // Optional date validation
      if (formData.fecha_caducidad) {
         // Try parsing as Date, then format back to YYYY-MM-DD string
         const date = new Date(formData.fecha_caducidad);
         if (isNaN(date.getTime())) {
           throw new Error('Fecha de caducidad inválida.');
         }
         // Re-format to ensure correct string format for DB if needed (Supabase often handles Date objects directly too)
         // Keeping it as YYYY-MM-DD string is safest
         // Note: The input[type="date"] handles formatting *for display*. We need to ensure the state and the payload are consistent.
         // The handleInputChange already attempts to put YYYY-MM-DD or null into state. Let's just validate and send what's in state.
      }


      // --- Prepare Payload for Update ---
      // Extract only the fields that should be updated
      const payloadToSend: Partial<MedicineFormData> = {
         marca_comercial: formData.marca_comercial,
         nombre_medicamento: formData.nombre_medicamento,
         precio_en_pesos: formData.precio_en_pesos, // Already validated as number
         upc: formData.upc,
         unidades: formData.unidades, // Already validated as number
         lote: formData.lote,
         ubicacion_stand: formData.ubicacion_stand,
         fecha_caducidad: formData.fecha_caducidad, // Already YYYY-MM-DD or null
         fraccion: formData.fraccion,
         stock_minimo: formData.stock_minimo, // Already validated as number
         categoria: formData.categoria,
         // Do NOT include id_farmaco, id_farmacia, fecha_ingreso in the update payload
         // Supabase .update() expects the object to contain the columns you want to change.
      };

       // Clean up payload: remove undefined values just in case (though formData state shouldn't have them)
       Object.keys(payloadToSend).forEach(key =>
           (payloadToSend as any)[key] === undefined && delete (payloadToSend as any)[key]
       );


      const { error: updateError } = await supabase
        .from('medicamentos')
        .update(payloadToSend)
        .eq('id_farmaco', itemToEdit.id_farmaco); // Use the ID from the original item

      if (updateError) {
        throw updateError;
      }

      // Success
      onMedicineEdited(); // Notify parent component to refresh data
      onClose(); // Close the modal on successful update

    } catch (err: any) {
      setError(err.message || 'Error al actualizar el medicamento.');
      console.error('Error updating medicamento:', err);
    } finally {
      setLoading(false);
    }
  };

  // Modal is only visible and functional if isOpen is true AND there's an item to edit
  // Adding this check at the beginning prevents rendering issues if itemToEdit is null
  if (!isOpen || !itemToEdit) {
    return null;
  }

  // --- Rendering ---
  // Modal Overlay (Standard semi-transparent black overlay)
  // Modal Content (Apply Aero Style)
  // Use rounded-2xl, increased padding, subtle border, shadow-2xl, semi-transparent white bg with blur
  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      {/* Modal Content */}
      <div className="bg-blue-50 bg-opacity-90 shadow-2xl rounded-2xl p-8 w-full max-w-5xl relative backdrop-blur-sm border border-blue-200 max-h-[90vh] overflow-y-auto">
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-gray-600 hover:text-gray-800 transition duration-150 focus:outline-none focus:ring-2 focus:ring-blue-400 rounded-full p-1"
          disabled={loading}
          aria-label="Cerrar modal"
        >
          <X size={24} />
        </button>

        {/* Title */}
        <h2 className="text-2xl font-semibold text-blue-900 mb-6 border-b border-blue-200 pb-4">
          Editar Medicamento: <span className="text-blue-700">{itemToEdit.nombre_medicamento}</span>
        </h2>

        {/* Error Message Display */}
        {error && (
          <div className="mb-4 p-3 bg-red-100 bg-opacity-70 text-red-800 rounded-lg border border-red-400">
            {error}
          </div>
        )}

        {/* Edit Form */}
        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {/* Nombre del Medicamento */}
            <div>
              <label htmlFor="edit-nombre" className="block text-sm font-medium text-gray-800 mb-1">
                Nombre del Medicamento*
              </label>
              <input
                id="edit-nombre"
                type="text"
                name="nombre_medicamento"
                value={formData.nombre_medicamento || ''} // Use || '' for input value to avoid React warning about null/undefined value
                onChange={handleInputChange}
                className="w-full px-3 py-2 border border-blue-300 rounded-lg shadow-sm focus:outline-none focus:ring-1 focus:ring-blue-600 bg-white bg-opacity-70 text-gray-900 placeholder-gray-600"
                required
                disabled={loading}
                placeholder="Ingrese el nombre del medicamento"
              />
            </div>

            {/* Marca Comercial */}
            <div>
              <label htmlFor="edit-marca" className="block text-sm font-medium text-gray-800 mb-1">
                Marca Comercial*
              </label>
              <input
                id="edit-marca"
                type="text"
                name="marca_comercial"
                 value={formData.marca_comercial || ''} // Use || ''
                onChange={handleInputChange}
                className="w-full px-3 py-2 border border-blue-300 rounded-lg shadow-sm focus:outline-none focus:ring-1 focus:ring-blue-600 bg-white bg-opacity-70 text-gray-900 placeholder-gray-600"
                required
                disabled={loading}
                placeholder="Ingrese la marca comercial"
              />
            </div>

            {/* Unidades */}
            <div>
              <label htmlFor="edit-unidades" className="block text-sm font-medium text-gray-800 mb-1">
                Unidades*
              </label>
               {/* Display as string, update internally as number */}
              <input
                id="edit-unidades"
                type="number"
                name="unidades"
                value={formData.unidades?.toString() || '0'} // Ensure value is string, default to '0' for display
                onChange={handleInputChange}
                min="0"
                step="1"
                className="w-full px-3 py-2 border border-blue-300 rounded-lg shadow-sm focus:outline-none focus:ring-1 focus:ring-blue-600 bg-white bg-opacity-70 text-gray-900 placeholder-gray-600"
                required
                disabled={loading}
                placeholder="0"
              />
            </div>

            {/* Precio */}
            <div>
              <label htmlFor="edit-precio" className="block text-sm font-medium text-gray-800 mb-1">
                Precio (MXN)*
              </label>
               {/* Display as string, update internally as number */}
              <input
                id="edit-precio"
                type="number"
                step="0.01"
                name="precio_en_pesos"
                value={formData.precio_en_pesos?.toString() || '0.00'} // Ensure value is string, default to '0.00'
                onChange={handleInputChange}
                min="0.01"
                className="w-full px-3 py-2 border border-blue-300 rounded-lg shadow-sm focus:outline-none focus:ring-1 focus:ring-blue-600 bg-white bg-opacity-70 text-gray-900 placeholder-gray-600"
                required
                disabled={loading}
                placeholder="0.00"
              />
            </div>

            {/* Stock Mínimo */}
            <div>
              <label htmlFor="edit-stock-minimo" className="block text-sm font-medium text-gray-800 mb-1">
                Stock Mínimo*
              </label>
               {/* Display as string, update internally as number */}
              <input
                type="number"
                id="edit-stock-minimo"
                name="stock_minimo"
                value={formData.stock_minimo?.toString() || '0'} // Ensure value is string, default to '0'
                onChange={handleInputChange}
                min="0"
                step="1"
                className="w-full px-3 py-2 border border-blue-300 rounded-lg shadow-sm focus:outline-none focus:ring-1 focus:ring-blue-600 bg-white bg-opacity-70 text-gray-900 placeholder-gray-600"
                required
                disabled={loading}
                placeholder="0"
              />
            </div>

            {/* Fecha de Caducidad */}
            <div>
              <label htmlFor="edit-fecha-caducidad" className="block text-sm font-medium text-gray-800 mb-1">
                Fecha de Caducidad
              </label>
              <input
                type="date"
                id="edit-fecha-caducidad"
                name="fecha_caducidad"
                value={formData.fecha_caducidad || ''} // Value should be YYYY-MM-DD string or empty string for type="date"
                onChange={handleInputChange}
                className="w-full px-3 py-2 border border-blue-300 rounded-lg shadow-sm focus:outline-none focus:ring-1 focus:ring-blue-600 bg-white bg-opacity-70 text-gray-900"
                disabled={loading}
              />
            </div>

            {/* UPC */}
            <div>
              <label htmlFor="edit-upc" className="block text-sm font-medium text-gray-800 mb-1">
                UPC
              </label>
              <input
                id="edit-upc"
                type="text"
                name="upc"
                value={formData.upc || ''} // Use || ''
                onChange={handleInputChange}
                className="w-full px-3 py-2 border border-blue-300 rounded-lg shadow-sm focus:outline-none focus:ring-1 focus:ring-blue-600 bg-white bg-opacity-70 text-gray-900 placeholder-gray-600"
                disabled={loading}
                placeholder="Código UPC"
              />
            </div>

            {/* Lote */}
            <div>
              <label htmlFor="edit-lote" className="block text-sm font-medium text-gray-800 mb-1">
                Lote
              </label>
              <input
                id="edit-lote"
                type="text"
                name="lote"
                value={formData.lote || ''} // Use || ''
                onChange={handleInputChange}
                className="w-full px-3 py-2 border border-blue-300 rounded-lg shadow-sm focus:outline-none focus:ring-1 focus:ring-blue-600 bg-white bg-opacity-70 text-gray-900 placeholder-gray-600"
                disabled={loading}
                placeholder="Número de lote"
              />
            </div>

            {/* Ubicación en Stand */}
            <div>
              <label htmlFor="edit-ubicacion" className="block text-sm font-medium text-gray-800 mb-1">
                Ubicación en Stand
              </label>
              <input
                id="edit-ubicacion"
                type="text"
                name="ubicacion_stand"
                value={formData.ubicacion_stand || ''} // Use || ''
                onChange={handleInputChange}
                className="w-full px-3 py-2 border border-blue-300 rounded-lg shadow-sm focus:outline-none focus:ring-1 focus:ring-blue-600 bg-white bg-opacity-70 text-gray-900 placeholder-gray-600"
                disabled={loading}
                placeholder="Ej: Estante A, Nivel 2"
              />
            </div>

            {/* Fracción */}
            <div>
              <label htmlFor="edit-fraccion" className="block text-sm font-medium text-gray-800 mb-1">
                Fracción
              </label>
              <select
                id="edit-fraccion"
                name="fraccion"
                value={formData.fraccion || ''} // Use || ''
                onChange={handleInputChange}
                className="w-full px-3 py-2 border border-blue-300 rounded-lg shadow-sm focus:outline-none focus:ring-1 focus:ring-blue-600 bg-white bg-opacity-70 text-gray-900"
                disabled={loading}
              >
                <option value="">Seleccionar fracción</option>
                <option value="I">I</option>
                <option value="II">II</option>
                <option value="III">III</option>
                <option value="IV">IV</option>
                <option value="V">V</option>
                <option value="VI">VI</option>
              </select>
            </div>

            {/* Categoría */}
            <div>
              <label htmlFor="edit-categoria" className="block text-sm font-medium text-gray-800 mb-1">
                Categoría
              </label>
              <select
                id="edit-categoria"
                name="categoria"
                value={formData.categoria || ''} // Use || ''
                onChange={handleInputChange}
                className="w-full px-3 py-2 border border-blue-300 rounded-lg shadow-sm focus:outline-none focus:ring-1 focus:ring-blue-600 bg-white bg-opacity-70 text-gray-900"
                disabled={loading}
              >
                <option value="">Seleccionar categoría</option>
                <option value="farmaco">Fármaco</option>
                <option value="uso personal">Uso Personal</option>
                <option value="insumos medicos">Insumos Médicos</option>
                <option value="otros">Otros</option>
              </select>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex justify-end space-x-3 pt-6 border-t border-blue-200">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-gray-800 bg-gray-200 bg-opacity-70 rounded-lg hover:bg-gray-300 transition duration-150 focus:outline-none focus:ring-2 focus:ring-gray-400 shadow-sm"
              disabled={loading}
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="px-5 py-2 text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:bg-blue-400 transition duration-150 focus:outline-none focus:ring-2 focus:ring-blue-500 shadow-md"
              disabled={loading}
            >
              {loading ? 'Actualizando...' : 'Actualizar Medicamento'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default EditMedicineModal;