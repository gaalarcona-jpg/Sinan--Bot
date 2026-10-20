// Envío diario de "promos de almuerzo" a Gary por WhatsApp.
//
// Una tarea programada de Claude deja cada día hábil, antes de las 11:00, un
// archivo de texto "promos-almuerzo-AAAA-MM-DD.txt" en la carpeta de Drive
// SINAN-Reportes. Este módulo lo lee y lo manda por el mismo número del bot.
//
// Orden de envío: plantilla aprobada (funciona aunque no haya ventana de 24 h)
// -> si la plantilla no existe/no está aprobada, texto libre (solo llega si Gary
// le escribió al bot en las últimas 24 h).
//
// No toca tablas financieras ni db_comercial. Todas las dependencias se
// inyectan para poder testear sin red ni BD (ver test_promos.js).
const MAX_PARAM = 1000; // Meta: parámetro de plantilla <= 1024 chars
function fechaChile(now = new Date()) {
 // YYYY-MM-DD en America/Santiago
 return new Intl.DateTimeFormat("en-CA", {
 timeZone: "America/Santiago", year: "numeric", month: "2-digit", day: "2-digit",
 }).format(now);
}
function nombreArchivo(fecha) {
 return `promos-almuerzo-${fecha}.txt`;
}
// Meta rechaza parámetros con saltos de línea, tabs o más de 4 espacios seguidos.
function aParametroPlantilla(texto) {
 let t = String(texto || "")
 .replace(/\r/g, "")
 .split("\n").map((l) => l.trim()).filter(Boolean).join(" | ")
 .replace(/\t/g, " ")
 .replace(/ {4,}/g, " ")
 .trim();
 if (t.length > MAX_PARAM) t = t.slice(0, MAX_PARAM - 1) + "...";
 return t;
}
function crearPromos({ drive, whatsapp, db, config, log = console }) {
 const destino = config.PROMOS_TO;
 async function yaEnviado(fecha) {
 const { rows } = await db.query("SELECT 1 FROM promos_envios WHERE fecha = $1", [fecha]);
 return rows.length > 0;
 }
 async function registrar(fecha, modo, fileId, messageId) {
 await db.query(
 `INSERT INTO promos_envios (fecha, destino, modo, drive_file_id, meta_message_id)
 VALUES ($1, $2, $3, $4, $5) ON CONFLICT (fecha) DO NOTHING`,
 [fecha, destino, modo, fileId || null, messageId || null]
 );
 }
 // ultimoIntento=true -> si no hay archivo, avisa a Gary en vez de esperar.
 async function enviarPromosDelDia({ now = new Date(), ultimoIntento = false } = {}) {
 const fecha = fechaChile(now);
 if (await yaEnviado(fecha)) {
 log.log(`[promos] ${fecha} ya enviado, nada que hacer`);
 return { estado: "ya_enviado", fecha };
 }
 const archivo = await drive.leerTextoPorNombre(nombreArchivo(fecha), config.GOOGLE_DRIVE_FOLDER_ID_REPORTES);
 if (!archivo || !archivo.texto.trim()) {
 if (!ultimoIntento) {
 log.log(`[promos] ${fecha} sin archivo todavía, reintento más tarde`);
 return { estado: "sin_archivo", fecha };
 }
 const aviso = "Hoy no llegó el resumen de promos de almuerzo. Revisa tu correo.";
 const r = await enviar(aviso);
 await registrar(fecha, "aviso_sin_archivo", null, r.messageId);
 return { estado: "aviso_sin_archivo", fecha, modo: r.modo };
 }
 const r = await enviar(archivo.texto.trim());
 await registrar(fecha, r.modo, archivo.fileId, r.messageId);
 log.log(`[promos] ${fecha} enviado a ${destino} por ${r.modo}`);
 return { estado: "enviado", fecha, modo: r.modo, messageId: r.messageId };
 }
 async function enviar(texto) {
 try {
 const messageId = await whatsapp.sendTemplate(
 destino, config.PROMOS_TEMPLATE, config.PROMOS_TEMPLATE_LANG, [aParametroPlantilla(texto)]
 );
 return { modo: "plantilla", messageId };
 } catch (e) {
 log.error("[promos] plantilla falló, uso texto libre:", e.message);
 const messageId = await whatsapp.sendTextStrict(destino, texto);
 return { modo: "texto", messageId };
 }
 }
 return { enviarPromosDelDia };
}
// Plantilla que se crea en el WABA si no existe (queda pendiente de aprobación
// de Meta; mientras tanto el envío cae a texto libre).
const PLANTILLA = {
 category: "UTILITY",
 body: "Promos de almuerzo de hoy: {{1}}",
 ejemplo: "Mejor opción hoy: Local X 40% Banco de Chile crédito | Confirma el beneficio en la app del banco antes de pagar.",
};
async function asegurarPlantilla({ whatsapp, config, log = console }) {
 try {
 const existe = await whatsapp.plantillaExiste(config.PROMOS_TEMPLATE);
 if (existe) {
 log.log(`[promos] plantilla ${config.PROMOS_TEMPLATE} estado: ${existe.status}`);
 return existe;
 }
 const creada = await whatsapp.crearPlantilla({
 name: config.PROMOS_TEMPLATE,
 language: config.PROMOS_TEMPLATE_LANG,
 category: PLANTILLA.category,
 body: PLANTILLA.body,
 ejemplo: PLANTILLA.ejemplo,
 });
 log.log(`[promos] plantilla ${config.PROMOS_TEMPLATE} creada, pendiente de aprobación`);
 return creada;
 } catch (e) {
 // Nunca debe botar el bot: el envío igual cae a texto libre.
 log.error("[promos] no pude verificar/crear plantilla:", e.response?.status, JSON.stringify(e.response?.data) || e.message);
 return null;
 }
}
module.exports = { crearPromos, asegurarPlantilla, fechaChile, nombreArchivo, aParametroPlantilla, PLANTILLA };

