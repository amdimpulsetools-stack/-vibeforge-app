-- 257: prescriptions.medication_catalog_id — el vínculo que hoy se calcula y se tira
--
-- Caso real (10-sep-2026, spec docs/spec-receta-a-recepcion.md §3.2 y §4.1):
-- la doctora escribe "Losart" en el compositor de recetas, el modal le ofrece
-- la fila del catálogo con el chip "Farmacia" —la tiene porque
-- `medication_catalog.inventory_product_id` existe desde la mig 248—, ella la
-- elige, el modal guarda `catalogId` en el borrador… y el POST lo descarta a
-- propósito porque `prescriptions` no tiene dónde ponerlo
-- (`prescription-composer-modal.tsx`, comentario "son solo de UI"). El sistema
-- tuvo el vínculo exacto en la mano y lo soltó: queda solo `medication text`.
--
-- La V1 de la spec (recepción SABE que hay receta) NO lee esta columna. No
-- cambia una sola pantalla ni el comportamiento de ninguna organización:
-- nullable, sin default, sin CHECK. Se hace AHORA y no en la V2 porque si se
-- pospone, el día que se lance el puente con Farmacia ninguna receta anterior
-- sabrá a qué producto apunta y la función arranca con cero historia. Hecha
-- hoy, dentro de dos meses el 100% de las recetas nuevas trae el vínculo.
--
-- Nullable y ON DELETE SET NULL a propósito: la receta es un documento
-- clínico y tiene que sobrevivir a que el medicamento salga del catálogo.
--
-- Y NO se añade `prescriptions.inventory_product_id` (spec §4.2): el salto al
-- almacén ya lo tiene el catálogo (mig 248:36), con su índice único por
-- producto y su propio SET NULL. Dos rutas al mismo producto divergen el día
-- que alguien re-enlaza una y no la otra.

ALTER TABLE prescriptions
  ADD COLUMN IF NOT EXISTS medication_catalog_id uuid
    REFERENCES medication_catalog(id) ON DELETE SET NULL;

COMMENT ON COLUMN prescriptions.medication_catalog_id IS
  'Mig 257: fila de medication_catalog que la médica eligió en el compositor de recetas. NULL = escrito a mano, o receta anterior a esta migración. La V1 (receta → recepción) NO la lee: existe para que la V2 (puente con Farmacia, vía medication_catalog.inventory_product_id, mig 248:36) no nazca sin historia. ON DELETE SET NULL: la receta sobrevive a que el medicamento salga del catálogo.';
