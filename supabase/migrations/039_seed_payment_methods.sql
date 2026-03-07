-- =============================================
-- 1. Add organization_id to lookup_values for multi-tenant support
--    NULL = system default (visible to all orgs)
--    non-NULL = org-specific (visible only to that org)
-- =============================================

ALTER TABLE lookup_values
ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE;

-- Drop the old unique constraint and create a new one that includes org scope
ALTER TABLE lookup_values
DROP CONSTRAINT IF EXISTS lookup_values_category_id_value_key;

CREATE UNIQUE INDEX IF NOT EXISTS lookup_values_category_org_value_unique
ON lookup_values (category_id, value, COALESCE(organization_id, '00000000-0000-0000-0000-000000000000'));

-- =============================================
-- 2. Update existing system payment methods with icons
-- =============================================

UPDATE lookup_values
SET icon = 'Banknote'
WHERE category_id = (SELECT id FROM lookup_categories WHERE slug = 'payment_method')
  AND value = 'cash' AND icon IS NULL;

UPDATE lookup_values
SET icon = 'Smartphone'
WHERE category_id = (SELECT id FROM lookup_categories WHERE slug = 'payment_method')
  AND value = 'yape' AND icon IS NULL;

UPDATE lookup_values
SET icon = 'CreditCard'
WHERE category_id = (SELECT id FROM lookup_categories WHERE slug = 'payment_method')
  AND value = 'visa' AND icon IS NULL;

-- =============================================
-- 3. Add universal payment methods (system defaults, org_id = NULL)
-- =============================================

INSERT INTO lookup_values (category_id, label, value, icon, display_order)
SELECT id, 'Transferencia bancaria', 'bank_transfer', 'Building2', 5
FROM lookup_categories WHERE slug = 'payment_method'
WHERE NOT EXISTS (
  SELECT 1 FROM lookup_values lv
  WHERE lv.category_id = (SELECT id FROM lookup_categories WHERE slug = 'payment_method')
    AND lv.value = 'bank_transfer' AND lv.organization_id IS NULL
);

INSERT INTO lookup_values (category_id, label, value, icon, display_order)
SELECT id, 'Depósito bancario', 'bank_deposit', 'Landmark', 6
FROM lookup_categories WHERE slug = 'payment_method'
WHERE NOT EXISTS (
  SELECT 1 FROM lookup_values lv
  WHERE lv.category_id = (SELECT id FROM lookup_categories WHERE slug = 'payment_method')
    AND lv.value = 'bank_deposit' AND lv.organization_id IS NULL
);

INSERT INTO lookup_values (category_id, label, value, icon, display_order)
SELECT id, 'Tarjeta', 'card', 'CreditCard', 7
FROM lookup_categories WHERE slug = 'payment_method'
WHERE NOT EXISTS (
  SELECT 1 FROM lookup_values lv
  WHERE lv.category_id = (SELECT id FROM lookup_categories WHERE slug = 'payment_method')
    AND lv.value = 'card' AND lv.organization_id IS NULL
);
