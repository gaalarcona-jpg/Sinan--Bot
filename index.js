const express = require("express");
const cron = require("node-cron");
const config = require("./config");
const db = require("./db");
const flows = require("./flows");
const backup = require("./backup");
const { normalizarTel } = require("./format");

const app = express();

// Captura el RAW body de TODA request, sin importar Content-Type ni si el JSON
// es parseable — evita que un payload con estructura inesperada se pierda
// silenciosamente antes de poder diagnosticarlo.
app.use((req, res, next) => {
  let data = "";
  req.setEncoding("utf8");
  req.on("data", (chunk) => { data += chunk; });
  req.on("end", () => {
    req.rawBody = data;
    try {
      req.body = data ? JSON.parse(data) : {};
    } catch (e) {
      console.error("No se pudo parsear JSON del webhook:", e.message);
      req.body = {};
    }
    next();
  });
  req.on("error", (e) => {
    console.error("Error leyendo request body:", e.message);
    req.body = {};
    next();
  });
});

// Extrae el primer mensaje de texto/imagen soportando el formato anidado de
// Meta Cloud API / 360dialog (entry[0].changes[0].value.messages) y el formato
// plano legacy (usado por el test-ping del panel de 360dialog).
function extraerMensaje(body) {
  const value = body?.entry?.[0]?.changes?.[0]?.value;
  if (value?.messages?.length) return value.messages[0];
  if (body?.messages?.length) return body.messages[0];
  return null;
}

app.get("/webhook", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];
  if (mode === "subscribe" && token === config.WEBHOOK_VERIFY_TOKEN) {
    res.status(200).send(challenge);
  } else {
    res.sendStatus(403);
  }
});

app.post("/webhook", async (req, res) => {
  res.sendStatus(200);
  try {
    const msg = extraerMensaje(req.body);
    if (!msg) {
      console.log("Webhook sin mensajes procesables (status update, test-ping u otro evento).");
      return;
    }
    if (!["text", "image", "document"].includes(msg.type)) {
      console.log("Mensaje ignorado por tipo no soportado:", msg.type);
      return;
    }
    const telefono = normalizarTel(msg.from);
    const usuario = await db.usuarios.porTelefono(telefono);
    if (!usuario) {
      console.log("No autorizado:", telefono);
      return;
    }
    await flows.procesarMensaje(usuario, msg);
  } catch (err) {
    console.error("Error procesando webhook:", err.message);
  }
});

app.get("/", (req, res) => res.json({ status: "SINAN Bot v2 activo", timestamp: new Date().toISOString() }));

cron.schedule(config.BACKUP_CRON_SCHEDULE, () => {
  backup.ejecutarBackupDiario().catch((e) => console.error("Cron backup falló:", e.message));
}, { timezone: config.BACKUP_TIMEZONE });

cron.schedule(config.RESUMEN_DIARIO_CRON_SCHEDULE, () => {
  flows.enviarResumenDiarioAGary().catch((e) => console.error("Cron resumen diario falló:", e.message));
}, { timezone: config.BACKUP_TIMEZONE });

app.listen(config.PORT, () => console.log(`SINAN Bot v2 corriendo en puerto ${config.PORT}`));
