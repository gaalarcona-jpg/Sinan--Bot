const { Router } = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

const router = Router();

router.post("/", async (req, res) => {
  const { nombre, clave } = req.body || {};
  if (!nombre || !clave) return res.status(400).json({ error: "Faltan credenciales" });

  const { rows } = await req.pool.query(
    "SELECT * FROM crm_usuarios WHERE LOWER(nombre) = LOWER($1)",
    [nombre.trim()]
  );

  // Siempre comparar hash aunque no exista (evitar timing attacks)
  const dummy = "$2a$10$dummy.hash.to.prevent.timing.attack.00000000000000000000";
  const hash = rows[0]?.clave_hash || dummy;
  const ok = await bcrypt.compare(clave, hash);

  if (!ok || !rows[0]) {
    return res.status(401).json({ error: "Credenciales incorrectas" });
  }

  const usuario = rows[0];
  const token = jwt.sign(
    { id: usuario.id, nombre: usuario.nombre, rol: usuario.rol },
    process.env.JWT_SECRET,
    { expiresIn: "12h" }
  );

  res.json({ token, rol: usuario.rol, nombre: usuario.nombre });
});

module.exports = router;
