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

// La descarga de media vía 360dialog (D360-API-KEY) devolvía una URL del CDN
// de Meta (lookaside.fbsbx.com) que ningún esquema de auth probado lograba
// pasar — 360dialog actúa como Tech Provider ante Meta, así que esa URL queda
// ligada a su App ID, no al nuestro. Por eso el media se resuelve directo
// contra Meta Cloud API (graph.facebook.com) con META_TOKEN, sin pasar por
// 360dialog en este paso.
const META_GRAPH_URL = "https://graph.facebook.com/v18.0";

async function downloadMedia(mediaId) {
  const metaHeaders = { Authorization: `Bearer ${config.META_TOKEN}` };
  const meta = await axios.get(`${META_GRAPH_URL}/${mediaId}`, { headers: metaHeaders });
  const { url, mime_type } = meta.data;
  const binResp = await axios.get(url, { headers: metaHeaders, responseType: "arraybuffer" });
  return { buffer: Buffer.from(binResp.data), mimeType: mime_type || "application/octet-stream" };
}

module.exports = { sendText, downloadMedia };
