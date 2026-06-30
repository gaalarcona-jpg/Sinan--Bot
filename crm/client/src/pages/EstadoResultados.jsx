import { useEffect, useState } from "react";
import { api } from "../api";
import Layout from "../components/Layout";

const fmt = (n) => "$" + Math.round(n || 0).toLocaleString("es-CL");
const fmtPct = (n) => n != null ? `${n >= 0 ? "+" : ""}${n}%` : "—";

function mesActual() {
  return new Date().toISOString().slice(0, 7);
}

function mesesDisponibles() {
  const meses = [];
  const now = new Date();
  for (let i = 0; i < 12; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    meses.push(d.toISOString().slice(0, 7));
  }
  return meses;
}

export default function EstadoResultados() {
  const [mes, setMes] = useState(mesActual());
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    setLoading(true);
    api.estadoResultados(mes)
      .then(setData)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, [mes]);

  return (
    <Layout title="Estado de Resultados" backTo="/dashboard">
      {/* Selector de mes */}
      <div className="mb-5">
        <label className="text-sinan-muted text-xs mb-1.5 block uppercase tracking-wider">Período</label>
        <select
          className="input-dark"
          value={mes}
          onChange={e => setMes(e.target.value)}
        >
          {mesesDisponibles().map(m => (
            <option key={m} value={m}>{m}</option>
          ))}
        </select>
      </div>

      {loading && (
        <div className="flex justify-center py-16">
          <div className="w-8 h-8 border-2 border-gold-500 border-t-transparent rounded-full animate-spin" />
        </div>
      )}

      {error && (
        <div className="card border-red-700/50 text-red-300 text-sm">{error}</div>
      )}

      {data && !loading && (
        <>
          {/* Resultado neto */}
          <div className={`card mb-5 ${data.resumen.resultadoNeto >= 0 ? "border-green-700/40" : "border-red-700/40"}`}>
            <div className="text-center">
              <div className="text-sinan-muted text-xs uppercase tracking-wider mb-1">Resultado neto</div>
              <div className={`text-4xl font-bold mb-1 ${data.resumen.resultadoNeto >= 0 ? "text-green-400" : "text-red-400"}`}>
                {fmt(data.resumen.resultadoNeto)}
              </div>
              <div className="text-sinan-muted text-sm">
                Margen: <span className={data.resumen.margenPct >= 0 ? "text-green-400" : "text-red-400"}>
                  {fmtPct(data.resumen.margenPct)}
                </span>
              </div>
            </div>
            <div className="flex justify-between mt-4 pt-4 border-t border-sinan-border text-sm">
              <div className="text-center flex-1">
                <div className="text-sinan-muted text-xs mb-0.5">Ingresos</div>
                <div className="text-green-400 font-semibold">{fmt(data.resumen.totalIngresos)}</div>
              </div>
              <div className="w-px bg-sinan-border" />
              <div className="text-center flex-1">
                <div className="text-sinan-muted text-xs mb-0.5">Costos</div>
                <div className="text-red-400 font-semibold">{fmt(data.resumen.totalCostos)}</div>
              </div>
            </div>
          </div>

          {/* Bloques por área */}
          <h3 className="text-xs font-semibold text-sinan-muted uppercase tracking-wider mb-3">Por área</h3>
          <div className="flex flex-col gap-3 mb-5">
            {data.bloques.map(b => (
              <div key={b.area} className="card">
                <div className="flex justify-between items-center mb-3">
                  <span className="font-semibold text-sinan-text">{b.area}</span>
                  <span className={`text-sm font-bold ${b.resultado >= 0 ? "text-green-400" : "text-red-400"}`}>
                    {fmtPct(b.margenPct)}
                  </span>
                </div>
                <div className="grid grid-cols-3 gap-2 text-center text-sm">
                  <div>
                    <div className="text-sinan-muted text-xs">Ingresos</div>
                    <div className="text-green-400 font-medium">{fmt(b.ingresos)}</div>
                  </div>
                  <div>
                    <div className="text-sinan-muted text-xs">Costos</div>
                    <div className="text-red-400 font-medium">{fmt(b.costos)}</div>
                  </div>
                  <div>
                    <div className="text-sinan-muted text-xs">Resultado</div>
                    <div className={`font-medium ${b.resultado >= 0 ? "text-green-400" : "text-red-400"}`}>
                      {fmt(b.resultado)}
                    </div>
                  </div>
                </div>
                {Object.keys(b.desgloseCategorias).length > 0 && (
                  <div className="mt-2 pt-2 border-t border-sinan-border">
                    {Object.entries(b.desgloseCategorias).map(([cat, monto]) => (
                      <div key={cat} className="flex justify-between text-xs text-sinan-muted py-0.5">
                        <span className="capitalize">{cat}</span>
                        <span className="text-sinan-text">{fmt(monto)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Gastos por obra */}
          {data.gastosObra.length > 0 && (
            <>
              <h3 className="text-xs font-semibold text-sinan-muted uppercase tracking-wider mb-3">Rendiciones por obra</h3>
              <div className="card">
                {data.gastosObra.map(g => (
                  <div key={g.obraId} className="flex justify-between py-2 border-b border-sinan-border last:border-0 text-sm">
                    <span className="text-sinan-text">{g.obraNombre}</span>
                    <span className="text-red-400 font-medium">{fmt(g.total)}</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </>
      )}
    </Layout>
  );
}
