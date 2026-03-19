-- Rename Spanish-named patient fields to English for consistency
-- Safe rename: preserves all data, only changes column names

ALTER TABLE patients RENAME COLUMN viene_desde TO referral_source;
ALTER TABLE patients RENAME COLUMN adicional_1 TO custom_field_1;
ALTER TABLE patients RENAME COLUMN adicional_2 TO custom_field_2;
