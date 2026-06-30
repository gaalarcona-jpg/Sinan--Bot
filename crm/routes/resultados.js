const { Router } = require("express");
const { requireAdmin } = require("./auth");

const router = Router();
router.use(requireAdmin);

// Estado de resultados por mes — solo admin
router.get("/", async (req, res) => {
  try {
    const mes = req.query.mes || new Date().toISOString().slice(0, 7); // YYYY-MM

    const [areasRes, ingresosRes, gastosOpRes, gastosConstRes] = await Promise.all([
      req.pool.query("SELECT * FROM areas_negocio ORDER BY id"),
      req.pool.query(
        `SELECT i.area_id, an.nombre AS area_nombre, SUM(i.monto)::numeric AS total
         FROM ingresos i
         LEFT JOIN areas_negocio an ON an.id = i.area_id
         WHERE TO_CHAR(i.fecha_cobro, 'YYYY-MM') = $1
         GROUP BY i.area_id, an.nombre`,
        [mes]
      ),
      req.pool.query(
        `SELECT go.area_id, an.nombre AS area_nombre, go.categoria, SUM(go.monto)::numeric AS total
         FROM gastos_operacionales go
         LEFT JOIN areas_negocio an ON an.id = go.area_id
         WHERE go.periodo_mes = $1 OR TO_CHAR(go.fecha, 'YYYY-MM') = $1
         GROUP BY go.area_id, an.nombre, go.categoria`,
        [mes]
      ),
      req.pool.query(
        `SELECT g.obra_id, o.nombre AS obra_nombre, SUM(g.monto)::numeric AS total
         FROM gastos g
         LEFT JOIN obras o ON o.id = g.obra_id
         WHERE TO_CHAR(g.creado_en, 'YYYY-MM') = $1 AND g.tipo = 'rendicion' AND g.estado != 'rechazado'
         GROUP BY g.obra_id, o.nombre`,
        [mes]
      ),
    ]);

    const ingresosPorArea = {};
    ingresosRes.rows.forEach(r => {
      ingresosPorArea[r.area_id] = { areaNombre: r.area_nombre, total: parseFloat(r.total) };
    });

    const gastosPorArea = {};
    gastosOpRes.rows.forEach(r => {
      if (!gastosPorArea[r.area_id]) gastosPorArea[r.area_id] = { areaNombre: r.area_nombre, categorias: {}, total: 0 };
      gastosPorArea[r.area_id].categorias[r.categoria] = parseFloat(r.total);
      gastosPorArea[r.area_id].total += parseFloat(r.total);
    });

    const totalIngresosConst = gastosConstRes.rows.reduce((s, r) => s + parseFloat(r.total), 0);
    const totalGastosConst = gastosConstRes.rows.reduce((s, r) => s + parseFloat(r.total), 0);

    const bloques = areasRes.rows.map(a => {
      const ing = ingresosPorArea[a.id]?.total || 0;
      const gOp = gastosPorArea[a.id]?.total || 0;
      const gConst = a.nombre === "Construcción" ? totalGastosConst : 0;
      const costos = gOp + gConst;
      const resultado = ing - costos;
      return {
        area: a.nombre,
        ingresos: ing,
        costosOperacionales: gOp,
        costosRendiciones: a.nombre === "Construcción" ? totalGastosConst : 0,
        costos,
        resultado,
        margenPct: ing > 0 ? Math.round((resultado / ing) * 100) : null,
        desgloseCategorias: gastosPorArea[a.id]?.categorias || {},
      };
    });

    const totalIngresos = bloques.reduce((s, b) => s + b.ingresos, 0);
    const totalCostos = bloques.reduce((s, b) => s + b.costos, 0);
    const resultadoNeto = totalIngresos - totalCostos;

    res.json({
      mes,
      bloques,
      gastosObra: gastosConstRes.rows.map(r => ({
        obraId: r.obra_id,
        obraNombre: r.obra_nombre,
        total: parseFloat(r.total),
      })),
      resumen: {
        totalIngresos,
        totalCostos,
        resultadoNeto,
        margenPct: totalIngresos > 0 ? Math.round((resultadoNeto / totalIngresos) * 100) : null,
      },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error generando estado de resultados" });
  }
});

// Estado de resultados por obra — solo admin
router.get("/obra/:id", async (req, res) => {
  try {
    const obraId = parseInt(req.params.id);
    if (isNaN(obraId)) return res.status(400).json({ error: "ID inválido" });

    const [obraRes, ingresosRes, gastosRes, comercialRes] = await Promise.all([
      req.pool.query("SELECT * FROM obras WHERE id = $1", [obraId]),
      req.pool.query("SELECT COALESCE(SUM(monto), 0)::numeric AS total FROM ingresos WHERE obra_id = $1", [obraId]),
      req.pool.query("SELECT COALESCE(SUM(monto), 0)::numeric AS total FROM gastos WHERE obra_id = $1 AND tipo = 'rendicion' AND estado != 'rechazado'", [obraId]),
      req.pool.query("SELECT precio_venta, porcentaje_utilidad_rodrigo FROM obras_comercial WHERE obra_id = $1", [obraId]),
    ]);

    if (!obraRes.rows.length) return res.status(404).json({ error: "Obra no encontrada" });

    const ingresos = parseFloat(ingresosRes.rows[0].total);
    const gastos = parseFloat(gastosRes.rows[0].total);
    const resultado = ingresos - gastos;
    const comercial = comercialRes.rows[0];

    res.json({
      obra: obraRes.rows[0],
      ingresos,
      gastos,
      resultado,
      margenPct: ingresos > 0 ? Math.round((resultado / ingresos) * 100) : null,
      precioVenta: comercial ? parseFloat(comercial.precio_venta || 0) : null,
      margenSobrePrecioVenta: comercial?.precio_venta
        ? parseFloat(comercial.precio_venta) - gastos
        : null,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error consultando resultado de obra" });
  }
});

module.exports = router;
