-- ============================================================
-- Migración 214 — Módulo Caja: turnos y arqueo (F3 del plan 15-ago)
--
-- Pendiente de aplicar en producción (la aplica el orquestador).
--
-- La 213 dejó las columnas dormidas en `patient_payments`
-- (source/cash_shift_id/created_by/tender_kind) y un trigger que solo
-- estampaba autor y tipo de medio. Aquí llegan las tres tablas del
-- módulo y el trigger termina su trabajo: vincular cada cobro al turno
-- abierto de quien lo digita.
--
-- Tres invariantes gobiernan todo lo que sigue:
--
--   1. COBRAR NUNCA DEPENDE DE LA CAJA. `caja_stamp_payment` jamás
--      rechaza un INSERT: sin módulo activo, sin turno abierto o con el
--      turno de otra persona, el pago se graba igual con
--      cash_shift_id NULL. La recepcionista no puede quedarse sin poder
--      cobrar porque olvidó abrir caja.
--
--   2. LA FILA DE `cash_settings` ES EL INTERRUPTOR. Sin fila, la org
--      se comporta exactamente como hoy (el trigger hace RETURN NEW en
--      la primera consulta). Con fila, el módulo está encendido. Cero
--      backfill, cero cambio para las ~N orgs que no lo usan.
--
--   3. EL EFECTIVO ES LO ÚNICO QUE SE ARQUEA. La diferencia solo existe
--      sobre efectivo:
--        esperado = opening_float
--                 + Σ patient_payments.amount  (turno, tender='efectivo')
--                 + Σ cash_movements.amount    (turno, tender='efectivo')
--      Los medios electrónicos se comparan (expected_by_method vs
--      counted_by_method) pero no producen faltante ni sobrante: ese
--      dinero no pasa por el cajón.
--
-- Los cuatro formularios de cobro existentes (appointment-sidebar,
-- appointment-form-modal, patient-drawer, budgets-panel) NO se tocan.
-- La vinculación es 100% del trigger, por diseño: cuatro formularios que
-- recuerdan atar el turno son cuatro sitios donde se puede olvidar.
-- ============================================================

-- ── 1. Ajustes por organización — el interruptor del módulo ─────
CREATE TABLE IF NOT EXISTS cash_settings (
  organization_id       uuid PRIMARY KEY REFERENCES organizations(id) ON DELETE CASCADE,

  -- 'user': cada persona abre y cierra SU caja (clínica con dos
  -- recepcionistas en el mismo mostrador, cada una con su cajón).
  -- 'organization': una sola caja por clínica, la abre quien llega
  -- primero y todo cobro del día cae ahí.
  shift_scope           text NOT NULL DEFAULT 'user'
                        CHECK (shift_scope IN ('user','organization')),

  -- Arqueo ciego: quien cuenta no ve el esperado hasta haber contado.
  -- Es el control anti-cuadre: sabiendo el número, un faltante se
  -- "corrige" escribiendo la cifra correcta en vez de contando.
  require_blind_count   boolean NOT NULL DEFAULT true,

  default_opening_float numeric(12,2) NOT NULL DEFAULT 0
                        CHECK (default_opening_float >= 0),

  -- Diferencia que NO se considera incidente (redondeos de sencillo).
  -- Por encima, el cierre exige motivo escrito.
  difference_tolerance  numeric(12,2) NOT NULL DEFAULT 0
                        CHECK (difference_tolerance >= 0),

  -- Frontera del módulo: los pagos anteriores a esta fecha nunca
  -- tuvieron turno y no deben aparecer en la bandeja "fuera de turno".
  activated_at          timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

DROP TRIGGER IF EXISTS trg_cash_settings_updated_at ON cash_settings;
CREATE TRIGGER trg_cash_settings_updated_at
  BEFORE UPDATE ON cash_settings
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ── 2. Turnos ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS cash_shifts (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  -- Informativo: en qué sede se abrió. NO participa en la unicidad del
  -- turno (dos sedes con una sola caja lógica es una decisión de
  -- shift_scope, no de office_id).
  office_id        uuid REFERENCES offices(id) ON DELETE SET NULL,

  status           text NOT NULL DEFAULT 'open' CHECK (status IN ('open','closed')),

  opened_at        timestamptz NOT NULL DEFAULT now(),
  -- RESTRICT y no SET NULL: un turno sin autor es un arqueo sin
  -- responsable. Si hay que dar de baja al usuario, primero se resuelve
  -- qué pasa con sus turnos.
  opened_by        uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  opening_float    numeric(12,2) NOT NULL DEFAULT 0 CHECK (opening_float >= 0),
  opening_notes    text,

  -- Clave de exclusión: `opened_by` si shift_scope='user',
  -- `organization_id` si shift_scope='organization'. La llena el RPC
  -- caja_open_shift (mig 215) leyendo cash_settings — vive como columna
  -- y no como expresión porque el índice parcial UNIQUE tiene que ser
  -- inmutable y cambiar el scope no puede invalidar turnos ya abiertos.
  scope_key        uuid NOT NULL,

  closed_at        timestamptz,
  closed_by        uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  -- true = lo cerró un admin que no fue quien lo abrió. No es un error:
  -- es un hecho que el historial debe mostrar.
  force_closed     boolean NOT NULL DEFAULT false,

  -- Lo que la persona CONTÓ.
  counted_cash     numeric(12,2) CHECK (counted_cash IS NULL OR counted_cash >= 0),
  counted_by_method jsonb,

  -- Lo que el sistema ESPERABA, congelado al cerrar. Congelado a
  -- propósito: un pago adjuntado después (caja_attach_payment) o una
  -- edición de notas no puede reescribir el arqueo de ayer.
  expected_cash      numeric(12,2),
  expected_by_tender jsonb,
  expected_by_method jsonb,
  payments_count     integer,

  -- Derivada, jamás digitada. Un faltante no se puede "arreglar"
  -- editando este número porque no se puede escribir.
  difference_cash  numeric(12,2)
                   GENERATED ALWAYS AS (counted_cash - expected_cash) STORED,

  closing_notes    text,
  difference_reason text,

  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),

  -- Un turno cerrado tiene arqueo completo o no está cerrado.
  CONSTRAINT cash_shift_closed_chk CHECK (
    status <> 'closed'
    OR (closed_at IS NOT NULL AND closed_by IS NOT NULL
        AND counted_cash IS NOT NULL AND expected_cash IS NOT NULL)
  ),
  -- Un turno abierto no tiene arqueo: nadie puede "pre-cuadrar".
  CONSTRAINT cash_shift_open_chk CHECK (
    status <> 'open'
    OR (closed_at IS NULL AND counted_cash IS NULL AND expected_cash IS NULL)
  ),
  -- LA REGLA: toda diferencia lleva firma. El RPC de cierre exige motivo
  -- del humano cuando supera la tolerancia y estampa uno automático
  -- ("dentro de tolerancia") por debajo — así este CHECK aguanta venga
  -- la escritura de donde venga, incluido SQL a mano.
  CONSTRAINT cash_shift_diff_reason_chk CHECK (
    status = 'open'
    OR counted_cash = expected_cash
    OR btrim(coalesce(difference_reason,'')) <> ''
  )
);

-- El invariante que hace imposible el doble turno: dos aperturas
-- concurrentes chocan aquí, no en un SELECT-antes-de-INSERT que dos
-- transacciones simultáneas pasan las dos.
CREATE UNIQUE INDEX IF NOT EXISTS cash_shifts_one_open_per_scope
  ON cash_shifts (organization_id, scope_key) WHERE status = 'open';

CREATE INDEX IF NOT EXISTS idx_cash_shifts_org_opened
  ON cash_shifts (organization_id, opened_at DESC);
CREATE INDEX IF NOT EXISTS idx_cash_shifts_org_open
  ON cash_shifts (organization_id) WHERE status = 'open';
CREATE INDEX IF NOT EXISTS idx_cash_shifts_opened_by
  ON cash_shifts (opened_by);

DROP TRIGGER IF EXISTS trg_cash_shifts_updated_at ON cash_shifts;
CREATE TRIGGER trg_cash_shifts_updated_at
  BEFORE UPDATE ON cash_shifts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ── 3. Movimientos de caja — append-only ────────────────────────
-- Todo el dinero que entra o sale del cajón SIN ser un cobro a un
-- paciente: el taxi de la muestra, la compra de papel, el depósito al
-- banco a media tarde.
CREATE TABLE IF NOT EXISTS cash_movements (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  -- RESTRICT: borrar un turno con movimientos es borrar el rastro del
  -- dinero. Los turnos no se borran.
  shift_id        uuid NOT NULL REFERENCES cash_shifts(id) ON DELETE RESTRICT,

  movement_type   text NOT NULL CHECK (movement_type IN
                    ('ingreso','reposicion','egreso','sangria','devolucion')),

  -- MONTO CON SIGNO, mismo criterio que inventory_movements.quantity
  -- (mig 209): el esperado del arqueo es UN SOLO SUM sin CASE, así que
  -- un bug de signo en la app no puede corromper el cuadre.
  amount          numeric(12,2) NOT NULL CHECK (amount <> 0),

  tender_kind     text NOT NULL DEFAULT 'efectivo'
                  CHECK (tender_kind IN ('efectivo','electronico','otro')),

  reason_code     text CHECK (reason_code IN (
                    'compra_insumos','movilidad','servicios','adelanto_personal',
                    'deposito_banco','devolucion_paciente','ajuste','otro')),
  notes           text,

  patient_id      uuid REFERENCES patients(id) ON DELETE SET NULL,
  payment_id      uuid REFERENCES patient_payments(id) ON DELETE SET NULL,

  -- Corrección = contra-movimiento, igual que el kardex de Almacén.
  reverses_movement_id uuid UNIQUE REFERENCES cash_movements(id) ON DELETE RESTRICT,

  created_at      timestamptz NOT NULL DEFAULT now(),
  created_by      uuid REFERENCES auth.users(id) ON DELETE SET NULL,

  CONSTRAINT cash_mov_sign_chk CHECK (
      (movement_type IN ('ingreso','reposicion')             AND amount > 0)
   OR (movement_type IN ('egreso','sangria','devolucion')    AND amount < 0)
  ),
  -- Plata que sale del cajón sin motivo tipificado es exactamente el
  -- agujero que este módulo existe para cerrar.
  CONSTRAINT cash_mov_reason_chk CHECK (
    movement_type NOT IN ('egreso','devolucion') OR reason_code IS NOT NULL
  ),
  -- Una devolución siempre tiene destinatario: o el paciente o el pago
  -- que se está devolviendo.
  CONSTRAINT cash_mov_devolucion_ref_chk CHECK (
    movement_type <> 'devolucion' OR patient_id IS NOT NULL OR payment_id IS NOT NULL
  ),
  CONSTRAINT cash_mov_self_rev_chk CHECK (
    reverses_movement_id IS NULL OR reverses_movement_id <> id
  )
);

CREATE INDEX IF NOT EXISTS idx_cash_movements_shift
  ON cash_movements (shift_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_cash_movements_org_created
  ON cash_movements (organization_id, created_at DESC);

-- Append-only en la BASE, no solo en RLS (patrón mig 209): service_role
-- bypassa RLS pero no bypassa un trigger.
CREATE OR REPLACE FUNCTION cash_movements_append_only()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  RAISE EXCEPTION
    'cash_movements es append-only. Corrige con un contra-movimiento (reverses_movement_id); nunca con UPDATE/DELETE.';
END $$;

REVOKE ALL ON FUNCTION cash_movements_append_only() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_cash_movements_append_only ON cash_movements;
CREATE TRIGGER trg_cash_movements_append_only
  BEFORE UPDATE OR DELETE ON cash_movements
  FOR EACH ROW EXECUTE FUNCTION cash_movements_append_only();

-- Un turno cerrado está cerrado: su esperado quedó congelado y un
-- movimiento posterior lo dejaría descuadrado para siempre.
CREATE OR REPLACE FUNCTION cash_movements_block_closed_shift()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_status text;
BEGIN
  SELECT status INTO v_status FROM cash_shifts WHERE id = NEW.shift_id;
  IF v_status IS NULL THEN
    RAISE EXCEPTION 'El turno de caja indicado no existe.' USING ERRCODE = 'foreign_key_violation';
  END IF;
  IF v_status <> 'open' THEN
    RAISE EXCEPTION 'La caja ya está cerrada: no se pueden registrar movimientos en un turno cerrado.'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;

REVOKE ALL ON FUNCTION cash_movements_block_closed_shift() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_cash_movements_open_shift ON cash_movements;
CREATE TRIGGER trg_cash_movements_open_shift
  BEFORE INSERT ON cash_movements
  FOR EACH ROW EXECUTE FUNCTION cash_movements_block_closed_shift();

-- ── 4. La FK que la 213 no pudo crear ───────────────────────────
-- RESTRICT: borrar un turno con pagos colgando dejaría los cobros
-- huérfanos de arqueo.
DO $$ BEGIN
  ALTER TABLE patient_payments
    ADD CONSTRAINT patient_payments_shift_fk
    FOREIGN KEY (cash_shift_id) REFERENCES cash_shifts(id) ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── 5. El trigger de la 213 termina su trabajo ──────────────────
-- Misma función (el trigger trg_patient_payments_stamp ya la apunta),
-- ahora con la vinculación al turno. Pasa a SECURITY DEFINER porque
-- lee cash_settings y cash_shifts, tablas cuya RLS no le sirve: el
-- trigger tiene que ver el turno para atarlo, incluso cuando quien
-- cobra no podría leerlo.
--
-- Lo que NO hace, y es lo importante: nunca rechaza. Sin fila en
-- cash_settings sale en la primera consulta; sin turno abierto deja
-- cash_shift_id en NULL y el pago se graba igual. Esos pagos aparecen
-- luego en la bandeja "Fuera de turno" para que un admin los atribuya.
CREATE OR REPLACE FUNCTION caja_stamp_payment()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_scope text;
  v_shift uuid;
BEGIN
  IF NEW.created_by IS NULL THEN
    NEW.created_by := auth.uid();  -- NULL con service_role: correcto
  END IF;
  IF NEW.tender_kind IS NULL THEN
    NEW.tender_kind := caja_classify_tender(NEW.payment_method);
  END IF;

  -- Ya viene atado (POS de Farmacia, caja_attach_payment, importador):
  -- se respeta. El trigger no reasigna turnos.
  IF NEW.cash_shift_id IS NOT NULL THEN
    RETURN NEW;
  END IF;

  SELECT shift_scope INTO v_scope
    FROM cash_settings
   WHERE organization_id = NEW.organization_id;

  -- Org sin módulo Caja: cero cambio de comportamiento.
  IF v_scope IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT s.id INTO v_shift
    FROM cash_shifts s
   WHERE s.organization_id = NEW.organization_id
     AND s.status = 'open'
     AND (v_scope = 'organization' OR s.opened_by = auth.uid())
   ORDER BY s.opened_at DESC
   LIMIT 1;

  -- Puede quedar NULL. El pago SE GRABA igual: cobrar jamás depende
  -- de que la caja esté abierta.
  NEW.cash_shift_id := v_shift;
  RETURN NEW;
END $$;

REVOKE ALL ON FUNCTION caja_stamp_payment() FROM PUBLIC, anon, authenticated;

-- ── 6. Un turno cerrado no se reescribe por la espalda ──────────
-- Sin esto, editar el monto de un pago de ayer descuadra un arqueo ya
-- firmado y nadie se entera. Emitir el comprobante después del cierre,
-- en cambio, es legítimo y frecuente: einvoice_id y notes sí cambian.
CREATE OR REPLACE FUNCTION caja_protect_closed_shift()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_status text;
BEGIN
  IF OLD.cash_shift_id IS NOT NULL THEN
    SELECT status INTO v_status FROM cash_shifts WHERE id = OLD.cash_shift_id;
  END IF;

  -- Sin turno o con el turno abierto: el pago se edita como siempre.
  IF v_status IS DISTINCT FROM 'closed' THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
  END IF;

  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION
      'Este pago pertenece a una caja ya cerrada y no se puede eliminar. Registra una devolución o un movimiento de caja en el turno abierto.'
      USING ERRCODE = 'check_violation';
  END IF;

  IF NEW.amount         IS DISTINCT FROM OLD.amount
  OR NEW.payment_method IS DISTINCT FROM OLD.payment_method
  OR NEW.tender_kind    IS DISTINCT FROM OLD.tender_kind
  OR NEW.payment_date   IS DISTINCT FROM OLD.payment_date
  OR NEW.cash_shift_id  IS DISTINCT FROM OLD.cash_shift_id THEN
    RAISE EXCEPTION
      'Este pago pertenece a una caja ya cerrada: no se puede cambiar el monto, el método, la fecha ni el turno. Corrige con un movimiento de caja en el turno abierto.'
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END $$;

REVOKE ALL ON FUNCTION caja_protect_closed_shift() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_patient_payments_protect_shift ON patient_payments;
CREATE TRIGGER trg_patient_payments_protect_shift
  BEFORE UPDATE OR DELETE ON patient_payments
  FOR EACH ROW EXECUTE FUNCTION caja_protect_closed_shift();

-- ── 7. RLS ──────────────────────────────────────────────────────
-- Turnos y movimientos son datos de responsabilidad personal: cada
-- quien ve LO SUYO, el admin ve todo. Sin policies de escritura sobre
-- cash_shifts a propósito: abrir y cerrar caja pasa por los RPC de la
-- 215, que son los que validan rol, calculan el esperado y congelan el
-- arqueo. Una policy de UPDATE aquí sería la puerta trasera que permite
-- cuadrar una caja a mano.
ALTER TABLE cash_settings  ENABLE ROW LEVEL SECURITY;
ALTER TABLE cash_shifts    ENABLE ROW LEVEL SECURITY;
ALTER TABLE cash_movements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members read own cash_shifts"
  ON cash_shifts FOR SELECT
  USING (
    organization_id IN (SELECT get_user_org_ids())
    AND (opened_by = auth.uid() OR is_org_admin(organization_id))
  );

CREATE POLICY "Org members read own cash_movements"
  ON cash_movements FOR SELECT
  USING (
    organization_id IN (SELECT get_user_org_ids())
    AND (
      is_org_admin(organization_id)
      OR EXISTS (
        SELECT 1 FROM cash_shifts s
         WHERE s.id = cash_movements.shift_id
           AND s.opened_by = auth.uid()
      )
    )
  );

-- INSERT directo (sin RPC) porque un movimiento no tiene invariante que
-- calcular: el signo lo garantiza un CHECK y el turno abierto lo
-- garantiza un trigger. Sin UPDATE/DELETE: la tabla es append-only.
CREATE POLICY "Org members insert cash_movements"
  ON cash_movements FOR INSERT TO authenticated
  WITH CHECK (
    organization_id IN (SELECT get_user_org_ids())
    AND created_by = auth.uid()
    AND EXISTS (
      SELECT 1 FROM cash_shifts s
       WHERE s.id = cash_movements.shift_id
         AND s.organization_id = cash_movements.organization_id
         AND s.status = 'open'
         AND (s.opened_by = auth.uid() OR is_org_admin(s.organization_id))
    )
  );

CREATE POLICY "Org members read cash_settings"
  ON cash_settings FOR SELECT
  USING (organization_id IN (SELECT get_user_org_ids()));

CREATE POLICY "Org admins write cash_settings"
  ON cash_settings FOR ALL
  USING (is_org_admin(organization_id))
  WITH CHECK (is_org_admin(organization_id));

-- ── 8. Addon oculto + precio + grants beta (patrón migs 209/210) ─
-- OJO con las dos escalas de plan, que NO son la misma:
--   · min_plan usa la escala interna del catálogo ('starter').
--   · included_from_plan usa slugs de plan ('independiente' |
--     'professional' | 'enterprise').
INSERT INTO addons (key, name, description, category, icon, is_premium, min_plan, sort_order, is_active)
VALUES (
  'caja',
  'Caja',
  'Turnos de caja y arqueo: apertura con fondo fijo, cierre con conteo contra esperado, diferencias firmadas y trazabilidad por persona.',
  'workflow',
  'wallet',
  true,
  'starter',
  22,
  false -- oculto mientras se desarrolla, como almacen (mig 209)
)
ON CONFLICT (key) DO NOTHING;

-- S/19/mes en Independiente; incluido desde Centro Médico hacia arriba.
UPDATE addons
   SET monthly_price = 19.00,
       included_from_plan = 'professional'
 WHERE key = 'caja';

-- Grants beta: las MISMAS orgs que tienen el grant de 'almacen'
-- (founder ×2 + la clínica de fertilidad piloto). El pin por nombre de
-- org que trae la 209 es lo que mantiene fuera al clon de pruebas
-- (oscarfiverr+...@gmail.com): su email no es igual, y su org tampoco
-- se llama así.
INSERT INTO organization_addons (organization_id, addon_key, enabled)
SELECT o.id, 'caja', true
FROM organizations o
JOIN user_profiles up ON up.id = o.owner_id
WHERE (up.email = 'oscarfiverr@gmail.com' AND o.name = 'Clínica de Oscar Duran')
   OR (up.email = 'amdimpulsetools@gmail.com' AND o.name = 'Centro Médico Amdimpulsetools')
   OR  up.email = 'patriciaquispefertilidad@gmail.com'
ON CONFLICT (organization_id, addon_key) DO UPDATE SET enabled = true;

-- ── Comentarios ─────────────────────────────────────────────────
COMMENT ON TABLE cash_settings IS
  'Caja F3: la FILA es el interruptor del módulo. Sin fila, caja_stamp_payment sale en la primera consulta y la org se comporta como antes de la 213.';
COMMENT ON TABLE cash_shifts IS
  'Caja F3: turnos de caja. difference_cash es GENERATED (no se puede digitar) y el esperado se congela al cerrar. Apertura/cierre solo por RPC (mig 215).';
COMMENT ON TABLE cash_movements IS
  'Caja F3: entradas y salidas de efectivo que no son cobros. Append-only por trigger. amount CON SIGNO: el esperado del arqueo es un solo SUM sin CASE.';
COMMENT ON COLUMN cash_shifts.scope_key IS
  'Mig 214: opened_by si shift_scope=user, organization_id si shift_scope=organization. Con el índice parcial UNIQUE (organization_id, scope_key) WHERE status=open es lo que hace imposible el doble turno.';
