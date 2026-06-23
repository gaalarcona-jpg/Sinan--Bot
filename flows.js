const db = require("./db");
const whatsapp = require("./whatsapp");
const drive = require("./drive");
const claude = require("./claude");
const reports = require("./reports");
const { fmtMonto, fmtFecha, contieneRazonSocialValida, telefonoCompleto } = require("./format");

const TOLERANCIA_DISCREPANCIA = 1; // pesos — diferencias menores se consideran "el mismo monto"

// "admin" tiene los mismos privilegios que "gary" (acceso total) — todo gate de
// permisos debe usar esto, nunca comparar contra "gary" en solitario.
const esAdmin = (usuario) => usuario.rol === "gary" || usuario.rol === "admin";

// Información financiera interna que Rodrigo nunca debe ver — se intercepta por
// palabra clave ANTES de clasificar con Claude, no depende de que el modelo
// "decida" bloquearlo.
const PATRON_INFO_RESTRINGIDA = /\b(margen(es)?|utilidad(es)?|rentabilidad|bono(s)?|ganancia(s)?)\b/i;

const TIPOS_DOCUMENTO = {
  boleta: "Boleta",
  factura: "Factura",
  comprobante_transferencia: "Comprobante de transferencia",
  otro: "Otro",
};

function limpiarNoNulos(obj) {
  const out = {};
  for (const [k, v] of Object.entries(obj || {})) {
    if (v !== null && v !== undefined) out[k] = v;
  }
  return out;
}

// mensajes: uno o más webhooks agrupados por index.js (ver BUFFER_MS) — se
// combinan en un solo texto y se usa la primera imagen/documento adjunto.
function extraerTextoYMedia(mensajes) {
  const textos = [];
  let media = null;
  for (const msg of mensajes) {
    if (msg.type === "text") {
      if (msg.text?.body?.trim()) textos.push(msg.text.body.trim());
      continue;
    }
    const m = msg.image || msg.document || null;
    if (!m) continue;
    if (m.caption?.trim()) textos.push(m.caption.trim());
    if (!media) media = { id: m.id, tipo: msg.type };
  }
  return { texto: textos.join("\n"), media };
}

const EMOJI_NUMEROS = ["1️⃣", "2️⃣", "3️⃣", "4️⃣", "5️⃣", "6️⃣", "7️⃣", "8️⃣", "9️⃣", "🔟"];
const numeroEmoji = (n) => EMOJI_NUMEROS[n - 1] || `${n}.`;

// Pregunta de obra con lista numerada: usa los candidatos ambiguos si los hay
// (ej: "Peñaflor" matcheó 2 obras), o todas las obras activas si no matcheó
// ninguna — así el usuario siempre puede responder con un número.
async function preguntaObra(datos) {
  let candidatos = datos.obraCandidatos;
  let intro = "¿A cuál obra corresponde?";
  if (!candidatos?.length) {
    candidatos = await db.obras.listar();
    if (!candidatos.length) {
      return { pregunta: "Todavía no hay obras registradas — pídele a Gary que cree una con \"obra nueva / Nombre\".", datosExtra: {} };
    }
  } else {
    intro = "No encontré exactamente esa obra. ¿Te refieres a alguna de estas?";
  }
  const lista = candidatos.map((c, i) => `${numeroEmoji(i + 1)} ${c.nombre}`).join("\n");
  return {
    pregunta: `${intro}\n${lista}`,
    datosExtra: { opcionesPendientes: { campo: "obra", lista: candidatos.map((c) => ({ id: c.id, nombre: c.nombre })) }, obraCandidatos: undefined },
  };
}

function construirResumenConfirmacion(datos, monto) {
  const lineas = [
    `- Obra: ${datos.obraNombre}`,
    `- Etapa: ${datos.etapaNombre}`,
    `- Ítem: ${datos.itemNombre}`,
    `- Proveedor: ${datos.proveedorNombre || "—"}`,
    `- Monto: ${fmtMonto(monto)}`,
    `- Fecha: ${datos.fecha_documento || "no detectada"}`,
    `- Tipo: ${TIPOS_DOCUMENTO[datos.tipo_documento] || "no detectado"}`,
    `- Estado: Pendiente`,
  ];
  return `📋 Voy a registrar:\n${lineas.join("\n")}\n¿Confirmas? (sí/no)`;
}

function slug(s) {
  return (
    String(s || "")
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-zA-Z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .toLowerCase() || "sin-dato"
  );
}

// YYYY-MM-DD_obra_proveedor_monto_telefono.jpg — se aplica recién al confirmar
// el gasto, porque al momento de subir la imagen todavía no se conocen todos
// estos datos (se van completando turno a turno).
function nombreArchivoFinal(datos, monto, usuario) {
  const fecha = datos.fecha_documento || new Date().toISOString().slice(0, 10);
  return `${fecha}_${slug(datos.obraNombre)}_${slug(datos.proveedorNombre)}_${Math.round(monto)}_${usuario.telefono}.jpg`;
}

async function resolverEntidades(datos) {
  const out = { ...datos };
  if (datos.obra && !out.obraId) {
    const candidatos = await db.obras.buscarCandidatos(datos.obra);
    if (candidatos.length === 1) {
      out.obraId = candidatos[0].id;
      out.obraNombre = candidatos[0].nombre;
    } else if (candidatos.length > 1) {
      out.obraCandidatos = candidatos.map((c) => ({ id: c.id, nombre: c.nombre }));
    }
  }
  const nombreEtapa = datos.etapa || datos.numero_etapa;
  if (nombreEtapa && out.obraId && !out.etapaId) {
    const etapa = await db.etapas.porObraYNombreAprox(out.obraId, nombreEtapa);
    if (etapa) { out.etapaId = etapa.id; out.etapaNombre = etapa.nombre; }
  }
  if (datos.item && out.etapaId && !out.itemId) {
    const item = await db.itemsPresupuesto.porEtapaYNombreAprox(out.etapaId, datos.item);
    if (item) { out.itemId = item.id; out.itemNombre = item.nombre; }
  }
  if (datos.proveedor && !out.proveedorId) {
    const prov = await db.proveedores.obtenerOCrear(datos.proveedor);
    out.proveedorId = prov.id;
    out.proveedorNombre = prov.nombre;
    const acuerdo = await db.acuerdos.masRecientePorProveedor(prov.id);
    if (acuerdo) out.acuerdoId = acuerdo.id;
  }
  return out;
}

async function descargarYSubirMedia(media, usuario) {
  if (!media) return null;
  const { buffer, mimeType } = await whatsapp.downloadMedia(media.id);
  const nombre = `${usuario.telefono}_${Date.now()}.${mimeType.split("/")[1] || "bin"}`;
  const subida = await drive.subirImagen(buffer, nombre, mimeType);
  return { buffer, mimeType, ...subida };
}

// ============================================================
// HANDLERS POR INTENT
// ============================================================

async function handleRegistrarRendicion(usuario, datos) {
  if (!datos.obraId) {
    const r = await preguntaObra(datos);
    return { completo: false, pregunta: r.pregunta, datosExtra: r.datosExtra };
  }
  if (!datos.etapaId) {
    return {
      completo: false,
      pregunta: `¿En qué etapa de ${datos.obraNombre} va esto? Ej: Etapa 1 Fundaciones, Etapa 2 Estructura...`,
    };
  }
  if (!datos.itemId) {
    return {
      completo: false,
      pregunta: "¿A qué ítem del presupuesto corresponde? Ej: Cemento, Fierros, Mano de obra...",
    };
  }

  const montoTexto = datos.monto ?? null;
  const montoImagen = datos.monto_imagen ?? null;
  const hayDiscrepancia =
    montoTexto != null && montoImagen != null &&
    Math.abs(montoTexto - montoImagen) > TOLERANCIA_DISCREPANCIA &&
    !datos.discrepanciaResuelta;

  if (hayDiscrepancia) {
    return {
      completo: false,
      pregunta: `El monto que escribiste (${fmtMonto(montoTexto)}) no coincide con el de la boleta (${fmtMonto(montoImagen)}). ¿Cuál es el correcto? Respóndeme con el monto.`,
      datosExtra: { discrepanciaPendiente: true },
    };
  }

  const monto = datos.discrepanciaResuelta ? datos.monto : (montoTexto ?? montoImagen);
  if (monto == null) {
    return { completo: false, pregunta: "No pude leer el monto de la boleta y no lo escribiste — ¿cuál es el monto total?" };
  }

  if (!datos.confirmacionPendiente) {
    return {
      completo: false,
      pregunta: construirResumenConfirmacion(datos, monto),
      datosExtra: { confirmacionPendiente: true },
    };
  }
  if (datos.confirma === false) {
    return {
      completo: false,
      pregunta: "Ok, no lo registro todavía. ¿Qué quieres corregir? (obra, etapa, ítem, monto o proveedor)",
      datosExtra: { confirmacionPendiente: false, confirma: null },
    };
  }
  if (datos.confirma !== true) {
    return { completo: false, pregunta: construirResumenConfirmacion(datos, monto), datosExtra: { confirmacionPendiente: true } };
  }

  const alertaRazonSocial = !!(datos.razon_social_detectada && !contieneRazonSocialValida(datos.razon_social_detectada));

  const gasto = await db.gastos.crear({
    tipo: "rendicion",
    obraId: datos.obraId,
    etapaId: datos.etapaId,
    itemId: datos.itemId,
    proveedorId: datos.proveedorId || null,
    acuerdoId: datos.acuerdoId || null,
    monto,
    ivaIncluido: datos.iva_incluido ?? null,
    descripcion: datos.descripcion || null,
    imagenDriveId: datos.imagenDriveId || null,
    imagenDriveLink: datos.imagenDriveLink || null,
    registradoPor: usuario.id,
    alertaRazonSocial,
    razonSocialDetectada: datos.razon_social_detectada || null,
    rawExtraccionIa: datos.rawExtraccionIa || null,
    fechaDocumento: datos.fecha_documento || null,
    tipoDocumento: datos.tipo_documento || null,
  });

  if (datos.imagenDriveId) {
    drive.renombrar(datos.imagenDriveId, nombreArchivoFinal(datos, monto, usuario))
      .catch((e) => console.error("No se pudo renombrar imagen en Drive:", e.message));
  }

  let mensaje = `✅ Rendición #${gasto.id} registrada. Las rendiciones se revisan semanalmente para pago — se incluirá en el reporte a Finanzas.`;
  if (alertaRazonSocial) {
    mensaje += `\n\n⚠️ La boleta no menciona a Sinan/Constructora Sinan — quedó marcada para revisión de Finanzas.`;
  }
  return { completo: true, mensaje };
}

async function handleRegistrarAcuerdo(usuario, datos) {
  if (!datos.proveedorId) return { completo: false, pregunta: "¿Con qué proveedor cerraste el acuerdo?" };
  const monto = datos.monto_acordado ?? datos.monto;
  if (monto == null) return { completo: false, pregunta: `¿Por qué monto fue el acuerdo con ${datos.proveedorNombre}?` };

  const acuerdo = await db.acuerdos.crear({
    proveedorId: datos.proveedorId,
    obraId: datos.obraId || null,
    montoAcordado: monto,
    descripcion: datos.descripcion || null,
    creadoPor: usuario.id,
  });
  return { completo: true, mensaje: `✅ Acuerdo #${acuerdo.id} registrado con ${datos.proveedorNombre} por ${fmtMonto(monto)}.` };
}

async function handleConsultarSaldoProveedor(usuario, datos) {
  if (!datos.proveedorId) return { completo: false, pregunta: "¿De qué proveedor quieres saber el saldo?" };
  const acuerdo = await db.acuerdos.masRecientePorProveedor(datos.proveedorId);
  if (!acuerdo) {
    return { completo: true, mensaje: `No tengo un acuerdo activo registrado con ${datos.proveedorNombre}.` };
  }
  const saldo = await db.acuerdos.saldoPendiente(acuerdo.id);
  return {
    completo: true,
    mensaje: `📋 *${datos.proveedorNombre}*\nAcordado: ${fmtMonto(saldo.montoAcordado)}\nComprometido/pagado: ${fmtMonto(saldo.comprometido)}\nSaldo pendiente: ${fmtMonto(saldo.saldo)}`,
  };
}

async function handleRegistrarPago(usuario, datos) {
  if (!esAdmin(usuario)) return { completo: true, mensaje: "Solo Gary puede marcar pagos." };

  let gasto = null;
  if (datos.id_rendicion_mencionado) {
    gasto = await db.gastos.porId(datos.id_rendicion_mencionado);
    if (!gasto) return { completo: true, mensaje: `❌ No existe la rendición #${datos.id_rendicion_mencionado}.` };
    if (gasto.estado === "pagado") return { completo: true, mensaje: `⚠️ La rendición #${gasto.id} ya estaba pagada.` };
  } else {
    const monto = datos.monto ?? datos.monto_imagen;
    if (monto == null) return { completo: false, pregunta: "¿Cuál es el monto del comprobante, o el ID de la rendición que estás pagando?" };
    const candidatos = await db.gastos.buscarPendientesPorMontoAprox(monto);
    if (candidatos.length === 0) {
      return { completo: false, pregunta: `No encontré ninguna rendición pendiente cercana a ${fmtMonto(monto)}. ¿Me confirmas el ID de la rendición?` };
    }
    if (candidatos.length > 1) {
      const lista = candidatos.slice(0, 5).map((g) => `  • #${g.id} — ${fmtMonto(g.monto)} (${fmtFecha(g.creado_en)})`).join("\n");
      return { completo: false, pregunta: `Encontré varias rendiciones pendientes con ese monto:\n${lista}\n¿Cuál es? Respóndeme con el ID.` };
    }
    gasto = candidatos[0];
  }

  if (!datos.comprobanteDriveId) {
    return { completo: false, pregunta: `Envíame la foto del comprobante de transferencia para marcar la rendición #${gasto.id} como pagada.` };
  }

  const actualizado = await db.gastos.marcarPagado(gasto.id, {
    montoPagado: datos.monto ?? gasto.monto,
    tipoPago: datos.tipo_pago || null,
    comprobanteDriveId: datos.comprobanteDriveId,
    comprobanteDriveLink: datos.comprobanteDriveLink,
    pagadoPor: usuario.id,
  });
  return { completo: true, mensaje: `✅ Pago registrado. Rendición #${actualizado.id} ahora está *Pagada* (${fmtMonto(actualizado.monto_pagado)}).` };
}

async function handleCompletarEtapa(usuario, datos) {
  if (!esAdmin(usuario)) {
    return { completo: true, mensaje: "Solo Gary puede marcar una etapa como completada." };
  }
  if (!datos.obraId) {
    const r = await preguntaObra(datos);
    return { completo: false, pregunta: r.pregunta, datosExtra: r.datosExtra };
  }
  if (!datos.etapaId) return { completo: false, pregunta: `¿Qué etapa de ${datos.obraNombre} se completó?` };

  const etapa = await db.etapas.marcarCompletada(datos.etapaId);
  const obra = await db.obras.porId(datos.obraId);

  let mensaje = `🎉 Etapa *${etapa.nombre}* de *${obra.nombre}* marcada como completada.`;
  const bono = Number(obra.bono_por_etapa);
  if (bono > 0) {
    const gastoBono = await db.gastos.crear({
      tipo: "bono",
      obraId: obra.id,
      etapaId: etapa.id,
      monto: bono,
      descripcion: `Bono por etapa completada: ${etapa.nombre}`,
      registradoPor: usuario.id,
    });
    mensaje += `\n💰 Se generó un bono pendiente de pago por ${fmtMonto(bono)} (rendición #${gastoBono.id}).`;
  }
  return { completo: true, mensaje };
}

// Avance de gasto real vs presupuesto — disponible para ambos roles (mismo
// dato que ya se ve en "resumen"), nunca toca margen/utilidad/bono.
async function handleEstadoEtapa(usuario, datos) {
  if (!datos.obraId) {
    const r = await preguntaObra(datos);
    return { completo: false, pregunta: r.pregunta, datosExtra: r.datosExtra };
  }
  if (!datos.etapaId) {
    return { completo: false, pregunta: `¿Qué etapa de ${datos.obraNombre}? Ej: Etapa 1, Etapa 2...` };
  }
  const etapa = await db.etapas.porId(datos.etapaId);
  const { presupuestoTotal, gastadoTotal } = await db.etapas.avance(datos.etapaId);
  const pct = presupuestoTotal > 0 ? Math.round((gastadoTotal / presupuestoTotal) * 100) : 0;
  const estadoTexto = etapa.estado === "completada" ? "✅ Completada" : "🔧 En curso";
  return {
    completo: true,
    mensaje:
      `📍 *${datos.obraNombre} — ${etapa.nombre}*\n` +
      `Estado: ${estadoTexto}\n` +
      `Gasto real: ${fmtMonto(gastadoTotal)} / Presupuesto: ${fmtMonto(presupuestoTotal)} (${pct}%)`,
  };
}

async function handleExportarReporte(usuario, datos) {
  if (!datos.obraId) {
    const r = await preguntaObra(datos);
    return { completo: false, pregunta: r.pregunta, datosExtra: r.datosExtra };
  }
  const link = esAdmin(usuario)
    ? await reports.gary.exportarObraConMargen(datos.obraId)
    : await reports.rodrigo.exportarObra(datos.obraId);
  return { completo: true, mensaje: `📊 Reporte de *${datos.obraNombre}* generado.\n🔗 ${link.webViewLink}` };
}

async function handleConsultarResumen(usuario, datos) {
  if (datos.obraId) {
    const filas = esAdmin(usuario)
      ? await reports.gary.eficienciaPorItem(datos.obraId)
      : await reports.rodrigo.eficienciaPorItem(datos.obraId);
    if (!filas.length) return { completo: true, mensaje: `Sin ítems de presupuesto cargados para ${datos.obraNombre} todavía.` };
    let t = `📊 *Eficiencia — ${datos.obraNombre}*\n\n`;
    filas.forEach((f) => {
      const pct = f.presupuesto > 0 ? Math.round((f.gastado / f.presupuesto) * 100) : 0;
      const icono = pct >= 90 ? "🔴" : pct >= 70 ? "🟡" : "🟢";
      t += `${icono} *${f.item}*: ${fmtMonto(f.gastado)} / ${fmtMonto(f.presupuesto)} (${pct}%)\n`;
    });
    return { completo: true, mensaje: t };
  }
  if (esAdmin(usuario)) {
    const t = await reports.gary.resumenDiarioPendientesTexto();
    return { completo: true, mensaje: t };
  }
  const r = await preguntaObra(datos);
  return { completo: false, pregunta: r.pregunta, datosExtra: r.datosExtra };
}

function handleAyuda(usuario) {
  if (esAdmin(usuario)) {
    return {
      completo: true,
      mensaje:
        "🤖 Hola Gary, te cuento en qué te puedo ayudar:\n\n" +
        "📸 Cuando Rodrigo registra una rendición, yo leo la boleta, reviso que la razón social sea Sinan y te aviso si algo queda pendiente.\n\n" +
        "💸 *Marcar pagos*: mándame la foto del comprobante de transferencia mencionando la rendición (por ID, o por monto aproximado si no lo sabes) y yo la marco como Pagada.\n\n" +
        "📈 *Resumen diario*: cada mañana te mando un acumulado de las rendiciones pendientes recientes, para que decidas si pagas algo antes del corte semanal. También puedes pedirme \"resumen\" cuando quieras.\n\n" +
        "📊 *Reportes con margen*: pide \"exportar [obra]\" y te mando un Excel con el detalle, incluyendo margen y utilidad — eso solo lo ves tú.\n\n" +
        "🤝 *Acuerdos y proveedores*: igual que Rodrigo, puedes cerrar acuerdos y preguntar saldos.\n\n" +
        "👥 *Usuarios y proveedores nuevos*: dime \"agregar usuario / Nombre / Teléfono / rol\" o \"agregar proveedor / Nombre\" y quedan habilitados.",
    };
  }
  return {
    completo: true,
    mensaje:
      "🤖 ¡Hola! Te cuento en qué te puedo ayudar:\n\n" +
      "📸 Mándame una foto de la boleta o factura y cuéntame en tus palabras qué compraste, para qué obra, etapa e ítem fue — yo me encargo de leer el monto y registrar todo con el respaldo guardado. Si la boleta es legible, ni siquiera necesitas escribirme el monto.\n\n" +
      "🤝 Si cerraste un acuerdo con un proveedor, dímelo (\"cerré acuerdo con Tal por $X\") y después puedes preguntarme \"cuánto le debo a Tal\" cuando quieras.\n\n" +
      "📊 Pídeme \"exportar [obra]\" cuando quieras revisar cómo va todo en Excel, o \"resumen de [obra]\" para ver tus rendiciones pendientes y pagadas.\n\n" +
      "📈 También puedo mostrarte qué tan bien va cada ítem respecto al presupuesto — para que veas el avance real de la obra.",
  };
}

function handleDesconocido() {
  return { completo: true, mensaje: "No entendí muy bien 🤔 — escribe *ayuda* para ver en qué te puedo ayudar." };
}

const HANDLERS = {
  REGISTRAR_RENDICION: handleRegistrarRendicion,
  REGISTRAR_ACUERDO: handleRegistrarAcuerdo,
  CONSULTAR_SALDO_PROVEEDOR: handleConsultarSaldoProveedor,
  REGISTRAR_PAGO: handleRegistrarPago,
  COMPLETAR_ETAPA: handleCompletarEtapa,
  ESTADO_ETAPA: handleEstadoEtapa,
  EXPORTAR_REPORTE: handleExportarReporte,
  CONSULTAR_RESUMEN: handleConsultarResumen,
  PEDIR_AYUDA: (usuario) => handleAyuda(usuario),
  DESCONOCIDO: () => handleDesconocido(),
};

// ============================================================
// COMANDOS ADMINISTRATIVOS (deterministas, solo gary/admin)
// ============================================================
async function intentarComandoAdmin(usuario, texto) {
  if (!esAdmin(usuario)) return null;
  const partes = texto.split("/").map((p) => p.trim());
  const cmd = partes[0].toLowerCase();

  if (cmd === "agregar usuario" && partes.length >= 4) {
    const [, nombre, telefono, rol] = partes;
    const creado = await db.usuarios.crear({ nombre, telefono: telefonoCompleto(telefono), rol: rol.toLowerCase() });
    return `✅ Usuario ${creado.nombre} (${creado.rol}) agregado.`;
  }
  if (cmd === "agregar proveedor" && partes.length >= 2) {
    const prov = await db.proveedores.obtenerOCrear(partes[1]);
    return `✅ Proveedor ${prov.nombre} agregado.`;
  }
  if (cmd === "obra nueva" && partes.length >= 2) {
    const obra = await db.obras.crear({ nombre: partes[1], bonoPorEtapa: partes[2] ? Number(partes[2].replace(/[$.]/g, "")) : 0 });
    return `✅ Obra ${obra.nombre} creada (bono por etapa: ${fmtMonto(obra.bono_por_etapa)}).`;
  }
  if (cmd === "etapa nueva" && partes.length >= 3) {
    const obra = await db.obras.porNombreAprox(partes[1]);
    if (!obra) return `❌ No encontré la obra "${partes[1]}".`;
    const etapa = await db.etapas.crear({ obraId: obra.id, nombre: partes[2] });
    return `✅ Etapa ${etapa.nombre} creada para ${obra.nombre}.`;
  }
  if (cmd === "presupuesto" && partes.length >= 5) {
    const [, nombreObra, nombreEtapa, nombreItem, montoRaw] = partes;
    const obra = await db.obras.porNombreAprox(nombreObra);
    if (!obra) return `❌ No encontré la obra "${nombreObra}".`;
    const etapa = await db.etapas.porObraYNombreAprox(obra.id, nombreEtapa);
    if (!etapa) return `❌ No encontré la etapa "${nombreEtapa}" en ${obra.nombre}.`;
    const monto = Number(montoRaw.replace(/[$.]/g, ""));
    const item = await db.itemsPresupuesto.crearOActualizar({ etapaId: etapa.id, nombre: nombreItem, presupuesto: monto });
    return `✅ Presupuesto de "${item.nombre}" en ${obra.nombre} ${etapa.nombre} actualizado a ${fmtMonto(monto)}.`;
  }
  if (cmd === "precio venta" && partes.length >= 3) {
    const dbComercial = require("./db_comercial");
    const obra = await db.obras.porNombreAprox(partes[1]);
    if (!obra) return `❌ No encontré la obra "${partes[1]}".`;
    const monto = Number(partes[2].replace(/[$.]/g, ""));
    if (partes.length >= 4) {
      const etapa = await db.etapas.porObraYNombreAprox(obra.id, partes[2]);
      const montoEtapa = Number(partes[3].replace(/[$.]/g, ""));
      if (!etapa) return `❌ No encontré la etapa "${partes[2]}" en ${obra.nombre}.`;
      await dbComercial.etapasComercial.actualizar(etapa.id, { precioVenta: montoEtapa });
      return `✅ Precio de venta de ${obra.nombre} ${etapa.nombre} actualizado a ${fmtMonto(montoEtapa)}.`;
    }
    await dbComercial.obrasComercial.actualizar(obra.id, { precioVenta: monto });
    return `✅ Precio de venta de ${obra.nombre} actualizado a ${fmtMonto(monto)}.`;
  }
  return null;
}

// ============================================================
// ENTRYPOINT
// ============================================================
async function procesarMensaje(usuario, mensajes) {
  const { texto, media } = extraerTextoYMedia(mensajes);

  if (/^\s*cancelar\s*$/i.test(texto || "")) {
    await db.estadoConversacional.borrar(usuario.id);
    await whatsapp.sendText(usuario.telefono, "Listo, cancelé lo que estábamos haciendo. ¿En qué más te ayudo?");
    return;
  }

  if (!esAdmin(usuario) && PATRON_INFO_RESTRINGIDA.test(texto || "")) {
    const nombre = (usuario.nombre || "").trim().split(/\s+/)[0] || "";
    await whatsapp.sendText(usuario.telefono, `${nombre ? nombre + ", " : ""}esa información está restringida para administración.`);
    return;
  }

  if (media || texto) {
    const respuestaAdmin = texto ? await intentarComandoAdmin(usuario, texto).catch((e) => {
      console.error("Error en comando admin:", e.message);
      return null;
    }) : null;
    if (respuestaAdmin) {
      await whatsapp.sendText(usuario.telefono, respuestaAdmin);
      return;
    }
  }

  let imagenSubida = null;
  let errorMedia = null;
  if (media) {
    try {
      imagenSubida = await descargarYSubirMedia(media, usuario);
    } catch (e) {
      const status = e.response?.status;
      console.error(
        "Error descargando/subiendo media:",
        status || "", e.message, status ? JSON.stringify(e.response?.data) : ""
      );
      errorMedia = true;
    }
  }

  if (errorMedia && !texto) {
    await whatsapp.sendText(usuario.telefono, "No pude leer la imagen que enviaste — ¿puedes reenviarla?");
    return;
  }

  const estado = await db.estadoConversacional.obtener(usuario.id);

  // Atajo determinista: si el bot mostró una lista numerada (preguntaObra) y
  // el usuario responde solo con un número, se resuelve directo sin pasar por
  // Claude — más rápido y sin riesgo de que la IA interprete mal un dígito.
  const opciones = estado?.datos_parciales?.opcionesPendientes;
  const seleccion = !media && /^\s*\d{1,2}\s*$/.test(texto || "") ? parseInt(texto.trim(), 10) : null;
  let extraido, intentFinal, datos;

  if (opciones && seleccion && opciones.lista[seleccion - 1]) {
    const elegido = opciones.lista[seleccion - 1];
    datos = { ...estado.datos_parciales };
    delete datos.opcionesPendientes;
    datos[`${opciones.campo}Id`] = elegido.id;
    datos[`${opciones.campo}Nombre`] = elegido.nombre;
    intentFinal = estado.intent;
    extraido = {};
  } else {
    const [obras, proveedores] = await Promise.all([db.obras.listar(), db.proveedores.listar()]);
    const catalogos = { obras: obras.map((o) => o.nombre), proveedores: proveedores.map((p) => p.nombre) };

    let claudeResp;
    try {
      claudeResp = await claude.extraerYClasificar({
        texto,
        imagen: imagenSubida ? { buffer: imagenSubida.buffer, mimeType: imagenSubida.mimeType } : null,
        estadoPendiente: estado, rol: usuario.rol, catalogos,
      });
    } catch (e) {
      console.error("Error clasificando mensaje con Claude:", e.message);
      await whatsapp.sendText(usuario.telefono, "Tuve un problema procesando tu mensaje, ¿puedes intentar de nuevo?");
      return;
    }

    extraido = claudeResp.resultado;
    intentFinal = extraido.intent;
    if (intentFinal === "RESPONDER_PREGUNTA_PENDIENTE" && estado) intentFinal = estado.intent;
    if (!estado && intentFinal === "RESPONDER_PREGUNTA_PENDIENTE") intentFinal = "DESCONOCIDO";

    datos = { ...(estado?.datos_parciales || {}), ...limpiarNoNulos(extraido) };
    delete datos.intent;
  }

  if (estado?.datos_parciales?.discrepanciaPendiente) {
    if (extraido.monto != null) datos.monto = extraido.monto;
    datos.discrepanciaResuelta = true;
    datos.discrepanciaPendiente = false;
  }

  if (imagenSubida) {
    if (intentFinal === "REGISTRAR_PAGO") {
      datos.comprobanteDriveId = imagenSubida.fileId;
      datos.comprobanteDriveLink = imagenSubida.webViewLink;
    } else {
      datos.imagenDriveId = imagenSubida.fileId;
      datos.imagenDriveLink = imagenSubida.webViewLink;
    }
  }

  datos = await resolverEntidades(datos);

  if (intentFinal === "REGISTRAR_PAGO" && !esAdmin(usuario)) {
    await whatsapp.sendText(usuario.telefono, "Solo Gary puede marcar pagos.");
    await db.estadoConversacional.borrar(usuario.id);
    return;
  }

  const handler = HANDLERS[intentFinal] || handleDesconocido;
  let resultado;
  try {
    resultado = await handler(usuario, datos);
  } catch (e) {
    console.error(`Error en handler ${intentFinal}:`, e.message);
    await whatsapp.sendText(usuario.telefono, "Algo falló registrando eso. Intenta de nuevo o avísale a Gary.");
    return;
  }

  if (resultado.completo) {
    await db.estadoConversacional.borrar(usuario.id);
    if (resultado.mensaje) await whatsapp.sendText(usuario.telefono, resultado.mensaje);
  } else {
    const datosAGuardar = { ...datos, ...(resultado.datosExtra || {}) };
    await db.estadoConversacional.guardar(usuario.id, intentFinal, datosAGuardar, resultado.pregunta);
    if (resultado.pregunta) await whatsapp.sendText(usuario.telefono, resultado.pregunta);
  }
}

async function enviarResumenDiarioAGary() {
  const garys = await db.usuarios.porRol(["gary", "admin"]);
  if (!garys.length) return;
  const texto = await reports.gary.resumenDiarioPendientesTexto();
  for (const g of garys) await whatsapp.sendText(g.telefono, texto);
}

module.exports = { procesarMensaje, enviarResumenDiarioAGary };
