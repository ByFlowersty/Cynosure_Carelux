import React from "react"
import { useState, useEffect, useMemo } from "react"
import supabase from "../../lib/supabaseClient"
import AddMedicineModal from "./AddMedicineModal"
import EditMedicineModal from "./EditMedicineModal"
import { RefreshCw } from "lucide-react"

// Define the structure of the data passed for alerts
interface MedicamentoAlertaProp {
  id_farmaco: number
  nombre_medicamento: string
  fecha_caducidad?: string | null
  fecha_ultimo_movimiento?: string | null
}

// Define interfaces for props
interface InventoryManagementProps {
  Id_Far: string
  medicamentosPorCaducar: MedicamentoAlertaProp[]
  medicamentosSinMovimiento: MedicamentoAlertaProp[]
  inventarioSearch: string
  setInventarioSearch: (value: string) => void
  onRefreshData: () => void
}

// Define the structure of a medicine item
interface MedicineItem {
  id_farmaco: number
  marca_comercial: string
  nombre_medicamento: string
  precio_en_pesos: number
  unidades: number
  fecha_caducidad?: string | null
  stock_minimo: number
  upc?: string | null
  lote?: string | null
  ubicacion_stand?: string | null
  fraccion?: string | null
  categoria?: string | null
  id_farmacia: number
  fecha_ultimo_movimiento?: string | null
}

const CATEGORY_OPTIONS = [
  { value: "", label: "Seleccionar categoría" },
  { value: "farmaco", label: "Fármaco" },
  { value: "uso personal", label: "Uso Personal" },
  { value: "insumos medicos", label: "Insumos Médicos" },
  { value: "otros", label: "Otros" },
]

const InventoryManagement: React.FC<InventoryManagementProps> = ({
  Id_Far,
  medicamentosPorCaducar,
  medicamentosSinMovimiento,
  inventarioSearch,
  setInventarioSearch,
  onRefreshData,
}) => {
  const [error, setError] = useState<string | null>(null)
  const [inventory, setInventory] = useState<MedicineItem[]>([])
  const [showAddModal, setShowAddModal] = useState(false)
  const [showEditModal, setShowEditModal] = useState(false)
  const [editingItem, setEditingItem] = useState<MedicineItem | null>(null)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [showExpiringDetails, setShowExpiringDetails] = useState(false)
  const [showNoMovementDetails, setShowNoMovementDetails] = useState(false)
  const [selectedCategory, setSelectedCategory] = useState<string>("")
  // Add debounced search
  const [debouncedSearch, setDebouncedSearch] = useState(inventarioSearch)

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(inventarioSearch)
    }, 300)
    return () => clearTimeout(timer)
  }, [inventarioSearch])

  // Function to fetch the full inventory data
  const fetchInventory = async () => {
    if (!Id_Far) {
      console.log("fetchInventory called with no Id_Far, skipping.")
      setInventory([])
      return
    }
    console.log("Fetching inventory for farmacia:", Id_Far)
    setIsRefreshing(true)
    try {
      setError(null)
      const { data, error } = await supabase.from("medicamentos").select("*").eq("id_farmacia", Id_Far)

      if (error) {
        console.error("Supabase error fetching inventory:", error)
        throw error
      }
      console.log("Inventory fetched successfully:", data?.length, "items.")
      setInventory(data || [])
    } catch (err: any) {
      setError("Error al cargar el inventario: " + err.message)
      console.error("Error loading inventory:", err)
      setInventory([])
    } finally {
      setIsRefreshing(false)
    }
  }

  // Initial fetch when component mounts or Id_Far changes
  useEffect(() => {
    fetchInventory()
  }, [Id_Far])

  // Handler for the Refresh button
  const handleRefreshClick = async () => {
    console.log("InventoryManagement: Refresh button clicked.")
    onRefreshData()
    await fetchInventory()
    console.log("InventoryManagement: Refresh process finished.")
  }

  const handleDelete = async (id: number) => {
    if (!window.confirm("¿Estás seguro de que quieres eliminar este medicamento?")) {
      return
    }
    setError(null)
    setIsRefreshing(true)
    try {
      const { error: deleteError } = await supabase.from("medicamentos").delete().eq("id_farmaco", id)

      if (deleteError) {
        throw deleteError
      }

      console.log(`InventoryManagement: Medicine ID ${id} deleted. Triggering refresh.`)
      fetchInventory()
      onRefreshData()
    } catch (err: any) {
      setError("Error al eliminar el medicamento: " + err.message)
      console.error("Error deleting medicamento:", err)
      setIsRefreshing(false)
    }
  }

  // Handler to open the Edit modal with the selected item
  const handleEditClick = (item: MedicineItem) => {
    setEditingItem(item)
    setShowEditModal(true)
  }

  // Callback from AddMedicineModal
  const handleMedicineAdded = () => {
    console.log("InventoryManagement: Medicine added. Triggering refresh.")
    setShowAddModal(false)
    fetchInventory()
    onRefreshData()
  }

  // Callback from EditMedicineModal
  const handleMedicineEdited = () => {
    console.log("InventoryManagement: Medicine edited. Triggering refresh.")
    setShowEditModal(false)
    setEditingItem(null)
    fetchInventory()
    onRefreshData()
  }

  // Create a Map for O(1) lookups
  const inventoryMap = useMemo(() => {
    const map = new Map<number, MedicineItem>()
    inventory.forEach((item) => map.set(item.id_farmaco, item))
    return map
  }, [inventory])

  // Helper function to find the full item details
  const findFullItem = (id: number): MedicineItem | undefined => {
    return inventoryMap.get(id)
  }

  // Apply search and category filters to inventory state
  const filteredInventory = useMemo(() => {
    if (!inventory?.length) return []
    if (!inventarioSearch && !selectedCategory) return inventory

    const lowerSearch = inventarioSearch.toLowerCase()

    return inventory.filter((item) => {
      // Early return for category filter
      if (selectedCategory && item.categoria?.toLowerCase() !== selectedCategory.toLowerCase()) {
        return false
      }

      // Early return for search filter
      if (inventarioSearch) {
        return (
          item.nombre_medicamento.toLowerCase().includes(lowerSearch) ||
          item.marca_comercial.toLowerCase().includes(lowerSearch) ||
          item.upc?.toLowerCase().includes(lowerSearch) ||
          item.lote?.toLowerCase().includes(lowerSearch) ||
          item.ubicacion_stand?.toLowerCase().includes(lowerSearch) ||
          item.categoria?.toLowerCase().includes(lowerSearch)
        )
      }

      return true
    })
  }, [inventory, debouncedSearch, selectedCategory])

  // Helper function to format dates for display
  const formatDateDisplay = (dateString: string | null | undefined): string => {
    if (!dateString) return "N/A"
    try {
      const date = new Date(dateString)
      if (isNaN(date.getTime())) return "Fecha inválida"

      const day = date.getDate().toString().padStart(2, "0")
      const month = (date.getMonth() + 1).toString().padStart(2, "0")
      const year = date.getFullYear()
      return `${day}/${month}/${year}`
    } catch (e) {
      console.error("Error formatting date:", dateString, e)
      return "Fecha inválida"
    }
  }

  const TableRow = React.memo(
    ({
      item,
      onEdit,
      onDelete,
      formatDateDisplay,
    }: {
      item: MedicineItem
      onEdit: (item: MedicineItem) => void
      onDelete: (id: number) => void
      formatDateDisplay: (date: string | null | undefined) => string
    }) => (
      <tr key={item.id_farmaco} className="hover:bg-white/10 transition-all duration-100">
        <td className="px-6 py-4 text-gray-800 dark:text-gray-100 font-medium">{item.nombre_medicamento}</td>
        <td className="px-6 py-4 text-gray-700 dark:text-gray-200">{item.marca_comercial}</td>
        <td className="px-6 py-4 text-gray-700 dark:text-gray-200">{item.categoria || "N/A"}</td>
        <td className="px-6 py-4 text-gray-700 dark:text-gray-200 font-medium">{item.unidades}</td>
        <td className="px-6 py-4 text-gray-700 dark:text-gray-200">{item.stock_minimo}</td>
        <td className="px-6 py-4">
          <span
            className={
              item.fecha_caducidad && new Date(item.fecha_caducidad) < new Date()
                ? "text-red-600 dark:text-red-400 font-semibold bg-red-100/50 dark:bg-red-900/50 px-2 py-1 rounded-lg"
                : "text-gray-700 dark:text-gray-200"
            }
          >
            {formatDateDisplay(item.fecha_caducidad)}
          </span>
        </td>
        <td className="px-6 py-4 text-gray-700 dark:text-gray-200 font-medium">${item.precio_en_pesos?.toFixed(2)}</td>
        <td className="px-6 py-4 text-gray-700 dark:text-gray-200">
          {formatDateDisplay(item.fecha_ultimo_movimiento)}
        </td>
        <td className="px-6 py-4">
          <div className="flex items-center space-x-3">
            <button
              onClick={() => onEdit(item)}
              className="text-blue-700 dark:text-blue-300 hover:text-blue-900 dark:hover:text-blue-100 font-medium px-3 py-1 rounded-lg bg-blue-100/50 dark:bg-blue-800/50 hover:bg-blue-200/60 dark:hover:bg-blue-700/60 backdrop-blur-sm border border-blue-200/30 dark:border-blue-600/30 transition-all duration-150 hover:scale-105 active:scale-95 text-sm"
            >
              Editar
            </button>
            <button
              onClick={() => onDelete(item.id_farmaco)}
              className="text-red-700 dark:text-red-300 hover:text-red-900 dark:hover:text-red-100 font-medium px-3 py-1 rounded-lg bg-red-100/50 dark:bg-red-800/50 hover:bg-red-200/60 dark:hover:bg-red-700/60 backdrop-blur-sm border border-red-200/30 dark:border-red-600/30 transition-all duration-150 hover:scale-105 active:scale-95 text-sm"
            >
              Eliminar
            </button>
          </div>
        </td>
      </tr>
    ),
  )

  return (
    <div className="p-6">
      {/* Main Aero Glass Container */}
      <div className="relative bg-white/20 dark:bg-gray-900/20 backdrop-blur-md border border-white/30 dark:border-gray-700/30 rounded-3xl shadow-2xl p-8 overflow-hidden">
        {/* Aero Glass Effect Overlay */}
        <div className="absolute inset-0 bg-gradient-to-br from-white/40 via-blue-50/30 to-transparent dark:from-gray-800/40 dark:via-gray-700/30 dark:to-transparent pointer-events-none rounded-3xl"></div>

        {/* Content Container */}
        <div className="relative z-10">
          {/* Header with Aero styling */}
          <div className="mb-8">
            <h2 className="text-3xl font-light text-blue-900/90 dark:text-blue-100/90 mb-2 tracking-wide">
              Gestión de Inventario
            </h2>
            <div className="h-px bg-gradient-to-r from-blue-300/50 via-blue-400/30 to-transparent dark:from-blue-600/50 dark:via-blue-500/30"></div>
          </div>

          {error && (
            <div className="mb-6 p-4 bg-red-100/60 dark:bg-red-900/60 backdrop-blur-sm border border-red-200/50 dark:border-red-700/50 rounded-2xl shadow-lg">
              <div className="text-red-700 dark:text-red-200 font-medium">{error}</div>
            </div>
          )}

          {/* Action Buttons with Aero Glass Effect */}
          <div className="mb-8 flex flex-wrap justify-end items-center gap-4">
            <button
              onClick={handleRefreshClick}
              disabled={isRefreshing}
              className={`px-6 py-3 rounded-2xl backdrop-blur-md border transition-all duration-150 shadow-lg flex items-center justify-center text-sm font-medium ${
                isRefreshing
                  ? "bg-blue-200/40 dark:bg-blue-800/40 border-blue-300/50 dark:border-blue-600/50 text-blue-600/70 dark:text-blue-300/70 cursor-not-allowed"
                  : "bg-white/30 dark:bg-gray-800/30 border-white/40 dark:border-gray-600/40 text-blue-800 dark:text-blue-200 hover:bg-white/40 dark:hover:bg-gray-700/40 hover:shadow-xl hover:scale-105 active:scale-95"
              }`}
              title="Actualizar datos de inventario"
            >
              <RefreshCw size={18} className={`${isRefreshing ? "animate-spin" : ""} mr-2`} />
              Actualizar
            </button>

            <button
              onClick={() => setShowAddModal(true)}
              className="px-6 py-3 bg-gradient-to-r from-blue-500/80 to-blue-600/80 dark:from-blue-600/80 dark:to-blue-700/80 backdrop-blur-md text-white rounded-2xl border border-blue-400/30 dark:border-blue-500/30 hover:from-blue-600/90 hover:to-blue-700/90 dark:hover:from-blue-700/90 dark:hover:to-blue-800/90 hover:shadow-xl hover:scale-105 active:scale-95 transition-all duration-150 shadow-lg text-sm font-medium"
            >
              Agregar Medicamento
            </button>
          </div>

          {/* Alert Sections with Aero Glass Cards */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-10">
            {/* Expiring Soon Section */}
            <div className="bg-white/25 dark:bg-gray-800/25 backdrop-blur-md border border-white/30 dark:border-gray-700/30 rounded-2xl shadow-xl overflow-hidden">
              <div className="p-6">
                <h3
                  className="text-xl font-medium mb-4 text-blue-800/90 dark:text-blue-200/90 flex justify-between items-center cursor-pointer hover:text-blue-900 dark:hover:text-blue-100 transition-colors duration-100"
                  onClick={() => setShowExpiringDetails(!showExpiringDetails)}
                  aria-expanded={showExpiringDetails}
                >
                  <span>Medicamentos por Caducar</span>
                  <div className="flex items-center space-x-2">
                    <span className="text-sm font-normal bg-orange-200/60 dark:bg-orange-800/60 text-orange-800 dark:text-orange-200 px-3 py-1 rounded-full backdrop-blur-sm border border-orange-300/30 dark:border-orange-600/30">
                      {medicamentosPorCaducar?.length || 0}
                    </span>
                    <svg
                      className={`w-5 h-5 transform transition-transform duration-150 ${showExpiringDetails ? "rotate-180" : "rotate-0"}`}
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path>
                    </svg>
                  </div>
                </h3>

                {!showExpiringDetails && medicamentosPorCaducar?.length > 0 && (
                  <div className="space-y-3 max-h-40 overflow-y-auto pr-2 custom-scrollbar">
                    {medicamentosPorCaducar.map((item) => (
                      <div
                        key={`exp-short-${item.id_farmaco}`}
                        className="flex justify-between items-center p-3 bg-white/20 dark:bg-gray-700/20 backdrop-blur-sm rounded-xl border border-white/20 dark:border-gray-600/20 hover:bg-white/30 dark:hover:bg-gray-600/30 transition-all duration-100"
                      >
                        <span className="text-gray-800 dark:text-gray-200 font-medium">{item.nombre_medicamento}</span>
                        <span className="text-orange-700 dark:text-orange-300 font-medium text-xs px-3 py-1 rounded-full bg-orange-200/70 dark:bg-orange-800/70 backdrop-blur-sm border border-orange-300/30 dark:border-orange-600/30">
                          ¡Pronto!
                        </span>
                      </div>
                    ))}
                  </div>
                )}

                {medicamentosPorCaducar?.length === 0 && !showExpiringDetails && (
                  <p className="text-blue-600/80 dark:text-blue-400/80 italic text-sm bg-blue-50/30 dark:bg-blue-900/30 p-3 rounded-xl backdrop-blur-sm border border-blue-200/30 dark:border-blue-700/30">
                    Ningún medicamento próximo a caducar.
                  </p>
                )}

                {showExpiringDetails && (
                  <div className="mt-6 pt-4 border-t border-white/20">
                    <h4 className="text-lg font-medium text-blue-800/90 mb-4">Detalles Completos</h4>
                    {medicamentosPorCaducar?.length > 0 ? (
                      <div className="overflow-x-auto rounded-xl bg-white/20 dark:bg-gray-800/20 backdrop-blur-sm border border-white/20 dark:border-gray-700/20">
                        <table className="min-w-full">
                          <thead className="bg-white/30 dark:bg-gray-700/30 backdrop-blur-sm">
                            <tr>
                              <th className="px-4 py-3 text-left text-xs font-semibold text-blue-900 dark:text-blue-100 uppercase tracking-wider">
                                Nombre
                              </th>
                              <th className="px-4 py-3 text-left text-xs font-semibold text-blue-900 dark:text-blue-100 uppercase tracking-wider">
                                Lote
                              </th>
                              <th className="px-4 py-3 text-left text-xs font-semibold text-blue-900 dark:text-blue-100 uppercase tracking-wider">
                                Piezas
                              </th>
                              <th className="px-4 py-3 text-left text-xs font-semibold text-blue-900 dark:text-blue-100 uppercase tracking-wider">
                                Ubicación
                              </th>
                              <th className="px-4 py-3 text-left text-xs font-semibold text-blue-900 dark:text-blue-100 uppercase tracking-wider">
                                Caducidad
                              </th>
                              <th className="px-4 py-3 text-left text-xs font-semibold text-blue-900 dark:text-blue-100 uppercase tracking-wider">
                                Precio
                              </th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-white/20 dark:divide-gray-600/20">
                            {medicamentosPorCaducar.map((alertItem) => {
                              const fullItem = findFullItem(alertItem.id_farmaco)
                              if (!fullItem) {
                                return (
                                  <tr key={`exp-missing-${alertItem.id_farmaco}`}>
                                    <td
                                      colSpan={6}
                                      className="px-4 py-3 text-red-600 italic bg-red-50/30 backdrop-blur-sm"
                                    >
                                      Datos no encontrados para: {alertItem.nombre_medicamento}
                                    </td>
                                  </tr>
                                )
                              }
                              return (
                                <tr
                                  key={`exp-detail-${fullItem.id_farmaco}`}
                                  className="hover:bg-white/10 transition-colors duration-100"
                                >
                                  <td className="px-4 py-3 text-gray-800 dark:text-gray-100 font-medium">
                                    {fullItem.nombre_medicamento}
                                  </td>
                                  <td className="px-4 py-3 text-gray-700 dark:text-gray-200">
                                    {fullItem.lote || "N/A"}
                                  </td>
                                  <td className="px-4 py-3 text-gray-700 dark:text-gray-200">{fullItem.unidades}</td>
                                  <td className="px-4 py-3 text-gray-700 dark:text-gray-200">
                                    {fullItem.ubicacion_stand || "N/A"}
                                  </td>
                                  <td className="px-4 py-3 text-orange-700 dark:text-orange-300 font-semibold">
                                    {formatDateDisplay(fullItem.fecha_caducidad)}
                                  </td>
                                  <td className="px-4 py-3 text-gray-700 dark:text-gray-200 font-medium">
                                    ${fullItem.precio_en_pesos?.toFixed(2)}
                                  </td>
                                </tr>
                              )
                            })}
                          </tbody>
                        </table>
                      </div>
                    ) : (
                      <p className="text-blue-600/80 italic text-sm bg-blue-50/30 dark:bg-blue-900/30 p-3 rounded-xl backdrop-blur-sm border border-blue-200/30 dark:border-blue-700/30">
                        Ningún medicamento próximo a caducar.
                      </p>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* No Movement Section */}
            <div className="bg-white/25 dark:bg-gray-800/25 backdrop-blur-md border border-white/30 dark:border-gray-700/30 rounded-2xl shadow-xl overflow-hidden">
              <div className="p-6">
                <h3
                  className="text-xl font-medium mb-4 text-blue-800/90 dark:text-blue-200/90 flex justify-between items-center cursor-pointer hover:text-blue-900 dark:hover:text-blue-100 transition-colors duration-100"
                  onClick={() => setShowNoMovementDetails(!showNoMovementDetails)}
                  aria-expanded={showNoMovementDetails}
                >
                  <span>Medicamentos Sin Movimiento</span>
                  <div className="flex items-center space-x-2">
                    <span className="text-sm font-normal bg-red-200/60 dark:bg-red-800/60 text-red-800 dark:text-red-200 px-3 py-1 rounded-full backdrop-blur-sm border border-red-300/30 dark:border-red-600/30">
                      {medicamentosSinMovimiento?.length || 0}
                    </span>
                    <svg
                      className={`w-5 h-5 transform transition-transform duration-150 ${showNoMovementDetails ? "rotate-180" : "rotate-0"}`}
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path>
                    </svg>
                  </div>
                </h3>

                {!showNoMovementDetails && medicamentosSinMovimiento?.length > 0 && (
                  <div className="space-y-3 max-h-40 overflow-y-auto pr-2 custom-scrollbar">
                    {medicamentosSinMovimiento.map((item) => (
                      <div
                        key={`nomov-short-${item.id_farmaco}`}
                        className="flex justify-between items-center p-3 bg-white/20 dark:bg-gray-700/20 backdrop-blur-sm rounded-xl border border-white/20 dark:border-gray-600/20 hover:bg-white/30 dark:hover:bg-gray-600/30 transition-all duration-100"
                      >
                        <span className="text-gray-800 dark:text-gray-200 font-medium">{item.nombre_medicamento}</span>
                        <span className="text-red-700 dark:text-red-300 font-medium text-xs px-3 py-1 rounded-full bg-red-200/70 dark:bg-red-800/70 backdrop-blur-sm border border-red-300/30 dark:border-red-600/30">
                          Sin Mov.
                        </span>
                      </div>
                    ))}
                  </div>
                )}

                {!showNoMovementDetails && medicamentosSinMovimiento?.length === 0 && (
                  <p className="text-blue-600/80 dark:text-blue-400/80 italic text-sm bg-blue-50/30 dark:bg-blue-900/30 p-3 rounded-xl backdrop-blur-sm border border-blue-200/30 dark:border-blue-700/30">
                    Ningún medicamento sin movimiento reciente.
                  </p>
                )}

                {showNoMovementDetails && (
                  <div className="mt-6 pt-4 border-t border-white/20">
                    <h4 className="text-lg font-medium text-blue-800/90 mb-4">Detalles Completos</h4>
                    {medicamentosSinMovimiento?.length > 0 ? (
                      <div className="overflow-x-auto rounded-xl bg-white/20 dark:bg-gray-800/20 backdrop-blur-sm border border-white/20 dark:border-gray-700/20">
                        <table className="min-w-full">
                          <thead className="bg-white/30 dark:bg-gray-700/30 backdrop-blur-sm">
                            <tr>
                              <th className="px-4 py-3 text-left text-xs font-semibold text-blue-900 dark:text-blue-100 uppercase tracking-wider">
                                Nombre
                              </th>
                              <th className="px-4 py-3 text-left text-xs font-semibold text-blue-900 dark:text-blue-100 uppercase tracking-wider">
                                Lote
                              </th>
                              <th className="px-4 py-3 text-left text-xs font-semibold text-blue-900 dark:text-blue-100 uppercase tracking-wider">
                                Piezas
                              </th>
                              <th className="px-4 py-3 text-left text-xs font-semibold text-blue-900 dark:text-blue-100 uppercase tracking-wider">
                                Ubicación
                              </th>
                              <th className="px-4 py-3 text-left text-xs font-semibold text-blue-900 dark:text-blue-100 uppercase tracking-wider">
                                Último Movimiento
                              </th>
                              <th className="px-4 py-3 text-left text-xs font-semibold text-blue-900 dark:text-blue-100 uppercase tracking-wider">
                                Precio
                              </th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-white/20 dark:divide-gray-600/20">
                            {medicamentosSinMovimiento.map((alertItem) => {
                              const fullItem = findFullItem(alertItem.id_farmaco)
                              if (!fullItem) {
                                return (
                                  <tr key={`nomov-missing-${alertItem.id_farmaco}`}>
                                    <td
                                      colSpan={6}
                                      className="px-4 py-3 text-red-600 italic bg-red-50/30 backdrop-blur-sm"
                                    >
                                      Datos no encontrados para: {alertItem.nombre_medicamento}
                                    </td>
                                  </tr>
                                )
                              }
                              return (
                                <tr
                                  key={`nomov-detail-${fullItem.id_farmaco}`}
                                  className="hover:bg-white/10 transition-colors duration-100"
                                >
                                  <td className="px-4 py-3 text-gray-800 dark:text-gray-100 font-medium">
                                    {fullItem.nombre_medicamento}
                                  </td>
                                  <td className="px-4 py-3 text-gray-700 dark:text-gray-200">
                                    {fullItem.lote || "N/A"}
                                  </td>
                                  <td className="px-4 py-3 text-gray-700 dark:text-gray-200">{fullItem.unidades}</td>
                                  <td className="px-4 py-3 text-gray-700 dark:text-gray-200">
                                    {fullItem.ubicacion_stand || "N/A"}
                                  </td>
                                  <td className="px-4 py-3 text-red-700 dark:text-red-300 font-semibold">
                                    {formatDateDisplay(fullItem.fecha_ultimo_movimiento)}
                                  </td>
                                  <td className="px-4 py-3 text-gray-700 dark:text-gray-200 font-medium">
                                    ${fullItem.precio_en_pesos?.toFixed(2)}
                                  </td>
                                </tr>
                              )
                            })}
                          </tbody>
                        </table>
                      </div>
                    ) : (
                      <p className="text-blue-600/80 italic text-sm bg-blue-50/30 dark:bg-blue-900/30 p-3 rounded-xl backdrop-blur-sm border border-blue-200/30 dark:border-blue-700/30">
                        Ningún medicamento sin movimiento reciente.
                      </p>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Search and Filter Section with Aero Glass */}
          <div className="mb-8 p-6 bg-white/20 dark:bg-gray-800/20 backdrop-blur-md border border-white/30 dark:border-gray-700/30 rounded-2xl shadow-lg">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Search Input */}
              <div>
                <label
                  htmlFor="inventory-search"
                  className="block text-sm font-medium text-blue-900/80 dark:text-blue-100/80 mb-2"
                >
                  Buscar en Inventario
                </label>
                <input
                  id="inventory-search"
                  type="text"
                  placeholder="Nombre, Marca, UPC, Lote, Ubicación..."
                  value={inventarioSearch}
                  onChange={(e) => setInventarioSearch(e.target.value)}
                  className="w-full px-4 py-3 bg-white/30 dark:bg-gray-700/30 backdrop-blur-md border border-white/40 dark:border-gray-600/40 rounded-xl shadow-inner focus:outline-none focus:ring-2 focus:ring-blue-400/50 focus:border-blue-400/50 transition-all duration-150 text-gray-900 dark:text-gray-100 placeholder-gray-600/70 dark:placeholder-gray-400/70"
                />
              </div>

              {/* Category Filter */}
              <div>
                <label
                  htmlFor="category-filter"
                  className="block text-sm font-medium text-blue-900/80 dark:text-blue-100/80 mb-2"
                >
                  Filtrar por Categoría
                </label>
                <select
                  id="category-filter"
                  value={selectedCategory}
                  onChange={(e) => setSelectedCategory(e.target.value)}
                  className="w-full px-4 py-3 bg-white/30 backdrop-blur-md border border-white/40 rounded-xl shadow-inner focus:outline-none focus:ring-2 focus:ring-blue-400/50 focus:border-blue-400/50 transition-all duration-150 text-gray-900"
                >
                  {CATEGORY_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* Main Inventory Table with Aero Glass */}
          <div className="bg-white/20 dark:bg-gray-800/20 backdrop-blur-md border border-white/30 dark:border-gray-700/30 rounded-2xl shadow-xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="min-w-full">
                <thead className="bg-white/30 dark:bg-gray-700/30 backdrop-blur-md">
                  <tr>
                    <th className="px-6 py-4 text-left text-xs font-semibold text-blue-900 dark:text-blue-100 uppercase tracking-wider">
                      Nombre
                    </th>
                    <th className="px-6 py-4 text-left text-xs font-semibold text-blue-900 dark:text-blue-100 uppercase tracking-wider">
                      Marca
                    </th>
                    <th className="px-6 py-4 text-left text-xs font-semibold text-blue-900 dark:text-blue-100 uppercase tracking-wider">
                      Categoría
                    </th>
                    <th className="px-6 py-4 text-left text-xs font-semibold text-blue-900 dark:text-blue-100 uppercase tracking-wider">
                      Stock
                    </th>
                    <th className="px-6 py-4 text-left text-xs font-semibold text-blue-900 dark:text-blue-100 uppercase tracking-wider">
                      Mínimo
                    </th>
                    <th className="px-6 py-4 text-left text-xs font-semibold text-blue-900 dark:text-blue-100 uppercase tracking-wider">
                      Caducidad
                    </th>
                    <th className="px-6 py-4 text-left text-xs font-semibold text-blue-900 dark:text-blue-100 uppercase tracking-wider">
                      Precio
                    </th>
                    <th className="px-6 py-4 text-left text-xs font-semibold text-blue-900 dark:text-blue-100 uppercase tracking-wider">
                      Último Mov.
                    </th>
                    <th className="px-6 py-4 text-left text-xs font-semibold text-blue-900 dark:text-blue-100 uppercase tracking-wider">
                      Acciones
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/20 dark:divide-gray-600/20">
                  {isRefreshing && (
                    <tr>
                      <td colSpan={9} className="px-6 py-8 text-center">
                        <div className="flex items-center justify-center space-x-3">
                          <RefreshCw className="w-6 h-6 animate-spin text-blue-600" />
                          <span className="text-blue-700 font-medium">Cargando inventario...</span>
                        </div>
                      </td>
                    </tr>
                  )}

                  {!isRefreshing && error && (
                    <tr>
                      <td colSpan={9} className="px-6 py-8 text-center">
                        <div className="text-red-600 font-medium bg-red-50/30 backdrop-blur-sm p-4 rounded-xl border border-red-200/30">
                          {error}
                        </div>
                      </td>
                    </tr>
                  )}

                  {!isRefreshing && !error && filteredInventory.length === 0 && (
                    <tr>
                      <td colSpan={9} className="px-6 py-8 text-center">
                        <div className="text-blue-700 italic bg-blue-50/30 backdrop-blur-sm p-4 rounded-xl border border-blue-200/30">
                          {inventory.length === 0
                            ? Id_Far
                              ? "El inventario está vacío."
                              : "Seleccione una farmacia para ver el inventario."
                            : "No se encontraron resultados para la búsqueda o filtro actual."}
                        </div>
                      </td>
                    </tr>
                  )}

                  {!isRefreshing &&
                    !error &&
                    filteredInventory.length > 0 &&
                    filteredInventory.map((item) => (
                      <TableRow
                        key={item.id_farmaco}
                        item={item}
                        onEdit={handleEditClick}
                        onDelete={handleDelete}
                        formatDateDisplay={formatDateDisplay}
                      />
                    ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>

      {/* Modals */}
      <AddMedicineModal
        isOpen={showAddModal}
        onClose={() => setShowAddModal(false)}
        Id_Far={Id_Far}
        onMedicineAdded={handleMedicineAdded}
      />
      <EditMedicineModal
        isOpen={showEditModal}
        onClose={() => {
          setShowEditModal(false)
          setEditingItem(null)
        }}
        itemToEdit={editingItem}
        onMedicineEdited={handleMedicineEdited}
      />

      {/* Custom Scrollbar Styles */}
            {/* Custom Scrollbar Styles */}
      <style>{`
        .custom-scrollbar::-webkit-scrollbar {
          width: 8px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: rgba(255, 255, 255, 0.1);
          border-radius: 10px;
        }
        @media (prefers-color-scheme: dark) {
          .custom-scrollbar::-webkit-scrollbar-track {
            background: rgba(0, 0, 0, 0.2);
          }
          .custom-scrollbar::-webkit-scrollbar-thumb {
            background: rgba(59, 130, 246, 0.4);
          }
          .custom-scrollbar::-webkit-scrollbar-thumb:hover {
            background: rgba(59, 130, 246, 0.6);
          }
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: rgba(59, 130, 246, 0.3);
          border-radius: 10px;
          backdrop-filter: blur(10px);
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: rgba(59, 130, 246, 0.5);
        }
      `}</style>
    </div>
  )
}

export default InventoryManagement
