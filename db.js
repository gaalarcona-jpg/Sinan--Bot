const { Pool } = require("pg");
const config = require("./config");

const pool = new Pool({
  connectionString: config.DATABASE_URL,
  ssl: config.DATABASE_URL.includes("railway") || process.env.NODE_ENV === "production"
    ? { rejectUnauthorized: false }
    : undefined,
});

const query = (sql, params) => pool.query(sql, params);

// ============================================================
// USUARIOS
// ============================================================
const usuarios = {
  async porTelefono(telefono) {
    const { rows } = await query("SELECT * FROM usuarios WHERE telefono = $1 AND activo = true", [telefono]);
    return rows[0] || null;
  },
  async porId(id) {
    const { rows } = await query("SELECT * FROM usuarios WHERE id = $1", [id]);
    return rows[0] || null;
  },
  async porRol(rol) {
    const { rows } = await query("SELECT * FROM usuarios WHERE rol = $1 AND activo = true", [rol]);
    return rows;
  },
  async crear({ nombre, telefono, rol }) {
    const { rows } = await query(
      "INSERT INTO usuarios (nombre, telefono, rol) VALUES ($1, $2, $3) RETURNING *",
      [nombre, telefono, rol]
    );
    return rows[0];
  },
};

// ============================================================
// OBRAS / ETAPAS / ITEMS DE PRESUPUESTO
// ============================================================
const obras = {
  async listar() {
    const { rows } = await query("SELECT * FROM obras WHERE activa = true ORDER BY nombre");
    return rows;
  },
  async porId(id) {
    const { rows } = await query("SELECT * FROM obras WHERE id = $1", [id]);
    return rows[0] || null;
  },
  async porNombreAprox(nombre) {
    if (!nombre) return null;
    const { rows } = await query(
      "SELECT * FROM obras WHERE activa = true AND nombre ILIKE $1 ORDER BY nombre LIMIT 1",
      [`%${nombre}%`]
    );
    return rows[0] || null;
  },
  async crear({ nombre, bonoPorEtapa = 0 }) {
    const { rows } = await query(
      "INSERT INTO obras (nombre, bono_por_etapa) VALUES ($1, $2) RETURNING *",
      [nombre, bonoPorEtapa]
    );
    return rows[0];
  },
  async actualizarBono(obraId, monto) {
    await query("UPDATE obras SET bono_por_etapa = $2 WHERE id = $1", [obraId, monto]);
  },
};

const etapas = {
  async porObraYNombreAprox(obraId, nombre) {
    if (!nombre) return null;
    const { rows } = await query(
      "SELECT * FROM etapas WHERE obra_id = $1 AND nombre ILIKE $2 ORDER BY id LIMIT 1",
      [obraId, `%${nombre}%`]
    );
    return rows[0] || null;
  },
  async porId(id) {
    const { rows } = await query("SELECT * FROM etapas WHERE id = $1", [id]);
    return rows[0] || null;
  },
  async listarPorObra(obraId) {
    const { rows } = await query("SELECT * FROM etapas WHERE obra_id = $1 ORDER BY id", [obraId]);
    return rows;
  },
  async crear({ obraId, nombre }) {
    const { rows } = await query(
      "INSERT INTO etapas (obra_id, nombre) VALUES ($1, $2) RETURNING *",
      [obraId, nombre]
    );
    return rows[0];
  },
  async marcarCompletada(id) {
    const { rows } = await query(
      "UPDATE etapas SET estado = 'completada', completada_en = now() WHERE id = $1 RETURNING *",
      [id]
    );
    return rows[0];
  },
};

const itemsPresupuesto = {
  async porEtapaYNombreAprox(etapaId, nombre) {
    if (!nombre) return null;
    const { rows } = await query(
      "SELECT * FROM items_presupuesto WHERE etapa_id = $1 AND nombre ILIKE $2 ORDER BY id LIMIT 1",
      [etapaId, `%${nombre}%`]
    );
    return rows[0] || null;
  },
  async porId(id) {
    const { rows } = await query("SELECT * FROM items_presupuesto WHERE id = $1", [id]);
    return rows[0] || null;
  },
  async listarPorEtapa(etapaId) {
    const { rows } = await query("SELECT * FROM items_presupuesto WHERE etapa_id = $1 ORDER BY nombre", [etapaId]);
    return rows;
  },
  async crearOActualizar({ etapaId, nombre, presupuesto }) {
    const { rows } = await query(
      `INSERT INTO items_presupuesto (etapa_id, nombre, presupuesto)
       VALUES ($1, $2, $3)
       ON CONFLICT (etapa_id, nombre) DO UPDATE SET presupuesto = $3, actualizado_en = now()
       RETURNING *`,
      [etapaId, nombre, presupuesto]
    );
    return rows[0];
  },
  async gastadoReal(itemId) {
    const { rows } = await query(
      "SELECT COALESCE(SUM(monto), 0) AS total FROM gastos WHERE item_id = $1 AND estado != 'rechazado'",
      [itemId]
    );
    return Number(rows[0].total);
  },
};

// ============================================================
// PROVEEDORES Y ACUERDOS
// ============================================================
const proveedores = {
  async listar() {
    const { rows } = await query("SELECT * FROM proveedores ORDER BY nombre");
    return rows;
  },
  async porNombreAprox(nombre) {
    if (!nombre) return null;
    const { rows } = await query("SELECT * FROM proveedores WHERE nombre ILIKE $1 ORDER BY id LIMIT 1", [`%${nombre}%`]);
    return rows[0] || null;
  },
  async porId(id) {
    const { rows } = await query("SELECT * FROM proveedores WHERE id = $1", [id]);
    return rows[0] || null;
  },
  async obtenerOCrear(nombre) {
    const existente = await proveedores.porNombreAprox(nombre);
    if (existente) return existente;
    const { rows } = await query("INSERT INTO proveedores (nombre) VALUES ($1) RETURNING *", [nombre]);
    return rows[0];
  },
};

const acuerdos = {
  async crear({ proveedorId, obraId, montoAcordado, descripcion, creadoPor }) {
    const { rows } = await query(
      `INSERT INTO acuerdos_proveedor (proveedor_id, obra_id, monto_acordado, descripcion, creado_por)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [proveedorId, obraId, montoAcordado, descripcion, creadoPor]
    );
    return rows[0];
  },
  async porId(id) {
    const { rows } = await query("SELECT * FROM acuerdos_proveedor WHERE id = $1", [id]);
    return rows[0] || null;
  },
  async masRecientePorProveedor(proveedorId) {
    const { rows } = await query(
      "SELECT * FROM acuerdos_proveedor WHERE proveedor_id = $1 AND estado = 'activo' ORDER BY creado_en DESC LIMIT 1",
      [proveedorId]
    );
    return rows[0] || null;
  },
  async saldoPendiente(acuerdoId) {
    const acuerdo = await acuerdos.porId(acuerdoId);
    if (!acuerdo) return null;
    const { rows } = await query(
      "SELECT COALESCE(SUM(monto), 0) AS total FROM gastos WHERE acuerdo_id = $1 AND estado != 'rechazado'",
      [acuerdoId]
    );
    const pagadoOComprometido = Number(rows[0].total);
    return {
      montoAcordado: Number(acuerdo.monto_acordado),
      comprometido: pagadoOComprometido,
      saldo: Number(acuerdo.monto_acordado) - pagadoOComprometido,
    };
  },
};

// ============================================================
// GASTOS / RENDICIONES / BONOS
// ============================================================
const gastos = {
  async crear(datos) {
    const {
      tipo = "rendicion", obraId, etapaId, itemId, proveedorId, acuerdoId, monto,
      ivaIncluido, descripcion, imagenDriveId, imagenDriveLink, registradoPor,
      alertaRazonSocial = false, razonSocialDetectada, rawExtraccionIa,
    } = datos;
    const { rows } = await query(
      `INSERT INTO gastos (
         tipo, obra_id, etapa_id, item_id, proveedor_id, acuerdo_id, monto, iva_incluido,
         descripcion, imagen_drive_id, imagen_drive_link, registrado_por,
         alerta_razon_social, razon_social_detectada, raw_extraccion_ia
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
       RETURNING *`,
      [tipo, obraId, etapaId, itemId, proveedorId, acuerdoId, monto, ivaIncluido,
       descripcion, imagenDriveId, imagenDriveLink, registradoPor,
       alertaRazonSocial, razonSocialDetectada, rawExtraccionIa]
    );
    return rows[0];
  },
  async porId(id) {
    const { rows } = await query("SELECT * FROM gastos WHERE id = $1", [id]);
    return rows[0] || null;
  },
  async marcarPagado(id, { montoPagado, tipoPago, comprobanteDriveId, comprobanteDriveLink, pagadoPor }) {
    const { rows } = await query(
      `UPDATE gastos SET estado = 'pagado', monto_pagado = $2, fecha_pago = now(), tipo_pago = $3,
         comprobante_pago_drive_id = $4, comprobante_pago_drive_link = $5, pagado_por = $6
       WHERE id = $1 RETURNING *`,
      [id, montoPagado, tipoPago, comprobanteDriveId, comprobanteDriveLink, pagadoPor]
    );
    return rows[0];
  },
  async porEstado(estado) {
    const { rows } = await query("SELECT * FROM gastos WHERE estado = $1 ORDER BY creado_en DESC", [estado]);
    return rows;
  },
  async porObra(obraId) {
    const { rows } = await query("SELECT * FROM gastos WHERE obra_id = $1 ORDER BY creado_en DESC", [obraId]);
    return rows;
  },
  async porObraConDetalle(obraId) {
    const { rows } = await query(
      `SELECT g.*, e.nombre AS etapa_nombre, ip.nombre AS item_nombre, p.nombre AS proveedor_nombre
       FROM gastos g
       LEFT JOIN etapas e ON e.id = g.etapa_id
       LEFT JOIN items_presupuesto ip ON ip.id = g.item_id
       LEFT JOIN proveedores p ON p.id = g.proveedor_id
       WHERE g.obra_id = $1
       ORDER BY g.creado_en DESC`,
      [obraId]
    );
    return rows;
  },
  async pendientesRecientes(dias = 7) {
    const { rows } = await query(
      `SELECT g.*, o.nombre AS obra_nombre FROM gastos g
       JOIN obras o ON o.id = g.obra_id
       WHERE g.estado = 'pendiente' AND g.creado_en >= now() - ($1 || ' days')::interval
       ORDER BY g.creado_en DESC`,
      [dias]
    );
    return rows;
  },
  async buscarPendientesPorMontoAprox(monto, toleranciaPct = 0.02, diasAtras = 30) {
    const min = monto * (1 - toleranciaPct);
    const max = monto * (1 + toleranciaPct);
    const { rows } = await query(
      `SELECT * FROM gastos
       WHERE estado = 'pendiente' AND monto BETWEEN $1 AND $2
         AND creado_en >= now() - ($3 || ' days')::interval
       ORDER BY creado_en DESC`,
      [min, max, diasAtras]
    );
    return rows;
  },
};

// ============================================================
// ESTADO CONVERSACIONAL
// ============================================================
const estadoConversacional = {
  async obtener(usuarioId) {
    const { rows } = await query("SELECT * FROM estado_conversacional WHERE usuario_id = $1", [usuarioId]);
    const estado = rows[0];
    if (!estado) return null;
    if (new Date(estado.expira_en) < new Date()) {
      await estadoConversacional.borrar(usuarioId);
      return null;
    }
    return estado;
  },
  async guardar(usuarioId, intent, datosParciales, preguntaPendiente, minutosTTL = 30) {
    const { rows } = await query(
      `INSERT INTO estado_conversacional (usuario_id, intent, datos_parciales, pregunta_pendiente, expira_en, actualizado_en)
       VALUES ($1, $2, $3, $4, now() + ($5 || ' minutes')::interval, now())
       ON CONFLICT (usuario_id) DO UPDATE SET
         intent = $2, datos_parciales = $3, pregunta_pendiente = $4,
         expira_en = now() + ($5 || ' minutes')::interval, actualizado_en = now()
       RETURNING *`,
      [usuarioId, intent, datosParciales, preguntaPendiente, minutosTTL]
    );
    return rows[0];
  },
  async borrar(usuarioId) {
    await query("DELETE FROM estado_conversacional WHERE usuario_id = $1", [usuarioId]);
  },
  async limpiarExpirados() {
    const { rowCount } = await query("DELETE FROM estado_conversacional WHERE expira_en < now()");
    return rowCount;
  },
};

// ============================================================
// BACKUPS LOG
// ============================================================
const backupsLog = {
  async registrar({ ok, tablas, driveFolderId, error }) {
    await query(
      "INSERT INTO backups_log (drive_folder_id, tablas, ok, error) VALUES ($1, $2, $3, $4)",
      [driveFolderId, tablas, ok, error || null]
    );
  },
};

module.exports = {
  pool,
  query,
  usuarios,
  obras,
  etapas,
  itemsPresupuesto,
  proveedores,
  acuerdos,
  gastos,
  estadoConversacional,
  backupsLog,
};
