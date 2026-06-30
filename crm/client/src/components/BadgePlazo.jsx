const NIVEL_CLASES = {
  verde:        "bg-green-900/40 text-green-300 border-green-700/40",
  amarillo:     "bg-yellow-900/40 text-yellow-300 border-yellow-700/40",
  naranja:      "bg-orange-900/40 text-orange-300 border-orange-700/40",
  rojo:         "bg-red-900/40 text-red-300 border-red-700/40",
  rojo_critico: "bg-red-950/60 text-red-200 border-red-500/60",
};

export function BadgePlazo({ plazo }) {
  if (!plazo) return null;
  const cls = NIVEL_CLASES[plazo.nivel] || NIVEL_CLASES.verde;
  return (
    <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full border ${cls}`}>
      {plazo.emoji} {plazo.mensaje}
    </span>
  );
}

export function FechasPlazo({ plazo }) {
  if (!plazo) return null;
  return (
    <div className="mt-1.5 flex flex-col gap-0.5 text-xs text-sinan-muted">
      {plazo.fechaInterna && (
        <span>📅 Plazo interno: <span className="text-sinan-text">{plazo.fechaInterna}</span></span>
      )}
      {plazo.fechaContrato && (
        <span>📋 Contrato: <span className="text-sinan-text">{plazo.fechaContrato}</span></span>
      )}
    </div>
  );
}
