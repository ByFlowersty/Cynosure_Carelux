
export default function ayuda() {
  return (
    <div className="min-h-screen bg-white p-6 md:p-12">
      <div className="max-w-3xl mx-auto">
        <h1 className="text-3xl font-bold text-gray-900 mb-4">Necesitas ayuda para iniciar sesión ?</h1>
        <p className="text-gray-700 text-base leading-relaxed mb-4">
          Bienvenido a Carelux Point. 
        </p>
        <p className="text-gray-700 text-base leading-relaxed mb-4">
          Aun en trabajo
        </p>
        <p className="text-gray-500 text-sm mt-8">
          Última actualización: {new Date().toLocaleDateString()}
        </p>
      </div>
    </div>
  )
}