const { Router } = require("express");
const { requireAuth, requireAdmin } = require("./auth");
const { alertaPlazo } = require("../plazo");

const router = Router();
router.use(requireAuth);

// Lista de obras activas — métricas separadas: Gastado / Contrato / Cobrado
router.get("/", async (req, res) => {
  try {
    // Subqueries independientes para evitar producto cartesiano entre
    // items_presupuesto y gastos al hacer JOIN en el mismo GROUP BY.
    const { rows: obras } = await req.pool.query(`
      SELECT
        o.id,
        o.nombre,
        o.bono_por_etapa,
        (
          SELECT COALESCE(SUM(g.monto), 0)::numeric
          FROM gastos g
          WHERE g.obra_id = o.id AND g.tipo = 'rendicion' AND g.estado != 'rechazado'
        ) AS gastado_total,
        (SELECT COUNT(*) FROM etapas e WHERE e.obra_id = o.id)::int AS etapas_count,
        (SELECT COUNT(*) FROM etapas e WHERE e.obra_id = o.id AND e.estado = 'completada')::int AS etapas_completadas
      FROM obras o
      WHERE o.activa = true
      ORDER BY o.nombre
    `);

    const obraIds = obras.map(o => o.id);

    // Primera etapa no-completada con plazo, por obra — para el badge del dashboard
    let etapasActivas = [];
    if (obraIds.length > 0) {
      const { rows } = await req.pool.query(`
        SELECT DISTINCT ON (e.obra_id)
          e.obra_id,
          e.id,
          e.nombre,
          e.fecha_vencimiento_contrato,
          e.fecha_vencimiento_interna
        FROM etapas e
        WHERE e.obra_id = ANY($1)
          AND e.estado != 'completada'
          AND e.fecha_vencimiento_interna IS NOT NULL
        ORDER BY e.obra_id, e.id ASC
      `, [obraIds]);
      etapasActivas = rows;
    }

    let payload = obras.map(o => {
      const ea = etapasActivas.find(e => e.obra_id === o.id) || null;
      return {
        id: o.id,
        nombre: o.nombre,
        gastadoTotal: parseFloat(o.gastado_total),
        etapasCount: o.etapas_count,
        etapasCompletadas: o.etapas_completadas,
        etapaActiva: ea ? {
          id: ea.id,
          nombre: ea.nombre,
          plazo: alertaPlazo(ea.fecha_vencimiento_contrato, ea.fecha_vencimiento_interna),
        } : null,
      };
    });

    // Datos financieros del contrato y cobros — solo admin
    if (req.user.rol === "admin" && obraIds.length > 0) {
      const [{ rows: contratos }, { rows: cobrados }] = await Promise.all([
        req.pool.query(
          "SELECT obra_id, precio_venta::numeric AS contrato FROM obras_comercial WHERE obra_id = ANY($1)",
          [obraIds]
        ),
        req.pool.query(
          "SELECT obra_id, COALESCE(SUM(monto), 0)::numeric AS cobrado FROM ingresos WHERE obra_id = ANY($1) GROUP BY obra_id",
          [obraIds]
        ),
      ]);

      const cMap = Object.fromEntries(contratos.map(r => [r.obra_id, parseFloat(r.contrato)]));
      const iMap = Object.fromEntries(cobrados.map(r => [r.obra_id, parseFloat(r.cobrado)]));

      payload = payload.map(o => ({
        ...o,
        contrato: cMap[o.id] ?? null,
        cobrado: iMap[o.id] ?? 0,
      }));
    }

    res.json(payload);
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
        e.fecha_vencimiento_contrato,
        e.fecha_vencimiento_interna,
        e.buffer_dias_interno,
        COALESCE(SUM(ip.presupuesto), 0)::numeric AS presupuesto_total,
        COALESCE(SUM(CASE WHEN g.estado != 'rechazado' THEN g.monto ELSE 0 END), 0)::numeric AS gastado_total
      FROM etapas e
      LEFT JOIN items_presupuesto ip ON ip.etapa_id = e.id
      LEFT JOIN gastos g ON g.etapa_id = e.id AND g.tipo = 'rendicion'
      WHERE e.obra_id = $1
      GROUP BY e.id, e.nombre, e.estado, e.completada_en,
               e.fecha_vencimiento_contrato, e.fecha_vencimiento_interna, e.buffer_dias_interno
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
        fechaVencimientoContrato: e.fecha_vencimiento_contrato
          ? new Date(e.fecha_vencimiento_contrato).toISOString().split("T")[0]
          : null,
        fechaVencimientoInterna: e.fecha_vencimiento_interna
          ? new Date(e.fecha_vencimiento_interna).toISOString().split("T")[0]
          : null,
        plazo: alertaPlazo(e.fecha_vencimiento_contrato, e.fecha_vencimiento_interna),
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
    const etapaRow = etapaRows.rows[0];

    res.json({
      etapa: {
        ...etapaRow,
        fechaVencimientoContrato: etapaRow.fecha_vencimiento_contrato
          ? new Date(etapaRow.fecha_vencimiento_contrato).toISOString().split("T")[0]
          : null,
        fechaVencimientoInterna: etapaRow.fecha_vencimiento_interna
          ? new Date(etapaRow.fecha_vencimiento_interna).toISOString().split("T")[0]
          : null,
        plazo: alertaPlazo(etapaRow.fecha_vencimiento_contrato, etapaRow.fecha_vencimiento_interna),
      },
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
