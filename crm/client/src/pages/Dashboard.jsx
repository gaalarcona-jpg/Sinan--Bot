import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, getUser } from "../api";
import Layout from "../components/Layout";
import BarraAvance from "../components/BarraAvance";

const fmt = (n) => "$" + Math.round(n || 0).toLocaleString("es-CL");

export default function Dashboard() {
  const [obras, setObras] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const navigate = useNavigate();
  const { nombre, rol } = getUser();

  useEffect(() => {
    api.obras()
      .then(setObras)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  return (
    <Layout title={`Hola, ${nombre}`}>
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-semibold text-sinan-text">Obras activas</h2>
        <span className="text-sinan-muted text-sm">{obras.length} obras</span>
      </div>

      {loading && (
        <div className="flex justify-center py-16">
          <div className="w-8 h-8 border-2 border-gold-500 border-t-transparent rounded-full animate-spin" />
        </div>
      )}

      {error && (
        <div className="card border-red-700/50 text-red-300 text-sm">{error}</div>
      )}

      {!loading && !error && obras.length === 0 && (
        <div className="card text-center text-sinan-muted py-10">
          No hay obras activas registradas.
        </div>
      )}

      <div className="flex flex-col gap-3">
        {obras.map(obra => (
          <button
            key={obra.id}
            onClick={() => navigate(`/obras/${obra.id}`)}
            className="card text-left active:bg-sinan-border transition-colors"
          >
            <div className="flex items-start justify-between mb-3">
              <div>
                <div className="font-semibold text-sinan-text text-base">{obra.nombre}</div>
                <div className="text-sinan-muted text-sm mt-0.5">
                  {obra.etapasCompletadas}/{obra.etapasCount} etapas completadas
                </div>
              </div>
              <span className={`text-xs font-medium px-2 py-1 rounded-full ${
                obra.pctAvance >= 100 ? "badge-danger" :
                obra.pctAvance >= 90  ? "badge-warn" :
                "badge-ok"
              }`}>
                {obra.pctAvance}%
              </span>
            </div>

            <BarraAvance
              pct={obra.pctAvance}
              gastado={obra.gastadoTotal}
              presupuesto={obra.presupuestoTotal}
            />

            <div className="flex justify-between mt-3 text-xs text-sinan-muted">
              <span>Gastado: <span className="text-sinan-text font-medium">{fmt(obra.gastadoTotal)}</span></span>
              <span>Ppto: <span className="text-sinan-text font-medium">{fmt(obra.presupuestoTotal)}</span></span>
            </div>
          </button>
        ))}
      </div>

      {rol === "admin" && obras.length > 0 && (
        <button
          onClick={() => navigate("/resultados")}
          className="mt-6 w-full border border-gold-500/40 text-gold-400 font-medium py-4 rounded-xl text-base hover:bg-gold-500/10 transition-colors"
        >
          📊 Ver Estado de Resultados
        </button>
      )}
    </Layout>
  );
}
