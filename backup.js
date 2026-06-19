const db = require("./db");
const drive = require("./drive");
const config = require("./config");

const TABLAS = [
  "usuarios", "obras", "etapas", "items_presupuesto", "obras_comercial",
  "etapas_comercial", "proveedores", "acuerdos_proveedor", "gastos",
  "estado_conversacional", "backups_log",
];

async function ejecutarBackupDiario() {
  const fecha = new Date().toISOString().slice(0, 10);
  const tablasOk = [];
  try {
    for (const tabla of TABLAS) {
      const { rows } = await db.query(`SELECT * FROM ${tabla}`);
      const buffer = Buffer.from(JSON.stringify(rows, null, 2), "utf8");
      await drive.subirBackup(buffer, `${fecha}_${tabla}.json`);
      tablasOk.push(tabla);
    }
    await db.estadoConversacional.limpiarExpirados();
    await db.backupsLog.registrar({ ok: true, tablas: tablasOk, driveFolderId: config.GOOGLE_DRIVE_FOLDER_ID_BACKUPS });
    console.log(`Backup diario OK (${fecha}): ${tablasOk.length} tablas.`);
  } catch (err) {
    console.error("Backup diario falló:", err.message);
    await db.backupsLog.registrar({ ok: false, tablas: tablasOk, driveFolderId: config.GOOGLE_DRIVE_FOLDER_ID_BACKUPS, error: err.message }).catch(() => {});
  }
}

module.exports = { ejecutarBackupDiario };
