import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, saveUser, getUser } from "../api";
import { useEffect } from "react";

export default function Login() {
  const navigate = useNavigate();
  const [nombre, setNombre] = useState("");
  const [clave, setClave] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const { token } = getUser();
    if (token) navigate("/dashboard");
  }, []);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!nombre.trim() || !clave) return;
    setError("");
    setLoading(true);
    try {
      const data = await api.login(nombre.trim(), clave);
      saveUser(data);
      navigate("/dashboard");
    } catch (err) {
      setError("Credenciales incorrectas");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-sinan-bg flex flex-col items-center justify-center px-6">
      {/* Logo */}
      <div className="mb-10 text-center">
        <div className="text-5xl font-bold text-gold-500 tracking-widest mb-1">SINAN</div>
        <div className="text-sinan-muted text-sm tracking-wider uppercase">Constructora · CRM</div>
      </div>

      {/* Form */}
      <form onSubmit={handleSubmit} className="w-full max-w-sm flex flex-col gap-4">
        <div>
          <label className="text-sinan-muted text-sm mb-1.5 block">Usuario</label>
          <input
            className="input-dark"
            type="text"
            placeholder="Gary o Rodrigo"
            value={nombre}
            onChange={e => setNombre(e.target.value)}
            autoComplete="username"
            autoCapitalize="none"
          />
        </div>

        <div>
          <label className="text-sinan-muted text-sm mb-1.5 block">Contraseña</label>
          <input
            className="input-dark"
            type="password"
            placeholder="••••••••"
            value={clave}
            onChange={e => setClave(e.target.value)}
            autoComplete="current-password"
          />
        </div>

        {error && (
          <div className="bg-red-900/40 border border-red-700/50 rounded-xl px-4 py-3 text-red-300 text-sm">
            {error}
          </div>
        )}

        <button
          type="submit"
          className="btn-gold mt-2"
          disabled={loading || !nombre.trim() || !clave}
        >
          {loading ? "Ingresando…" : "Ingresar"}
        </button>
      </form>
    </div>
  );
}
