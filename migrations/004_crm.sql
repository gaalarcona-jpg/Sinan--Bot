-- Migración 004: Tablas CRM web (usuarios CRM + versionado)

CREATE TABLE IF NOT EXISTS crm_usuarios (
  id SERIAL PRIMARY KEY,
  nombre TEXT NOT NULL,
  clave_hash TEXT NOT NULL,
  rol TEXT NOT NULL CHECK (rol IN ('admin','operacion')),
  creado_en TIMESTAMPTZ DEFAULT NOW()
);

-- Versiones del CRM (qué git tag corresponde a qué deploy)
CREATE TABLE IF NOT EXISTS crm_versiones (
  id SERIAL PRIMARY KEY,
  version TEXT NOT NULL,
  descripcion TEXT,
  git_tag TEXT,
  desplegado_en TIMESTAMPTZ DEFAULT NOW()
);

-- Índice único por nombre (login case-insensitive)
CREATE UNIQUE INDEX IF NOT EXISTS idx_crm_usuarios_nombre ON crm_usuarios(LOWER(nombre));
