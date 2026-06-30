import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { api, getUser } from "../api";
import Layout from "../components/Layout";

const fmt = (n) => "$" + Math.round(n || 0).toLocaleString("es-CL");
const fmtFecha = (s) => s ? new Date(s).toLocaleDateString("es-CL") : "—";

function EstadoBadge({ estado }) {
  if (estado === "pendiente") return <span className="badge-warn">⏳ Pendiente</span>;
  if (estado === "pagado") return <span className="badge-ok">✓ Pagado</span>;
  if (estado === "rechazado") return <span className="badge-danger">✗ Rechazado</span>;
  return <span className="text-xs text-sinan-muted">{estado}</span>;
}

export default function Rendiciones() {
  const [params] = useSearchParams();
  const obraId = params.get("obraId");
  const soloMode = params.get("solo") === "pendientes";

  const [gastos, setGastos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [modo, setModo] = useState(soloMode ? "pendientes" : "todas");

  useEffect(() => {
    setLoading(true);
    const p = modo === "pendientes"
      ? api.pendientes()
      : api.gastos(obraId ? { obraId } : {});

    p.then(setGastos)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, [modo, obraId]);

  const totalMonto = gastos.reduce((s, g) => s + parseFloat(g.monto || 0), 0);

  return (
    <Layout title={modo === "pendientes" ? "Pendientes de pago" : "Rendiciones"}>
      {/* Toggle modo */}
      <div className="flex gap-2 mb-4">
        <button
          onClick={() => setModo("pendientes")}
          className={`flex-1 py-3 rounded-xl text-sm font-medium transition-colors ${
            modo === "pendientes"
              ? "bg-gold-500 text-black"
              : "bg-sinan-surface text-sinan-muted border border-sinan-border"
          }`}
        >
          ⏳ Pendientes
        </button>
        <button
          onClick={() => setModo("todas")}
          className={`flex-1 py-3 rounded-xl text-sm font-medium transition-colors ${
            modo === "todas"
              ? "bg-gold-500 text-black"
              : "bg-sinan-surface text-sinan-muted border border-sinan-border"
          }`}
        >
          📋 Todas
        </button>
      </div>

      {/* Resumen */}
      {!loading && gastos.length > 0 && (
        <div className="card mb-4 flex justify-between items-center">
          <span className="text-sinan-muted text-sm">{gastos.length} rendiciones</span>
          <span className="text-gold-400 font-semibold">{fmt(totalMonto)}</span>
        </div>
      )}

      {loading && (
        <div className="flex justify-center py-16">
          <div className="w-8 h-8 border-2 border-gold-500 border-t-transparent rounded-full animate-spin" />
        </div>
      )}

      {error && (
        <div className="card border-red-700/50 text-red-300 text-sm">{error}</div>
      )}

      {!loading && !error && gastos.length === 0 && (
        <div className="card text-center text-sinan-muted py-10">
          {modo === "pendientes" ? "No hay gastos pendientes. ✓" : "No hay rendiciones registradas."}
        </div>
      )}

      <div className="flex flex-col gap-2">
        {gastos.map(g => (
          <div key={g.id} className="card">
            <div className="flex justify-between items-start mb-2">
              <div className="flex-1 pr-2">
                <div className="font-semibold text-sinan-text text-base">{fmt(g.monto)}</div>
                <div className="text-sinan-muted text-sm mt-0.5">{g.proveedor_nombre || "Sin proveedor"}</div>
              </div>
              <EstadoBadge estado={g.estado} />
            </div>

            <div className="text-xs text-sinan-muted space-y-0.5">
              <div>
                <span className="text-gold-500/80">Obra:</span>{" "}
                <span className="text-sinan-text">{g.obra_nombre || "—"}</span>
                {g.etapa_nombre && <> · {g.etapa_nombre}</>}
              </div>
              {g.item_nombre && (
                <div><span className="text-gold-500/80">Ítem:</span> {g.item_nombre}</div>
              )}
              {g.descripcion && (
                <div className="text-sinan-text/80 truncate">{g.descripcion}</div>
              )}
              <div>
                <span className="text-gold-500/80">Fecha:</span>{" "}
                {fmtFecha(g.fecha_documento || g.creado_en)}
                {g.tipo_documento && ` · ${g.tipo_documento}`}
              </div>
              {g.alerta_razon_social && (
                <div className="text-yellow-400">⚠ Alertado por razón social</div>
              )}
            </div>

            {g.imagen_drive_link && (
              <a
                href={g.imagen_drive_link}
                target="_blank"
                rel="noreferrer"
                className="mt-2 inline-block text-xs text-gold-400 underline"
              >
                Ver comprobante 📎
              </a>
            )}
          </div>
        ))}
      </div>
    </Layout>
  );
}
