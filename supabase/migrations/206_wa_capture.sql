-- ============================================================
-- Módulo Captación — Fase 1: capturador silencioso (spec 12-ago-2026)
--
-- Hasta hoy el webhook de WhatsApp SOLO procesaba acuses de recibo
-- (statuses) y descartaba los mensajes entrantes de pacientes: un
-- "confirmo" a un recordatorio se perdía en el vacío. Estas tablas
-- guardan cada mensaje entrante con su bloque referral de Meta (qué
-- anuncio click-to-WhatsApp trajo la conversación) — el dato que
-- alimenta la atribución campaña → cita → soles de las fases 2-3.
--
-- Fase 1 = solo capturar. Sin UI de clínica: el addon `captacion`
-- (Fase 2) decide quién VE; este esquema decide qué se OYE, y oye
-- para todas las orgs con número conectado — el dato no es
-- retroactivo, cada día sin capturar se pierde.
-- ============================================================

-- Una conversación por teléfono × organización. El primer referral
-- queda congelado aquí: es EL dato de atribución (de qué anuncio
-- vino esta persona), aunque después escriba veinte veces más.
CREATE TABLE IF NOT EXISTS wa_conversations (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id         uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  -- Solo dígitos con código de país (ej. 51987654321): es la llave de
  -- cruce contra patients.phone, normalizada a la entrada.
  phone_normalized        text NOT NULL,
  display_name            text,
  first_referral_ad_id    text,
  first_referral_headline text,
  first_referral_source   text,
  first_referral_at       timestamptz,
  -- Se llena cuando el motor de atribución (Fase 2) cruce el teléfono
  -- con un paciente; NULL mientras tanto.
  patient_id              uuid REFERENCES patients(id) ON DELETE SET NULL,
  lead_status             text NOT NULL DEFAULT 'nuevo'
                          CHECK (lead_status IN ('nuevo','conversando','agendado','perdido','no_interesado')),
  last_message_at         timestamptz NOT NULL DEFAULT now(),
  created_at              timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, phone_normalized)
);

CREATE INDEX idx_wa_conv_org_last ON wa_conversations(organization_id, last_message_at DESC);
CREATE INDEX idx_wa_conv_phone ON wa_conversations(phone_normalized);

-- Cada mensaje entrante. wamid es único: Meta reintenta webhooks y,
-- con varias apps suscritas a la misma WABA, cada una recibe su propio
-- ciclo de reintentos — sin esta llave el capturador duplicaría.
CREATE TABLE IF NOT EXISTS wa_inbound_messages (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES wa_conversations(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  wamid           text NOT NULL UNIQUE,
  message_type    text NOT NULL DEFAULT 'text',
  -- Cuerpo en texto plano; multimedia (Fase 3) guardará solo la
  -- referencia, nunca el binario.
  body            text,
  referral_json   jsonb,
  received_at     timestamptz NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_wa_inbound_conv ON wa_inbound_messages(conversation_id, received_at);
CREATE INDEX idx_wa_inbound_org_received ON wa_inbound_messages(organization_id, received_at DESC);

-- RLS: los miembros de la org leen lo suyo (la UI de Fase 2/3 lo
-- necesitará); INSERT/UPDATE solo vía service role desde el webhook —
-- ninguna policy de escritura a propósito.
ALTER TABLE wa_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE wa_inbound_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members read own org wa_conversations"
  ON wa_conversations FOR SELECT TO authenticated
  USING (organization_id IN (
    SELECT organization_id FROM organization_members WHERE user_id = auth.uid()
  ));

CREATE POLICY "Members read own org wa_inbound_messages"
  ON wa_inbound_messages FOR SELECT TO authenticated
  USING (organization_id IN (
    SELECT organization_id FROM organization_members WHERE user_id = auth.uid()
  ));

COMMENT ON TABLE wa_conversations IS
  'Captación F1: una conversación WhatsApp entrante por teléfono×org, con el referral de campaña Meta congelado al primer contacto.';
COMMENT ON TABLE wa_inbound_messages IS
  'Captación F1: mensajes entrantes crudos del webhook. Idempotencia por wamid (Meta reintenta). Escritura solo service-role.';
