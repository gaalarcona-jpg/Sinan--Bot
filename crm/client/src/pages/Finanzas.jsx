import { useEffect, useState } from "react";
import { api } from "../api";
import Layout from "../components/Layout";
import { TendenciaDeuda } from "../components/Evolutivo";

const fmt = (n) => (n < 0 ? "-$" : "$") + Math.abs(Math.round(n || 0)).toLocaleString("es-CL");
const fmtM = (n) => (n < 0 ? "-$" : "$") + (Math.abs(n || 0) / 1e6).toLocaleString("es-CL", { maximumFractionDigits: 1 }) + " M";
const pct = (a, b) => (b ? Math.round((a / b) * 1000) / 10 : null);
const sum = (arr, i0, i1) => arr.slice(i0, i1).reduce((a, b) => a + b, 0);
const color = (n) => (n < 0 ? "text-red-400" : "text-green-400");

// Períodos calculados desde los meses del archivo (el último mes es parcial).
function periodos(meses) {
  const n = meses.length;
  const anio = meses[n - 1].slice(0, 4);
  const i0 = meses.findIndex((m) => m.startsWith(anio));
  const out = [];
  if (n - 1 - i0 > 0) out.push({ id: "anio", label: `${anio} (meses cerrados)`, i0, i1: n - 1, meses: n - 1 - i0 });
  const u = Math.max(0, n - 13);
  out.push({ id: "12m", label: "Últimos 12 meses cerrados", i0: u, i1: n - 1, meses: n - 1 - u });
  out.push({ id: "todo", label: `Todo (${meses[0].split(" ")[1]}-${meses[0].slice(2, 4)} a hoy)`, i0: 0, i1: n, meses: n });
  return out;
}

export default function Finanzas() {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [tab, setTab] = useState("resultado");

  useEffect(() => {
    api.finanzas().then(setData).catch((e) => setError(e.message));
  }, []);

  return (
    <Layout title="Finanzas SINAN CHILE" backTo="/dashboard">
      <div className="flex gap-2 mb-4">
        {[["resultado", "Resultado"], ["obras", "Obras"], ["deudas", "Deudas"]].map(([id, l]) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={`flex-1 py-2 rounded-xl text-sm font-medium border ${
              tab === id ? "border-gold-500 text-gold-500 bg-gold-500/10" : "border-sinan-border text-sinan-muted"
            }`}
          >
            {l}
          </button>
        ))}
      </div>
      {error && <div className="card text-red-300 text-sm">{error}</div>}
      {!data && !error && (
        <div className="flex justify-center py-16">
          <div className="w-8 h-8 border-2 border-gold-500 border-t-transparent rounded-full animate-spin" />
        </div>
      )}
      {data && tab === "resultado" && <Resultado d={data} />}
      {data && tab === "obras" && <Obras d={data} />}
      {data && tab === "deudas" && <Deudas d={data} />}
      {data && (
        <p className="text-sinan-muted text-xs mt-6 leading-relaxed">
          Corte {data.corte}. {data.fuente}
        </p>
      )}
    </Layout>
  );
}

function Resultado({ d }) {
  const PERIODOS = periodos(d.meses);
  const [p, setP] = useState(PERIODOS[0]);
  const [mesSel, setMesSel] = useState(null);
  const L = Object.fromEntries(d.resultado.map((x) => [x.clave, x.valores]));
  const tot = (k) => sum(L[k], p.i0, p.i1);
  const ing = tot("ingresos");
  return (
    <div className="space-y-4">
      <div className="flex gap-2 overflow-x-auto">
        {PERIODOS.map((x) => (
          <button key={x.id} onClick={() => setP(x)}
            className={`px-3 py-1.5 rounded-lg text-xs whitespace-nowrap border ${p.id === x.id ? "border-gold-500 text-gold-500" : "border-sinan-border text-sinan-muted"}`}>
            {x.label}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Kpi label="Ingresos" valor={fmtM(ing)} />
        <Kpi label="Margen bruto" valor={`${pct(tot("margen_bruto"), ing) ?? "—"}%`} />
        <Kpi label="Resultado neto" valor={fmtM(tot("resultado_neto"))} cls={color(tot("resultado_neto"))} />
        <Kpi label="Neto promedio / mes" valor={fmtM(tot("resultado_neto") / p.meses)} cls={color(tot("resultado_neto"))} />
      </div>

      <div className="card space-y-2">
        {d.resultado.map((x) => {
          const v = sum(x.valores, p.i0, p.i1);
          const fuerte = x.tipo !== "linea";
          return (
            <div key={x.clave} className={`flex justify-between text-sm ${fuerte ? "font-semibold border-t border-sinan-border pt-2" : ""}`}>
              <span className={fuerte ? "text-sinan-text" : "text-sinan-muted"}>{x.label}</span>
              <span className={x.tipo === "clave" ? color(v) : "text-sinan-text"}>{fmt(v)}</span>
            </div>
          );
        })}
      </div>

      <h2 className="text-sinan-text font-semibold text-sm pt-2">Mes a mes (resultado neto)</h2>
      <div className="card space-y-1.5">
        {d.meses.map((m, i) => {
          const neto = L.resultado_neto[i];
          const max = Math.max(...L.resultado_neto.map(Math.abs)) || 1;
          return (
            <button key={m} onClick={() => setMesSel(mesSel === i ? null : i)} className="w-full text-left">
              <div className="flex items-center gap-2 text-xs">
                <span className="w-16 text-sinan-muted">{m}{i === d.meses.length - 1 ? "*" : ""}</span>
                <div className="flex-1 h-3 bg-sinan-bg rounded relative overflow-hidden">
                  <div className={`h-3 rounded ${neto < 0 ? "bg-red-500/70" : "bg-green-500/70"}`}
                    style={{ width: `${(Math.abs(neto) / max) * 100}%` }} />
                </div>
                <span className={`w-24 text-right ${color(neto)}`}>{fmtM(neto)}</span>
              </div>
              {mesSel === i && (
                <div className="mt-2 mb-1 p-3 rounded-lg bg-sinan-bg space-y-1">
                  {d.resultado.map((x) => (
                    <div key={x.clave} className="flex justify-between text-xs">
                      <span className="text-sinan-muted">{x.label}</span>
                      <span className="text-sinan-text">{fmt(x.valores[i])}</span>
                    </div>
                  ))}
                </div>
              )}
            </button>
          );
        })}
        <p className="text-sinan-muted text-xs pt-1">* mes en curso, parcial. Toca un mes para ver el detalle.</p>
      </div>

      <h2 className="text-sinan-text font-semibold text-sm pt-2">Fuera del resultado (informativo)</h2>
      <div className="card space-y-2">
        {d.informativo.map((x) => (
          <div key={x.label} className="flex justify-between text-sm gap-3">
            <span className="text-sinan-muted">{x.label}</span>
            <span className="text-sinan-text whitespace-nowrap">{fmt(sum(x.valores, p.i0, p.i1))}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function Obras({ d }) {
  return (
    <div className="space-y-3">
      <p className="text-sinan-muted text-xs">Cobrado y pagado desde sep-2025. En obras en curso, un margen alto es cobro adelantado: esa caja financia las etapas que faltan. Olmué y Los Andes quedan fuera: sus ingresos no están registrados completos.</p>
      {d.obras.map((o) => {
        const m = o.ingresos - o.costos;
        const p = pct(m, o.ingresos);
        return (
          <div key={o.obra} className="card">
            <div className="flex justify-between items-baseline mb-2">
              <span className="text-sinan-text font-semibold text-sm">{o.obra}</span>
              <span className={`text-sm font-semibold ${color(m)}`}>{p == null ? "—" : `${p}%`}</span>
            </div>
            <Fila l="Cobrado" v={fmt(o.ingresos)} />
            <Fila l="Pagado" v={fmt(o.costos)} />
            <Fila l="Margen" v={fmt(m)} cls={color(m)} />
            {o.costos_antes_sep25 > 0 && (
              <p className="text-amber-400 text-xs mt-2">Tiene {fmt(o.costos_antes_sep25)} en costos antes de sep-2025 sin cobros registrados: margen no medible.</p>
            )}
          </div>
        );
      })}
    </div>
  );
}

function Deudas({ d }) {
  const { registro, evolucion, interes_informal_mes } = d.deudas;
  const t = evolucion.total;
  const n = t.length;
  const max = Math.max(...t) || 1;
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <Kpi label="Deuda total hoy" valor={fmtM(t[n - 1])} />
        <Kpi label="Último mes" valor={fmtM(t[n - 1] - t[n - 2])} cls={color(-(t[n - 1] - t[n - 2]))} />
        <Kpi label="Desde ene-2025" valor={fmtM(t[n - 1] - t[0])} cls={color(-(t[n - 1] - t[0]))} />
        <Kpi label="Interés que se acumula / mes" valor={fmt(interes_informal_mes)} />
      </div>

      <h2 className="text-sinan-text font-semibold text-sm">Evolución de la deuda</h2>
      <div className="card space-y-1.5">
        {evolucion.meses.map((m, i) => (
          <div key={m} className="flex items-center gap-2 text-xs">
            <span className="w-16 text-sinan-muted">{m}</span>
            <div className="flex-1 h-3 bg-sinan-bg rounded overflow-hidden">
              <div className="h-3 rounded bg-gold-500/70" style={{ width: `${(t[i] / max) * 100}%` }} />
            </div>
            <span className="w-20 text-right text-sinan-text">{fmtM(t[i])}</span>
          </div>
        ))}
      </div>

      <h2 className="text-sinan-text font-semibold text-sm">Detalle por deuda</h2>
      {registro.map((r, k) => ({ r, v: evolucion.por_deuda[k]?.valores })).filter(({ r }) => r.suma).map(({ r, v }) => (
        <TendenciaDeuda key={r.deuda} nombre={r.deuda} meses={evolucion.meses} valores={v}
          detalle={[r.tipo, r.cuota ? `cuota ${fmt(r.cuota)} · ${r.cuotas_pagadas} de ${r.cuotas_total} pagadas` : "", r.interes_mes ? `interés ${fmt(r.interes_mes)}/mes` : "", r.nota].filter(Boolean).join(" · ")} />
      ))}
      <h2 className="text-sinan-text font-semibold text-sm">Pagadas o reemplazadas (no suman)</h2>
      {registro.filter((r) => !r.suma).map((r) => (
        <div key={r.deuda} className="card opacity-70">
          <div className="flex justify-between">
            <span className="text-sinan-text text-sm">{r.deuda}</span>
            <span className="text-sinan-muted text-sm">{fmt(r.saldo)}</span>
          </div>
          {r.nota && <p className="text-sinan-muted text-xs mt-1">{r.nota}</p>}
        </div>
      ))}
    </div>
  );
}

function Kpi({ label, valor, cls = "text-sinan-text" }) {
  return (
    <div className="card">
      <div className="text-sinan-muted text-xs uppercase tracking-wider">{label}</div>
      <div className={`text-lg font-bold mt-1 ${cls}`}>{valor}</div>
    </div>
  );
}

function Fila({ l, v, cls = "text-sinan-text" }) {
  return (
    <div className="flex justify-between text-sm">
      <span className="text-sinan-muted">{l}</span>
      <span className={cls}>{v}</span>
    </div>
  );
}
