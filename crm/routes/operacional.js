const { Router } = require("express");
const { requireAdmin } = require("./auth");

const router = Router();

// Gastos operacionales — solo admin
router.get("/gastos-operacionales", requireAdmin, async (req, res) => {
  try {
    const { mes } = req.query;
    const params = [];
    let where = "";

    if (mes) {
      params.push(mes);
      where = `WHERE (go.periodo_mes = $1 OR TO_CHAR(go.fecha, 'YYYY-MM') = $1)`;
    }

    const { rows } = await req.pool.query(`
      SELECT
        go.id,
        go.categoria,
        go.descripcion,
        go.monto,
        go.fecha,
        go.periodo_mes,
        go.imagen_drive_link,
        go.tipo_documento,
        an.nombre AS area_nombre,
        p.nombre AS proveedor_nombre
      FROM gastos_operacionales go
      LEFT JOIN areas_negocio an ON an.id = go.area_id
      LEFT JOIN proveedores p ON p.id = go.proveedor_id
      ${where}
      ORDER BY go.fecha DESC
      LIMIT 300
    `, params);

    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error consultando gastos operacionales" });
  }
});

// Ingresos — solo admin
router.get("/ingresos", requireAdmin, async (req, res) => {
  try {
    const { mes, obraId } = req.query;
    const conditions = [];
    const params = [];

    if (mes) { params.push(mes); conditions.push(`TO_CHAR(i.fecha_cobro, 'YYYY-MM') = $${params.length}`); }
    if (obraId) { params.push(parseInt(obraId)); conditions.push(`i.obra_id = $${params.length}`); }

    const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

    const { rows } = await req.pool.query(`
      SELECT
        i.id,
        i.cliente_nombre,
        i.descripcion,
        i.monto,
        i.fecha_cobro,
        i.comprobante_drive_link,
        an.nombre AS area_nombre,
        o.nombre AS obra_nombre,
        e.nombre AS etapa_nombre
      FROM ingresos i
      LEFT JOIN areas_negocio an ON an.id = i.area_id
      LEFT JOIN obras o ON o.id = i.obra_id
      LEFT JOIN etapas e ON e.id = i.etapa_id
      ${where}
      ORDER BY i.fecha_cobro DESC
    `, params);

    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error consultando ingresos" });
  }
});

module.exports = router;
