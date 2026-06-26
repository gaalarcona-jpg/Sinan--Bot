const { query } = require("./db");

// ============================================================
// GASTOS OPERACIONALES
// ============================================================
const gastos_op = {
  async crear(datos) {
    const {
      areaId, categoria, descripcion, monto, periodoMes, fecha,
      proveedorId, imagenDriveId, imagenDriveLink, tipoDocumento, registradoPor
    } = datos;
    const { rows } = await query(
      `INSERT INTO gastos_operacionales (
         area_id, categoria, descripcion, monto, periodo_mes, fecha,
         proveedor_id, imagen_drive_id, imagen_drive_link, tipo_documento, registrado_por
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
       RETURNING *`,
      [areaId, categoria, descripcion || null, monto, periodoMes || null,
       fecha || new Date().toISOString().slice(0, 10),
       proveedorId || null, imagenDriveId || null, imagenDriveLink || null,
       tipoDocumento || null, registradoPor]
    );
    return rows[0];
  },

  async listarPorMes(periodoMes) {
    const { rows } = await query(
      `SELECT go.*, an.nombre AS area_nombre, p.nombre AS proveedor_nombre, u.nombre AS usuario_nombre
       FROM gastos_operacionales go
       LEFT JOIN areas_negocio an ON an.id = go.area_id
       LEFT JOIN proveedores p ON p.id = go.proveedor_id
       LEFT JOIN usuarios u ON u.id = go.registrado_por
       WHERE periodo_mes = $1 OR TO_CHAR(fecha, 'YYYY-MM') = $1
       ORDER BY fecha DESC`,
      [periodoMes]
    );
    return rows;
  },
};

// ============================================================
// INGRESOS
// ============================================================
const ingresos = {
  async crear(datos) {
    const {
      areaId, obraId, etapaId, clienteNombre, descripcion, monto, fechaCobro,
      comprobanteDriveId, comprobanteDriveLink, registradoPor
    } = datos;
    const { rows } = await query(
      `INSERT INTO ingresos (
         area_id, obra_id, etapa_id, cliente_nombre, descripcion, monto, fecha_cobro,
         comprobante_drive_id, comprobante_drive_link, registrado_por
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
       RETURNING *`,
      [areaId, obraId || null, etapaId || null, clienteNombre, descripcion || null,
       monto, fechaCobro || new Date().toISOString().slice(0, 10),
       comprobanteDriveId || null, comprobanteDriveLink || null, registradoPor]
    );
    return rows[0];
  },

  async listarPorMes(periodoMes) {
    const { rows } = await query(
      `SELECT i.*, an.nombre AS area_nombre, o.nombre AS obra_nombre, e.nombre AS etapa_nombre
       FROM ingresos i
       LEFT JOIN areas_negocio an ON an.id = i.area_id
       LEFT JOIN obras o ON o.id = i.obra_id
       LEFT JOIN etapas e ON e.id = i.etapa_id
       WHERE TO_CHAR(fecha_cobro, 'YYYY-MM') = $1
       ORDER BY fecha_cobro DESC`,
      [periodoMes]
    );
    return rows;
  },

  async listarPorObra(obraId) {
    const { rows } = await query(
      `SELECT i.*, e.nombre AS etapa_nombre
       FROM ingresos i
       LEFT JOIN etapas e ON e.id = i.etapa_id
       WHERE obra_id = $1
       ORDER BY fecha_cobro DESC`,
      [obraId]
    );
    return rows;
  },
};

// ============================================================
// ESTADO DE RESULTADOS
// ============================================================
const estadoResultados = {
  async porMes(periodoMes) {
    // Ingresos por área
    const { rows: ingresosData } = await query(
      `SELECT area_id, SUM(monto) AS total
       FROM ingresos
       WHERE TO_CHAR(fecha_cobro, 'YYYY-MM') = $1
       GROUP BY area_id`,
      [periodoMes]
    );

    // Gastos operacionales por área y categoría
    const { rows: gastosOpData } = await query(
      `SELECT area_id, categoria, SUM(monto) AS total
       FROM gastos_operacionales
       WHERE periodo_mes = $1 OR TO_CHAR(fecha, 'YYYY-MM') = $1
       GROUP BY area_id, categoria`,
      [periodoMes]
    );

    // Gastos de construcción (rendiciones)
    const { rows: rendicionesData } = await query(
      `SELECT g.obra_id, o.nombre AS obra_nombre, SUM(g.monto) AS total
       FROM gastos g
       LEFT JOIN obras o ON o.id = g.obra_id
       WHERE TO_CHAR(g.creado_en, 'YYYY-MM') = $1 AND g.tipo = 'rendicion'
       GROUP BY g.obra_id, o.nombre`,
      [periodoMes]
    );

    // Áreas
    const { rows: areas } = await query("SELECT * FROM areas_negocio ORDER BY id");

    const construccion = areas.find(a => a.nombre === 'Construcción');
    const arquitectura = areas.find(a => a.nombre === 'Arquitectura');
    const operacional = areas.find(a => a.nombre === 'Operacional');

    // Construcción
    const ingresosConst = ingresosData.find(i => i.area_id === construccion?.id)?.total || 0;
    const gastosOpConst = gastosOpData.filter(g => g.area_id === construccion?.id).reduce((sum, g) => sum + parseFloat(g.total), 0);
    const rendiciones = rendicionesData.reduce((sum, r) => sum + parseFloat(r.total || 0), 0);
    const totalCostosConst = gastosOpConst + rendiciones;
    const margenConst = ingresosConst - totalCostosConst;
    const margenPctConst = ingresosConst > 0 ? ((margenConst / ingresosConst) * 100).toFixed(1) : 0;

    // Arquitectura
    const ingresosArq = ingresosData.find(i => i.area_id === arquitectura?.id)?.total || 0;
    const gastosOpArq = gastosOpData.filter(g => g.area_id === arquitectura?.id).reduce((sum, g) => sum + parseFloat(g.total), 0);
    const margenArq = ingresosArq - gastosOpArq;
    const margenPctArq = ingresosArq > 0 ? ((margenArq / ingresosArq) * 100).toFixed(1) : 0;

    // Operacional
    const gastosOpOp = gastosOpData.filter(g => g.area_id === operacional?.id);
    const totalOp = gastosOpOp.reduce((sum, g) => sum + parseFloat(g.total), 0);

    const totalIngresos = parseFloat(ingresosConst) + parseFloat(ingresosArq);
    const totalGastos = totalCostosConst + gastosOpArq + totalOp;
    const resultadoNeto = totalIngresos - totalGastos;

    return {
      construccion: {
        ingresos: parseFloat(ingresosConst),
        gastosOp: gastosOpConst,
        rendiciones,
        totalCostos: totalCostosConst,
        margen: margenConst,
        margenPct: margenPctConst,
      },
      arquitectura: {
        ingresos: parseFloat(ingresosArq),
        gastosOp: gastosOpArq,
        margen: margenArq,
        margenPct: margenPctArq,
      },
      operacional: {
        gastosPorCategoria: gastosOpOp.map(g => ({ categoria: g.categoria, total: parseFloat(g.total) })),
        total: totalOp,
      },
      resultadoNeto,
    };
  },

  async porObra(obraId) {
    // Ingresos de la obra
    const { rows: ingresosObra } = await query(
      `SELECT SUM(monto) AS total FROM ingresos WHERE obra_id = $1`,
      [obraId]
    );

    // Costos por etapa (rendiciones)
    const { rows: costosPorEtapa } = await query(
      `SELECT e.nombre AS etapa, SUM(g.monto) AS total
       FROM gastos g
       LEFT JOIN etapas e ON e.id = g.etapa_id
       WHERE g.obra_id = $1 AND g.tipo = 'rendicion'
       GROUP BY e.id, e.nombre
       ORDER BY e.nombre`,
      [obraId]
    );

    const ingresos = parseFloat(ingresosObra[0]?.total || 0);
    const totalCostos = costosPorEtapa.reduce((sum, c) => sum + parseFloat(c.total), 0);
    const margen = ingresos - totalCostos;
    const margenPct = ingresos > 0 ? ((margen / ingresos) * 100).toFixed(1) : 0;

    return {
      ingresos,
      costosPorEtapa: costosPorEtapa.map(c => ({ etapa: c.etapa, total: parseFloat(c.total) })),
      totalCostos,
      margen,
      margenPct,
    };
  },
};

// ============================================================
// CONFIG SISTEMA
// ============================================================
const config = {
  async get(clave) {
    const { rows } = await query("SELECT valor FROM config_sistema WHERE clave = $1", [clave]);
    return rows[0]?.valor || null;
  },

  async set(clave, valor) {
    await query(
      `INSERT INTO config_sistema (clave, valor, actualizado_en)
       VALUES ($1, $2, NOW())
       ON CONFLICT (clave) DO UPDATE SET valor = $2, actualizado_en = NOW()`,
      [clave, valor]
    );
  },
};

module.exports = {
  gastos_op,
  ingresos,
  estadoResultados,
  config,
};
