-- =============================================
-- Seed: Complete payment methods with icons
-- Adds missing payment methods (Plin, Transferencia, Link de pago, Visa/Tarjeta)
-- and sets icon field for all so the UI can render them dynamically.
-- =============================================

-- Update existing payment methods with icons
UPDATE lookup_values
SET icon = 'Banknote'
WHERE category_id = (SELECT id FROM lookup_categories WHERE slug = 'payment_method')
  AND value = 'cash';

UPDATE lookup_values
SET icon = 'Smartphone'
WHERE category_id = (SELECT id FROM lookup_categories WHERE slug = 'payment_method')
  AND value = 'yape';

UPDATE lookup_values
SET icon = 'CreditCard', label = 'Visa/Tarjeta'
WHERE category_id = (SELECT id FROM lookup_categories WHERE slug = 'payment_method')
  AND value = 'visa';

-- Insert missing payment methods
INSERT INTO lookup_values (category_id, label, value, icon, display_order)
SELECT id, 'Plin', 'plin', 'Smartphone', 4 FROM lookup_categories WHERE slug = 'payment_method'
ON CONFLICT (category_id, value) DO NOTHING;

INSERT INTO lookup_values (category_id, label, value, icon, display_order)
SELECT id, 'Transferencia', 'transfer', 'Building2', 5 FROM lookup_categories WHERE slug = 'payment_method'
ON CONFLICT (category_id, value) DO NOTHING;

INSERT INTO lookup_values (category_id, label, value, icon, display_order)
SELECT id, 'Link de pago', 'payment_link', 'Link2', 6 FROM lookup_categories WHERE slug = 'payment_method'
ON CONFLICT (category_id, value) DO NOTHING;
