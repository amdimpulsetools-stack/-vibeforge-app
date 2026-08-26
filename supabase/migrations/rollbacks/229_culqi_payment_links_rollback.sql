-- Rollback de la mig 229: elimina el módulo de links de cobro Culqi.
-- ATENCIÓN: borra las credenciales Culqi de TODAS las clínicas y el
-- historial de links de cobro. Los patient_payments ya creados por
-- pagos confirmados NO se tocan (son cobros reales, viven en Caja).
-- El código tolera la ausencia de las tablas solo si también se
-- revierte el deploy que las consulta — revertir ambos juntos.

DROP TABLE IF EXISTS payment_links;
DROP TABLE IF EXISTS culqi_config;
