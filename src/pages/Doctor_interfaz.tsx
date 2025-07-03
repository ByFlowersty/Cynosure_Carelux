import { useState } from 'react';
import DoctorPrescription from '../components/DOC/DoctorPrescription'; // Asegúrate de que la ruta sea correcta
import Itinerario from '../components/DOC/Itinerario'; // Importa el nuevo módulo
import '../App.css';
import '../index.css';

export default function Doctor_interfaz() {
  const [activeTab, setActiveTab] = useState<'prescription' | 'itinerary'>('prescription');

  // Clases base para ambos botones, para no repetirlas
  const baseButtonClasses = `
    flex-1 sm:flex-none text-center /* flex-1 para que ocupen espacio en móviles, sm:flex-none para que no se estiren en pantallas grandes */
    px-4 py-2 sm:px-6 sm:py-2 rounded-lg
    text-sm sm:text-lg font-medium
    transition-colors duration-200
    focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 /* Añadido focus para accesibilidad */
  `;

  // Clases específicas para el estado activo
  const activeClasses = 'bg-indigo-600 text-white shadow-md';

  // Clases específicas para el estado inactivo (ahora más visibles)
  const inactiveClasses = 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50 hover:border-gray-400';

  return (
    <div className="flex flex-col h-screen bg-gray-50"> {/* Contenedor principal que ocupa toda la pantalla */}
      
      {/* Navbar / Tabs */}
      <nav className="bg-white shadow-md p-4 sticky top-0 z-20"> {/* Hacemos la navbar pegajosa si es necesario */}
        <div className="container mx-auto flex flex-wrap justify-between items-center"> {/* flex-wrap para responsive */}
          <h1 className="text-2xl font-bold text-gray-800 mb-4 sm:mb-0">Portal del Doctor</h1> {/* Título más descriptivo y margen responsivo */}
          <div className="flex space-x-2 sm:space-x-4"> {/* Espaciado responsivo para botones */}
            <button
              onClick={() => setActiveTab('prescription')}
              // Combina las clases base con las específicas del estado activo/inactivo
              className={`${baseButtonClasses} ${activeTab === 'prescription' ? activeClasses : inactiveClasses}`}
            >
              Receta Médica
            </button>
            <button
              onClick={() => setActiveTab('itinerary')}
              // Combina las clases base con las específicas del estado activo/inactivo
              className={`${baseButtonClasses} ${activeTab === 'itinerary' ? activeClasses : inactiveClasses}`}
            >
              Mi Itinerario
            </button>
          </div>
        </div>
      </nav>

      {/* Content Area */}
      {/* Este div ahora permite el scroll para su contenido si este es más alto que el espacio disponible */}
      <div className="flex-1 overflow-y-auto"> 
        {activeTab === 'prescription' ? (
          <DoctorPrescription />
        ) : (
          <Itinerario /> 
        )}
      </div>
    </div>
  );
}