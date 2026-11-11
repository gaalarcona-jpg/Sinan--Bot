// Estado de resultado, margen por obra y deudas (solo admin).
// Fuente: crm/data/finanzas.json, foto validada de la planilla "SINAN CHILE – Estado de Costos 2025-2026".
// Contiene márgenes: nunca exponer a rol "operacion" (Rodrigo).
const express = require("express");
const fs = require("fs");
const path = require("path");
const { requireAdmin } = require("./auth");

const router = express.Router();
const ARCHIVO = path.join(__dirname, "..", "data", "finanzas.json");

router.get("/", requireAdmin, (_req, res) => {
  try {
    res.set("Cache-Control", "no-store");
    res.json(JSON.parse(fs.readFileSync(ARCHIVO, "utf8")));
  } catch (err) {
    console.error("finanzas.json:", err.message);
    res.status(500).json({ error: "No se pudo leer el estado de resultado" });
  }
});

module.exports = router;
