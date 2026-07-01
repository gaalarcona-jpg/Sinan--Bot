const { Router } = require("express");
const { requireAdmin } = require("./auth");

const router = Router();
router.use(requireAdmin);

// GET /api/inversiones?desde=YYYY-MM-DD&hasta=YYYY-MM-DD
router.get("/", async (req, res) => {
  const { desde, hasta } = req.query;
  const params = [];
  let where = "";
  if (desde) { params.push(desde); where += ` AND i.fecha >= $${params.length}`; }
  if (hasta) { params.push(hasta); where += ` AND i.fecha <= $${params.length}`; }

  try {
    const { rows } = await req.pool.query(
      `SELECT i.id, i.tipo, i.descripcion, i.monto, i.fecha, i.proveedor,
              i.vida_util_anos, i.comprobante_pdf_link, i.creado_en,
              u.nombre AS registrado_por_nombre
       FROM inversiones i
       LEFT JOIN usuarios u ON u.id = i.registrado_por
       WHERE true${where}
       ORDER BY i.fecha DESC, i.id DESC`,
      params
    );
    res.json(rows);
  } catch (e) {
    console.error("GET /inversiones:", e.message);
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
