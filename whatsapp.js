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

// Descarga un media de WhatsApp: primero se resuelve la URL real del media-id,
// luego se descarga el binario. Ambas llamadas requieren el header D360-API-KEY.
async function downloadMedia(mediaId) {
  const meta = await axios.get(`${BASE_URL}/${mediaId}`, { headers: { "D360-API-KEY": config.WHATSAPP_API_KEY } });
  const { url, mime_type } = meta.data;
  const binResp = await axios.get(url, {
    headers: { "D360-API-KEY": config.WHATSAPP_API_KEY },
    responseType: "arraybuffer",
  });
  return { buffer: Buffer.from(binResp.data), mimeType: mime_type || "application/octet-stream" };
}

module.exports = { sendText, downloadMedia };
