

export default function terminos() {
  return (
    <div className="min-h-screen bg-white p-6 md:p-12">
      <div className="max-w-3xl mx-auto">
        <h1 className="text-3xl font-bold text-gray-900 mb-4">Términos y Condiciones</h1>
        <p className="text-gray-700 text-base leading-relaxed mb-4">
          Bienvenido a Carelux Point. Al utilizar nuestro sitio web, aceptas los siguientes términos y condiciones...
        </p>
        <p className="text-gray-700 text-base leading-relaxed mb-4">
          [Aquí puedes agregar el contenido completo de tus términos.]
        </p>
        <p className="text-gray-500 text-sm mt-8">
          Última actualización: {new Date().toLocaleDateString()}
        </p>
      </div>
    </div>
  )
}

