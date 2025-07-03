import { useState, type FormEvent, type ChangeEvent, useEffect } from "react"
import { useNavigate } from "react-router-dom"
import supabase from "../../lib/supabaseClient"
import { Input } from "../ui/input"
import { Button } from "../ui/button"
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  CardFooter,
} from "../ui/card"

export default function CambiarContraseña() {
  const [password, setPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState("")
  const [error, setError] = useState("")
  const navigate = useNavigate()

  // Opcional: Verificar si hay sesión activa (debug)
  useEffect(() => {
    const checkSession = async () => {
      const { data } = await supabase.auth.getSession()
      console.log("Sesión activa:", data.session)
    }
    checkSession()
  }, [])

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setLoading(true)
    setError("")
    setMessage("")

    if (password !== confirmPassword) {
      setError("Las contraseñas no coinciden.")
      setLoading(false)
      return
    }

    const { error } = await supabase.auth.updateUser({ password })

    if (error) {
      setError(error.message)
    } else {
      setMessage("Tu contraseña ha sido actualizada correctamente.")
      setTimeout(() => navigate("/login"), 2500)
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
          <h1 className="text-2xl font-bold text-gray-900">Cambiar Contraseña</h1>
          <p className="text-gray-500 mt-1">Crea una nueva contraseña para tu cuenta</p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg text-center">Nueva Contraseña</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              {error && (
                <div className="text-red-600 text-sm bg-red-100 px-3 py-2 rounded">
                  {error}
                </div>
              )}
              {message && (
                <div className="text-green-600 text-sm bg-green-100 px-3 py-2 rounded">
                  {message}
                </div>
              )}
              <div>
                <label className="text-sm font-medium text-gray-700">
                  Nueva contraseña
                </label>
                <Input
                  type="password"
                  required
                  value={password}
                  onChange={(e: ChangeEvent<HTMLInputElement>) =>
                    setPassword(e.target.value)
                  }
                />
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700">
                  Confirmar contraseña
                </label>
                <Input
                  type="password"
                  required
                  value={confirmPassword}
                  onChange={(e: ChangeEvent<HTMLInputElement>) =>
                    setConfirmPassword(e.target.value)
                  }
                />
              </div>
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? "Cambiando..." : "Actualizar contraseña"}
              </Button>
            </form>
          </CardContent>
          <CardFooter className="flex justify-center">
            <Button
              variant="link"
              onClick={() => navigate("/login")}
              className="text-emerald-600"
            >
              Volver al inicio de sesión
            </Button>
          </CardFooter>
        </Card>
      </div>
    </div>
  )
}
