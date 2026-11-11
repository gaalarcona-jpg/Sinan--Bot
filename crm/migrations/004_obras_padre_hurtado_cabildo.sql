-- Obras con contrato firmado que aún no existían en la base (para que el bot pueda registrar sus gastos).
INSERT INTO obras (nombre) VALUES ('Padre Hurtado (Parraguez)') ON CONFLICT (nombre) DO NOTHING;
INSERT INTO obras (nombre) VALUES ('Cabildo (Escobar)') ON CONFLICT (nombre) DO NOTHING;
