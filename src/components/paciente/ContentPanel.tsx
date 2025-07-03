import React, { useState, useEffect, useRef } from 'react'; // Importar React si no está globalmente disponible
import { Calendar as CalendarIcon,  MapPin } from 'lucide-react';
import supabase from '../../lib/supabaseClient'; // Asegúrate que la ruta es correcta
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import AppointmentScheduler from './AppointmentScheduler';
import Recetas from './Recetas';
import EREBUS from './EREBUS'; // Asegúrate que la ruta es correcta

// NOTE: To fix the Leaflet type error (TS7016), run this in your terminal:
// npm install --save-dev @types/leaflet

// Fix para los iconos de Leaflet en producción con algunos bundlers
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.7.1/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.7.1/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.7.1/dist/images/marker-shadow.png',
});

interface Pharmacy {
  id: string; // Asumiendo que el ID es string (como UUID)
  nombre: string;
  ubicacion: string; // Puede ser "lat,lon" o una dirección completa
  telefono: string;
  horario_atencion: string;
  key_lux: string; // O el tipo que sea necesario
  id_administrador: string; // O el tipo que sea necesario
  // FIX: Allow lat/lon to be null to match geocoding logic
  lat?: number | null;
  lon?: number | null;
}

interface ContentPanelProps {
  view: 'appointments' | 'medications' | 'pharmacies' | 'EREBUS';
  patientId?: string;
  onClose: () => void; // onClose puede ser útil incluso en 'pharmacies' si hay un botón "Atrás" general
}

const ContentPanel: React.FC<ContentPanelProps> = ({ view }) => {
  const [pharmacies, setPharmacies] = useState<Pharmacy[]>([]);
  const [loadingPharmacies, setLoadingPharmacies] = useState<boolean>(false);
  const [errorPharmacies, setErrorPharmacies] = useState<string | null>(null);
  const [selectedPharmacyId, setSelectedPharmacyId] = useState<string | null>(null);
  const [isGeocoding, setIsGeocoding] = useState<boolean>(false); // Estado para indicar carga de geocodificación

  // Referencias para el mapa
  const mapRef = useRef<L.Map | null>(null);
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const markerRef = useRef<L.Marker | null>(null);

  // --- Efectos y Lógica para Farmacias ---

  // Cargar farmacias solo cuando la vista es 'pharmacies'
  useEffect(() => {
    if (view === 'pharmacies') {
      const fetchPharmacies = async () => {
        setLoadingPharmacies(true);
        setErrorPharmacies(null);
        setIsGeocoding(false); // Reset geocoding state
        setSelectedPharmacyId(null); // Reset selection when view changes
        const { data, error } = await supabase
          .from('farmacias') // Asegúrate que el nombre de la tabla es correcto
          .select('*');

        if (error) {
          console.error('Error fetching pharmacies:', error);
          setErrorPharmacies('No se pudieron cargar las farmacias.');
        } else if (data) {
          // Convertir IDs a string si vienen como número (ajustar según tu schema)
          const typedData = data.map(p => ({ ...p, id: String(p.id) })) as Pharmacy[];
          setPharmacies(typedData);
        }
        setLoadingPharmacies(false);
      };

      fetchPharmacies();
    } else {
      // Limpiar farmacias si la vista cambia
      setPharmacies([]);
    }
  }, [view]); // Dependencia: 'view'

  // Inicializar o destruir mapa basado en la vista 'pharmacies'
  useEffect(() => {
    let mapInstance: L.Map | null = null;

    if (view === 'pharmacies' && mapContainerRef.current && !mapRef.current) {
      const defaultLocation: L.LatLngTuple = [19.4326, -99.1332]; // Centro de CDMX como default
      mapInstance = L.map(mapContainerRef.current).setView(defaultLocation, 12); // Zoom inicial

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
        maxZoom: 19,
      }).addTo(mapInstance);

      mapRef.current = mapInstance;

      // Forzar invalidación de tamaño después de un breve retraso (si el mapa estaba oculto)
      const timerId = setTimeout(() => {
        mapInstance?.invalidateSize();
      }, 150);

      return () => clearTimeout(timerId); // Limpieza del timeout
    }

    // Función de limpieza para cuando la vista cambia o el componente se desmonta
    return () => {
      if (mapRef.current) {
        mapRef.current.remove(); // Destruir instancia del mapa
        mapRef.current = null;
        markerRef.current = null; // Limpiar referencia al marcador
      }
    };
  }, [view]); // Re-ejecutar solo si la vista cambia

  // --- Manejar clic en farmacia con geocodificación ---
  const handlePharmacyClick = async (pharmacy: Pharmacy) => {
    if (isGeocoding) return; // Evitar clics múltiples mientras se geocodifica

    setSelectedPharmacyId(pharmacy.id);
    let lat: number | null = null;
    let lon: number | null = null;
    let addressToDisplay = pharmacy.ubicacion || 'Ubicación no disponible'; // Dirección original para el popup

    try {
      // 1. Intentar parsear como "lat,lon" primero
      if (pharmacy.ubicacion && pharmacy.ubicacion.includes(',')) {
        const coords = pharmacy.ubicacion.split(',');
        if (coords.length === 2) {
          const parsedLat = parseFloat(coords[0].trim());
          const parsedLon = parseFloat(coords[1].trim());
          // Validar rango básico de coordenadas
          if (!isNaN(parsedLat) && !isNaN(parsedLon) && parsedLat >= -90 && parsedLat <= 90 && parsedLon >= -180 && parsedLon <= 180) {
            lat = parsedLat;
            lon = parsedLon;
            console.log(`Usando coordenadas existentes para ${pharmacy.nombre}:`, lat, lon);
          }
        }
      }

      // 2. Si no se parseó o no era formato lat,lon válido, intentar geocodificar
      if (lat === null || lon === null) {
        // Usar coordenadas cacheadas si existen
        if (pharmacy.lat && pharmacy.lon) {
          lat = pharmacy.lat;
          lon = pharmacy.lon;
          console.log(`Usando coordenadas cacheadas para ${pharmacy.nombre}:`, lat, lon);
        } else {
          // Si no hay dirección válida, no geocodificar
          if (!pharmacy.ubicacion || typeof pharmacy.ubicacion !== 'string' || pharmacy.ubicacion.trim() === '') {
            console.error('Dirección inválida o vacía para geocodificar:', pharmacy.ubicacion);
            alert('La dirección de esta farmacia no es válida o está vacía.');
            return;
          }

          // Geocodificar usando Nominatim
          console.log(`Geocodificando dirección para ${pharmacy.nombre}:`, pharmacy.ubicacion);
          setIsGeocoding(true); // Indicar que estamos buscando coords

          try {
            const encodedAddress = encodeURIComponent(pharmacy.ubicacion);
            // IMPORTANTE: ¡¡CAMBIA ESTO!! Usa un User-Agent descriptivo y tu email.
            const response = await fetch(
              `https://nominatim.openstreetmap.org/search?q=${encodedAddress}&format=json&limit=1&countrycodes=mx`, // Limitar a México (opcional)
              {
                method: 'GET',
                headers: {
                  'User-Agent': 'MIA_App/1.0 (soporte@mia-salud.com)' // ¡¡CAMBIA ESTO!!
                }
              }
            );

            if (!response.ok) {
              throw new Error(`Error de red [${response.status}]: ${response.statusText}`);
            }

            const data = await response.json();

            if (data && data.length > 0 && data[0].lat && data[0].lon) {
              lat = parseFloat(data[0].lat);
              lon = parseFloat(data[0].lon);
              console.log('Geocodificación exitosa:', lat, lon);

              // Cachear las coordenadas en el estado para evitar futuras llamadas API
              setPharmacies(prevPharmacies =>
                prevPharmacies.map(p =>
                  p.id === pharmacy.id ? { ...p, lat: lat, lon: lon } : p
                )
              );

            } else {
              console.error('No se encontraron coordenadas para:', pharmacy.ubicacion);
              alert(`No se pudieron encontrar las coordenadas para la dirección:\n${addressToDisplay}`);
              // No detener la ejecución aquí, podría simplemente no mostrar el marcador
              lat = null;
              lon = null;
            }
          } catch (geoError: any) {
            console.error('Error durante la geocodificación:', geoError);
            alert(`Ocurrió un error al buscar la ubicación: ${geoError.message}`);
            lat = null; // Asegurarse que no se usan coords inválidas
            lon = null;
          } finally {
            setIsGeocoding(false); // Quitar el estado de carga
          }
        } // Fin del else (necesidad de geocodificar)
      } // Fin del if (lat o lon eran null inicialmente)

      // 3. Si tenemos coordenadas válidas, mover el mapa y mostrar marcador
      if (lat !== null && lon !== null) {
        const newCenter: L.LatLngTuple = [lat, lon];

        if (mapRef.current) {
          mapRef.current.flyTo(newCenter, 16); // Zoom más cercano

          // Eliminar marcador anterior si existe
          if (markerRef.current) {
            mapRef.current.removeLayer(markerRef.current);
            markerRef.current = null; // Limpiar referencia
          }

          // Añadir nuevo marcador y abrir popup
          const newMarker = L.marker(newCenter).addTo(mapRef.current);
          // Mostrar nombre y dirección original en el popup
          newMarker.bindPopup(`<b>${pharmacy.nombre}</b><br>${addressToDisplay}`).openPopup();
          markerRef.current = newMarker; // Guardar referencia al nuevo marcador
        }
      } else if (!isGeocoding) { // Solo mostrar alerta si no estamos ya en proceso de geocodificación
         // No se pudieron obtener coordenadas (ni parseadas, ni cacheadas, ni geocodificadas con éxito)
         console.warn('No se mostrará marcador para:', pharmacy.nombre);
         // Opcional: Mostrar alerta si la geocodificación falló previamente (ya se mostró alerta en el catch)
         // alert('No se pudo mostrar la farmacia en el mapa.');

         // Quitar marcador existente si se seleccionó una farmacia sin coords válidas
         if (mapRef.current && markerRef.current) {
            mapRef.current.removeLayer(markerRef.current);
            markerRef.current = null;
         }
      }

    } catch (error) {
      console.error('Error general al manejar clic en farmacia:', error);
      alert('Ocurrió un error inesperado al seleccionar la farmacia.');
      setIsGeocoding(false); // Asegurarse de resetear el estado de carga en caso de error general
    }
  };

  // --- Renderizado Específico para Farmacias ---
  const renderPharmacyMap = () => {
    return (
      <div className="bg-white rounded-xl shadow-md overflow-hidden h-full flex flex-col"> {/* Asegura altura */}
        {/* Header */}
        <div className="p-4 md:p-5 border-b border-gray-200 flex items-center flex-shrink-0">
          {/* Podrías añadir un botón de volver aquí si es necesario */}
          {/* <button onClick={onClose} className="mr-3 ..."><ArrowLeft ... /></button> */}
          <h3 className="text-lg font-semibold text-gray-800">Farmacias Cercanas</h3>
        </div>

        {/* Contenido Principal (Permitir scroll si es necesario) */}
        <div className="flex-grow overflow-y-auto p-4 md:p-5">
          {/* Mapa */}
          <div className="mb-6 rounded-lg overflow-hidden border border-gray-200 relative">
            <div
              ref={mapContainerRef}
              className="h-64 md:h-80 w-full bg-gray-200" // Fondo mientras carga/inicializa
              aria-label="Mapa de farmacias"
            />
            {isGeocoding && ( // Overlay de carga durante geocodificación
              <div className="absolute inset-0 bg-white bg-opacity-75 flex items-center justify-center z-10 pointer-events-none">
                <div className="text-center p-4 bg-white rounded shadow">
                   {/* Puedes usar un spinner SVG o un componente Spinner aquí */}
                  <svg className="animate-spin h-8 w-8 text-primary mx-auto mb-2" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  <p className="text-base font-medium text-gray-600">Buscando ubicación...</p>
                </div>
              </div>
            )}
          </div>

          {/* Lista de Farmacias */}
          {loadingPharmacies && (
            <div className="text-center text-gray-600 py-10">Cargando farmacias...</div>
          )}
          {errorPharmacies && (
            <div className="text-center text-red-600 bg-red-100 border border-red-400 rounded p-4">{errorPharmacies}</div>
          )}
          {!loadingPharmacies && !errorPharmacies && pharmacies.length === 0 && (
              <div className="text-center text-gray-500 py-10">No hay farmacias disponibles.</div>
          )}
          {!loadingPharmacies && !errorPharmacies && pharmacies.length > 0 && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {pharmacies.map((pharmacy) => (
                <div
                  key={`pharmacy-${pharmacy.id}`}
                  onClick={() => handlePharmacyClick(pharmacy)}
                  className={`bg-white rounded-lg border transition-all duration-200 cursor-pointer overflow-hidden flex flex-col
                    ${selectedPharmacyId === pharmacy.id ? 'border-primary ring-2 ring-primary/50 shadow-lg' : 'border-gray-200 hover:shadow-md'}
                    ${isGeocoding && selectedPharmacyId === pharmacy.id ? 'opacity-60 cursor-wait' : 'hover:border-gray-300'}` // Estilo de carga/hover
                  }
                  role="button"
                  tabIndex={isGeocoding ? -1 : 0} // Deshabilitar tabulación mientras carga
                  aria-disabled={isGeocoding && selectedPharmacyId === pharmacy.id}
                  onKeyPress={(e) => !isGeocoding && (e.key === 'Enter' || e.key === ' ') && handlePharmacyClick(pharmacy)} // Accesibilidad (Enter o Espacio)
                >
                  <div className="p-4 flex-grow"> {/* flex-grow para empujar detalles hacia abajo si hay teléfono */}
                    <h4 className="text-base font-semibold text-gray-800 truncate mb-2" title={pharmacy.nombre}>{pharmacy.nombre}</h4>
                    <div className="space-y-2 text-sm">
                      <div className="flex items-start text-gray-600" title={pharmacy.ubicacion}>
                        <MapPin className="h-4 w-4 text-gray-400 mt-0.5 mr-2 flex-shrink-0" aria-hidden="true"/>
                        {/* Mostrar siempre la dirección original */}
                        <span className="line-clamp-2">{pharmacy.ubicacion || 'Dirección no especificada'}</span>
                      </div>
                      <div className="flex items-center text-gray-600">
                        <CalendarIcon className="h-4 w-4 text-gray-400 mr-2 flex-shrink-0" aria-hidden="true"/>
                        <span>{pharmacy.horario_atencion || 'No especificado'}</span>
                      </div>
                    </div>
                  </div>
                   {pharmacy.telefono && (
                       <div className="p-4 pt-0 text-sm text-gray-600 border-t border-gray-100 mt-auto"> {/* mt-auto para empujar al fondo */}
                         Tel: {pharmacy.telefono}
                       </div>
                   )}
                </div>
              ))}
            </div>
           )}
        </div>
      </div>
    );
  };

  // --- Switch Principal para Renderizado ---
  switch (view) {
    case 'appointments':
      return <AppointmentScheduler />;
    case 'medications':
      return <Recetas />;
    case 'pharmacies':
      return renderPharmacyMap();
    case 'EREBUS':
      return <EREBUS />;
    default:
      // Manejo de vista desconocida o no implementada
      const exhaustiveCheck: never = view; // Ayuda a TypeScript a verificar que todas las vistas están manejadas
      console.warn(`ContentPanel recibió una vista desconocida: ${exhaustiveCheck}`);
      return (
         <div className="p-6 bg-white rounded-xl shadow-md text-center text-gray-500">
             Contenido no disponible para la sección: {view}.
         </div>
      );
  }
};

export default ContentPanel;