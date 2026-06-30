const { Router } = require("express");

const router = Router();

router.get("/", async (req, res) => {
  try {
    const { rows } = await req.pool.query(
      "SELECT * FROM crm_versiones ORDER BY desplegado_en DESC LIMIT 1"
    );
    res.json(rows[0] || { version: "1.0.0", git_tag: "crm-v1.0", descripcion: "CRM SINAN" });
  } catch (err) {
    res.json({ version: "1.0.0", git_tag: "crm-v1.0" });
  }
});

module.exports = router;
