const fmtMonto = (n) => "$" + Math.round(Number(n) || 0).toLocaleString("es-CL");

// Canoniza siempre a 56 + 9 dígitos, sin importar si llega con "+56", "56", o sin
// código de país — necesario porque el webhook (Meta Cloud API) siempre manda el
// número con "56", pero un admin puede tipear "agregar usuario" sin ese prefijo.
const normalizarTel = (n) => {
  const digitos = (n || "").toString().replace(/[^\d]/g, "");
  if (digitos.startsWith("56") && digitos.length === 11) return digitos;
  if (digitos.length === 9 && digitos.startsWith("9")) return "56" + digitos;
  if (digitos.length === 8) return "569" + digitos;
  return digitos;
};

const fmtFecha = (d) => new Date(d).toLocaleDateString("es-CL");

const RAZON_SOCIAL_VALIDA = /sinan/i;
const contieneRazonSocialValida = (texto) => RAZON_SOCIAL_VALIDA.test(texto || "");

module.exports = { fmtMonto, normalizarTel, fmtFecha, contieneRazonSocialValida };
