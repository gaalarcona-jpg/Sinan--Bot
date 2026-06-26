-- Migración 003: Gastos operacionales, ingresos y estado de resultados

-- Tabla de áreas de negocio
CREATE TABLE IF NOT EXISTS areas_negocio (
  id SERIAL PRIMARY KEY,
  nombre VARCHAR(100) NOT NULL UNIQUE,
  creado_en TIMESTAMP DEFAULT NOW()
);

-- Tabla de gastos operacionales (sueldos, arriendos, marketing, etc.)
CREATE TABLE IF NOT EXISTS gastos_operacionales (
  id SERIAL PRIMARY KEY,
  area_id INTEGER NOT NULL REFERENCES areas_negocio(id),
  categoria VARCHAR(50) NOT NULL CHECK (categoria IN ('sueldo', 'arriendo', 'marketing', 'software', 'otro')),
  descripcion TEXT,
  monto NUMERIC(12, 2) NOT NULL,
  fecha DATE NOT NULL,
  proveedor_id INTEGER REFERENCES proveedores(id),
  imagen_drive_id VARCHAR(255),
  imagen_drive_link TEXT,
  tipo_documento VARCHAR(50),
  registrado_por INTEGER NOT NULL REFERENCES usuarios(id),
  periodo_mes VARCHAR(7), -- YYYY-MM para agrupar sueldos mensuales
  creado_en TIMESTAMP DEFAULT NOW()
);

-- Tabla de ingresos (cobros efectivos)
CREATE TABLE IF NOT EXISTS ingresos (
  id SERIAL PRIMARY KEY,
  area_id INTEGER NOT NULL REFERENCES areas_negocio(id),
  obra_id INTEGER REFERENCES obras(id),
  etapa_id INTEGER REFERENCES etapas(id),
  cliente_nombre VARCHAR(255) NOT NULL,
  descripcion TEXT,
  monto NUMERIC(12, 2) NOT NULL,
  fecha_cobro DATE NOT NULL,
  comprobante_drive_id VARCHAR(255),
  comprobante_drive_link TEXT,
  registrado_por INTEGER NOT NULL REFERENCES usuarios(id),
  creado_en TIMESTAMP DEFAULT NOW()
);

-- Insertar las 3 áreas de negocio por defecto
INSERT INTO areas_negocio (nombre) VALUES
  ('Construcción'),
  ('Arquitectura'),
  ('Operacional')
ON CONFLICT (nombre) DO NOTHING;

-- Índices para consultas frecuentes
CREATE INDEX IF NOT EXISTS idx_gastos_operacionales_periodo ON gastos_operacionales(periodo_mes);
CREATE INDEX IF NOT EXISTS idx_gastos_operacionales_area ON gastos_operacionales(area_id);
CREATE INDEX IF NOT EXISTS idx_ingresos_fecha ON ingresos(fecha_cobro);
CREATE INDEX IF NOT EXISTS idx_ingresos_area ON ingresos(area_id);
CREATE INDEX IF NOT EXISTS idx_ingresos_obra ON ingresos(obra_id);
