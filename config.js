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
};

module.exports = Object.freeze(config);
