const { Router } = require("express");
const { requireAuth, requireAdmin } = require("./auth");

const router = Router();
router.use(requireAuth);

// Rendiciones (gastos de obra) — ambos roles, sin margen
router.get("/", async (req, res) => {
  try {
    const { obraId, etapaId, desde, hasta } = req.query;
    const conditions = ["g.tipo = 'rendicion'"];
    const params = [];

    if (obraId) { params.push(parseInt(obraId)); conditions.push(`g.obra_id = $${params.length}`); }
    if (etapaId) { params.push(parseInt(etapaId)); conditions.push(`g.etapa_id = $${params.length}`); }
    if (desde) { params.push(desde); conditions.push(`g.creado_en >= $${params.length}`); }
    if (hasta) { params.push(hasta); conditions.push(`g.creado_en <= $${params.length}`); }

    const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

    const { rows } = await req.pool.query(`
      SELECT
        g.id,
        g.estado,
        g.monto,
        g.descripcion,
        g.fecha_documento,
        g.tipo_documento,
        g.imagen_drive_link,
        g.creado_en,
        g.iva_incluido,
        o.nombre AS obra_nombre,
        e.nombre AS etapa_nombre,
        ip.nombre AS item_nombre,
        p.nombre AS proveedor_nombre
      FROM gastos g
      LEFT JOIN obras o ON o.id = g.obra_id
      LEFT JOIN etapas e ON e.id = g.etapa_id
      LEFT JOIN items_presupuesto ip ON ip.id = g.item_id
      LEFT JOIN proveedores p ON p.id = g.proveedor_id
      ${where}
      ORDER BY g.creado_en DESC
      LIMIT 200
    `, params);

    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error consultando gastos" });
  }
});

// Rendiciones pendientes — ambos roles
router.get("/pendientes", async (req, res) => {
  try {
    const { rows } = await req.pool.query(`
      SELECT
        g.id,
        g.monto,
        g.descripcion,
        g.creado_en,
        g.imagen_drive_link,
        g.tipo_documento,
        g.alerta_razon_social,
        o.nombre AS obra_nombre,
        e.nombre AS etapa_nombre,
        ip.nombre AS item_nombre,
        p.nombre AS proveedor_nombre
      FROM gastos g
      LEFT JOIN obras o ON o.id = g.obra_id
      LEFT JOIN etapas e ON e.id = g.etapa_id
      LEFT JOIN items_presupuesto ip ON ip.id = g.item_id
      LEFT JOIN proveedores p ON p.id = g.proveedor_id
      WHERE g.estado = 'pendiente'
      ORDER BY g.creado_en DESC
    `);
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error consultando pendientes" });
  }
});

module.exports = router;
