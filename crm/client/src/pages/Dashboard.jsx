import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, getUser } from "../api";
import Layout from "../components/Layout";
import { BadgePlazo } from "../components/BadgePlazo";

const fmt = (n) => "$" + Math.round(n || 0).toLocaleString("es-CL");

export default function Dashboard() {
  const [obras, setObras] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const navigate = useNavigate();
  const { nombre, rol } = getUser();
  const esAdmin = rol === "admin";

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
            {/* Cabecera */}
            <div className="flex items-start justify-between mb-2">
              <div className="font-semibold text-sinan-text text-base">{obra.nombre}</div>
              <span className="text-xs text-sinan-muted ml-2 shrink-0">
                {obra.etapasCompletadas}/{obra.etapasCount} etapas
              </span>
            </div>

            {/* Métricas financieras */}
            {esAdmin ? (
              <div className="grid grid-cols-3 gap-2 mb-2">
                <div>
                  <div className="text-xs text-sinan-muted">Contrato</div>
                  <div className="text-sm font-semibold text-gold-400">
                    {obra.contrato != null ? fmt(obra.contrato) : "—"}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-sinan-muted">Cobrado</div>
                  <div className={`text-sm font-semibold ${obra.cobrado > 0 ? "text-green-400" : "text-sinan-text"}`}>
                    {fmt(obra.cobrado ?? 0)}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-sinan-muted">Gastado</div>
                  <div className="text-sm font-semibold text-sinan-text">
                    {fmt(obra.gastadoTotal)}
                  </div>
                </div>
              </div>
            ) : (
              <div className="mb-2">
                <div className="text-xs text-sinan-muted">Gastado</div>
                <div className="text-sm font-semibold text-sinan-text">{fmt(obra.gastadoTotal)}</div>
              </div>
            )}

            {/* Badge de plazo de etapa activa */}
            {obra.etapaActiva ? (
              <div className="flex flex-col gap-1">
                <div className="text-xs text-sinan-muted">{obra.etapaActiva.nombre}</div>
                <BadgePlazo plazo={obra.etapaActiva.plazo} />
              </div>
            ) : (
              <div className="text-xs text-sinan-muted/60 italic">Sin plazo activo</div>
            )}
          </button>
        ))}
      </div>

      {esAdmin && obras.length > 0 && (
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
