// Evolutivos compartidos: resultado neto mes a mes y deuda (total y por crédito).
const fmtM = (n) => (n < 0 ? "-$" : "$") + (Math.abs(n || 0) / 1e6).toLocaleString("es-CL", { maximumFractionDigits: 1 }) + " M";
const corto = (lab) => lab.split(" ")[1] + " " + lab.slice(2, 4);

// Barras verticales con signo (verde arriba, rojo abajo) para una serie mensual.
export function BarrasMes({ meses, valores, parcialUltimo = false, onSelect, seleccionado, neutro = false }) {
  const max = Math.max(...valores.map(Math.abs)) || 1;
  const alto = 64;
  return (
    <div className="flex items-stretch gap-1 overflow-x-auto pb-1">
      {valores.map((v, i) => {
        const h = Math.max(2, (Math.abs(v) / max) * alto);
        const sel = seleccionado === i;
        return (
          <button key={meses[i]} onClick={() => onSelect && onSelect(i)}
            className={`flex flex-col items-center min-w-[30px] flex-1 rounded ${sel ? "bg-gold-500/10" : ""}`}>
            <div className="flex flex-col justify-end" style={{ height: alto }}>
              {v >= 0 && <div className={`w-4 rounded-t ${neutro ? "bg-gold-500/70" : "bg-green-500/80"} ${parcialUltimo && i === valores.length - 1 ? "opacity-40" : ""}`} style={{ height: h }} />}
            </div>
            <div className="w-full border-t border-sinan-border" />
            <div className="flex flex-col justify-start" style={{ height: neutro ? 0 : alto }}>
              {v < 0 && <div className={`w-4 rounded-b ${parcialUltimo && i === valores.length - 1 ? "bg-red-500/30" : "bg-red-500/80"}`} style={{ height: h }} />}
            </div>
            <span className={`text-[10px] mt-1 leading-tight text-center ${sel ? "text-gold-500" : "text-sinan-muted"}`}>{meses[i].split(" ")[1]}<br />{meses[i].slice(2, 4)}</span>
          </button>
        );
      })}
    </div>
  );
}

// Tendencia de una deuda: saldo hoy, cambio del último mes y desde hace 6 meses, mini barras.
export function TendenciaDeuda({ nombre, meses, valores, detalle }) {
  const n = valores.length;
  const hoy = valores[n - 1];
  const mes = hoy - valores[n - 2];
  const seis = hoy - valores[Math.max(0, n - 7)];
  const ult = valores.slice(-12);
  const max = Math.max(...ult) || 1;
  const flecha = (d) => (d < 0 ? "▼ baja" : d > 0 ? "▲ sube" : "= igual");
  const col = (d) => (d < 0 ? "text-green-400" : d > 0 ? "text-red-400" : "text-sinan-muted");
  return (
    <div className="card">
      <div className="flex justify-between items-baseline gap-2">
        <span className="text-sinan-text text-sm font-semibold">{nombre}</span>
        <span className="text-gold-500 text-sm font-semibold whitespace-nowrap">{fmtM(hoy)}</span>
      </div>
      <div className="flex items-end gap-0.5 h-8 mt-2" title="Últimos 12 meses">
        {ult.map((v, i) => (
          <div key={i} className="flex-1 bg-gold-500/60 rounded-sm" style={{ height: `${Math.max(2, (v / max) * 100)}%` }} />
        ))}
      </div>
      <div className="flex justify-between text-[10px] text-sinan-muted mt-0.5">
        <span>{corto(meses[Math.max(0, n - 12)])}</span><span>{corto(meses[n - 1])}</span>
      </div>
      <div className="flex justify-between text-xs mt-2">
        <span className={col(mes)}>Último mes: {flecha(mes)} {fmtM(Math.abs(mes))}</span>
        <span className={col(seis)}>6 meses: {flecha(seis)} {fmtM(Math.abs(seis))}</span>
      </div>
      {detalle && <p className="text-sinan-muted text-xs mt-1">{detalle}</p>}
    </div>
  );
}

export { fmtM };
