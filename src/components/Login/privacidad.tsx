

export default function Privacidad() {
  return (
    <div className="min-h-screen bg-white p-6 md:p-12">
      <div className="max-w-3xl mx-auto">
        <h1 className="text-3xl font-bold text-gray-900 mb-6">Política de Privacidad</h1>

        <h2 className="text-2xl font-semibold text-gray-800 mb-4">¿Qué datos recopilamos?</h2>
        <p className="text-gray-700 text-base leading-relaxed mb-4">
          En Carelux Point, recopilamos información que nos proporciona directamente, como su nombre, correo electrónico y otra información necesaria para brindarle nuestros servicios.
        </p>

        <h2 className="text-2xl font-semibold text-gray-800 mb-4">¿Cómo usamos su información?</h2>
        <p className="text-gray-700 text-base leading-relaxed mb-4">
          Utilizamos su información para mejorar nuestros servicios, comunicarnos con usted sobre actualizaciones, y garantizar una experiencia segura y personalizada.
        </p>

        <h2 className="text-2xl font-semibold text-gray-800 mb-4">¿Con quién compartimos su información?</h2>
        <p className="text-gray-700 text-base leading-relaxed mb-4">
          No vendemos su información personal a terceros. Podemos compartir datos con proveedores de servicios confiables que nos ayudan a operar nuestro negocio bajo estrictas políticas de confidencialidad.
        </p>

        <h2 className="text-2xl font-semibold text-gray-800 mb-4">Sus derechos</h2>
        <p className="text-gray-700 text-base leading-relaxed mb-4">
          Usted tiene derecho a acceder, corregir o eliminar sus datos personales, así como a restringir su procesamiento. Para ejercer estos derechos, por favor contáctenos.
        </p>

        <p className="text-gray-500 text-sm mt-12">
          Última actualización: {new Date().toLocaleDateString('es-ES')}
        </p>
      </div>
    </div>
  )
}
