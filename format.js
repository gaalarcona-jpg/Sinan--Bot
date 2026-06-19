const fmtMonto = (n) => "$" + Math.round(Number(n) || 0).toLocaleString("es-CL");

const normalizarTel = (n) => (n || "").toString().replace(/[^\d]/g, "");

const fmtFecha = (d) => new Date(d).toLocaleDateString("es-CL");

const RAZON_SOCIAL_VALIDA = /sinan/i;
const contieneRazonSocialValida = (texto) => RAZON_SOCIAL_VALIDA.test(texto || "");

module.exports = { fmtMonto, normalizarTel, fmtFecha, contieneRazonSocialValida };
