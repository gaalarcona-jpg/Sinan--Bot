const { Router } = require("express");
const { requireAuth, requireAdmin } = require("./auth");

const router = Router();
router.use(requireAuth);

// Lista de obras activas con % avance
router.get("/", async (req, res) => {
  try {
    const { rows } = await req.pool.query(`
      SELECT
        o.id,
        o.nombre,
        o.bono_por_etapa,
        COALESCE(SUM(ip.presupuesto), 0)::numeric AS presupuesto_total,
        COALESCE(SUM(CASE WHEN g.estado != 'rechazado' THEN g.monto ELSE 0 END), 0)::numeric AS gastado_total,
        COUNT(DISTINCT e.id) AS etapas_count,
        COUNT(DISTINCT CASE WHEN e.estado = 'completada' THEN e.id END) AS etapas_completadas
      FROM obras o
      LEFT JOIN etapas e ON e.obra_id = o.id
      LEFT JOIN items_presupuesto ip ON ip.etapa_id = e.id
      LEFT JOIN gastos g ON g.obra_id = o.id AND g.tipo = 'rendicion'
      WHERE o.activa = true
      GROUP BY o.id, o.nombre, o.bono_por_etapa
      ORDER BY o.nombre
    `);

    const obras = rows.map(o => ({
      id: o.id,
      nombre: o.nombre,
      presupuestoTotal: parseFloat(o.presupuesto_total),
      gastadoTotal: parseFloat(o.gastado_total),
      pctAvance: o.presupuesto_total > 0
        ? Math.round((o.gastado_total / o.presupuesto_total) * 100)
        : 0,
      etapasCount: parseInt(o.etapas_count),
      etapasCompletadas: parseInt(o.etapas_completadas),
    }));

    res.json(obras);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error consultando obras" });
  }
});

// Detalle de obra: etapas + avance + (solo admin) datos comerciales
router.get("/:id", async (req, res) => {
  try {
    const obraId = parseInt(req.params.id);
    if (isNaN(obraId)) return res.status(400).json({ error: "ID inválido" });

    const { rows: obraRows } = await req.pool.query("SELECT * FROM obras WHERE id = $1", [obraId]);
    if (!obraRows.length) return res.status(404).json({ error: "Obra no encontrada" });
    const obra = obraRows[0];

    const { rows: etapas } = await req.pool.query(`
      SELECT
        e.id,
        e.nombre,
        e.estado,
        e.completada_en,
        COALESCE(SUM(ip.presupuesto), 0)::numeric AS presupuesto_total,
        COALESCE(SUM(CASE WHEN g.estado != 'rechazado' THEN g.monto ELSE 0 END), 0)::numeric AS gastado_total
      FROM etapas e
      LEFT JOIN items_presupuesto ip ON ip.etapa_id = e.id
      LEFT JOIN gastos g ON g.etapa_id = e.id AND g.tipo = 'rendicion'
      WHERE e.obra_id = $1
      GROUP BY e.id, e.nombre, e.estado, e.completada_en
      ORDER BY e.id
    `, [obraId]);

    const payload = {
      id: obra.id,
      nombre: obra.nombre,
      bonoPorEtapa: parseFloat(obra.bono_por_etapa || 0),
      etapas: etapas.map(e => ({
        id: e.id,
        nombre: e.nombre,
        estado: e.estado,
        completadaEn: e.completada_en,
        presupuestoTotal: parseFloat(e.presupuesto_total),
        gastadoTotal: parseFloat(e.gastado_total),
        pctAvance: e.presupuesto_total > 0
          ? Math.round((e.gastado_total / e.presupuesto_total) * 100)
          : 0,
      })),
    };

    // Datos comerciales solo para admin
    if (req.user.rol === "admin") {
      const { rows: comercial } = await req.pool.query(
        "SELECT precio_venta, porcentaje_utilidad_rodrigo FROM obras_comercial WHERE obra_id = $1",
        [obraId]
      );
      if (comercial.length) {
        const gastadoTotal = etapas.reduce((s, e) => s + parseFloat(e.gastado_total), 0);
        const precioVenta = parseFloat(comercial[0].precio_venta || 0);
        payload.comercial = {
          precioVenta,
          margen: precioVenta - gastadoTotal,
          pctMargen: precioVenta > 0 ? Math.round(((precioVenta - gastadoTotal) / precioVenta) * 100) : null,
        };
      }
    }

    res.json(payload);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error consultando obra" });
  }
});

// Items de una etapa con gastos vs presupuesto
router.get("/:id/etapas/:etapaId", async (req, res) => {
  try {
    const obraId = parseInt(req.params.id);
    const etapaId = parseInt(req.params.etapaId);
    if (isNaN(obraId) || isNaN(etapaId)) return res.status(400).json({ error: "ID inválido" });

    const { rows: items } = await req.pool.query(`
      SELECT
        ip.id,
        ip.nombre,
        ip.presupuesto::numeric,
        COALESCE(SUM(CASE WHEN g.estado != 'rechazado' THEN g.monto ELSE 0 END), 0)::numeric AS gastado
      FROM items_presupuesto ip
      LEFT JOIN gastos g ON g.item_id = ip.id
      WHERE ip.etapa_id = $1
      GROUP BY ip.id, ip.nombre, ip.presupuesto
      ORDER BY ip.nombre
    `, [etapaId]);

    const etapaRows = await req.pool.query("SELECT * FROM etapas WHERE id = $1 AND obra_id = $2", [etapaId, obraId]);
    if (!etapaRows.rows.length) return res.status(404).json({ error: "Etapa no encontrada" });

    res.json({
      etapa: etapaRows.rows[0],
      items: items.map(i => ({
        id: i.id,
        nombre: i.nombre,
        presupuesto: parseFloat(i.presupuesto),
        gastado: parseFloat(i.gastado),
        saldo: parseFloat(i.presupuesto) - parseFloat(i.gastado),
        pctUsado: i.presupuesto > 0 ? Math.round((i.gastado / i.presupuesto) * 100) : 0,
        excedido: parseFloat(i.gastado) > parseFloat(i.presupuesto),
      })),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error consultando etapa" });
  }
});

module.exports = router;
