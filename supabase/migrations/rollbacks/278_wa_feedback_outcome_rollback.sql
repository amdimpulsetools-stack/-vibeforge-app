-- Rollback 278: quita el pulgar, el resultado automático y las etiquetas
-- del sistema. ⚠ Borra las valoraciones y el texto final de las
-- sugerencias y el resultado (Agendó/Asistió) de cada conversación. Las
-- etiquetas "Agendó" / "Asistió" NO se borran: quedan como etiquetas
-- normales (y las que ya tienen los chats se conservan). Idempotente.

DROP TRIGGER IF EXISTS trg_appointments_wa_outcome_insert ON appointments;
DROP TRIGGER IF EXISTS trg_appointments_wa_outcome_update ON appointments;
DROP FUNCTION IF EXISTS wa_inbox_outcome_from_appointment();

DROP TRIGGER IF EXISTS trg_org_tags_protect_system ON org_tags;
DROP FUNCTION IF EXISTS org_tags_protect_system();
DROP INDEX IF EXISTS org_tags_org_system_uq;
ALTER TABLE org_tags DROP CONSTRAINT IF EXISTS org_tags_system_key_check;
ALTER TABLE org_tags DROP COLUMN IF EXISTS system_key;

DROP INDEX IF EXISTS idx_wa_conv_org_patient;
ALTER TABLE wa_conversations DROP CONSTRAINT IF EXISTS wa_conversations_outcome_check;
ALTER TABLE wa_conversations
  DROP COLUMN IF EXISTS outcome,
  DROP COLUMN IF EXISTS outcome_at,
  DROP COLUMN IF EXISTS outcome_appointment_id;

DROP INDEX IF EXISTS idx_wa_ai_conv_created;
ALTER TABLE wa_ai_suggestions DROP CONSTRAINT IF EXISTS wa_ai_suggestions_rating_check;
ALTER TABLE wa_ai_suggestions DROP CONSTRAINT IF EXISTS wa_ai_suggestions_rating_note_check;
ALTER TABLE wa_ai_suggestions
  DROP COLUMN IF EXISTS rating,
  DROP COLUMN IF EXISTS rating_note,
  DROP COLUMN IF EXISTS rated_by,
  DROP COLUMN IF EXISTS rated_at,
  DROP COLUMN IF EXISTS final_text;
