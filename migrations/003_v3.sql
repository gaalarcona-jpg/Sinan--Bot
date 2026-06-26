-- SINAN Bot v3 — Migración completa de sistema operacional

-- Tabla de áreas de negocio
CREATE TABLE IF NOT EXISTS areas_negocio (
  id SERIAL PRIMARY KEY,
  nombre TEXT NOT NULL UNIQUE
);

INSERT INTO areas_negocio (nombre) VALUES
  ('Construcción'),
  ('Arquitectura'),
  ('Operacional')
ON CONFLICT (nombre) DO NOTHING;

-- Tabla de gastos operacionales
CREATE TABLE IF NOT EXISTS gastos_operacionales (
  id SERIAL PRIMARY KEY,
  area_id INTEGER REFERENCES areas_negocio(id),
  categoria TEXT NOT NULL CHECK (categoria IN ('sueldo','arriendo','marketing','software','contabilidad','otro')),
  descripcion TEXT,
  monto NUMERIC(14,0) NOT NULL,
  periodo_mes TEXT,
  fecha DATE DEFAULT CURRENT_DATE,
  proveedor_id INTEGER REFERENCES proveedores(id),
  imagen_drive_id TEXT,
  imagen_drive_link TEXT,
  tipo_documento TEXT,
  registrado_por INTEGER REFERENCES usuarios(id),
  creado_en TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_gastos_op_periodo ON gastos_operacionales(periodo_mes);
CREATE INDEX IF NOT EXISTS idx_gastos_op_area ON gastos_operacionales(area_id);
CREATE INDEX IF NOT EXISTS idx_gastos_op_categoria ON gastos_operacionales(categoria);

-- Tabla de ingresos
CREATE TABLE IF NOT EXISTS ingresos (
  id SERIAL PRIMARY KEY,
  area_id INTEGER REFERENCES areas_negocio(id),
  obra_id INTEGER REFERENCES obras(id),
  etapa_id INTEGER REFERENCES etapas(id),
  cliente_nombre TEXT,
  descripcion TEXT,
  monto NUMERIC(14,0) NOT NULL,
  fecha_cobro DATE DEFAULT CURRENT_DATE,
  comprobante_drive_id TEXT,
  comprobante_drive_link TEXT,
  registrado_por INTEGER REFERENCES usuarios(id),
  creado_en TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ingresos_fecha ON ingresos(fecha_cobro);
CREATE INDEX IF NOT EXISTS idx_ingresos_area ON ingresos(area_id);
CREATE INDEX IF NOT EXISTS idx_ingresos_obra ON ingresos(obra_id);

-- Tabla de configuración del sistema
CREATE TABLE IF NOT EXISTS config_sistema (
  clave TEXT PRIMARY KEY,
  valor TEXT NOT NULL,
  actualizado_en TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO config_sistema (clave, valor) VALUES
  ('grupo_whatsapp_id', ''),
  ('notificar_grupo', 'false')
ON CONFLICT (clave) DO NOTHING;
