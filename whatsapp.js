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
// luego se descarga el binario. La metadata siempre requiere D360-API-KEY; la
// URL del binario a veces apunta a un host de Meta (no de 360dialog) que
// rechaza ese header con 401 — en ese caso se reintenta sin él.
async function downloadMedia(mediaId) {
  const meta = await axios.get(`${BASE_URL}/${mediaId}`, { headers: { "D360-API-KEY": config.WHATSAPP_API_KEY } });
  const { url, mime_type } = meta.data;
  try {
    const binResp = await axios.get(url, {
      headers: { "D360-API-KEY": config.WHATSAPP_API_KEY },
      responseType: "arraybuffer",
    });
    return { buffer: Buffer.from(binResp.data), mimeType: mime_type || "application/octet-stream" };
  } catch (e) {
    if (e.response?.status !== 401) throw e;
    console.error("Descarga de binario con D360-API-KEY dio 401, reintentando sin el header:", url);
    const binResp = await axios.get(url, { responseType: "arraybuffer" });
    return { buffer: Buffer.from(binResp.data), mimeType: mime_type || "application/octet-stream" };
  }
}

module.exports = { sendText, downloadMedia };
