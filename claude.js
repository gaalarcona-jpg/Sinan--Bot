const Anthropic = require("@anthropic-ai/sdk");
const config = require("./config");

const client = new Anthropic({ apiKey: config.ANTHROPIC_API_KEY });

const INTENTS = [
  "REGISTRAR_RENDICION",
  "REGISTRAR_ACUERDO",
  "CONSULTAR_SALDO_PROVEEDOR",
  "REGISTRAR_PAGO",
  "COMPLETAR_ETAPA",
  "ESTADO_ETAPA",
  "EXPORTAR_REPORTE",
  "CONSULTAR_RESUMEN",
  "REGISTRAR_GASTO_OPERACIONAL",
  "REGISTRAR_INGRESO",
  "CONSULTAR_ESTADO_RESULTADOS",
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
      monto_imagen: { type: ["number", "null"], description: "CRÍTICO: monto_imagen es SOLO el campo explícitamente etiquetado como 'Monto', 'Monto pagado', 'Total' o 'Subtotal' en el documento. NUNCA concatenar ni mezclar con números de factura, pedido, referencia, código de autorización u otros campos numéricos del documento. Si el documento dice 'Monto pagado: $954.261' el valor es 954261, no 5954261 ni ninguna otra variación. Leer con precisión y extraer SOLO el monto del campo de pago/total." },
      iva_incluido: { type: ["boolean", "null"], description: "Si la boleta indica IVA incluido. null si no se puede determinar" },
      razon_social_detectada: { type: ["string", "null"], description: "Razón social del receptor leída en la boleta, si hay imagen" },
      fecha_documento: { type: ["string", "null"], description: "Fecha del documento leída en la imagen, formato YYYY-MM-DD si se puede inferir, null si no hay imagen o no es legible" },
      tipo_documento: { type: ["string", "null"], enum: ["boleta", "factura", "comprobante_transferencia", "otro", null], description: "Tipo de documento visible en la imagen, null si no hay imagen" },
      legible_imagen: { type: ["boolean", "null"], description: "true si la imagen adjunta se pudo leer con confianza, false si está borrosa/cortada/ilegible, null si no hay imagen" },
      descripcion: { type: ["string", "null"], description: "Breve descripción de la compra/gasto en palabras del usuario" },
      id_rendicion_mencionado: { type: ["number", "null"], description: "ID de rendición explícito si el usuario lo menciona (ej. 'pago la 42')" },
      monto_acordado: { type: ["number", "null"], description: "Monto de un acuerdo comercial con proveedor, si aplica" },
      tipo_pago: { type: ["string", "null"], enum: ["proveedor", "reembolso_rodrigo", null], description: "Si Gary indica si el pago fue directo al proveedor o reembolso a Rodrigo" },
      numero_etapa: { type: ["string", "null"], description: "Número/nombre de etapa mencionado para consultar su estado de avance (intent ESTADO_ETAPA)" },
      confirma: { type: ["boolean", "null"], description: "Si el mensaje es una respuesta afirmativa/negativa a una pregunta de confirmación pendiente" },
      area_negocio: { type: ["string", "null"], enum: ["Construcción", "Arquitectura", "Operacional", null], description: "Área de negocio mencionada. Construcción si menciona obra/etapa, Arquitectura si menciona diseño/planos, Operacional para gastos generales sin obra" },
      categoria_gasto: { type: ["string", "null"], enum: ["sueldo", "arriendo", "marketing", "software", "otro", null], description: "Categoría de gasto operacional: sueldo (sueldos/salarios), arriendo (arriendos/oficina), marketing (publicidad/marketing), software (SaaS/licencias), otro" },
      cliente_nombre: { type: ["string", "null"], description: "Nombre del cliente que pagó/cobró, para ingresos" },
      periodo_mes: { type: ["string", "null"], description: "Mes del período en formato YYYY-MM si menciona 'junio', 'este mes', mes específico" },
    },
    required: ["intent"],
  },
};

function systemPrompt({ rol, catalogos, estadoPendiente, hayImagen }) {
  return [
    "Eres el clasificador de intención del bot SINAN, un bot de WhatsApp para control financiero de una constructora chilena.",
    `El mensaje viene de un usuario con rol "${rol}".`,
    "Tu única tarea es llamar a la herramienta clasificar_mensaje_sinan con la intención y las entidades que puedas extraer del texto y/o la imagen adjunta.",
    "No generes texto de respuesta para el usuario final — eso lo decide otro componente del sistema.",
    hayImagen && !estadoPendiente
      ? "El mensaje trae una imagen adjunta (boleta/factura/comprobante). REGLA: si hay imagen Y menciona obra/etapa/ítem O no menciona categoría operacional (sueldo/arriendo/marketing/software), usa REGISTRAR_RENDICION. Si hay imagen Y menciona sueldo/arriendo/marketing/software SIN obra, usa REGISTRAR_GASTO_OPERACIONAL. Nunca uses REGISTRAR_PAGO cuando hay imagen. Nunca uses DESCONOCIDO cuando hay imagen. Intenta leer monto, proveedor, fecha y tipo de documento de la imagen. Si la imagen está borrosa o no se puede leer el monto, de todas formas clasifica el intent correcto con legible_imagen=false y monto_imagen=null."
      : "",
    hayImagen
      ? "Para la imagen adjunta: extrae monto_imagen, proveedor (nombre/razón social del documento), fecha_documento (YYYY-MM-DD si es legible), tipo_documento (boleta/factura/comprobante_transferencia/otro) y legible_imagen (true/false según puedas leer el contenido con confianza)."
      : "",
    "NUEVOS INTENTS DE GASTOS OPERACIONALES E INGRESOS:",
    "• REGISTRAR_GASTO_OPERACIONAL: cuando menciona 'pagué sueldo/arriendo/marketing/software/oficina' SIN mencionar obra/etapa. Extrae categoria_gasto, monto, proveedor, periodo_mes si dice 'junio' o 'este mes'. Si menciona área (Construcción/Arquitectura/Operacional) extrae area_negocio.",
    "• REGISTRAR_INGRESO: cuando dice 'cobré/recibí pago de [cliente]' o 'me pagó [cliente]'. Extrae cliente_nombre, monto, obra si la menciona, area_negocio (Construcción si obra, Arquitectura si diseño/planos, Operacional si general).",
    "• CONSULTAR_ESTADO_RESULTADOS: cuando pide 'estado de resultados', 'ER', 'resultado del mes', 'cómo quedó el mes', 'balance'. Extrae periodo_mes si especifica mes.",
    "Si el mensaje es un saludo simple (hola, buenas, buenos días, etc.) sin más contenido y no hay conversación pendiente, usa intent PEDIR_AYUDA.",
    "Si el mensaje es corto y parece responder una pregunta que el bot hizo previamente (ej: solo dice un nombre de etapa, 'sí', 'no', un monto), usa intent RESPONDER_PREGUNTA_PENDIENTE y llena las entidades que correspondan a esa respuesta.",
    "Si el usuario pregunta por el avance/estado de una etapa específica (ej: 'cómo va la etapa 2 de Codegua'), usa intent ESTADO_ETAPA con obra y numero_etapa.",
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
      system: systemPrompt({ rol, catalogos, estadoPendiente, hayImagen: !!imagen?.buffer }),
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
