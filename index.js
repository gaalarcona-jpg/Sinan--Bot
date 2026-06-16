const express = require("express");
const axios = require("axios");
const app = express();
app.use(express.json());

const TOKEN_360 = process.env.TOKEN_360;
const API_URL   = "https://waba.360dialog.io/v1/messages";
const GARY_NUMBERS = [process.env.GARY_NUMBER_1, process.env.GARY_NUMBER_2].filter(Boolean);
const RODRIGO_NUMBER = process.env.RODRIGO_NUMBER;

const gastos = [];
let gastoIdCounter = 1;

const fmtMonto = (n) => "$" + Math.round(n).toLocaleString("es-CL");

function sendMsg(to, body) {
  return axios.post(API_URL, { messaging_product: "whatsapp", to, type: "text", text: { body } },
    { headers: { "D360-API-KEY": TOKEN_360, "Content-Type": "application/json" } }
  ).catch(err => console.error("Error:", err.message));
}

function isGary(n) { return GARY_NUMBERS.includes(n); }
function isRodrigo(n) { return n === RODRIGO_NUMBER; }
function isAuthorized(n) { return isGary(n) || isRodrigo(n); }

function parsearGasto(texto) {
  const partes = texto.split("/").map(p => p.trim());
  const errores = [];
  if (partes.length < 5) {
    const campos = ["Obra", "Etapa", "Proveedor", "Monto", "Descripción"];
    for (let i = partes.length; i < 5; i++) errores.push(campos[i]);
    return { ok: false, errores, partes };
  }
  const [obra, etapa, proveedor, montoRaw, ...descParts] = partes;
  const descripcion = descParts.join(" / ");
  const monto = parseInt(montoRaw.replace(/[$.]/g, ""));
  if (isNaN(monto) || monto <= 0) return { ok: false, errores: ["Monto inválido (ej: 1166311)"], partes };
  const obrasValidas = ["codegua", "rancagua", "peñaflor"];
  if (!obrasValidas.some(o => obra.toLowerCase().includes(o)))
    return { ok: false, errores: [`Obra no reconocida: "${obra}" — usa Codegua, Rancagua o Peñaflor`], partes };
  return { ok: true, obra, etapa: etapa.toUpperCase(), proveedor, monto, descripcion };
}

function parsearPago(texto) {
  const partes = texto.split("/").map(p => p.trim());
  if (partes.length < 3) return { ok: false, msg: "Formato: pago / ID / monto\nEj: pago / 3 / 600000" };
  const id = parseInt(partes[1]);
  const monto = parseInt(partes[2].replace(/[$.]/g, ""));
  if (isNaN(id)) return { ok: false, msg: "ID de gasto inválido" };
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
  let t = `📊 *SINAN — Resumen operacional*\n📅 ${new Date().toLocaleDateString("es-CL")}\n\n`;
  if (!Object.keys(porObra).length) { t += "Sin gastos registrados aún.\n"; }
  else Object.entries(porObra).forEach(([obra, d]) => {
    t += `🏗️ *${obra}*\n  ✅ Pagado: ${fmtMonto(d.pagado)}\n  ⏳ Pendiente: ${fmtMonto(d.pendiente)}\n`;
  });
  t += `\n━━━━━━━━━━\n⏳ Total pendiente: ${fmtMonto(pendientes.reduce((s,g)=>s+g.monto,0))} (${pendientes.length})\n`;
  t += `✅ Total pagado: ${fmtMonto(pagados.reduce((s,g)=>s+g.monto,0))} (${pagados.length})`;
  return t;
}

function listarPendientes() {
  const p = gastos.filter(g => g.estado === "pendiente");
  if (!p.length) return "✅ No hay gastos pendientes.";
  let t = `⏳ *Gastos pendientes:*\n\n`;
  p.forEach(g => { t += `🔹 *ID ${g.id}* — ${g.obra} ${g.etapa}\n   ${g.proveedor} · ${fmtMonto(g.monto)}\n   ${g.descripcion} · ${g.fecha}\n\n`; });
  t += `Para pagar:\n*pago / ID / monto*`;
  return t;
}

function msgAyuda(esGary) {
  let t = `🤖 *Bot SINAN*\n\n📝 Registrar gasto:\nObra / Etapa / Proveedor / Monto / Descripción\n_Ej: Codegua / E1 / Yolito / 1166311 / Fierros_\n\n📊 *resumen* — Estado empresa\n⏳ *pendientes* — Sin pagar\n❓ *ayuda* — Este mensaje`;
  if (esGary) t += `\n\n👑 *Solo Gary:*\n✅ *pago / ID / monto* — Marcar pagado`;
  return t;
}

app.post("/webhook", async (req, res) => {
  res.sendStatus(200);
  try {
    const body = req.body;
    const messages = body?.messages || body?.entry?.[0]?.changes?.[0]?.value?.messages;
    if (!messages?.length) return;
    const msg = messages[0];
    if (msg.type !== "text") return;
    const texto = msg.text?.body?.trim() || "";
    const from = msg.from;
    if (!isAuthorized(from)) return;
    const lower = texto.toLowerCase();
    const gary = isGary(from);

    if (lower === "ayuda" || lower === "help") return sendMsg(from, msgAyuda(gary));
    if (lower === "resumen") return sendMsg(from, generarResumen());
    if (lower === "pendientes") return sendMsg(from, listarPendientes());

    if (lower.startsWith("pago") && gary) {
      const pago = parsearPago(texto);
      if (!pago.ok) return sendMsg(from, `❌ ${pago.msg}`);
      const gasto = gastos.find(g => g.id === pago.id);
      if (!gasto) return sendMsg(from, `❌ No existe ID ${pago.id}. Usa *pendientes* para ver los disponibles.`);
      if (gasto.estado === "pagado") return sendMsg(from, `⚠️ ID ${pago.id} ya fue pagado (${fmtMonto(gasto.monto)})`);
      gasto.estado = "pagado"; gasto.montoPagado = pago.monto; gasto.fechaPago = new Date().toLocaleDateString("es-CL");
      let r = `✅ *Pago registrado*\nID: ${gasto.id} · ${gasto.obra} ${gasto.etapa}\nProveedor: ${gasto.proveedor}\nMonto: ${fmtMonto(pago.monto)}\nFecha: ${gasto.fechaPago}`;
      if (pago.monto !== gasto.monto) r += `\n⚠️ Diferencia: registrado ${fmtMonto(gasto.monto)} vs pagado ${fmtMonto(pago.monto)}`;
      return sendMsg(from, r);
    }

    if (texto.includes("/")) {
      const parsed = parsearGasto(texto);
      if (!parsed.ok) {
        let r = `❌ *Formato incorrecto*\n\n`;
        if (parsed.errores.length) { r += `Falta:\n`; parsed.errores.forEach(e => r += `  • ${e}\n`); }
        r += `\n📝 Formato correcto:\nObra / Etapa / Proveedor / Monto / Descripción\n\nEj: Codegua / E1 / Yolito / 1166311 / Fierros`;
        if (parsed.partes?.length) {
          r += `\n\n📋 Lo que recibí:\n`;
          ["Obra","Etapa","Proveedor","Monto","Descripción"].forEach((c,i) => { if (parsed.partes[i]) r += `  ${c}: ${parsed.partes[i]}\n`; });
        }
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

    if (texto.length > 3) sendMsg(from, `🤖 No entendí.\n\nUsa *ayuda* para ver los comandos disponibles.`);
  } catch (err) { console.error("Error webhook:", err.message); }
});

app.get("/gastos", (req, res) => res.json(gastos));
app.get("/gastos/:obra/:etapa", (req, res) => {
  const { obra, etapa } = req.params;
  const filtrados = gastos.filter(g => g.obra.toLowerCase().includes(obra.toLowerCase()) && g.etapa.toLowerCase() === etapa.toLowerCase());
  res.json({ gastos: filtrados, total: filtrados.reduce((s,g)=>s+g.monto,0), count: filtrados.length });
});
app.get("/", (req, res) => res.json({ status: "SINAN Bot activo", timestamp: new Date().toISOString(), gastos_registrados: gastos.length }));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`SINAN Bot corriendo en puerto ${PORT}`));
