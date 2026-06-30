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

// Modal de confirmación de aprobación
function ModalAprobar({ gasto, onConfirm, onCancel, loading }) {
  return (
    <div className="fixed inset-0 bg-black/70 z-50 flex items-end sm:items-center justify-center p-4">
      <div className="bg-sinan-card border border-sinan-border rounded-2xl w-full max-w-sm p-5">
        <div className="text-base font-semibold text-sinan-text mb-1">¿Marcar como pagado?</div>
        <div className="text-sm text-sinan-muted mb-4">
          <span className="text-gold-400 font-semibold">{fmt(gasto.monto)}</span>
          {gasto.proveedor_nombre ? ` a ${gasto.proveedor_nombre}` : ""}
          {gasto.obra_nombre ? ` · ${gasto.obra_nombre}` : ""}
        </div>
        <div className="flex gap-3">
          <button
            onClick={onCancel}
            disabled={loading}
            className="flex-1 py-3 rounded-xl text-sm font-medium bg-sinan-surface border border-sinan-border text-sinan-muted"
          >
            Cancelar
          </button>
          <button
            onClick={onConfirm}
            disabled={loading}
            className="flex-1 py-3 rounded-xl text-sm font-semibold bg-green-700 text-white disabled:opacity-50"
          >
            {loading ? "Aprobando…" : "✅ Confirmar"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function Rendiciones() {
  const [params] = useSearchParams();
  const obraId = params.get("obraId");
  const soloMode = params.get("solo") === "pendientes";

  const [gastos, setGastos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [modo, setModo] = useState(soloMode ? "pendientes" : "todas");
  const [confirmando, setConfirmando] = useState(null); // gasto a aprobar
  const [aprobando, setAprobando] = useState(false);

  const { rol } = getUser();
  const esAdmin = rol === "admin";

  useEffect(() => {
    setLoading(true);
    const p = modo === "pendientes"
      ? api.pendientes()
      : api.gastos(obraId ? { obraId } : {});

    p.then(setGastos)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, [modo, obraId]);

  async function handleAprobar() {
    if (!confirmando) return;
    setAprobando(true);
    try {
      await api.aprobarGasto(confirmando.id);
      // Actualizar estado localmente sin recargar toda la lista
      setGastos(prev =>
        prev.map(g => g.id === confirmando.id ? { ...g, estado: "pagado" } : g)
      );
      setConfirmando(null);
    } catch (e) {
      setError(e.message);
      setConfirmando(null);
    } finally {
      setAprobando(false);
    }
  }

  const totalMonto = gastos.reduce((s, g) => s + parseFloat(g.monto || 0), 0);

  return (
    <Layout title={modo === "pendientes" ? "Pendientes de pago" : "Rendiciones"}>
      {/* Modal */}
      {confirmando && (
        <ModalAprobar
          gasto={confirmando}
          onConfirm={handleAprobar}
          onCancel={() => setConfirmando(null)}
          loading={aprobando}
        />
      )}

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
        <div className="card border-red-700/50 text-red-300 text-sm mb-3">{error}</div>
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

            {/* Botón aprobar — solo admin, solo para pendientes */}
            {esAdmin && g.estado === "pendiente" && (
              <button
                onClick={() => setConfirmando(g)}
                className="mt-3 w-full py-2.5 rounded-xl text-sm font-semibold bg-green-900/40 border border-green-700/40 text-green-300 hover:bg-green-800/50 transition-colors"
              >
                ✅ Aprobar pago
              </button>
            )}
          </div>
        ))}
      </div>
    </Layout>
  );
}
