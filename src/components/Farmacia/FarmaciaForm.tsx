// src/components/Farmacia/FarmaciaForm.tsx

import { useState, ChangeEvent, FormEvent } from 'react';
// NOTE: To fix the crypto-js type error, run: npm i --save-dev @types/crypto-js
import CryptoJS from 'crypto-js';
import supabase from "../../lib/supabaseClient";
import QRCode from 'react-qr-code';

// Definir tipos para los datos del formulario
interface FormData {
  nombreFarmacia: string;
  direccion: string;
  telefono: string;
  horaApertura: string;
  horaCierre: string;
  keyLux: string;
}

// Definir tipo para las props del componente
interface FarmaciaFormProps {
  onFarmaciaSaved: (farmaciaData: any | null) => void;
  // It's good practice to also pass the admin user ID as a prop
  // to make the component more reusable and testable.
  adminUserId?: string;
}

const FarmaciaForm: React.FC<FarmaciaFormProps> = ({ onFarmaciaSaved, adminUserId }) => {
  const [formData, setFormData] = useState<FormData>({
    nombreFarmacia: '',
    direccion: '',
    telefono: '',
    horaApertura: '',
    horaCierre: '',
    keyLux: ''
  });

  // Local state to hold the generated Key_Lux for QR code display after submission
  const [generatedKeyLux, setGeneratedKeyLux] = useState<string>('');

  // Función para generar la Key_Lux de manera segura usando un hash
  const generateKeyLux = (): string => {
    const { nombreFarmacia, direccion, telefono } = formData;
    const keyString = `${nombreFarmacia}-${direccion}-${telefono}-${Date.now()}`; // Combina los datos y un timestamp
    const hash = CryptoJS.SHA256(keyString).toString(CryptoJS.enc.Base64); // Crea un hash en Base64
    return hash;
  };

  const handleInputChange = (e: ChangeEvent<HTMLInputElement>): void => {
    const { id, value } = e.target;
    setFormData((prevData) => ({
      ...prevData,
      [id]: value
    }));
  };

  const handleSubmit = async (e: FormEvent<HTMLFormElement>): Promise<void> => {
    e.preventDefault();
    const keyToSave = generateKeyLux();
    setGeneratedKeyLux(keyToSave); // Store for QR code display

    try {
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (userError) throw userError;
      // FIX: Check if user is null before accessing user.id
      if (!user) {
        throw new Error("No user is logged in. Cannot save pharmacy.");
      }

      const farmaciaData = {
        nombre: formData.nombreFarmacia,
        id_administrador: adminUserId || user.id, // Prefer prop, fallback to logged-in user
        key_lux: keyToSave,
        ubicacion: formData.direccion,
        telefono: formData.telefono,
        horario_atencion: `${formData.horaApertura} - ${formData.horaCierre}`
      };

      const { data, error } = await supabase
        .from('farmacias')
        .insert([farmaciaData])
        .select()
        .single();

      if (error) throw error;

      alert('Farmacia registrada exitosamente!');
      
      // Call the parent callback with the newly saved pharmacy data
      onFarmaciaSaved(data);

      // Reset form fields after successful submission
      setFormData({
        nombreFarmacia: '',
        direccion: '',
        telefono: '',
        horaApertura: '',
        horaCierre: '',
        keyLux: ''
      });

    } catch (error: unknown) {
      // FIX: Type error as Error to safely access message property
      const errorMessage = error instanceof Error ? error.message : "An unknown error occurred.";
      console.error('Error al guardar la farmacia:', errorMessage);
      alert(`Error al guardar la farmacia. Por favor, intente nuevamente: ${errorMessage}`);
    }
  };

  return (
    <div className="p-6 bg-white rounded-lg shadow-lg">
      <h2 className="text-2xl font-bold text-[#4d7c6f] mb-4">Registrar Nueva Farmacia</h2>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="nombreFarmacia" className="block text-sm font-medium text-gray-700 mb-1">
            Nombre de la Farmacia
          </label>
          <input
            type="text"
            id="nombreFarmacia"
            value={formData.nombreFarmacia}
            onChange={handleInputChange}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-[#4d7c6f]"
            required
          />
        </div>

        <div>
          <label htmlFor="direccion" className="block text-sm font-medium text-gray-700 mb-1">
            Dirección
          </label>
          <input
            type="text"
            id="direccion"
            value={formData.direccion}
            onChange={handleInputChange}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-[#4d7c6f]"
            required
          />
        </div>

        <div>
          <label htmlFor="telefono" className="block text-sm font-medium text-gray-700 mb-1">
            Teléfono
          </label>
          <input
            type="tel"
            id="telefono"
            value={formData.telefono}
            onChange={handleInputChange}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-[#4d7c6f]"
            required
          />
        </div>

        <div>
          <label htmlFor="horaApertura" className="block text-sm font-medium text-gray-700 mb-1">
            Hora de Apertura
          </label>
          <input
            type="time"
            id="horaApertura"
            value={formData.horaApertura}
            onChange={handleInputChange}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-[#4d7c6f]"
            required
          />
        </div>

        <div>
          <label htmlFor="horaCierre" className="block text-sm font-medium text-gray-700 mb-1">
            Hora de Cierre
          </label>
          <input
            type="time"
            id="horaCierre"
            value={formData.horaCierre}
            onChange={handleInputChange}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-[#4d7c6f]"
            required
          />
        </div>

        <div className="flex gap-4">
          <button
            type="submit"
            className="flex-1 py-2 px-4 bg-[#4d7c6f] text-white rounded-md hover:bg-[#3a5e54] mt-4"
          >
            Guardar Farmacia
          </button>
          <button
            type="button"
            onClick={() => onFarmaciaSaved(null)} // Notify parent to cancel/close
            className="flex-1 py-2 px-4 bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300 mt-4"
          >
            Cancelar
          </button>
        </div>
      </form>

      {generatedKeyLux && (
        <div className="mt-4 text-center">
          <h3 className="text-lg font-semibold">Código QR de Key_Lux</h3>
          <p className="text-sm text-gray-500 mb-2">Guarda este código para tus dispositivos.</p>
          <QRCode value={generatedKeyLux} size={128} />
        </div>
      )}
    </div>
  );
};

// FIX: Removed prop-types as it's not needed with TypeScript interfaces.
// FarmaciaForm.propTypes = {
//   onFarmaciaSaved: PropTypes.func.isRequired,
// };

export default FarmaciaForm;