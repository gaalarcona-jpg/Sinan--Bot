CREATE TABLE IF NOT EXISTS inversiones (
  id SERIAL PRIMARY KEY,
  tipo TEXT NOT NULL CHECK (tipo IN ('activo_fijo','herramienta','vehiculo','material_stock','otro')),
  descripcion TEXT NOT NULL,
  monto NUMERIC(14,0) NOT NULL,
  fecha DATE NOT NULL DEFAULT CURRENT_DATE,
  proveedor TEXT,
  vida_util_anos INTEGER,
  imagen_drive_id TEXT,
  imagen_drive_link TEXT,
  comprobante_pdf_link TEXT,
  registrado_por INTEGER REFERENCES usuarios(id),
  creado_en TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
