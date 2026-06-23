-- Datos estructurados que Claude Vision extrae de la boleta/factura/comprobante,
-- usados en el resumen de confirmación y en el reporte Excel.
ALTER TABLE gastos ADD COLUMN IF NOT EXISTS fecha_documento DATE;
ALTER TABLE gastos ADD COLUMN IF NOT EXISTS tipo_documento TEXT;
