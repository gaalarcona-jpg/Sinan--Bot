const express = require("express");
const path = require("path");
const { Pool } = require("pg");
const bcrypt = require("bcryptjs");

const loginRoute = require("./routes/login");
const obrasRoute = require("./routes/obras");
const gastosRoute = require("./routes/gastos");
const resultadosRoute = require("./routes/resultados");
const versionRoute = require("./routes/version");
const operacionalRoute = require("./routes/operacional");
const inversionesRoute = require("./routes/inversiones");

if (!process.env.DATABASE_URL) {
  console.error("Falta DATABASE_URL");
  process.exit(1);
}
if (!process.env.JWT_SECRET) {
  console.error("Falta JWT_SECRET");
  process.exit(1);
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL.includes("railway") || process.env.NODE_ENV === "production"
    ? { rejectUnauthorized: false }
    : undefined,
});

async function runMigrations() {
  const fs = require("fs");
  const migrationsDir = path.join(__dirname, "migrations");
  const files = fs.readdirSync(migrationsDir).filter(f => f.endsWith(".sql")).sort();

  await pool.query(`
    CREATE TABLE IF NOT EXISTS _migraciones (
      nombre TEXT PRIMARY KEY,
      corrida_en TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  for (const file of files) {
    const { rows } = await pool.query("SELECT 1 FROM _migraciones WHERE nombre = $1", [file]);
    if (rows.length) continue;
    const sql = fs.readFileSync(path.join(migrationsDir, file), "utf8");
    await pool.query(sql);
    await pool.query("INSERT INTO _migraciones (nombre) VALUES ($1)", [file]);
    console.log("Migración aplicada:", file);
  }
}

async function seedCrmUsuarios() {
  const { rows } = await pool.query("SELECT COUNT(*) AS c FROM crm_usuarios");
  if (parseInt(rows[0].c) > 0) return;

  const garyHash = await bcrypt.hash("sinan2026", 10);
  const rodrigoHash = await bcrypt.hash("rodrigo2026", 10);

  await pool.query(
    "INSERT INTO crm_usuarios (nombre, clave_hash, rol) VALUES ($1, $2, $3), ($4, $5, $6)",
    ["Gary", garyHash, "admin", "Rodrigo", rodrigoHash, "operacion"]
  );
  console.log("CRM usuarios iniciales creados (Gary/admin, Rodrigo/operacion)");
}

async function registrarVersion() {
  const gitTag = process.env.CRM_GIT_TAG || "crm-v1.0";
  const { rows } = await pool.query("SELECT 1 FROM crm_versiones WHERE git_tag = $1", [gitTag]);
  if (rows.length) return;
  await pool.query(
    "INSERT INTO crm_versiones (version, descripcion, git_tag) VALUES ($1, $2, $3)",
    ["1.0.0", "Primera versión CRM web: login, dashboard obras, estado resultados, rendiciones", gitTag]
  );
  console.log("Versión CRM registrada:", gitTag);
}

const app = express();
app.use(express.json());

// Inyectar pool en cada request
app.use((req, _res, next) => { req.pool = pool; next(); });

// API routes
app.use("/api/login", loginRoute);
app.use("/api/obras", obrasRoute);
app.use("/api/gastos", gastosRoute);
app.use("/api", operacionalRoute);   // monta /api/gastos-operacionales y /api/ingresos
app.use("/api/estado-resultados", resultadosRoute);
app.use("/api/inversiones", inversionesRoute);
app.use("/api/version", versionRoute);

// Servir frontend estático (en producción)
const clientDist = path.join(__dirname, "client", "dist");
if (require("fs").existsSync(clientDist)) {
  app.use(express.static(clientDist));
  app.get("*", (_req, res) => res.sendFile(path.join(clientDist, "index.html")));
} else {
  app.get("/", (_req, res) => res.json({ status: "SINAN CRM API corriendo", clientDist: "no construido" }));
}

const PORT = process.env.PORT || 4000;

(async () => {
  try {
    await runMigrations();
    await seedCrmUsuarios();
    await registrarVersion();
    app.listen(PORT, () => console.log(`SINAN CRM escuchando en :${PORT}`));
  } catch (err) {
    console.error("Error al iniciar CRM:", err.message);
    process.exit(1);
  }
})();
