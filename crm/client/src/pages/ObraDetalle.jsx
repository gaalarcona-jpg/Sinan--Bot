import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { api, getUser } from "../api";
import Layout from "../components/Layout";
import BarraAvance from "../components/BarraAvance";
import { BadgePlazo, FechasPlazo } from "../components/BadgePlazo";

const fmt = (n) => "$" + Math.round(n || 0).toLocaleString("es-CL");

export default function ObraDetalle() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { rol } = getUser();
  const [obra, setObra] = useState(null);
  const [etapaId, setEtapaId] = useState(null);
  const [etapaItems, setEtapaItems] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadingItems, setLoadingItems] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    api.obra(id)
      .then(setObra)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, [id]);

  async function verItems(eid) {
    if (etapaId === eid) { setEtapaId(null); setEtapaItems(null); return; }
    setEtapaId(eid);
    setLoadingItems(true);
    try {
      const data = await api.etapa(id, eid);
      setEtapaItems(data);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoadingItems(false);
    }
  }

  if (loading) return (
    <Layout title="Cargando…" backTo="/dashboard">
      <div className="flex justify-center py-16">
        <div className="w-8 h-8 border-2 border-gold-500 border-t-transparent rounded-full animate-spin" />
      </div>
    </Layout>
  );

  if (error) return (
    <Layout title="Error" backTo="/dashboard">
      <div className="card border-red-700/50 text-red-300 text-sm">{error}</div>
    </Layout>
  );

  const totalGastado = obra.etapas.reduce((s, e) => s + e.gastadoTotal, 0);
  const totalPpto = obra.etapas.reduce((s, e) => s + e.presupuestoTotal, 0);
  const pctGlobal = totalPpto > 0 ? Math.round((totalGastado / totalPpto) * 100) : 0;

  return (
    <Layout title={obra.nombre} backTo="/dashboard">
      {/* Resumen obra */}
      <div className="card mb-4">
        <div className="text-sinan-muted text-xs mb-2 uppercase tracking-wider">Resumen obra</div>
        <BarraAvance pct={pctGlobal} gastado={totalGastado} presupuesto={totalPpto} />
        <div className="flex justify-between mt-3 text-sm">
          <span className="text-sinan-muted">Gastado: <span className="text-sinan-text font-semibold">{fmt(totalGastado)}</span></span>
          <span className="text-sinan-muted">Ppto: <span className="text-sinan-text font-semibold">{fmt(totalPpto)}</span></span>
        </div>

        {rol === "admin" && obra.comercial && (
          <div className="mt-3 pt-3 border-t border-sinan-border">
            <div className="text-xs text-sinan-muted uppercase tracking-wider mb-2">Comercial (solo admin)</div>
            <div className="grid grid-cols-3 gap-2">
              <div className="text-center">
                <div className="text-xs text-sinan-muted">Precio venta</div>
                <div className="text-sm font-semibold text-gold-400">{fmt(obra.comercial.precioVenta)}</div>
              </div>
              <div className="text-center">
                <div className="text-xs text-sinan-muted">Margen</div>
                <div className={`text-sm font-semibold ${obra.comercial.margen >= 0 ? "text-green-400" : "text-red-400"}`}>
                  {fmt(obra.comercial.margen)}
                </div>
              </div>
              <div className="text-center">
                <div className="text-xs text-sinan-muted">%</div>
                <div className={`text-sm font-semibold ${obra.comercial.pctMargen >= 0 ? "text-green-400" : "text-red-400"}`}>
                  {obra.comercial.pctMargen ?? "—"}%
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Etapas */}
      <h3 className="text-sm font-semibold text-sinan-muted uppercase tracking-wider mb-3">
        Etapas ({obra.etapas.length})
      </h3>

      <div className="flex flex-col gap-2">
        {obra.etapas.map(etapa => (
          <div key={etapa.id} className="card">
            <button
              onClick={() => verItems(etapa.id)}
              className="w-full text-left"
            >
              <div className="flex items-center justify-between mb-2">
                <span className="font-medium text-sinan-text">{etapa.nombre}</span>
                <div className="flex items-center gap-2">
                  {etapa.estado === "completada" && (
                    <span className="badge-ok">✓ Completa</span>
                  )}
                  <span className={`text-sm font-bold ${etapa.pctAvance >= 100 ? "text-red-400" : etapa.pctAvance >= 90 ? "text-yellow-400" : "text-gold-400"}`}>
                    {etapa.pctAvance}%
                  </span>
                  <span className="text-sinan-muted text-lg">{etapaId === etapa.id ? "▲" : "▼"}</span>
                </div>
              </div>
              <BarraAvance
                pct={etapa.pctAvance}
                gastado={etapa.gastadoTotal}
                presupuesto={etapa.presupuestoTotal}
                compact
              />
              <div className="flex justify-between mt-2 text-xs text-sinan-muted">
                <span>{fmt(etapa.gastadoTotal)} gastado</span>
                <span>Ppto {fmt(etapa.presupuestoTotal)}</span>
              </div>
              {etapa.plazo && (
                <div className="mt-2">
                  <BadgePlazo plazo={etapa.plazo} />
                  <FechasPlazo plazo={etapa.plazo} />
                </div>
              )}
            </button>

            {/* Items de la etapa */}
            {etapaId === etapa.id && (
              <div className="mt-3 pt-3 border-t border-sinan-border">
                {loadingItems ? (
                  <div className="flex justify-center py-4">
                    <div className="w-6 h-6 border-2 border-gold-500 border-t-transparent rounded-full animate-spin" />
                  </div>
                ) : etapaItems?.items?.length === 0 ? (
                  <p className="text-sinan-muted text-sm text-center py-2">Sin ítems presupuestados.</p>
                ) : (
                  <div className="flex flex-col gap-3">
                    {etapaItems?.items?.map(item => (
                      <div key={item.id} className={`rounded-xl p-3 ${item.excedido ? "bg-red-900/30 border border-red-700/40" : "bg-sinan-surface"}`}>
                        <div className="flex justify-between items-start mb-1.5">
                          <span className="text-sinan-text text-sm font-medium flex-1 pr-2">{item.nombre}</span>
                          {item.excedido && <span className="badge-danger shrink-0">Excedido</span>}
                        </div>
                        <BarraAvance pct={item.pctUsado} gastado={item.gastado} presupuesto={item.presupuesto} compact />
                        <div className="flex justify-between mt-1.5 text-xs text-sinan-muted">
                          <span>Gastado: <span className={item.excedido ? "text-red-400 font-medium" : "text-sinan-text"}>{fmt(item.gastado)}</span></span>
                          <span>Ppto: {fmt(item.presupuesto)}</span>
                          <span>Saldo: <span className={item.saldo < 0 ? "text-red-400" : "text-green-400"}>{fmt(item.saldo)}</span></span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Ver gastos de esta obra */}
      <button
        onClick={() => navigate(`/rendiciones?obraId=${id}`)}
        className="mt-5 w-full border border-sinan-border text-sinan-muted py-3.5 rounded-xl text-sm hover:border-gold-500/40 transition-colors"
      >
        Ver rendiciones de esta obra
      </button>
    </Layout>
  );
}
