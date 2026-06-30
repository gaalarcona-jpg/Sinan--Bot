-- Migración 005: Sistema de plazos duales por etapa

ALTER TABLE etapas ADD COLUMN IF NOT EXISTS fecha_vencimiento_contrato DATE;
ALTER TABLE etapas ADD COLUMN IF NOT EXISTS fecha_vencimiento_interna DATE;
ALTER TABLE etapas ADD COLUMN IF NOT EXISTS buffer_dias_interno INTEGER NOT NULL DEFAULT 14;

-- Índice para consultas de alertas
CREATE INDEX IF NOT EXISTS idx_etapas_plazos
  ON etapas (fecha_vencimiento_contrato, fecha_vencimiento_interna)
  WHERE fecha_vencimiento_contrato IS NOT NULL OR fecha_vencimiento_interna IS NOT NULL;

-- Datos iniciales: Codegua Etapa 1 → contrato 2026-07-31, interno 2026-07-17
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
