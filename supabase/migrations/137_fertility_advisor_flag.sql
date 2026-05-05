-- ═══════════════════════════════════════════════════════════════════
-- MIGRATION 137: Fertility advisor flag for doctors
--
-- Adds a per-membership flag that escalates a doctor's visibility on
-- budget records and (future) fertility-specific dashboards. When a
-- doctor is flagged as fertility advisor (a.k.a. obstetra/asesora de
-- fertilidad), they can see and manage ALL budget records of the org,
-- not just their own. Owners/admins always see everything.
--
-- Also adds a JSONB metadata column to organization_invitations so the
-- inviter can pre-set this flag at invitation time and the
-- accept-invite flow can apply it on the resulting membership.
-- ═══════════════════════════════════════════════════════════════════

ALTER TABLE organization_members
  ADD COLUMN IF NOT EXISTS is_fertility_advisor BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN organization_members.is_fertility_advisor IS
  'Solo aplica si la org tiene addon fertility_basic|fertility_premium activo. Permite que un doctor también funcione como asesora de fertilidad/obstetra: ve TODOS los presupuestos de la org y los gestiona, en lugar de solo los de SUS pacientes asignados. Activable desde el form de invitación.';

ALTER TABLE organization_invitations
  ADD COLUMN IF NOT EXISTS invitation_meta JSONB NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN organization_invitations.invitation_meta IS
  'Metadata libre que el flujo de aceptación traslada al membership. Hoy soporta { is_fertility_advisor: boolean }.';
