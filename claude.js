const Anthropic = require("@anthropic-ai/sdk");
const config = require("./config");

const client = new Anthropic({ apiKey: config.ANTHROPIC_API_KEY });

const INTENTS = [
  "REGISTRAR_RENDICION",
  "REGISTRAR_ACUERDO",
  "CONSULTAR_SALDO_PROVEEDOR",
  "REGISTRAR_PAGO",
  "COMPLETAR_ETAPA",
  "EXPORTAR_REPORTE",
  "CONSULTAR_RESUMEN",
  "PEDIR_AYUDA",
  "RESPONDER_PREGUNTA_PENDIENTE",
  "DESCONOCIDO",
];

const TOOL = {
  name: "clasificar_mensaje_sinan",
  description:
    "Clasifica la intención del mensaje de un usuario del bot SINAN y extrae las entidades relevantes " +
    "mencionadas en el texto y/o visibles en la imagen adjunta (boleta o comprobante de transferencia).",
  input_schema: {
    type: "object",
    properties: {
      intent: { type: "string", enum: INTENTS },
      obra: { type: ["string", "null"], description: "Nombre de la obra mencionada, tal como la dijo el usuario" },
      etapa: { type: ["string", "null"], description: "Nombre/código de la etapa mencionada" },
      item: { type: ["string", "null"], description: "Ítem presupuestario mencionado (ej: Fierros, Mano de obra)" },
      proveedor: { type: ["string", "null"], description: "Nombre del proveedor mencionado" },
      monto: { type: ["number", "null"], description: "Monto en pesos chilenos mencionado por el usuario en texto, sin signos" },
      monto_imagen: { type: ["number", "null"], description: "Monto total leído directamente de la boleta/imagen adjunta, si hay imagen" },
      iva_incluido: { type: ["boolean", "null"], description: "Si la boleta indica IVA incluido. null si no se puede determinar" },
      razon_social_detectada: { type: ["string", "null"], description: "Razón social del receptor leída en la boleta, si hay imagen" },
      descripcion: { type: ["string", "null"], description: "Breve descripción de la compra/gasto en palabras del usuario" },
      id_rendicion_mencionado: { type: ["number", "null"], description: "ID de rendición explícito si el usuario lo menciona (ej. 'pago la 42')" },
      monto_acordado: { type: ["number", "null"], description: "Monto de un acuerdo comercial con proveedor, si aplica" },
      tipo_pago: { type: ["string", "null"], enum: ["proveedor", "reembolso_rodrigo", null], description: "Si Gary indica si el pago fue directo al proveedor o reembolso a Rodrigo" },
      confirma: { type: ["boolean", "null"], description: "Si el mensaje es una respuesta afirmativa/negativa a una pregunta de confirmación pendiente" },
    },
    required: ["intent"],
  },
};

function systemPrompt({ rol, catalogos, estadoPendiente }) {
  return [
    "Eres el clasificador de intención del bot SINAN, un bot de WhatsApp para control financiero de una constructora chilena.",
    `El mensaje viene de un usuario con rol "${rol}".`,
    "Tu única tarea es llamar a la herramienta clasificar_mensaje_sinan con la intención y las entidades que puedas extraer del texto y/o la imagen adjunta.",
    "No generes texto de respuesta para el usuario final — eso lo decide otro componente del sistema.",
    "Si el mensaje es corto y parece responder una pregunta que el bot hizo previamente (ej: solo dice un nombre de etapa, 'sí', 'no', un monto), usa intent RESPONDER_PREGUNTA_PENDIENTE y llena las entidades que correspondan a esa respuesta.",
    catalogos?.obras?.length ? `Obras activas conocidas: ${catalogos.obras.join(", ")}.` : "",
    catalogos?.proveedores?.length ? `Proveedores conocidos: ${catalogos.proveedores.join(", ")}.` : "",
    estadoPendiente
      ? `Hay una conversación en curso. Intent pendiente: ${estadoPendiente.intent}. Datos ya recolectados: ${JSON.stringify(estadoPendiente.datos_parciales)}. Última pregunta hecha al usuario: "${estadoPendiente.pregunta_pendiente || ""}".`
      : "No hay conversación pendiente.",
  ].filter(Boolean).join("\n");
}

async function extraerYClasificar({ texto, imagen, estadoPendiente, rol, catalogos }) {
  const contenido = [];
  if (imagen?.buffer) {
    contenido.push({
      type: "image",
      source: { type: "base64", media_type: imagen.mimeType, data: imagen.buffer.toString("base64") },
    });
  }
  contenido.push({ type: "text", text: texto || "(mensaje sin texto, solo imagen adjunta)" });

  const intentar = async () => {
    const resp = await client.messages.create({
      model: config.ANTHROPIC_MODEL,
      max_tokens: 1024,
      system: systemPrompt({ rol, catalogos, estadoPendiente }),
      tools: [TOOL],
      tool_choice: { type: "tool", name: TOOL.name },
      messages: [{ role: "user", content: contenido }],
    });
    const toolUse = resp.content.find((b) => b.type === "tool_use");
    if (!toolUse) throw new Error("Claude no devolvió tool_use");
    return { resultado: toolUse.input, raw: resp };
  };

  try {
    return await intentar();
  } catch (err) {
    console.error("Error en extraerYClasificar, reintentando una vez:", err.message);
    return await intentar();
  }
}

module.exports = { extraerYClasificar, INTENTS };
