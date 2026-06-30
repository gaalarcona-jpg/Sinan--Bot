const BASE = "/api";

function getToken() {
  return localStorage.getItem("crm_token");
}

export function setToken(t) {
  localStorage.setItem("crm_token", t);
}

export function clearToken() {
  localStorage.removeItem("crm_token");
  localStorage.removeItem("crm_rol");
  localStorage.removeItem("crm_nombre");
}

export function getUser() {
  return {
    token: localStorage.getItem("crm_token"),
    rol: localStorage.getItem("crm_rol"),
    nombre: localStorage.getItem("crm_nombre"),
  };
}

export function saveUser({ token, rol, nombre }) {
  localStorage.setItem("crm_token", token);
  localStorage.setItem("crm_rol", rol);
  localStorage.setItem("crm_nombre", nombre);
}

async function req(path, opts = {}) {
  const token = getToken();
  const res = await fetch(`${BASE}${path}`, {
    ...opts,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(opts.headers || {}),
    },
  });
  if (res.status === 401) {
    clearToken();
    window.location.href = "/";
    throw new Error("Sesión expirada");
  }
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Error ${res.status}`);
  }
  return res.json();
}

export const api = {
  login: (nombre, clave) =>
    req("/login", { method: "POST", body: JSON.stringify({ nombre, clave }) }),

  obras: () => req("/obras"),
  obra: (id) => req(`/obras/${id}`),
  etapa: (obraId, etapaId) => req(`/obras/${obraId}/etapas/${etapaId}`),

  gastos: (params = {}) => {
    const qs = new URLSearchParams(params).toString();
    return req(`/gastos${qs ? "?" + qs : ""}`);
  },
  pendientes: () => req("/gastos/pendientes"),

  gastosOperacionales: (mes) => req(`/gastos-operacionales${mes ? "?mes=" + mes : ""}`),
  ingresos: (params = {}) => {
    const qs = new URLSearchParams(params).toString();
    return req(`/ingresos${qs ? "?" + qs : ""}`);
  },

  estadoResultados: (mes) => req(`/estado-resultados${mes ? "?mes=" + mes : ""}`),
  resultadosObra: (id) => req(`/estado-resultados/obra/${id}`),

  aprobarGasto: (id) => req(`/gastos/${id}/aprobar`, { method: "POST" }),

  version: () => req("/version"),
};
