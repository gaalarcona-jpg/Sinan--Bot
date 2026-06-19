const REQUERIDAS = [
  "DATABASE_URL",
  "WHATSAPP_API_KEY",
  "WEBHOOK_VERIFY_TOKEN",
  "ANTHROPIC_API_KEY",
  "GOOGLE_SERVICE_ACCOUNT_JSON_BASE64",
  "GOOGLE_DRIVE_FOLDER_ID_BOLETAS",
  "GOOGLE_DRIVE_FOLDER_ID_BACKUPS",
  "GOOGLE_DRIVE_FOLDER_ID_REPORTES",
];

const faltantes = REQUERIDAS.filter((k) => !process.env[k]);
if (faltantes.length) {
  console.error("Faltan variables de entorno obligatorias:", faltantes.join(", "));
  process.exit(1);
}

let googleCredentials;
try {
  const raw = Buffer.from(process.env.GOOGLE_SERVICE_ACCOUNT_JSON_BASE64, "base64").toString("utf8");
  googleCredentials = JSON.parse(raw);
} catch (e) {
  console.error("GOOGLE_SERVICE_ACCOUNT_JSON_BASE64 no es un base64/JSON válido:", e.message);
  process.exit(1);
}

const config = {
  PORT: process.env.PORT || 3000,
  DATABASE_URL: process.env.DATABASE_URL,
  WHATSAPP_API_KEY: process.env.WHATSAPP_API_KEY,
  WEBHOOK_VERIFY_TOKEN: process.env.WEBHOOK_VERIFY_TOKEN,
  ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
  ANTHROPIC_MODEL: process.env.ANTHROPIC_MODEL || "claude-sonnet-4-5",
  GOOGLE_CREDENTIALS: googleCredentials,
  GOOGLE_DRIVE_FOLDER_ID_BOLETAS: process.env.GOOGLE_DRIVE_FOLDER_ID_BOLETAS,
  GOOGLE_DRIVE_FOLDER_ID_BACKUPS: process.env.GOOGLE_DRIVE_FOLDER_ID_BACKUPS,
  GOOGLE_DRIVE_FOLDER_ID_REPORTES: process.env.GOOGLE_DRIVE_FOLDER_ID_REPORTES,
  BACKUP_CRON_SCHEDULE: process.env.BACKUP_CRON_SCHEDULE || "0 6 * * *",
  BACKUP_TIMEZONE: process.env.BACKUP_TIMEZONE || "America/Santiago",
  RESUMEN_DIARIO_CRON_SCHEDULE: process.env.RESUMEN_DIARIO_CRON_SCHEDULE || "0 8 * * *",
};

module.exports = Object.freeze(config);
