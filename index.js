const express = require("express");
const axios = require("axios");
const app = express();

// Captura el RAW body de TODA request, sin importar Content-Type ni si el JSON
// es parseable. Reemplaza a express.json() para que ningún payload con
// estructura inesperada se pierda silenciosamente antes de loguearlo.
app.use((req, res, next) => {
  let data = "";
  req.setEncoding("utf8");
  req.on("data", (chunk) => { data += chunk; });
  req.on("end", () => {
    req.rawBody = data;
    if (req.path === "/webhook") {
      console.log("==== RAW WEBHOOK ====");
      console.log("Method:", req.method, "Content-Type:", req.headers["content-type"]);
      console.log("Headers:", JSON.stringify(req.headers));
      console.log("Body crudo:", data || "(vacío)");
      console.log("=====================");
    }
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

const WHATSAPP_API_KEY = process.env.WHATSAPP_API_KEY;
const normalizarTel = (n) => (n || "").replace(/[^\d]/g, "");
const GARY_NUMBERS = [process.env.GARY_NUMBER_1, process.env.GARY_NUMBER_2].filter(Boolean).map(normalizarTel);
const RODRIGO_NUMBER = normalizarTel(process.env.RODRIGO_NUMBER);

const gastos = [];
let gastoIdCounter = 1;

const fmtMonto = (n) => "$" + Math.round(n).toLocaleString("es-CL");

async function sendMsg(to, body) {
  try {
    await axios.post("https://waba-v2.360dialog.io/messages", {
      messaging_product: "whatsapp",
      to,
      type: "text",
      text: { body, preview_url: false }
    }, { headers: { "D360-API-KEY": WHATSAPP_API_KEY, "Content-Type": "application/json" } });
    console.log("Enviado OK a", to);
  } catch(err) {
    console.error("Error:", err.response?.status, JSON.stringify(err.response?.data));
  }
}

function isGary(n) { return GARY_NUMBERS.includes(normalizarTel(n)); }
function isRodrigo(n) { return normalizarTel(n) === RODRIGO_NUMBER; }
function isAuthorized(n) { return isGary(n) || isRodrigo(n); }

// Extrae el primer mensaje de texto soportando dos formatos de webhook:
// 1) Meta Cloud API / 360dialog "Cloud API hosted by Meta": anidado en
//    entry[0].changes[0].value.messages
// 2) Formato plano legacy (usado por el test-ping del panel de 360dialog):
//    body.messages directamente
function extraerMensaje(body) {
  const value = body?.entry?.[0]?.changes?.[0]?.value;
  if (value?.messages?.length) return value.messages[0];
  if (body?.messages?.length) return body.messages[0];
  return null;
}

function parsearGasto(texto) {
  const partes = texto.split("/").map(p => p.trim());
  const errores = [];
  if (partes.length < 5) {
    const campos = ["Obra","Etapa","Proveedor","Monto","Descripción"];
    for (let i = partes.length; i < 5; i++) errores.push(campos[i]);
    return { ok: false, errores, partes };
  }
  const [obra, etapa, proveedor, montoRaw, ...descParts] = partes;
  const descripcion = descParts.join(" / ");
  const monto = parseInt(montoRaw.replace(/[$.]/g, ""));
  if (isNaN(monto) || monto <= 0) return { ok: false, errores: ["Monto inválido (ej: 1166311)"], partes };
  const obrasValidas = ["codegua","rancagua","peñaflor","maribel","islevy","adela","mardones"];
  if (!obrasValidas.some(o => obra.toLowerCase().includes(o)))
    return { ok: false, errores: [`Obra no reconocida: "${obra}"`], partes };
  return { ok: true, obra, etapa: etapa.toUpperCase(), proveedor, monto, descripcion };
}

function parsearPago(texto) {
  const partes = texto.split("/").map(p => p.trim());
  if (partes.length < 3) return { ok: false, msg: "Formato: pago / ID / monto" };
  const id = parseInt(partes[1]);
  const monto = parseInt(partes[2].replace(/[$.]/g, ""));
  if (isNaN(id)) return { ok: false, msg: "ID inválido" };
  if (isNaN(monto) || monto <= 0) return { ok: false, msg: "Monto inválido" };
  return { ok: true, id, monto };
}

function generarResumen() {
  const pendientes = gastos.filter(g => g.estado === "pendiente");
  const pagados = gastos.filter(g => g.estado === "pagado");
  const porObra = {};
  gastos.forEach(g => {
    const key = `${g.obra} ${g.etapa}`;
    if (!porObra[key]) porObra[key] = { pendiente: 0, pagado: 0 };
    porObra[key][g.estado] += g.monto;
  });
  let t = `📊 *SINAN — Resumen*\n📅 ${new Date().toLocaleDateString("es-CL")}\n\n`;
  if (!Object.keys(porObra).length) t += "Sin gastos registrados.\n";
  else Object.entries(porObra).forEach(([o, d]) => {
    t += `🏗️ *${o}*\n  ✅ Pagado: ${fmtMonto(d.pagado)}\n  ⏳ Pendiente: ${fmtMonto(d.pendiente)}\n`;
  });
  t += `\n━━━━━━━━━━\n⏳ Pendiente: ${fmtMonto(pendientes.reduce((s,g)=>s+g.monto,0))} (${pendientes.length})\n`;
  t += `✅ Pagado: ${fmtMonto(pagados.reduce((s,g)=>s+g.monto,0))} (${pagados.length})`;
  return t;
}

function listarPendientes() {
  const p = gastos.filter(g => g.estado === "pendiente");
  if (!p.length) return "✅ No hay gastos pendientes.";
  let t = `⏳ *Gastos pendientes:*\n\n`;
  p.forEach(g => { t += `🔹 *ID ${g.id}* — ${g.obra} ${g.etapa}\n   ${g.proveedor} · ${fmtMonto(g.monto)}\n   ${g.descripcion} · ${g.fecha}\n\n`; });
  t += `Para pagar: *pago / ID / monto*`;
  return t;
}

function msgAyuda(esGary) {
  let t = `🤖 *Bot SINAN*\n\n📝 Registrar gasto:\nObra / Etapa / Proveedor / Monto / Descripción\n_Ej: Codegua / E1 / Yolito / 1166311 / Fierros_\n\n📊 *resumen* — Estado empresa\n⏳ *pendientes* — Sin pagar\n❓ *ayuda* — Este mensaje`;
  if (esGary) t += `\n\n👑 *Solo Gary:*\n✅ *pago / ID / monto* — Marcar pagado`;
  return t;
}

app.get("/webhook", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];
  if (mode === "subscribe" && token === "sinan2024") {
    res.status(200).send(challenge);
  } else {
    res.sendStatus(403);
  }
});

app.post("/webhook", async (req, res) => {
  res.sendStatus(200);
  try {
    const body = req.body;
    const msg = extraerMensaje(body);
    if (!msg) {
      console.log("Webhook sin mensajes procesables (status update, test-ping u otro evento). object:", body?.object);
      return;
    }
    if (msg.type !== "text") {
      console.log("Mensaje ignorado por tipo no-texto:", msg.type);
      return;
    }
    const texto = msg.text?.body?.trim() || "";
    const from = msg.from;
    console.log("Mensaje de:", from, "->", texto);
    if (!isAuthorized(from)) { console.log("No autorizado:", from); return; }
    const lower = texto.toLowerCase();
    const gary = isGary(from);

    if (lower === "ayuda" || lower === "help") return sendMsg(from, msgAyuda(gary));
    if (lower === "resumen") return sendMsg(from, generarResumen());
    if (lower === "pendientes") return sendMsg(from, listarPendientes());

    if (lower.startsWith("pago") && gary) {
      const pago = parsearPago(texto);
      if (!pago.ok) return sendMsg(from, `❌ ${pago.msg}`);
      const gasto = gastos.find(g => g.id === pago.id);
      if (!gasto) return sendMsg(from, `❌ No existe ID ${pago.id}.`);
      if (gasto.estado === "pagado") return sendMsg(from, `⚠️ ID ${pago.id} ya fue pagado`);
      gasto.estado = "pagado"; gasto.montoPagado = pago.monto; gasto.fechaPago = new Date().toLocaleDateString("es-CL");
      let r = `✅ *Pago registrado*\nID: ${gasto.id} · ${gasto.obra} ${gasto.etapa}\nProveedor: ${gasto.proveedor}\nMonto: ${fmtMonto(pago.monto)}\nFecha: ${gasto.fechaPago}`;
      if (pago.monto !== gasto.monto) r += `\n⚠️ Diferencia: registrado ${fmtMonto(gasto.monto)} vs pagado ${fmtMonto(pago.monto)}`;
      return sendMsg(from, r);
    }

    if (texto.includes("/")) {
      const parsed = parsearGasto(texto);
      if (!parsed.ok) {
        let r = `❌ *Formato incorrecto*\n\nFalta:\n`;
        parsed.errores.forEach(e => r += `  • ${e}\n`);
        r += `\nEj: Codegua / E1 / Yolito / 1166311 / Fierros`;
        return sendMsg(from, r);
      }
      const gasto = { id: gastoIdCounter++, obra: parsed.obra, etapa: parsed.etapa, proveedor: parsed.proveedor, monto: parsed.monto, descripcion: parsed.descripcion, fecha: new Date().toLocaleDateString("es-CL"), registradoPor: gary ? "Gary" : "Rodrigo", estado: "pendiente" };
      gastos.push(gasto);
      let saldo = "";
      if (gasto.obra.toLowerCase().includes("codegua") && gasto.etapa === "E1") {
        const PPTO = 31000000;
        const gastadoE1 = gastos.filter(g => g.obra.toLowerCase().includes("codegua") && g.etapa === "E1").reduce((s,g)=>s+g.monto,0);
        const s = PPTO - gastadoE1; const p = Math.round((gastadoE1/PPTO)*100);
        saldo = `\n\n📊 Codegua E1\nPresupuesto: ${fmtMonto(PPTO)}\nGastado: ${fmtMonto(gastadoE1)} (${p}%) ${p>=90?"🔴":p>=70?"🟡":"🟢"}\nSaldo: ${fmtMonto(s)}${s<0?" ⚠️ EXCEDIDO":""}`;
      }
      let r = `✅ *Registrado — ID ${gasto.id}*\n⏳ Pendiente de pago\n\n${gasto.obra} ${gasto.etapa} · ${gasto.proveedor}\nMonto: ${fmtMonto(gasto.monto)}\nDesc: ${gasto.descripcion}${saldo}`;
      if (!gary) {
        r += `\n\n💡 Notificando a Gary...`;
        GARY_NUMBERS.forEach(n => sendMsg(n, `🔔 *Nuevo gasto — Rodrigo*\nID: ${gasto.id} · ${gasto.obra} ${gasto.etapa}\n${gasto.proveedor} · ${fmtMonto(gasto.monto)}\n${gasto.descripcion}\n\nPara pagar: *pago / ${gasto.id} / ${gasto.monto}*`));
      }
      return sendMsg(from, r);
    }

    if (texto.length > 3) sendMsg(from, `🤖 No entendí.\n\nUsa *ayuda* para ver los comandos.`);
  } catch (err) { console.error("Error webhook:", err.message); }
});

app.get("/gastos", (req, res) => res.json(gastos));
app.get("/", (req, res) => res.json({ status: "SINAN Bot activo", timestamp: new Date().toISOString(), gastos_registrados: gastos.length }));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`SINAN Bot corriendo en puerto ${PORT}`));
