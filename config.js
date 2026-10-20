const REQUERIDAS = [
  "DATABASE_URL",
  "WHATSAPP_API_KEY",
  "META_TOKEN",
  "WEBHOOK_VERIFY_TOKEN",
  "ANTHROPIC_API_KEY",
  "GOOGLE_CLIENT_ID",
  "GOOGLE_CLIENT_SECRET",
  "GOOGLE_REFRESH_TOKEN",
  "GOOGLE_DRIVE_FOLDER_ID_BOLETAS",
  "GOOGLE_DRIVE_FOLDER_ID_BACKUPS",
  "GOOGLE_DRIVE_FOLDER_ID_REPORTES",
];

const faltantes = REQUERIDAS.filter((k) => !process.env[k]);
if (faltantes.length) {
  console.error("Faltan variables de entorno obligatorias:", faltantes.join(", "));
  process.exit(1);
}

const config = {
  PORT: process.env.PORT || 3000,
  DATABASE_URL: process.env.DATABASE_URL,
  WHATSAPP_API_KEY: process.env.WHATSAPP_API_KEY,
  // Token directo de Meta — única vía para descargar media (graph.facebook.com),
  // 360dialog queda fuera de esa ruta porque la URL de binario que devolvía
  // quedaba ligada a su propio App ID ante Meta, no al nuestro.
  META_TOKEN: process.env.META_TOKEN,
  WEBHOOK_VERIFY_TOKEN: process.env.WEBHOOK_VERIFY_TOKEN,
  ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
  ANTHROPIC_MODEL: process.env.ANTHROPIC_MODEL || "claude-sonnet-4-5",
  // Drive corre con OAuth de una cuenta personal (no service account): las
  // service accounts no tienen cuota de almacenamiento propia en Gmail
  // personal y no hay Unidades Compartidas disponibles sin Google Workspace.
  GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID,
  GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET,
  GOOGLE_REFRESH_TOKEN: process.env.GOOGLE_REFRESH_TOKEN,
  GOOGLE_DRIVE_FOLDER_ID_BOLETAS: process.env.GOOGLE_DRIVE_FOLDER_ID_BOLETAS,
  GOOGLE_DRIVE_FOLDER_ID_BACKUPS: process.env.GOOGLE_DRIVE_FOLDER_ID_BACKUPS,
  GOOGLE_DRIVE_FOLDER_ID_REPORTES: process.env.GOOGLE_DRIVE_FOLDER_ID_REPORTES,
  BACKUP_CRON_SCHEDULE: process.env.BACKUP_CRON_SCHEDULE || "0 6 * * *",
  BACKUP_TIMEZONE: process.env.BACKUP_TIMEZONE || "America/Santiago",
  RESUMEN_DIARIO_CRON_SCHEDULE: process.env.RESUMEN_DIARIO_CRON_SCHEDULE || "0 8 * * *",
  // Promos de almuerzo (promos.js). PROMOS_ACTIVO=false lo apaga desde Railway.
  PROMOS_ACTIVO: (process.env.PROMOS_ACTIVO || "true") !== "false",
  PROMOS_TO: process.env.PROMOS_TO || "56973068845",
  PROMOS_TEMPLATE: process.env.PROMOS_TEMPLATE || "promos_almuerzo",
  PROMOS_TEMPLATE_LANG: process.env.PROMOS_TEMPLATE_LANG || "es",
  // Intento 11:00 y reintento 11:05; a las 11:15 el último intento avisa si no hay archivo.
  PROMOS_CRON_SCHEDULE: process.env.PROMOS_CRON_SCHEDULE || "0,5 11 * * 1-5",
  PROMOS_CRON_ULTIMO: process.env.PROMOS_CRON_ULTIMO || "15 11 * * 1-5",
};

module.exports = Object.freeze(config);
