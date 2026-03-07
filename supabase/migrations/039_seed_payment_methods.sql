-- =============================================
-- Normalize payment methods: keep only universal defaults
-- Country-specific methods (Yape, Plin, etc.) should be added
-- by each organization via admin/lookups panel.
-- =============================================

-- Remove country-specific seeds from 006 (Yape, Visa)
DELETE FROM lookup_values
WHERE category_id = (SELECT id FROM lookup_categories WHERE slug = 'payment_method')
  AND value IN ('yape', 'visa');

-- Update existing "cash" with icon
UPDATE lookup_values
SET icon = 'Banknote', display_order = 1
WHERE category_id = (SELECT id FROM lookup_categories WHERE slug = 'payment_method')
  AND value = 'cash';

-- Add universal methods
INSERT INTO lookup_values (category_id, label, value, icon, display_order)
SELECT id, 'Transferencia bancaria', 'bank_transfer', 'Building2', 2
FROM lookup_categories WHERE slug = 'payment_method'
ON CONFLICT (category_id, value) DO NOTHING;

INSERT INTO lookup_values (category_id, label, value, icon, display_order)
SELECT id, 'Depósito bancario', 'bank_deposit', 'Landmark', 3
FROM lookup_categories WHERE slug = 'payment_method'
ON CONFLICT (category_id, value) DO NOTHING;

INSERT INTO lookup_values (category_id, label, value, icon, display_order)
SELECT id, 'Tarjeta', 'card', 'CreditCard', 4
FROM lookup_categories WHERE slug = 'payment_method'
ON CONFLICT (category_id, value) DO NOTHING;
