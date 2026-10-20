-- Registro de envíos diarios de "promos de almuerzo" (feature personal de Gary,
-- no toca datos financieros). Un registro por fecha evita envíos duplicados
-- cuando el cron reintenta.
CREATE TABLE IF NOT EXISTS promos_envios (
 fecha DATE PRIMARY KEY,
 destino TEXT NOT NULL,
 modo TEXT NOT NULL CHECK (modo IN ('plantilla','texto','aviso_sin_archivo')),
 drive_file_id TEXT,
 meta_message_id TEXT,
 creado_en TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
