const axios = require("axios");
const config = require("./config");

const BASE_URL = "https://waba-v2.360dialog.io";
const headers = { "D360-API-KEY": config.WHATSAPP_API_KEY, "Content-Type": "application/json" };

async function sendText(to, body) {
  try {
    await axios.post(`${BASE_URL}/messages`, {
      messaging_product: "whatsapp",
      to,
      type: "text",
      text: { body, preview_url: false },
    }, { headers });
    console.log("Enviado OK a", to);
  } catch (err) {
    console.error("Error enviando mensaje:", err.response?.status, JSON.stringify(err.response?.data));
  }
}

// Descarga un media de WhatsApp: primero se resuelve la URL real del media-id
// (siempre vía D360-API-KEY, ese paso nunca ha fallado), luego se descarga el
// binario. La URL del binario a veces apunta a un host de Meta (lookaside.fbsbx.com,
// no a 360dialog) cuyo esquema de auth es distinto al de la metadata, así que se
// prueban varias estrategias en orden hasta que una funcione.
async function descargarBinario(url) {
  const intentos = [
    { nombre: "D360-API-KEY", headers: { "D360-API-KEY": config.WHATSAPP_API_KEY } },
    { nombre: "Authorization Bearer", headers: { Authorization: `Bearer ${config.WHATSAPP_API_KEY}` } },
    { nombre: "sin header", headers: {} },
  ];
  let ultimoError;
  for (const intento of intentos) {
    try {
      const resp = await axios.get(url, { headers: intento.headers, responseType: "arraybuffer" });
      console.log("Descarga de binario OK con estrategia:", intento.nombre);
      return resp;
    } catch (e) {
      ultimoError = e;
      if (e.response?.status !== 401) throw e;
      console.error(`Descarga de binario con "${intento.nombre}" dio 401, probando siguiente estrategia.`);
    }
  }
  throw ultimoError;
}

async function downloadMedia(mediaId) {
  const meta = await axios.get(`${BASE_URL}/${mediaId}`, { headers: { "D360-API-KEY": config.WHATSAPP_API_KEY } });
  const { url, mime_type } = meta.data;
  const binResp = await descargarBinario(url);
  return { buffer: Buffer.from(binResp.data), mimeType: mime_type || "application/octet-stream" };
}

module.exports = { sendText, downloadMedia };
