// ============================================================
// AISLAMIENTO ESTRUCTURAL: este es el ÚNICO archivo que consulta
// las tablas obras_comercial / etapas_comercial (precio de venta,
// margen, utilidad). Solo debe ser importado por reports.js (sección
// gary) y por flows.js dentro de bloques `if (usuario.rol === 'gary')`.
// Nunca debe aparecer un require('./db_comercial') en ningún código
// alcanzable para el rol 'rodrigo'.
// ============================================================
const { query } = require("./db");

const obrasComercial = {
  async porObra(obraId) {
    const { rows } = await query("SELECT * FROM obras_comercial WHERE obra_id = $1", [obraId]);
    return rows[0] || null;
  },
  async actualizar(obraId, { precioVenta, porcentajeUtilidadRodrigo }) {
    const { rows } = await query(
      `INSERT INTO obras_comercial (obra_id, precio_venta, porcentaje_utilidad_rodrigo)
       VALUES ($1, $2, COALESCE($3, 10.00))
       ON CONFLICT (obra_id) DO UPDATE SET
         precio_venta = COALESCE($2, obras_comercial.precio_venta),
         porcentaje_utilidad_rodrigo = COALESCE($3, obras_comercial.porcentaje_utilidad_rodrigo),
         actualizado_en = now()
       RETURNING *`,
      [obraId, precioVenta ?? null, porcentajeUtilidadRodrigo ?? null]
    );
    return rows[0];
  },
};

const etapasComercial = {
  async porEtapa(etapaId) {
    const { rows } = await query("SELECT * FROM etapas_comercial WHERE etapa_id = $1", [etapaId]);
    return rows[0] || null;
  },
  async actualizar(etapaId, { precioVenta }) {
    const { rows } = await query(
      `INSERT INTO etapas_comercial (etapa_id, precio_venta)
       VALUES ($1, $2)
       ON CONFLICT (etapa_id) DO UPDATE SET precio_venta = $2, actualizado_en = now()
       RETURNING *`,
      [etapaId, precioVenta]
    );
    return rows[0];
  },
};

// gastadoReal: suma de gastos (rendiciones + bonos, no rechazados) para una etapa u obra completa.
const gastadoReal = {
  async porEtapa(etapaId) {
    const { rows } = await query(
      "SELECT COALESCE(SUM(monto), 0) AS total FROM gastos WHERE etapa_id = $1 AND estado != 'rechazado'",
      [etapaId]
    );
    return Number(rows[0].total);
  },
  async porObra(obraId) {
    const { rows } = await query(
      "SELECT COALESCE(SUM(monto), 0) AS total FROM gastos WHERE obra_id = $1 AND estado != 'rechazado'",
      [obraId]
    );
    return Number(rows[0].total);
  },
};

// presupuestoTotal: suma de items_presupuesto, usado para prorratear el precio de venta
// de obra entre etapas cuando no hay precio_venta explícito a nivel de etapa.
const presupuestoTotal = {
  async porObra(obraId) {
    const { rows } = await query(
      `SELECT COALESCE(SUM(ip.presupuesto), 0) AS total
       FROM items_presupuesto ip JOIN etapas e ON e.id = ip.etapa_id
       WHERE e.obra_id = $1`,
      [obraId]
    );
    return Number(rows[0].total);
  },
  async porEtapa(etapaId) {
    const { rows } = await query(
      "SELECT COALESCE(SUM(presupuesto), 0) AS total FROM items_presupuesto WHERE etapa_id = $1",
      [etapaId]
    );
    return Number(rows[0].total);
  },
};

// Regla de cálculo: si la etapa tiene precio_venta propio, manda. Si no, se prorratea desde
// el precio de venta de la obra, proporcional al peso del presupuesto de costos de la etapa
// dentro del presupuesto total de la obra.
async function margenPorEtapa(etapaId, obraId) {
  const [comercialEtapa, comercialObra, gastado, presupuestoEtapa, presupuestoObraTotal] = await Promise.all([
    etapasComercial.porEtapa(etapaId),
    obrasComercial.porObra(obraId),
    gastadoReal.porEtapa(etapaId),
    presupuestoTotal.porEtapa(etapaId),
    presupuestoTotal.porObra(obraId),
  ]);

  let precioVenta = null;
  if (comercialEtapa?.precio_venta != null) {
    precioVenta = Number(comercialEtapa.precio_venta);
  } else if (comercialObra?.precio_venta != null && presupuestoObraTotal > 0) {
    precioVenta = Number(comercialObra.precio_venta) * (presupuestoEtapa / presupuestoObraTotal);
  }

  if (precioVenta == null) return { precioVenta: null, gastado, margen: null, utilidadRodrigo: null };

  const margen = precioVenta - gastado;
  const pct = comercialObra ? Number(comercialObra.porcentaje_utilidad_rodrigo) : 10;
  return { precioVenta, gastado, margen, utilidadRodrigo: margen * (pct / 100) };
}

async function margenPorObra(obraId) {
  const [comercialObra, gastado] = await Promise.all([
    obrasComercial.porObra(obraId),
    gastadoReal.porObra(obraId),
  ]);
  if (!comercialObra?.precio_venta) return { precioVenta: null, gastado, margen: null, utilidadRodrigo: null };
  const precioVenta = Number(comercialObra.precio_venta);
  const margen = precioVenta - gastado;
  const pct = Number(comercialObra.porcentaje_utilidad_rodrigo);
  return { precioVenta, gastado, margen, utilidadRodrigo: margen * (pct / 100) };
}

module.exports = { obrasComercial, etapasComercial, gastadoReal, presupuestoTotal, margenPorEtapa, margenPorObra };
