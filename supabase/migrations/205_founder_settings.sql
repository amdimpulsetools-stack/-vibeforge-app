-- Ajustes del founder: a dónde llegan las alertas internas y cuáles se envían.
--
-- Antes de esto el destinatario se resolvía desde user_profiles.is_founder y
-- solo se podía sobreescribir con la env var FOUNDER_ALERT_EMAIL en Vercel —
-- es decir, el founder no tenía forma de VER ni CAMBIAR a dónde llegan sus
-- propios correos desde la aplicación (auditoría 2026-08-08).
--
-- Tabla singleton: una sola fila (id = true). No lleva policies a propósito:
-- con RLS activa y sin policies, PostgREST la deja inaccesible a cualquier
-- usuario; solo el service-role client (tras requireFounder + 2FA) la toca.

CREATE TABLE IF NOT EXISTS founder_settings (
  id                   boolean PRIMARY KEY DEFAULT true CHECK (id),
  -- NULL = usar el email del perfil founder (comportamiento por defecto).
  alert_email          text,
  notify_new_ticket    boolean NOT NULL DEFAULT true,
  notify_new_message   boolean NOT NULL DEFAULT true,
  notify_new_org       boolean NOT NULL DEFAULT true,
  notify_payment       boolean NOT NULL DEFAULT false,
  updated_at           timestamptz NOT NULL DEFAULT now(),
  updated_by           uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

ALTER TABLE founder_settings ENABLE ROW LEVEL SECURITY;

-- Fila única sembrada con los defaults.
INSERT INTO founder_settings (id) VALUES (true) ON CONFLICT (id) DO NOTHING;

COMMENT ON TABLE founder_settings IS
  'Singleton de ajustes internos del founder (destinatario y tipos de alerta). Sin policies: solo service-role.';
