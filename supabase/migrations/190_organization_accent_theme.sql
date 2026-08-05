-- ═══════════════════════════════════════════════════════════════════
-- MIGRATION 190: tema de color de acento por organización
--
-- ── Qué habilita ──────────────────────────────────────────────────
-- El dashboard deja de ser siempre verde esmeralda. Cada clínica elige
-- entre tres acentos de MARCA:
--
--   emerald  Esmeralda  (default — el look actual, cero cambio visual)
--   ocean    Océano     (celeste)
--   sand     Arena      (arena → terracota)
--
-- El mecanismo vive arriba, no aquí: Tailwind 4 compila `bg-emerald-500`
-- a `background-color: var(--color-emerald-500)`, así que
-- `app/(dashboard)/layout.tsx` inyecta un <style> server-rendered que
-- redefine `--color-emerald-50..950` + los tokens shadcn de marca
-- (--primary/--ring/--glow-primary) con la paleta elegida. Esta columna
-- es SOLO la persistencia de esa elección.
--
-- ── Por qué el default es 'emerald' y no NULL ─────────────────────
-- NOT NULL DEFAULT 'emerald' hace que las orgs existentes queden
-- exactamente donde están hoy, sin backfill y sin que el layout tenga
-- que distinguir "no eligió" de "eligió esmeralda": el server sólo emite
-- el <style> cuando el valor NO es 'emerald', así que el caso por
-- defecto no paga ni un byte extra de CSS.
--
-- ── Por qué el CHECK importa ──────────────────────────────────────
-- El valor viaja de la BD a un mapa ESTÁTICO de CSS literal
-- (lib/theme/accent-themes.ts) y nunca se interpola dentro del <style>,
-- así que una fila corrupta no puede inyectar CSS — el layout valida
-- contra las claves del mapa y cae a 'emerald'. El CHECK es la segunda
-- barrera: impide que la fila corrupta exista.
--
-- ── Autorización ──────────────────────────────────────────────────
-- No se toca RLS: la policy de UPDATE de `organizations` (mig 013) ya
-- restringe la escritura a owner/admin de la org. La UI de Settings
-- además sólo muestra el selector al owner.
--
-- Aditiva e idempotente. Sin backfill (el DEFAULT ya lo cubre).
-- Rollback:
--   ALTER TABLE organizations
--     DROP CONSTRAINT IF EXISTS organizations_accent_theme_check;
--   ALTER TABLE organizations DROP COLUMN IF EXISTS accent_theme;
-- ═══════════════════════════════════════════════════════════════════

ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS accent_theme TEXT NOT NULL DEFAULT 'emerald';

-- El CHECK va por separado y guardado: `ADD COLUMN IF NOT EXISTS` no
-- reaplica la restricción inline si la columna ya existía, y
-- `ADD CONSTRAINT` no acepta IF NOT EXISTS en Postgres.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'organizations_accent_theme_check'
  ) THEN
    ALTER TABLE organizations
      ADD CONSTRAINT organizations_accent_theme_check
      CHECK (accent_theme IN ('emerald', 'ocean', 'sand'));
  END IF;
END $$;

COMMENT ON COLUMN organizations.accent_theme IS
  'Acento de MARCA del dashboard: emerald (Esmeralda, default) | ocean (Océano) | sand (Arena). Sólo recolorea la marca — los colores semánticos (success/destructive/warning/info) NO dependen de este valor. Paletas en lib/theme/accent-themes.ts.';
