-- ═══════════════════════════════════════════════════════════════════
-- MIGRATION 234: WhatsApp Embedded Signup (Meta) — columnas de soporte
--
-- El flujo "Conectar con Facebook" (Facebook Login for Business +
-- Embedded Signup) reemplaza la digitación manual de credenciales:
-- Meta devuelve un business token + waba_id + phone_number_id y el
-- servidor los guarda por el MISMO camino que el wizard manual
-- (lib/whatsapp/config-store.ts, token cifrado AES-256-GCM).
-- Estas columnas registran lo que el flujo manual no necesitaba:
--
--   connected_via        → 'manual' | 'embedded_signup'. Con qué camino
--                          se obtuvo el token (para soporte y para saber
--                          si aplica re-onboarding vía popup).
--   coexistence          → true = la clínica eligió "mantener mi app de
--                          WhatsApp Business" (featureType
--                          whatsapp_business_app_onboarding): el número
--                          sigue vivo en su celular ADEMÁS de la API.
--   register_pin         → PIN de 6 dígitos generado por Yenda para
--                          POST /<phone_number_id>/register (verificación
--                          en dos pasos de Cloud API). Cifrado a nivel
--                          app (lib/encryption.ts), igual que access_token.
--   registration_status  → 'registered' | 'pending'. En Coexistence el
--                          register puede fallar/no aplicar porque el
--                          número ya está activo en la app del celular:
--                          'pending' = conexión guardada con registro
--                          best-effort pendiente. NULL = flujo manual
--                          (no gestionamos el register).
--   display_phone_number → número legible (+51 ...) según Meta, para
--                          mostrar en la card de Integraciones.
--   verified_name        → nombre verificado del negocio según Meta.
--
-- Additive + idempotente — safe to re-run en una base viva.
-- NO se aplica desde el CLI: el founder la pega a mano.
-- ═══════════════════════════════════════════════════════════════════

ALTER TABLE whatsapp_config
  ADD COLUMN IF NOT EXISTS connected_via text NOT NULL DEFAULT 'manual'
    CHECK (connected_via IN ('manual', 'embedded_signup')),
  ADD COLUMN IF NOT EXISTS coexistence boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS register_pin text,
  ADD COLUMN IF NOT EXISTS registration_status text
    CHECK (registration_status IN ('registered', 'pending')),
  ADD COLUMN IF NOT EXISTS display_phone_number text,
  ADD COLUMN IF NOT EXISTS verified_name text;
