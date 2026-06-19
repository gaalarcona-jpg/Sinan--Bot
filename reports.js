const db = require("./db");
const dbComercial = require("./db_comercial");
const drive = require("./drive");
const excel = require("./excel");
const { fmtMonto, fmtFecha } = require("./format");

// Cálculo de eficiencia por ítem — no toca datos comerciales, seguro para ambos roles.
async function eficienciaPorItem(obraId) {
  const { rows } = await db.query(
    `SELECT ip.id, ip.nombre AS item, e.nombre AS etapa, ip.presupuesto,
            COALESCE(SUM(g.monto), 0) AS gastado
     FROM items_presupuesto ip
     JOIN etapas e ON e.id = ip.etapa_id
     LEFT JOIN gastos g ON g.item_id = ip.id AND g.estado != 'rechazado'
     WHERE e.obra_id = $1
     GROUP BY ip.id, ip.nombre, e.nombre, ip.presupuesto
     ORDER BY e.nombre, ip.nombre`,
    [obraId]
  );
  return rows.map((r) => ({
    item: `${r.etapa} — ${r.item}`,
    presupuesto: Number(r.presupuesto),
    gastado: Number(r.gastado),
    pct: Number(r.presupuesto) > 0 ? Math.round((Number(r.gastado) / Number(r.presupuesto)) * 100) : 0,
  }));
}

function filaGasto(g) {
  return {
    id: g.id,
    tipo: g.tipo,
    etapa: g.etapa_nombre || "",
    item: g.item_nombre || "",
    proveedor: g.proveedor_nombre || "",
    monto: Number(g.monto),
    estado: g.estado,
    fecha: fmtFecha(g.creado_en),
    descripcion: g.descripcion || "",
  };
}

const rodrigo = {
  eficienciaPorItem,
  async exportarObra(obraId) {
    const obra = await db.obras.porId(obraId);
    const [gastosDetalle, filasEficiencia] = await Promise.all([
      db.gastos.porObraConDetalle(obraId),
      eficienciaPorItem(obraId),
    ]);
    const buffer = await excel.construirReporteObra({
      nombreObra: obra.nombre,
      filasGastos: gastosDetalle.map(filaGasto),
      filasEficiencia,
    });
    return drive.subirReporte(buffer, `${obra.nombre}_${Date.now()}.xlsx`);
  },
};

const gary = {
  eficienciaPorItem,
  async exportarObraConMargen(obraId) {
    const obra = await db.obras.porId(obraId);
    const [gastosDetalle, filasEficiencia, etapasDeLaObra] = await Promise.all([
      db.gastos.porObraConDetalle(obraId),
      eficienciaPorItem(obraId),
      db.etapas.listarPorObra(obraId),
    ]);
    const filasMargen = await Promise.all(
      etapasDeLaObra.map(async (etapa) => {
        const m = await dbComercial.margenPorEtapa(etapa.id, obraId);
        return {
          etapa: etapa.nombre,
          precioVenta: m.precioVenta ?? "",
          gastado: m.gastado,
          margen: m.margen ?? "",
          utilidadRodrigo: m.utilidadRodrigo ?? "",
        };
      })
    );
    const buffer = await excel.construirReporteObra({
      nombreObra: obra.nombre,
      filasGastos: gastosDetalle.map(filaGasto),
      filasEficiencia,
      filasMargen,
    });
    return drive.subirReporte(buffer, `${obra.nombre}_margen_${Date.now()}.xlsx`);
  },
  async margenPorObra(obraId) {
    return dbComercial.margenPorObra(obraId);
  },
  async resumenDiarioPendientesTexto(dias = 7) {
    const pendientes = await db.gastos.pendientesRecientes(dias);
    if (!pendientes.length) return `📊 *SINAN — Resumen diario*\n\nSin rendiciones pendientes en los últimos ${dias} días.`;
    const total = pendientes.reduce((s, g) => s + Number(g.monto), 0);
    const porObra = {};
    pendientes.forEach((g) => {
      porObra[g.obra_nombre] = (porObra[g.obra_nombre] || 0) + Number(g.monto);
    });
    let t = `📊 *SINAN — Resumen diario*\n📅 ${fmtFecha(new Date())}\n\n`;
    Object.entries(porObra).forEach(([obra, monto]) => { t += `🏗️ ${obra}: ${fmtMonto(monto)}\n`; });
    t += `\n━━━━━━━━━━\n⏳ Total pendiente (${dias}d): ${fmtMonto(total)} (${pendientes.length} rendiciones)`;
    return t;
  },
};

module.exports = { rodrigo, gary };
