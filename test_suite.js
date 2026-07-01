/**
 * SINAN Bot v2 — Suite de 50 tests
 * Run: ANTHROPIC_API_KEY=xxx node test_suite.js
 *
 * P01-P05  → unit tests (no env needed)
 * I01-I15  → clasificación ingreso (necesita ANTHROPIC_API_KEY)
 * G01-G10  → clasificación gasto operacional (necesita ANTHROPIC_API_KEY)
 * V01-V08  → clasificación inversión (necesita ANTHROPIC_API_KEY)
 * R01-R08  → regresión rendición (necesita ANTHROPIC_API_KEY)
 * C01-C04  → CRM API HTTP (llama Railway producción)
 */

const CRM_URL = "https://sinan-crm-production.up.railway.app";

// ============================================================
// P01-P05 — extraerTextoYMedia unit tests
// ============================================================
const KEYWORDS_INGRESO = /cobr[eé]|recib[ií]|me pag[oó]|ingreso|dep[oó]sito|transfer[ei]/i;
const KEYWORDS_GASTO = /compr[eé]|pagu[eé]|boleta|factura|rendici[oó]n/i;

function extraerTextoYMedia(mensajes) {
  const textos = [];
  const medias = [];
  let mediaEsReenviada = false;
  let archivoNoSoportado = null;
  let pdfComprobante = null;
  let pdfAmbigu = null;

  for (const msg of mensajes) {
    if (msg.context?.forwarded === true) mediaEsReenviada = true;

    if (msg.type === "text") {
      if (msg.text?.body?.trim()) textos.push(msg.text.body.trim());
      continue;
    }

    const m = msg.image || msg.document || null;
    if (!m) continue;

    if (msg.type === "document") {
      const filename = m.filename || "archivo";
      const ext = (filename.split(".").pop() || "").toLowerCase();
      const caption = m.caption?.trim() || "";
      if (caption) textos.push(caption);

      if (ext === "pdf") {
        if (KEYWORDS_INGRESO.test(caption)) {
          pdfComprobante = { id: m.id, filename };
        } else if (KEYWORDS_GASTO.test(caption)) {
          archivoNoSoportado = { filename, tipo: "pdf", esGasto: true };
        } else {
          pdfAmbigu = { id: m.id, filename };
        }
        continue;
      }

      if (["xlsx", "xls", "doc", "docx"].includes(ext)) {
        archivoNoSoportado = { filename, tipo: ext };
        continue;
      }
      archivoNoSoportado = { filename, tipo: ext };
      continue;
    }

    if (m.caption?.trim()) textos.push(m.caption.trim());
    medias.push({ id: m.id, tipo: msg.type, filename: m.filename || null });
  }

  return { texto: textos.join("\n"), medias, mediaEsReenviada, archivoNoSoportado, pdfComprobante, pdfAmbigu };
}

const pUnitTests = [
  {
    id: "P01",
    desc: "PDF con caption ingreso → pdfComprobante",
    fn: () => {
      const r = extraerTextoYMedia([{
        type: "document",
        document: { id: "abc123", filename: "comprobante.pdf", caption: "cobré de Walter $500000" },
      }]);
      if (!r.pdfComprobante) throw new Error("pdfComprobante null");
      if (r.pdfAmbigu) throw new Error("pdfAmbigu no debería estar seteado");
      if (r.archivoNoSoportado) throw new Error("archivoNoSoportado no debería estar seteado");
      if (!r.texto.includes("cobré")) throw new Error("caption no se extrae como texto");
    },
  },
  {
    id: "P02",
    desc: "PDF con caption gasto → archivoNoSoportado.esGasto",
    fn: () => {
      const r = extraerTextoYMedia([{
        type: "document",
        document: { id: "abc124", filename: "factura.pdf", caption: "aquí está la boleta de Sodimac" },
      }]);
      if (!r.archivoNoSoportado) throw new Error("archivoNoSoportado null");
      if (!r.archivoNoSoportado.esGasto) throw new Error("esGasto debería ser true");
      if (r.pdfComprobante) throw new Error("pdfComprobante no debería estar seteado");
    },
  },
  {
    id: "P03",
    desc: "PDF sin caption → pdfAmbigu",
    fn: () => {
      const r = extraerTextoYMedia([{
        type: "document",
        document: { id: "abc125", filename: "archivo.pdf" },
      }]);
      if (!r.pdfAmbigu) throw new Error("pdfAmbigu null");
      if (r.pdfComprobante) throw new Error("pdfComprobante no debería estar seteado");
      if (r.archivoNoSoportado) throw new Error("archivoNoSoportado no debería estar seteado");
    },
  },
  {
    id: "P04",
    desc: "XLSX → archivoNoSoportado sin esGasto",
    fn: () => {
      const r = extraerTextoYMedia([{
        type: "document",
        document: { id: "abc126", filename: "rendicion.xlsx" },
      }]);
      if (!r.archivoNoSoportado) throw new Error("archivoNoSoportado null");
      if (r.archivoNoSoportado.esGasto) throw new Error("esGasto no debería ser true para xlsx");
      if (r.pdfComprobante || r.pdfAmbigu) throw new Error("no debería haber pdf vars");
    },
  },
  {
    id: "P05",
    desc: "Imagen normal → en medias, no en archivoNoSoportado",
    fn: () => {
      const r = extraerTextoYMedia([{
        type: "image",
        image: { id: "abc127", caption: "boleta de Sodimac" },
      }]);
      if (r.medias.length !== 1) throw new Error(`medias.length=${r.medias.length}, esperado 1`);
      if (r.archivoNoSoportado) throw new Error("archivoNoSoportado no debería estar seteado");
      if (!r.texto.includes("boleta")) throw new Error("caption no se extrae");
    },
  },
];

// ============================================================
// Claude classification helpers
// ============================================================
let claudeClient = null;
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const ANTHROPIC_MODEL = process.env.ANTHROPIC_MODEL || "claude-sonnet-4-5";

const INTENTS = [
  "REGISTRAR_RENDICION","REGISTRAR_ACUERDO","CONSULTAR_SALDO_PROVEEDOR","REGISTRAR_PAGO",
  "COMPLETAR_ETAPA","ESTADO_ETAPA","EXPORTAR_REPORTE","CONSULTAR_RESUMEN",
  "REGISTRAR_GASTO_OPERACIONAL","REGISTRAR_INGRESO","CONSULTAR_ESTADO_RESULTADOS",
  "REGISTRAR_INVERSION","PEDIR_AYUDA","RESPONDER_PREGUNTA_PENDIENTE","DESCONOCIDO",
];

const TOOL = {
  name: "clasificar_mensaje_sinan",
  description: "Clasifica la intención del mensaje de un usuario del bot SINAN y extrae las entidades relevantes mencionadas en el texto.",
  input_schema: {
    type: "object",
    properties: {
      intent: { type: "string", enum: INTENTS },
      obra: { type: ["string", "null"] },
      etapa: { type: ["string", "null"] },
      item: { type: ["string", "null"] },
      proveedor: { type: ["string", "null"] },
      monto: { type: ["number", "null"] },
      monto_imagen: { type: ["number", "null"] },
      descripcion: { type: ["string", "null"] },
      cliente_nombre: { type: ["string", "null"], description: "Nombre SOLO del cliente. Sin descriptores geográficos (comuna, ciudad). Ej: 'cliente Walter Comuna de Quilpue' → 'Walter'; 'Gonzalo Parrague Padre Hurtado' → 'Gonzalo Parrague'." },
      area_negocio: { type: ["string", "null"], enum: ["Construcción","Arquitectura","Operacional",null] },
      categoria_gasto: { type: ["string", "null"], enum: ["sueldo","arriendo","marketing","software","otro",null] },
      tipo_inversion: { type: ["string", "null"], enum: ["activo_fijo","herramienta","vehiculo","material_stock","otro",null] },
      descripcion_activo: { type: ["string", "null"] },
      vida_util_anos: { type: ["number", "null"] },
      comprobante_pdf: { type: ["boolean", "null"] },
      confirma: { type: ["boolean", "null"] },
      periodo_mes: { type: ["string", "null"] },
    },
    required: ["intent"],
  },
};

function buildSystemPrompt(rol = "gary") {
  return [
    `Eres el clasificador de intención del bot SINAN. El mensaje viene de un usuario con rol "${rol}".`,
    "Tu única tarea es llamar a la herramienta clasificar_mensaje_sinan con la intención y entidades del texto.",
    "No generes texto de respuesta para el usuario final.",
    "REGLA 0 (PRIORIDAD MÁXIMA): Si el mensaje contiene cualquiera de estas palabras clave: 'costo operacional', 'gasto operacional', 'operacional', 'sueldo', 'arriendo', 'marketing', 'software', 'contador', 'tag vial', 'tag autopista', 'camioneta cuota', 'pago mensual', 'crédito cuota', 'cuota mensual' → SIEMPRE clasifica como REGISTRAR_GASTO_OPERACIONAL. Nunca uses REGISTRAR_INGRESO aunque el texto traiga comprobante de transferencia. Esta regla tiene precedencia absoluta sobre todas las demás.",
    "• REGISTRAR_GASTO_OPERACIONAL: cuando menciona 'pagué sueldo/arriendo/marketing/software/oficina' SIN mencionar obra/etapa.",
    "• REGISTRAR_INGRESO: cuando dice 'cobré/recibí pago de [cliente]' o 'me pagó [cliente]'. Extrae cliente_nombre (solo el nombre, sin geografía).",
    "• REGISTRAR_INVERSION: cuando Gary menciona compra de activo fijo, herramienta, vehículo, material en stock sin asignar a obra específica. Si va a una obra específica, usar REGISTRAR_RENDICION.",
    "• REGISTRAR_RENDICION: foto de boleta/factura + obra/etapa/ítem.",
  ].join("\n");
}

async function clasificar(texto, rol = "gary") {
  if (!claudeClient) {
    const { default: Anthropic } = await import("@anthropic-ai/sdk");
    claudeClient = new Anthropic({ apiKey: ANTHROPIC_API_KEY });
  }
  const resp = await claudeClient.messages.create({
    model: ANTHROPIC_MODEL,
    max_tokens: 512,
    system: buildSystemPrompt(rol),
    tools: [TOOL],
    tool_choice: { type: "tool", name: TOOL.name },
    messages: [{ role: "user", content: [{ type: "text", text: texto }] }],
  });
  const tu = resp.content.find((b) => b.type === "tool_use");
  if (!tu) throw new Error("No tool_use en respuesta");
  return tu.input;
}

// ============================================================
// I01-I15 — Ingreso classification tests
// ============================================================
const ingresoTests = [
  { id: "I01", desc: "cobré de Walter → REGISTRAR_INGRESO", texto: "cobré de Walter $500000", expect: { intent: "REGISTRAR_INGRESO" } },
  { id: "I02", desc: "recibí pago de Carlos → REGISTRAR_INGRESO", texto: "recibí pago de Carlos Pérez $1200000 por Codegua etapa 1", expect: { intent: "REGISTRAR_INGRESO" } },
  { id: "I03", desc: "me pagó Juan → REGISTRAR_INGRESO", texto: "me pagó Juan García $800000", expect: { intent: "REGISTRAR_INGRESO" } },
  { id: "I04", desc: "cliente_nombre sin geografía: 'Walter Comuna de Quilpue'", texto: "cobré de Walter de la Comuna de Quilpue $500000", expect: { intent: "REGISTRAR_INGRESO", cliente_nombre_no_contiene: ["quilpue", "Quilpue", "comuna", "Comuna"] } },
  { id: "I05", desc: "cliente_nombre: 'Gonzalo Parrague Padre Hurtado' → 'Gonzalo Parrague'", texto: "ingreso de Gonzalo Parrague Padre Hurtado $950000", expect: { intent: "REGISTRAR_INGRESO", cliente_nombre_no_contiene: ["Padre Hurtado", "padre hurtado"] } },
  { id: "I06", desc: "monto extraído correctamente", texto: "cobré de María $750000", expect: { intent: "REGISTRAR_INGRESO", monto_not_null: true } },
  { id: "I07", desc: "ingreso con obra → REGISTRAR_INGRESO (no rendición)", texto: "recibí pago de Roberto $2500000 por obra Codegua", expect: { intent: "REGISTRAR_INGRESO" } },
  { id: "I08", desc: "cobro arquitectura → REGISTRAR_INGRESO", texto: "cobré honorarios de diseño $1800000 de Pedro Soto", expect: { intent: "REGISTRAR_INGRESO" } },
  { id: "I09", desc: "depósito → REGISTRAR_INGRESO", texto: "depósito de Juan Martínez $3000000", expect: { intent: "REGISTRAR_INGRESO" } },
  { id: "I10", desc: "transferencia recibida → REGISTRAR_INGRESO", texto: "me hicieron una transferencia de $650000 de Diego Pérez", expect: { intent: "REGISTRAR_INGRESO" } },
  { id: "I11", desc: "ingreso no pasa a REGISTRAR_RENDICION", texto: "cobré $900000 de Cliente SA", expect: { intent: "REGISTRAR_INGRESO" } },
  { id: "I12", desc: "comprobante pdf=true cuando se menciona comprobante", texto: "cobré de Carlos $500000 te mando el comprobante PDF", expect: { intent: "REGISTRAR_INGRESO" } },
  { id: "I13", desc: "ingreso parcial etapa → REGISTRAR_INGRESO", texto: "cobré etapa 2 Codegua $57000000 de Rodrigo Mardones", expect: { intent: "REGISTRAR_INGRESO" } },
  { id: "I14", desc: "pago recibido con monto en texto → monto extraído", texto: "me pagó Empresa XY $4500000", expect: { intent: "REGISTRAR_INGRESO", monto_not_null: true } },
  { id: "I15", desc: "nombre largo sin geografía extraído", texto: "cobré de Juan Carlos Martínez López Santiago $1200000", expect: { intent: "REGISTRAR_INGRESO" } },
];

// ============================================================
// G01-G10 — Gasto operacional tests (REGLA 0)
// ============================================================
const gastoTests = [
  { id: "G01", desc: "sueldo → REGISTRAR_GASTO_OPERACIONAL", texto: "pagué el sueldo de Rodrigo $800000", expect: { intent: "REGISTRAR_GASTO_OPERACIONAL" } },
  { id: "G02", desc: "arriendo → REGISTRAR_GASTO_OPERACIONAL", texto: "pagué el arriendo de la oficina $350000", expect: { intent: "REGISTRAR_GASTO_OPERACIONAL" } },
  { id: "G03", desc: "marketing → REGISTRAR_GASTO_OPERACIONAL", texto: "gasté en marketing $120000", expect: { intent: "REGISTRAR_GASTO_OPERACIONAL" } },
  { id: "G04", desc: "software → REGISTRAR_GASTO_OPERACIONAL", texto: "pagué el software de contabilidad $89000", expect: { intent: "REGISTRAR_GASTO_OPERACIONAL" } },
  { id: "G05", desc: "cuota mensual → REGISTRAR_GASTO_OPERACIONAL (no REGISTRAR_INGRESO aunque traiga comprobante)", texto: "adjunto comprobante de transferencia de la cuota mensual del crédito $250000", expect: { intent: "REGISTRAR_GASTO_OPERACIONAL" } },
  { id: "G06", desc: "gasto operacional → REGISTRAR_GASTO_OPERACIONAL", texto: "gasto operacional contador $200000", expect: { intent: "REGISTRAR_GASTO_OPERACIONAL" } },
  { id: "G07", desc: "operacional → REGISTRAR_GASTO_OPERACIONAL", texto: "pago operacional del mes $150000", expect: { intent: "REGISTRAR_GASTO_OPERACIONAL" } },
  { id: "G08", desc: "crédito cuota → REGISTRAR_GASTO_OPERACIONAL", texto: "crédito cuota de la camioneta $180000", expect: { intent: "REGISTRAR_GASTO_OPERACIONAL" } },
  { id: "G09", desc: "tag autopista → REGISTRAR_GASTO_OPERACIONAL", texto: "recarga tag autopista $50000", expect: { intent: "REGISTRAR_GASTO_OPERACIONAL" } },
  { id: "G10", desc: "pago mensual → REGISTRAR_GASTO_OPERACIONAL", texto: "pago mensual del arriendo $400000", expect: { intent: "REGISTRAR_GASTO_OPERACIONAL" } },
];

// ============================================================
// V01-V08 — Inversión tests
// ============================================================
const inversionTests = [
  { id: "V01", desc: "compré andamio → REGISTRAR_INVERSION", texto: "compré un andamio de 6 metros $450000", expect: { intent: "REGISTRAR_INVERSION" } },
  { id: "V02", desc: "compramos camioneta → REGISTRAR_INVERSION", texto: "compramos una camioneta Ford Ranger 2023 $18000000", expect: { intent: "REGISTRAR_INVERSION" } },
  { id: "V03", desc: "adquirí notebook → REGISTRAR_INVERSION", texto: "adquirí un notebook Dell para la oficina $850000", expect: { intent: "REGISTRAR_INVERSION" } },
  { id: "V04", desc: "tipo_inversion herramienta detectada", texto: "compré taladro inalámbrico Makita $280000", expect: { intent: "REGISTRAR_INVERSION", tipo_inversion: "herramienta" } },
  { id: "V05", desc: "tipo_inversion vehiculo detectado", texto: "compramos camioneta $18000000", expect: { intent: "REGISTRAR_INVERSION", tipo_inversion: "vehiculo" } },
  { id: "V06", desc: "vida_util_anos extraída", texto: "compré maquina de soldar para taller, vida útil 5 años, $320000", expect: { intent: "REGISTRAR_INVERSION", vida_util_anos_not_null: true } },
  { id: "V07", desc: "compra para obra específica → REGISTRAR_RENDICION (no inversión)", texto: "compré fierros para Codegua etapa 2 $280000 en Sodimac", expect: { intent: "REGISTRAR_RENDICION" } },
  { id: "V08", desc: "descripcion_activo extraída", texto: "compré andamio tubular 6 metros $450000", expect: { intent: "REGISTRAR_INVERSION", descripcion_activo_not_null: true } },
];

// ============================================================
// R01-R08 — Regresión rendición
// ============================================================
const rendicionTests = [
  { id: "R01", desc: "imagen boleta texto básico → REGISTRAR_RENDICION", texto: "boleta de Sodimac para Codegua etapa 1 fierros", expect: { intent: "REGISTRAR_RENDICION" } },
  { id: "R02", desc: "compra con obra y etapa → REGISTRAR_RENDICION", texto: "compré cemento para Codegua etapa 2 $180000", expect: { intent: "REGISTRAR_RENDICION" } },
  { id: "R03", desc: "rendición con proveedor → REGISTRAR_RENDICION + proveedor", texto: "pagué a Sodimac $450000 para Codegua fierros", expect: { intent: "REGISTRAR_RENDICION" } },
  { id: "R04", desc: "factura para obra → REGISTRAR_RENDICION", texto: "factura de materiales para Codegua etapa 3 mano de obra $1200000", expect: { intent: "REGISTRAR_RENDICION" } },
  { id: "R05", desc: "monto de boleta en texto → monto extraído", texto: "gasté $280000 en cemento para Codegua", expect: { intent: "REGISTRAR_RENDICION", monto_not_null: true } },
  { id: "R06", desc: "registro normal sin confundir con inversión", texto: "compré herramientas para la obra Codegua etapa 1 $150000", expect: { intent: "REGISTRAR_RENDICION" } },
  { id: "R07", desc: "pago proveedor con acuerdo → no confundir con gasto operacional", texto: "pagué a Constructora XY por Codegua etapa 2 $3500000", expect: { intent: "REGISTRAR_RENDICION" } },
  { id: "R08", desc: "múltiples ítems obra etapa → REGISTRAR_RENDICION", texto: "compré para Codegua etapa 1: fierros $200000, cemento $150000, arena $80000", expect: { intent: "REGISTRAR_RENDICION" } },
];

// ============================================================
// C01-C04 — CRM API tests (HTTP vs Railway producción)
// ============================================================
async function httpGet(url, token = null) {
  const { default: https } = await import("https");
  const { default: http } = await import("http");
  return new Promise((resolve, reject) => {
    const lib = url.startsWith("https") ? https : http;
    const opts = { headers: token ? { Authorization: `Bearer ${token}` } : {} };
    lib.get(url, opts, (res) => {
      let data = "";
      res.on("data", (c) => (data += c));
      res.on("end", () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(data) }); }
        catch { resolve({ status: res.statusCode, body: data }); }
      });
    }).on("error", reject);
  });
}

async function httpPost(url, body) {
  const { default: https } = await import("https");
  const { default: http } = await import("http");
  const payload = JSON.stringify(body);
  return new Promise((resolve, reject) => {
    const lib = url.startsWith("https") ? https : http;
    const opts = { method: "POST", headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(payload) } };
    const req = lib.request(url, opts, (res) => {
      let data = "";
      res.on("data", (c) => (data += c));
      res.on("end", () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(data) }); }
        catch { resolve({ status: res.statusCode, body: data }); }
      });
    });
    req.on("error", reject);
    req.write(payload);
    req.end();
  });
}

async function getToken(nombre, clave) {
  const r = await httpPost(`${CRM_URL}/api/login`, { nombre, clave });
  if (r.status !== 200) throw new Error(`Login failed ${r.status}: ${JSON.stringify(r.body)}`);
  return r.body.token;
}

const crmTests = [
  {
    id: "C01",
    desc: "GET /api/inversiones sin auth → 401",
    fn: async () => {
      const r = await httpGet(`${CRM_URL}/api/inversiones`);
      if (r.status !== 401) throw new Error(`status ${r.status}, esperado 401`);
    },
  },
  {
    id: "C02",
    desc: "GET /api/inversiones con Gary → 200",
    fn: async () => {
      const token = await getToken("Gary", "sinan2026");
      const r = await httpGet(`${CRM_URL}/api/inversiones`, token);
      if (r.status !== 200) throw new Error(`status ${r.status}, esperado 200. Body: ${JSON.stringify(r.body)}`);
      if (!Array.isArray(r.body)) throw new Error("Response no es array");
    },
  },
  {
    id: "C03",
    desc: "GET /api/inversiones con Rodrigo → 403",
    fn: async () => {
      const token = await getToken("Rodrigo", "rodrigo2026");
      const r = await httpGet(`${CRM_URL}/api/inversiones`, token);
      if (r.status !== 403) throw new Error(`status ${r.status}, esperado 403`);
    },
  },
  {
    id: "C04",
    desc: "GET /api/version → 200 (sanity check deploy OK)",
    fn: async () => {
      const r = await httpGet(`${CRM_URL}/api/version`);
      if (r.status !== 200) throw new Error(`status ${r.status}, esperado 200`);
    },
  },
];

// ============================================================
// Runner
// ============================================================
let passed = 0;
let failed = 0;
const failures = [];

async function runUnit(tests) {
  for (const t of tests) {
    try {
      t.fn();
      console.log(`  ✅ ${t.id}: ${t.desc}`);
      passed++;
    } catch (e) {
      console.log(`  ❌ ${t.id}: ${t.desc} — ${e.message}`);
      failed++;
      failures.push(`${t.id}: ${e.message}`);
    }
  }
}

async function runClasificacion(tests) {
  for (const t of tests) {
    try {
      const result = await clasificar(t.texto, "gary");
      const exp = t.expect;
      if (exp.intent && result.intent !== exp.intent) {
        throw new Error(`intent="${result.intent}", esperado "${exp.intent}"`);
      }
      if (exp.tipo_inversion && result.tipo_inversion !== exp.tipo_inversion) {
        throw new Error(`tipo_inversion="${result.tipo_inversion}", esperado "${exp.tipo_inversion}"`);
      }
      if (exp.vida_util_anos_not_null && result.vida_util_anos == null) {
        throw new Error("vida_util_anos null, esperado no-null");
      }
      if (exp.descripcion_activo_not_null && !result.descripcion_activo) {
        throw new Error("descripcion_activo null, esperado no-null");
      }
      if (exp.monto_not_null && result.monto == null && result.monto_imagen == null) {
        throw new Error("monto y monto_imagen null, esperado al menos uno no-null");
      }
      if (exp.cliente_nombre_no_contiene) {
        const nombre = (result.cliente_nombre || "").toLowerCase();
        for (const word of exp.cliente_nombre_no_contiene) {
          if (nombre.includes(word.toLowerCase())) {
            throw new Error(`cliente_nombre "${result.cliente_nombre}" contiene "${word}" (debería excluir geografía)`);
          }
        }
      }
      console.log(`  ✅ ${t.id}: ${t.desc}`);
      passed++;
    } catch (e) {
      console.log(`  ❌ ${t.id}: ${t.desc} — ${e.message}`);
      failed++;
      failures.push(`${t.id}: ${e.message}`);
    }
  }
}

async function runAsync(tests) {
  for (const t of tests) {
    try {
      await t.fn();
      console.log(`  ✅ ${t.id}: ${t.desc}`);
      passed++;
    } catch (e) {
      console.log(`  ❌ ${t.id}: ${t.desc} — ${e.message}`);
      failed++;
      failures.push(`${t.id}: ${e.message}`);
    }
  }
}

(async () => {
  const hasApiKey = !!ANTHROPIC_API_KEY;

  console.log("\n=== SINAN Bot v2 — 50-test suite ===\n");

  console.log("[ P01-P05 ] PDF / format unit tests");
  await runUnit(pUnitTests);

  if (hasApiKey) {
    console.log("\n[ I01-I15 ] Ingreso classification tests");
    await runClasificacion(ingresoTests);

    console.log("\n[ G01-G10 ] Gasto operacional classification (REGLA 0)");
    await runClasificacion(gastoTests);

    console.log("\n[ V01-V08 ] Inversión classification tests");
    await runClasificacion(inversionTests);

    console.log("\n[ R01-R08 ] Rendición regression tests");
    await runClasificacion(rendicionTests);
  } else {
    const skipped = ingresoTests.length + gastoTests.length + inversionTests.length + rendicionTests.length;
    console.log(`\n⚠️  ANTHROPIC_API_KEY no disponible — ${skipped} tests de clasificación omitidos`);
    console.log("   Run: ANTHROPIC_API_KEY=xxx node test_suite.js");
  }

  console.log("\n[ C01-C04 ] CRM API tests (Railway producción)");
  await runAsync(crmTests);

  const total = hasApiKey ? 50 : (pUnitTests.length + crmTests.length);
  console.log(`\n====================================`);
  console.log(`Resultados: ${passed}/${total} pasados`);
  if (failures.length) {
    console.log("\nFALLOS:");
    failures.forEach((f) => console.log(`  ✗ ${f}`));
  } else if (hasApiKey) {
    console.log("🎉 50/50 tests en verde — listo para deploy");
  }
  process.exit(failed > 0 ? 1 : 0);
})();
