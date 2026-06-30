export default function BarraAvance({ pct, gastado, presupuesto, compact = false }) {
  const pctClamp = Math.min(pct, 100);
  const color =
    pct >= 100 ? "bg-red-500" :
    pct >= 90  ? "bg-red-400" :
    pct >= 70  ? "bg-yellow-400" :
    "bg-gold-500";

  const fmt = (n) => "$" + Math.round(n || 0).toLocaleString("es-CL");

  return (
    <div className="w-full">
      <div className="flex justify-between items-center mb-1">
        <span className={`font-bold ${pct >= 100 ? "text-red-400" : pct >= 90 ? "text-yellow-300" : "text-gold-400"} ${compact ? "text-sm" : "text-base"}`}>
          {pct}%
        </span>
        {!compact && (
          <span className="text-sinan-muted text-xs">
            {fmt(gastado)} / {fmt(presupuesto)}
          </span>
        )}
      </div>
      <div className="h-2 bg-sinan-surface rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${color}`}
          style={{ width: `${pctClamp}%` }}
        />
      </div>
    </div>
  );
}
