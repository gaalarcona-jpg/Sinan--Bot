-- Migración 002 (CRM): columnas de plazo dual en etapas
-- Idempotente: IF NOT EXISTS garantiza que no rompe si ya corrió la migración raíz 005_plazos.sql

ALTER TABLE etapas ADD COLUMN IF NOT EXISTS fecha_vencimiento_contrato DATE;
ALTER TABLE etapas ADD COLUMN IF NOT EXISTS fecha_vencimiento_interna DATE;
ALTER TABLE etapas ADD COLUMN IF NOT EXISTS buffer_dias_interno INTEGER NOT NULL DEFAULT 14;

CREATE INDEX IF NOT EXISTS idx_etapas_plazos
  ON etapas (fecha_vencimiento_contrato, fecha_vencimiento_interna)
  WHERE fecha_vencimiento_contrato IS NOT NULL OR fecha_vencimiento_interna IS NOT NULL;

-- Datos iniciales: Codegua Etapa 1
UPDATE etapas e
SET
  fecha_vencimiento_contrato = '2026-07-31',
  fecha_vencimiento_interna  = '2026-07-17',
  buffer_dias_interno        = 14
FROM obras o
WHERE e.obra_id = o.id
  AND o.nombre ILIKE '%codegua%'
  AND (e.nombre ILIKE '%etapa 1%' OR e.nombre ILIKE '%e1%' OR e.nombre ILIKE '% 1')
  AND e.fecha_vencimiento_contrato IS NULL;
