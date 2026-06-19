const fs = require("fs");
const path = require("path");
const { Pool } = require("pg");

async function run() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_URL?.includes("railway") || process.env.NODE_ENV === "production"
      ? { rejectUnauthorized: false }
      : undefined,
  });

  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        filename    TEXT PRIMARY KEY,
        aplicada_en TIMESTAMPTZ NOT NULL DEFAULT now()
      );
    `);

    const dir = path.join(__dirname, "migrations");
    const archivos = fs.readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();

    const { rows } = await client.query("SELECT filename FROM schema_migrations");
    const aplicadas = new Set(rows.map((r) => r.filename));

    let nuevas = 0;
    for (const archivo of archivos) {
      if (aplicadas.has(archivo)) continue;
      const sql = fs.readFileSync(path.join(dir, archivo), "utf8");
      console.log("Aplicando migración:", archivo);
      try {
        await client.query("BEGIN");
        await client.query(sql);
        await client.query("INSERT INTO schema_migrations (filename) VALUES ($1)", [archivo]);
        await client.query("COMMIT");
        nuevas++;
      } catch (err) {
        await client.query("ROLLBACK");
        console.error("Migración falló:", archivo, err.message);
        process.exit(1);
      }
    }
    console.log(`Migraciones aplicadas: ${nuevas}. Total histórico: ${aplicadas.size + nuevas}.`);
  } finally {
    client.release();
    await pool.end();
  }
}

run().catch((err) => {
  console.error("Error ejecutando migraciones:", err.message);
  process.exit(1);
});
