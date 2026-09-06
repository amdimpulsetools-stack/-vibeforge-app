-- Pendiente de aplicar en producción (la aplica el orquestador)
--
-- ═══════════════════════════════════════════════════════════════════
-- 248: Catálogo de medicamentos por organización
--
-- Pedido del founder (5-sep): "un apartado para añadir las plantillas o
-- nombres de los medicamentos, que permita seleccionar también del
-- apartado Farmacia pero también añadir otros, porque puede que algunos
-- no los vendan en la misma clínica".
--
-- Una fila = un medicamento tal como se receta (nombre + concentración
-- + forma) con sus valores por defecto (vía, frecuencia, duración,
-- dosis por toma, indicaciones). El modal de Receta lo autocompleta y
-- prellena; nada obliga a usarlo (texto libre sigue valiendo).
--
--   inventory_product_id  vínculo opcional al producto de Farmacia
--                         (importado desde Almacén). SET NULL al borrar
--                         el producto: la receta no depende del stock.
--
-- Escritura: owner/admin (catálogo de la clínica) y doctores (agregan
-- desde el modal lo que recetan). Lectura: cualquier miembro activo.
-- Base (no addon): recetar es Yenda base.
-- ═══════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS medication_catalog (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id       uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name                  text NOT NULL CHECK (btrim(name) <> ''),
  concentration         text,          -- "500 mg", "1 g/5 ml"
  pharmaceutical_form   text,          -- tableta, cápsula, jarabe…
  route                 text,          -- oral, tópica, IM…
  frequency             text,          -- "Cada 8 horas"
  duration              text,          -- "7 días"
  dose_per_take         text,          -- "1 tableta"
  default_instructions  text,
  inventory_product_id  uuid REFERENCES inventory_products(id) ON DELETE SET NULL,
  is_active             boolean NOT NULL DEFAULT true,
  display_order         integer NOT NULL DEFAULT 0,
  -- Quién lo agregó (admin desde el catálogo o doctor desde la receta);
  -- DEFAULT auth.uid() para no depender de que la UI lo mande.
  created_by            uuid REFERENCES auth.users(id) ON DELETE SET NULL DEFAULT auth.uid(),
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

-- Mismo medicamento (nombre + concentración) una sola vez por org.
CREATE UNIQUE INDEX IF NOT EXISTS medication_catalog_org_name_uniq
  ON medication_catalog (organization_id, lower(btrim(name)), lower(coalesce(btrim(concentration), '')));

-- Un producto de Farmacia se importa una sola vez.
CREATE UNIQUE INDEX IF NOT EXISTS medication_catalog_product_uniq
  ON medication_catalog (organization_id, inventory_product_id)
  WHERE inventory_product_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_medication_catalog_org_active
  ON medication_catalog (organization_id, is_active, display_order, name);

DROP TRIGGER IF EXISTS trg_medication_catalog_updated_at ON medication_catalog;
CREATE TRIGGER trg_medication_catalog_updated_at
  BEFORE UPDATE ON medication_catalog
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE medication_catalog ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "medication_catalog_read" ON medication_catalog;
CREATE POLICY "medication_catalog_read" ON medication_catalog
  FOR SELECT USING (organization_id IN (SELECT get_user_org_ids()));

-- owner/admin o doctor de la org (get_user_org_role solo cuenta miembros
-- activos desde la mig 235).
DROP POLICY IF EXISTS "medication_catalog_write" ON medication_catalog;
CREATE POLICY "medication_catalog_write" ON medication_catalog
  FOR ALL TO authenticated
  USING (
    is_org_admin(organization_id)
    OR get_user_org_role(organization_id) = 'doctor'
  )
  WITH CHECK (
    is_org_admin(organization_id)
    OR get_user_org_role(organization_id) = 'doctor'
  );

COMMENT ON TABLE medication_catalog IS
  'Mig 248: catálogo de medicamentos por org para el modal de Receta (autocompletado + valores por defecto). inventory_product_id enlaza opcionalmente con Farmacia; los no vendidos en la clínica viven aquí igual.';
