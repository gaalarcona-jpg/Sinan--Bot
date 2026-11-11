import { useEffect, useState } from "react";
import { api } from "../api";
import Layout from "../components/Layout";
import { BarrasMes, TendenciaDeuda, fmtM } from "../components/Evolutivo";

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

          <h2 className="text-sinan-muted text-xs uppercase tracking-wider mb-2">Resultado neto mes a mes</h2>
          <div className="card mb-5">
            <BarrasMes meses={data.meses} valores={L.resultado_neto} parcialUltimo onSelect={setI} seleccionado={i} />
            <p className="text-sinan-muted text-xs mt-2">Toca un mes para ver su detalle abajo. El último mes es parcial.</p>
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

          <CostosFijosVariables d={data} i={i} setI={setI} />

          <DeudaEvolucion d={data.deudas} />

          <div className="mt-6" />

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

function DeudaEvolucion({ d }) {
  const { meses, total, por_deuda } = d.evolucion;
  const n = total.length;
  const cambios = total.map((t, k) => (k === 0 ? 0 : -(t - total[k - 1])));
  const activas = por_deuda
    .map((p, k) => ({ ...p, reg: d.registro[k] }))
    .filter((p) => p.reg && p.reg.suma);
  return (
    <>
      <h2 className="text-sinan-muted text-xs uppercase tracking-wider mt-6 mb-2">Deuda total</h2>
      <div className="card mb-3">
        <div className="flex justify-between items-baseline">
          <span className="text-sinan-text text-2xl font-bold">{fmtM(total[n - 1])}</span>
          <span className={`text-sm ${total[n - 1] - total[n - 2] <= 0 ? "text-green-400" : "text-red-400"}`}>
            {total[n - 1] - total[n - 2] <= 0 ? "▼ bajó" : "▲ subió"} {fmtM(Math.abs(total[n - 1] - total[n - 2]))} este mes
          </span>
        </div>
        <div className="flex items-end gap-1 h-20 mt-3">
          {total.map((t, k) => (
            <div key={k} className="flex-1 bg-gold-500/70 rounded-t-sm" style={{ height: `${Math.max(2, (t / Math.max(...total)) * 100)}%` }} />
          ))}
        </div>
        <div className="flex justify-between text-[10px] text-sinan-muted mt-1">
          <span>{meses[0]}</span><span>{meses[n - 1]}</span>
        </div>
        <p className="text-sinan-muted text-xs mt-3 mb-1">Cuánto bajó (verde) o subió (rojo) la deuda cada mes:</p>
        <BarrasMes meses={meses} valores={cambios} />
      </div>
      <h2 className="text-sinan-muted text-xs uppercase tracking-wider mt-5 mb-2">Créditos y deudas, uno por uno</h2>
      <div className="flex flex-col gap-3">
        {activas.map((p) => (
          <TendenciaDeuda key={p.deuda} nombre={p.deuda} meses={meses} valores={p.valores}
            detalle={p.reg.cuota ? `Cuota ${fmt(p.reg.cuota)} · ${p.reg.cuotas_pagadas} de ${p.reg.cuotas_total} pagadas` : p.reg.interes_mes ? `Interés ${fmt(p.reg.interes_mes)}/mes que se suma` : ""} />
        ))}
      </div>
    </>
  );
}

// Costos fijos (estructura de la empresa) vs variables (costo de las obras), con su evolución.
function CostosFijosVariables({ d, i, setI }) {
  const n = d.meses.length;
  const cerrados = n - 1; // el último mes es parcial
  const fijos = d.costos_fijos || [];
  const totalFijo = d.meses.map((_, k) => fijos.reduce((s, c) => s + c.valores[k], 0));
  const variable = d.resultado.find((x) => x.clave === "costo_obras").valores;
  const ingresos = d.resultado.find((x) => x.clave === "ingresos").valores;
  const prom = (arr, a, b) => { const s = arr.slice(Math.max(0, a), b); return s.length ? s.reduce((x, y) => x + y, 0) / s.length : 0; };
  const u3 = prom(totalFijo, cerrados - 3, cerrados);
  const p3 = prom(totalFijo, cerrados - 6, cerrados - 3);
  const varPct = p3 ? Math.round(((u3 - p3) / p3) * 1000) / 10 : null;
  const pctVar = (a, b) => { const ing = prom(ingresos, a, b); return ing ? Math.round((prom(variable, a, b) / ing) * 100) : null; };
  const tend = (c) => {
    const a = prom(c.valores, cerrados - 3, cerrados), b = prom(c.valores, cerrados - 6, cerrados - 3);
    return a - b;
  };
  return (
    <>
      <h2 className="text-sinan-muted text-xs uppercase tracking-wider mt-6 mb-2">Costos fijos mensuales (estructura)</h2>
      <div className="card mb-3">
        <div className="flex justify-between items-baseline gap-2">
          <div>
            <div className="text-sinan-muted text-xs">Promedio últimos 3 meses</div>
            <div className="text-sinan-text text-2xl font-bold">{fmtM(u3)}<span className="text-sm text-sinan-muted font-normal"> /mes</span></div>
          </div>
          {varPct != null && (
            <span className={`text-sm text-right ${varPct > 0 ? "text-red-400" : "text-green-400"}`}>
              {varPct > 0 ? "▲ subiendo" : "▼ bajando"} {Math.abs(varPct)}%<br />
              <span className="text-sinan-muted text-xs">vs 3 meses anteriores</span>
            </span>
          )}
        </div>
        <div className="mt-3">
          <BarrasMes meses={d.meses} valores={totalFijo} neutro parcialUltimo onSelect={setI} seleccionado={i} />
        </div>
        <div className="mt-3 space-y-1.5">
          <div className="flex justify-between text-[11px] text-sinan-muted"><span>Categoría</span><span>{d.meses[i]} · tendencia</span></div>
          {fijos.map((c) => {
            const t = tend(c);
            return (
              <div key={c.label} className="flex justify-between text-sm gap-2">
                <span className="text-sinan-muted">{c.label}</span>
                <span className="whitespace-nowrap text-sinan-text">
                  {fmt(c.valores[i])}{" "}
                  <span className={t > 50000 ? "text-red-400" : t < -50000 ? "text-green-400" : "text-sinan-muted"}>{t > 50000 ? "▲" : t < -50000 ? "▼" : "="}</span>
                </span>
              </div>
            );
          })}
          <div className="flex justify-between text-sm font-semibold border-t border-sinan-border pt-1.5">
            <span className="text-sinan-text">Total fijos</span><span className="text-sinan-text">{fmt(totalFijo[i])}</span>
          </div>
        </div>
        <p className="text-sinan-muted text-xs mt-2">Sueldos, marketing, oficina, vehículos y otros gastos de la empresa. No incluye intereses de créditos.</p>
      </div>

      <h2 className="text-sinan-muted text-xs uppercase tracking-wider mt-5 mb-2">Costos variables (obras)</h2>
      <div className="card mb-3">
        <div className="flex justify-between items-baseline gap-2">
          <div>
            <div className="text-sinan-muted text-xs">Promedio últimos 3 meses</div>
            <div className="text-sinan-text text-2xl font-bold">{fmtM(prom(variable, cerrados - 3, cerrados))}<span className="text-sm text-sinan-muted font-normal"> /mes</span></div>
          </div>
          {pctVar(cerrados - 3, cerrados) != null && (
            <span className="text-sm text-right text-sinan-text">
              {pctVar(cerrados - 3, cerrados)}% de lo cobrado<br />
              <span className="text-sinan-muted text-xs">antes: {pctVar(cerrados - 6, cerrados - 3) ?? "—"}%</span>
            </span>
          )}
        </div>
        <div className="mt-3">
          <BarrasMes meses={d.meses} valores={variable} neutro parcialUltimo onSelect={setI} seleccionado={i} />
        </div>
        <p className="text-sinan-muted text-xs mt-2">Materiales, mano de obra y subcontratos pagados en las obras. Suben y bajan con el avance de cada obra.</p>
      </div>
    </>
  );
}
