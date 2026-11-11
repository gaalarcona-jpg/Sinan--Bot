import { useEffect, useState } from "react";
import { api } from "../api";
import Layout from "../components/Layout";

// Estado de resultado de un mes, con la misma foto validada que la pestaña Finanzas
// (crm/data/finanzas.json, solo admin).
const fmt = (n) => (n < 0 ? "-$" : "$") + Math.abs(Math.round(n || 0)).toLocaleString("es-CL");
const pct = (a, b) => (b ? Math.round((a / b) * 1000) / 10 : null);
const color = (n) => (n < 0 ? "text-red-400" : "text-green-400");

export default function EstadoResultados() {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [i, setI] = useState(null);

  useEffect(() => {
    api.finanzas()
      .then((d) => {
        setData(d);
        setI(d.meses.length - 2); // último mes completo (el último es parcial)
      })
      .catch((e) => setError(e.message));
  }, []);

  const L = data ? Object.fromEntries(data.resultado.map((x) => [x.clave, x.valores])) : {};
  const v = (k) => (data && i != null ? L[k][i] : 0);
  const ingresos = v("ingresos");
  const neto = v("resultado_neto");
  const ultimo = data && i === data.meses.length - 1;

  return (
    <Layout title="Estado de Resultados" backTo="/dashboard">
      {error && <div className="card border-red-700/50 text-red-300 text-sm">{error}</div>}
      {!data && !error && (
        <div className="flex justify-center py-16">
          <div className="w-8 h-8 border-2 border-gold-500 border-t-transparent rounded-full animate-spin" />
        </div>
      )}

      {data && (
        <>
          <div className="mb-5">
            <label className="text-sinan-muted text-xs mb-1.5 block uppercase tracking-wider">Período</label>
            <select className="input-dark" value={i} onChange={(e) => setI(Number(e.target.value))}>
              {data.meses.map((m, k) => (
                <option key={m} value={k}>
                  {m}{k === data.meses.length - 1 ? " (parcial)" : ""}
                </option>
              ))}
            </select>
          </div>

          <div className={`card mb-5 ${neto >= 0 ? "border-green-700/40" : "border-red-700/40"}`}>
            <div className="text-center">
              <div className="text-sinan-muted text-xs uppercase tracking-wider mb-1">Resultado neto</div>
              <div className={`text-4xl font-bold mb-1 ${color(neto)}`}>{fmt(neto)}</div>
              <div className="text-sinan-muted text-sm">
                Margen neto: <span className={color(neto)}>{pct(neto, ingresos) ?? "—"}%</span>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3 mt-4 pt-4 border-t border-sinan-border text-center">
              <div>
                <div className="text-sinan-muted text-xs">Ingresos de obras</div>
                <div className="text-green-400 font-semibold">{fmt(ingresos)}</div>
              </div>
              <div>
                <div className="text-sinan-muted text-xs">Costo de obras</div>
                <div className="text-red-400 font-semibold">{fmt(v("costo_obras"))}</div>
              </div>
            </div>
          </div>

          <h2 className="text-sinan-muted text-xs uppercase tracking-wider mb-2">Por obra</h2>
          <div className="flex flex-col gap-3 mb-5">
            {data.detalle_costos.map((c) => {
              const ing = data.detalle_ingresos.find((x) => x.label === c.label)?.valores[i] || 0;
              const cos = c.valores[i];
              if (!ing && !cos) return null;
              const r = ing - cos;
              return (
                <div key={c.label} className="card">
                  <div className="font-semibold text-sinan-text mb-2">{c.label}</div>
                  <div className="grid grid-cols-3 gap-2 text-center">
                    <div>
                      <div className="text-xs text-sinan-muted">Cobrado</div>
                      <div className="text-sm text-green-400">{fmt(ing)}</div>
                    </div>
                    <div>
                      <div className="text-xs text-sinan-muted">Pagado</div>
                      <div className="text-sm text-red-400">{fmt(cos)}</div>
                    </div>
                    <div>
                      <div className="text-xs text-sinan-muted">Resultado</div>
                      <div className={`text-sm ${color(r)}`}>{fmt(r)}</div>
                    </div>
                  </div>
                </div>
              );
            })}
            {data.detalle_ingresos
              .filter((x) => !data.detalle_costos.some((c) => c.label === x.label) && x.valores[i])
              .map((x) => (
                <div key={x.label} className="card flex justify-between text-sm gap-3">
                  <span className="text-sinan-muted">{x.label}</span>
                  <span className="text-green-400 whitespace-nowrap">{fmt(x.valores[i])}</span>
                </div>
              ))}
          </div>

          <h2 className="text-sinan-muted text-xs uppercase tracking-wider mb-2">Resumen del mes</h2>
          <div className="card space-y-2 mb-5">
            {data.resultado.map((x) => {
              const fuerte = x.tipo !== "linea";
              return (
                <div key={x.clave} className={`flex justify-between text-sm ${fuerte ? "font-semibold border-t border-sinan-border pt-2" : ""}`}>
                  <span className={fuerte ? "text-sinan-text" : "text-sinan-muted"}>{x.label}</span>
                  <span className={x.tipo === "clave" ? color(x.valores[i]) : "text-sinan-text"}>{fmt(x.valores[i])}</span>
                </div>
              );
            })}
          </div>

          <h2 className="text-sinan-muted text-xs uppercase tracking-wider mb-2">Fuera del resultado</h2>
          <div className="card space-y-2">
            {data.informativo.filter((x) => x.valores[i]).map((x) => (
              <div key={x.label} className="flex justify-between text-sm gap-3">
                <span className="text-sinan-muted">{x.label}</span>
                <span className="text-sinan-text whitespace-nowrap">{fmt(x.valores[i])}</span>
              </div>
            ))}
          </div>

          <p className="text-sinan-muted text-xs mt-6 leading-relaxed">
            {ultimo ? "Mes en curso: datos parciales. " : ""}Mes = fecha de pago o cobro. Corte {data.corte}.
          </p>
        </>
      )}
    </Layout>
  );
}
