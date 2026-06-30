// Lógica de alertas de plazo — compartida entre bot (flows.js) y CRM (routes/obras.js).
// No tiene dependencias de DB: recibe las fechas ya resueltas como strings ISO.

function diasRestantes(fechaISO) {
  if (!fechaISO) return null;
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  const fecha = new Date(fechaISO);
  fecha.setHours(0, 0, 0, 0);
  return Math.ceil((fecha - hoy) / 86400000);
}

// Retorna { nivel, emoji, mensaje, diasInterno, diasContrato }
// nivel: 'verde' | 'amarillo' | 'naranja' | 'rojo' | 'rojo_critico' | null
function alertaPlazo(fechaVencimientoContrato, fechaVencimientoInterna) {
  const diasContrato = diasRestantes(fechaVencimientoContrato);
  const diasInterno  = diasRestantes(fechaVencimientoInterna);

  if (diasContrato === null && diasInterno === null) return null;

  const fmtFecha = (iso) => iso
    ? new Date(iso).toLocaleDateString("es-CL", { day: "2-digit", month: "2-digit", year: "numeric" })
    : null;

  // Plazo contractual vencido → máxima urgencia
  if (diasContrato !== null && diasContrato < 0) {
    return {
      nivel: "rojo_critico",
      emoji: "🆘",
      mensaje: `PLAZO CONTRACTUAL VENCIDO hace ${Math.abs(diasContrato)} día${Math.abs(diasContrato) !== 1 ? "s" : ""}`,
      diasInterno,
      diasContrato,
      fechaContrato: fmtFecha(fechaVencimientoContrato),
      fechaInterna:  fmtFecha(fechaVencimientoInterna),
    };
  }

  // Plazo interno vencido, contrato aún vigente
  if (diasInterno !== null && diasInterno < 0) {
    const margenStr = diasContrato !== null
      ? `, ${diasContrato} día${diasContrato !== 1 ? "s" : ""} de margen contractual`
      : "";
    return {
      nivel: "rojo",
      emoji: "🔴",
      mensaje: `Plazo interno vencido${margenStr}`,
      diasInterno,
      diasContrato,
      fechaContrato: fmtFecha(fechaVencimientoContrato),
      fechaInterna:  fmtFecha(fechaVencimientoInterna),
    };
  }

  // Naranja: 7 días o menos para plazo interno
  if (diasInterno !== null && diasInterno <= 7) {
    return {
      nivel: "naranja",
      emoji: "🔶",
      mensaje: `URGENTE: ${diasInterno} día${diasInterno !== 1 ? "s" : ""} para plazo interno`,
      diasInterno,
      diasContrato,
      fechaContrato: fmtFecha(fechaVencimientoContrato),
      fechaInterna:  fmtFecha(fechaVencimientoInterna),
    };
  }

  // Amarillo: 8–21 días
  if (diasInterno !== null && diasInterno <= 21) {
    return {
      nivel: "amarillo",
      emoji: "⚠️",
      mensaje: `Quedan ${diasInterno} días para el plazo interno`,
      diasInterno,
      diasContrato,
      fechaContrato: fmtFecha(fechaVencimientoContrato),
      fechaInterna:  fmtFecha(fechaVencimientoInterna),
    };
  }

  // Verde: más de 21 días
  return {
    nivel: "verde",
    emoji: "🟢",
    mensaje: diasInterno !== null ? `${diasInterno} días para el plazo interno` : null,
    diasInterno,
    diasContrato,
    fechaContrato: fmtFecha(fechaVencimientoContrato),
    fechaInterna:  fmtFecha(fechaVencimientoInterna),
  };
}

// Texto para WhatsApp
function textoAlertaWhatsApp(etapaNombre, alerta) {
  if (!alerta || alerta.nivel === "verde") return null;
  let t = `${alerta.emoji} *${etapaNombre}* — ${alerta.mensaje}`;
  if (alerta.fechaInterna) t += `\n📅 Plazo interno: ${alerta.fechaInterna}`;
  if (alerta.fechaContrato) t += `\n📋 Plazo contrato: ${alerta.fechaContrato}`;
  return t;
}

module.exports = { alertaPlazo, textoAlertaWhatsApp };
