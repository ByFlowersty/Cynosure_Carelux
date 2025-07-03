import { useState, type FormEvent, type ChangeEvent } from "react"
import { useNavigate } from "react-router-dom"
import { MailIcon } from "lucide-react"
import supabase from "../../lib/supabaseClient"
import { Input } from "../ui/input"
import { Button } from "../ui/button"
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from "../ui/card"

export default function RecuperarContraseña() {
  const [email, setEmail] = useState("")
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState("")
  const [error, setError] = useState("")
  const navigate = useNavigate()

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setLoading(true)
    setMessage("")
    setError("")

    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/cambiar-contraseña`,
    })

    if (error) {
      setError(error.message)
    } else {
      setMessage("Hemos enviado un enlace de recuperación a tu correo.")
    }

    setLoading(false)
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-emerald-50 to-white p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-emerald-100 mb-4">
            <img
              src="/logo.png"
              alt="Carelux Point Logo"
              width="128"
              height="128"
              className="opacity-90"
            />
          </div>
          <h1 className="text-2xl font-bold text-gray-900">
            Recuperar Contraseña
          </h1>
          <p className="text-gray-500 mt-1">
            Te ayudamos a volver a acceder a tu cuenta
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg text-center">
              ¿Olvidaste tu contraseña?
            </CardTitle>
            <CardDescription className="text-center">
              Ingresa tu correo y te enviaremos un enlace para recuperarla.
            </CardDescription>
          </CardHeader>

          {error && (
            <div className="mx-6 mb-2 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-md text-sm">
              {error}
            </div>
          )}
          {message && (
            <div className="mx-6 mb-2 bg-emerald-50 border border-emerald-200 text-emerald-700 px-4 py-3 rounded-md text-sm">
              {message}
            </div>
          )}

          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <label
                  htmlFor="email"
                  className="text-sm font-medium text-gray-700 flex items-center gap-2"
                >
                  <MailIcon className="h-4 w-4" />
                  Correo electrónico
                </label>
                <Input
                  id="email"
                  name="email"
                  type="email"
                  placeholder="tu@email.com"
                  required
                  value={email}
                  onChange={(e: ChangeEvent<HTMLInputElement>) =>
                    setEmail(e.target.value)
                  }
                />
              </div>

              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? (
                  <span className="flex items-center justify-center">
                    <svg
                      className="animate-spin mr-2 h-4 w-4 text-white"
                      xmlns="http://www.w3.org/2000/svg"
                      fill="none"
                      viewBox="0 0 24 24"
                    >
                      <circle
                        className="opacity-25"
                        cx="12"
                        cy="12"
                        r="10"
                        stroke="currentColor"
                        strokeWidth="4"
                      />
                      <path
                        className="opacity-75"
                        fill="currentColor"
                        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 
                          12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                      />
                    </svg>
                    Enviando...
                  </span>
                ) : (
                  "Enviar enlace de recuperación"
                )}
              </Button>
            </form>
          </CardContent>

          <CardFooter className="flex flex-col items-center space-y-4">
            <Button
              variant="link"
              onClick={() => navigate("/login")}
              className="text-emerald-600"
            >
              Volver al inicio de sesión
            </Button>
          </CardFooter>
        </Card>

        <div className="mt-8 text-center text-xs text-gray-500">
          <p>© {new Date().getFullYear()} Carelux Point. Todos los derechos reservados.</p>
        </div>
      </div>
    </div>
  )
}
