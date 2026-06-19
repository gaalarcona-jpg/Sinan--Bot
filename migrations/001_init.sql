-- ============================================================
-- USUARIOS Y ROLES
-- ============================================================
CREATE TABLE usuarios (
  id            SERIAL PRIMARY KEY,
  nombre        TEXT NOT NULL,
  telefono      TEXT NOT NULL UNIQUE,
  rol           TEXT NOT NULL CHECK (rol IN ('gary', 'rodrigo', 'finanzas', 'admin')),
  activo        BOOLEAN NOT NULL DEFAULT true,
  creado_en     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_usuarios_telefono ON usuarios (telefono);

-- ============================================================
-- OBRAS Y ETAPAS — datos visibles para AMBOS roles
-- ============================================================
CREATE TABLE obras (
  id                SERIAL PRIMARY KEY,
  nombre            TEXT NOT NULL UNIQUE,
  bono_por_etapa    NUMERIC(14,2) NOT NULL DEFAULT 0,
  activa            BOOLEAN NOT NULL DEFAULT true,
  creada_en         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE etapas (
  id              SERIAL PRIMARY KEY,
  obra_id         INTEGER NOT NULL REFERENCES obras(id) ON DELETE CASCADE,
  nombre          TEXT NOT NULL,
  estado          TEXT NOT NULL DEFAULT 'en_curso' CHECK (estado IN ('en_curso','completada')),
  completada_en   TIMESTAMPTZ,
  UNIQUE (obra_id, nombre)
);
CREATE INDEX idx_etapas_obra ON etapas (obra_id);

CREATE TABLE items_presupuesto (
  id              SERIAL PRIMARY KEY,
  etapa_id        INTEGER NOT NULL REFERENCES etapas(id) ON DELETE CASCADE,
  nombre          TEXT NOT NULL,
  presupuesto     NUMERIC(14,2) NOT NULL DEFAULT 0,
  actualizado_en  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (etapa_id, nombre)
);
CREATE INDEX idx_items_etapa ON items_presupuesto (etapa_id);

-- ============================================================
-- DATOS COMERCIALES — SOLO accedidos desde db_comercial.js
-- ============================================================
CREATE TABLE obras_comercial (
  obra_id                       INTEGER PRIMARY KEY REFERENCES obras(id) ON DELETE CASCADE,
  precio_venta                  NUMERIC(14,2),
  porcentaje_utilidad_rodrigo   NUMERIC(5,2) NOT NULL DEFAULT 10.00,
  actualizado_en                TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE etapas_comercial (
  etapa_id        INTEGER PRIMARY KEY REFERENCES etapas(id) ON DELETE CASCADE,
  precio_venta     NUMERIC(14,2),
  actualizado_en   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- PROVEEDORES Y ACUERDOS
-- ============================================================
CREATE TABLE proveedores (
  id        SERIAL PRIMARY KEY,
  nombre    TEXT NOT NULL UNIQUE,
  creado_en TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE acuerdos_proveedor (
  id                SERIAL PRIMARY KEY,
  proveedor_id      INTEGER NOT NULL REFERENCES proveedores(id),
  obra_id           INTEGER REFERENCES obras(id),
  monto_acordado    NUMERIC(14,2) NOT NULL,
  descripcion       TEXT,
  creado_por        INTEGER NOT NULL REFERENCES usuarios(id),
  creado_en         TIMESTAMPTZ NOT NULL DEFAULT now(),
  estado            TEXT NOT NULL DEFAULT 'activo' CHECK (estado IN ('activo','cerrado'))
);
CREATE INDEX idx_acuerdos_proveedor ON acuerdos_proveedor (proveedor_id);

-- ============================================================
-- GASTOS / RENDICIONES / BONOS — pipeline único de pagos
-- Sin ninguna columna de margen/utilidad — eso se calcula agregado
-- en reports.js (sección gary) contra obras_comercial/etapas_comercial.
-- ============================================================
CREATE TABLE gastos (
  id                            SERIAL PRIMARY KEY,
  tipo                          TEXT NOT NULL DEFAULT 'rendicion' CHECK (tipo IN ('rendicion','bono')),
  obra_id                       INTEGER NOT NULL REFERENCES obras(id),
  etapa_id                      INTEGER REFERENCES etapas(id),
  item_id                       INTEGER REFERENCES items_presupuesto(id),
  proveedor_id                  INTEGER REFERENCES proveedores(id),
  acuerdo_id                    INTEGER REFERENCES acuerdos_proveedor(id),
  monto                         NUMERIC(14,2) NOT NULL,
  iva_incluido                  BOOLEAN,
  descripcion                   TEXT,
  imagen_drive_id               TEXT,
  imagen_drive_link             TEXT,
  registrado_por                INTEGER NOT NULL REFERENCES usuarios(id),
  estado                        TEXT NOT NULL DEFAULT 'pendiente' CHECK (estado IN ('pendiente','pagado','rechazado')),
  monto_pagado                  NUMERIC(14,2),
  fecha_pago                    TIMESTAMPTZ,
  tipo_pago                     TEXT CHECK (tipo_pago IN ('proveedor','reembolso_rodrigo')),
  comprobante_pago_drive_id     TEXT,
  comprobante_pago_drive_link   TEXT,
  pagado_por                    INTEGER REFERENCES usuarios(id),
  alerta_razon_social           BOOLEAN NOT NULL DEFAULT false,
  razon_social_detectada        TEXT,
  raw_extraccion_ia             JSONB,
  creado_en                     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_gastos_obra_etapa ON gastos (obra_id, etapa_id);
CREATE INDEX idx_gastos_estado ON gastos (estado);
CREATE INDEX idx_gastos_proveedor ON gastos (proveedor_id);
CREATE INDEX idx_gastos_tipo ON gastos (tipo);
CREATE INDEX idx_gastos_creado_en ON gastos (creado_en);

-- ============================================================
-- ESTADO CONVERSACIONAL PENDIENTE
-- ============================================================
CREATE TABLE estado_conversacional (
  usuario_id          INTEGER PRIMARY KEY REFERENCES usuarios(id),
  intent              TEXT NOT NULL,
  datos_parciales     JSONB NOT NULL DEFAULT '{}',
  pregunta_pendiente  TEXT,
  expira_en           TIMESTAMPTZ NOT NULL,
  actualizado_en      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- BACKUPS (metadata)
-- ============================================================
CREATE TABLE backups_log (
  id              SERIAL PRIMARY KEY,
  ejecutado_en    TIMESTAMPTZ NOT NULL DEFAULT now(),
  drive_folder_id TEXT,
  tablas          TEXT[],
  ok              BOOLEAN NOT NULL,
  error           TEXT
);
