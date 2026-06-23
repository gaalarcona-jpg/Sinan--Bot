const fmtMonto = (n) => "$" + Math.round(Number(n) || 0).toLocaleString("es-CL");

// Única función global de normalización de teléfonos — toda comparación de
// usuarios en el bot debe pasar por aquí, nunca comparar strings sin normalizar.
// Se queda con los últimos 9 dígitos (el número de abonado chileno sin "56"):
// cubre "56990017192", "+56990017192", "990017192" y "0056990017192" por igual,
// sin necesidad de detectar casos especiales de prefijo.
const normalizarTel = (n) => (n || "").toString().replace(/\D/g, "").slice(-9);

// Para guardar en la BD y para enviar por WhatsApp (360dialog exige el número
// completo con código de país) — nunca usar normalizarTel() para esto, ya que
// le quita el "56" que la API necesita para entregar el mensaje.
const telefonoCompleto = (n) => "56" + normalizarTel(n);

const fmtFecha = (d) => new Date(d).toLocaleDateString("es-CL");

const RAZON_SOCIAL_VALIDA = /sinan/i;
const contieneRazonSocialValida = (texto) => RAZON_SOCIAL_VALIDA.test(texto || "");

module.exports = { fmtMonto, normalizarTel, telefonoCompleto, fmtFecha, contieneRazonSocialValida };
