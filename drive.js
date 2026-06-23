const { google } = require("googleapis");
const { Readable } = require("stream");
const config = require("./config");

// OAuth de la cuenta personal de Gary (no service account): las service
// accounts no tienen cuota de almacenamiento propia, y sin Google Workspace no
// hay Unidades Compartidas donde darles una — los archivos quedan en el Drive
// real de Gary, con su cuota de 15GB. El refresh token no expira mientras no
// se revoque el acceso desde la cuenta de Google.
const auth = new google.auth.OAuth2(config.GOOGLE_CLIENT_ID, config.GOOGLE_CLIENT_SECRET);
auth.setCredentials({ refresh_token: config.GOOGLE_REFRESH_TOKEN });

const drive = google.drive({ version: "v3", auth });

async function subirArchivo(buffer, nombreArchivo, mimeType, folderId) {
  const { data } = await drive.files.create({
    requestBody: { name: nombreArchivo, parents: [folderId] },
    media: { mimeType, body: Readable.from(buffer) },
    fields: "id, webViewLink",
  });
  await drive.permissions.create({
    fileId: data.id,
    requestBody: { role: "reader", type: "anyone" },
  });
  const { data: meta } = await drive.files.get({ fileId: data.id, fields: "id, webViewLink" });
  return { fileId: meta.id, webViewLink: meta.webViewLink };
}

const subirImagen = (buffer, nombreArchivo, mimeType) =>
  subirArchivo(buffer, nombreArchivo, mimeType, config.GOOGLE_DRIVE_FOLDER_ID_BOLETAS);

const subirBackup = (buffer, nombreArchivo) =>
  subirArchivo(buffer, nombreArchivo, "application/json", config.GOOGLE_DRIVE_FOLDER_ID_BACKUPS);

const subirReporte = (buffer, nombreArchivo) =>
  subirArchivo(
    buffer,
    nombreArchivo,
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    config.GOOGLE_DRIVE_FOLDER_ID_REPORTES
  );

// La imagen se sube al tiro cuando llega (con nombre provisorio, porque obra/
// proveedor/monto recién se terminan de confirmar en turnos posteriores) y se
// renombra una vez creado el gasto, ya con todos los datos finales.
async function renombrar(fileId, nuevoNombre) {
  await drive.files.update({ fileId, requestBody: { name: nuevoNombre } });
}

module.exports = { subirImagen, subirBackup, subirReporte, renombrar };
