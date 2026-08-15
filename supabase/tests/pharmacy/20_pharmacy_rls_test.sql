-- ═══════════════════════════════════════════════════════════════════
-- RLS del módulo Farmacia (mig 216) ejecutada como un usuario REAL.
--
-- Las pruebas de invariantes (10_) corren como superusuario y por tanto
-- BYPASSAN la RLS: comprueban la aritmética y la atomicidad, no los
-- permisos. Este archivo hace lo contrario — se pone en la piel de un
-- `authenticated` cualquiera y verifica que la puerta esté cerrada.
--
-- Lo que aquí se defiende es una sola frase: una venta cerrada no se
-- toca desde el cliente, y una organización no ve la caja de otra.
-- ═══════════════════════════════════════════════════════════════════

-- Privilegios de tabla que en Supabase trae el rol `authenticated`.
-- Sin ellos la RLS ni siquiera llega a evaluarse (falla antes por GRANT).
GRANT USAGE ON SCHEMA public TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated;
-- En Supabase `authenticated` puede llamar a auth.uid(); aquí hay que
-- concederlo a mano porque el stub crea el esquema auth desde cero.
GRANT USAGE ON SCHEMA auth TO authenticated;
GRANT EXECUTE ON FUNCTION auth.uid() TO authenticated;

-- Segunda organización, con su propio usuario, para probar el aislamiento.
DO $$
DECLARE
  v_org2 uuid := '99999999-9999-9999-9999-999999999999';
  v_user2 uuid := '88888888-8888-8888-8888-888888888888';
BEGIN
  INSERT INTO auth.users (id, email) VALUES (v_user2, 'otra@clinica.com');
  INSERT INTO organizations (id, name, owner_id) VALUES (v_org2, 'Otra Clinica', v_user2);
  INSERT INTO organization_members (user_id, organization_id, role)
    VALUES (v_user2, v_org2, 'owner');
  INSERT INTO organization_addons (organization_id, addon_key, enabled)
    VALUES (v_org2, 'almacen', true);
END $$;

-- ── 1. Aislamiento entre organizaciones ─────────────────────────────
SET ROLE authenticated;
SET test.uid = '88888888-8888-8888-8888-888888888888';

DO $$
DECLARE v_seen int;
BEGIN
  SELECT count(*)::int INTO v_seen FROM pharmacy_sales
   WHERE organization_id = '11111111-1111-1111-1111-111111111111';
  IF v_seen <> 0 THEN
    RAISE EXCEPTION 'FAIL  la otra organizacion ve % ventas ajenas', v_seen;
  END IF;
  RAISE NOTICE 'PASS  una organizacion no ve las ventas de otra';
END $$;

RESET ROLE;

-- ── 2. Una venta cerrada no se muta desde el cliente ─────────────────
SET ROLE authenticated;
SET test.uid = '33333333-3333-3333-3333-333333333333';

DO $$
DECLARE
  v_sale uuid;
  v_rows int;
  v_status text;
  v_total numeric;
BEGIN
  SELECT id INTO v_sale FROM pharmacy_sales
   WHERE status = 'confirmada'
     AND organization_id = '11111111-1111-1111-1111-111111111111'
   LIMIT 1;

  IF v_sale IS NULL THEN
    RAISE EXCEPTION 'FAIL  no hay venta confirmada para la prueba';
  END IF;

  SELECT status, total INTO v_status, v_total FROM pharmacy_sales WHERE id = v_sale;

  -- No hay policy de UPDATE que alcance a una venta cerrada: la fila es
  -- INVISIBLE para el UPDATE (0 filas afectadas), no un error ruidoso.
  UPDATE pharmacy_sales SET total = 0.01 WHERE id = v_sale;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows <> 0 THEN
    RAISE EXCEPTION 'FAIL  se pudo reescribir el total de una venta cerrada';
  END IF;
  RAISE NOTICE 'PASS  el total de una venta cerrada no se puede reescribir';

  DELETE FROM pharmacy_sales WHERE id = v_sale;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows <> 0 THEN
    RAISE EXCEPTION 'FAIL  se pudo borrar una venta cerrada';
  END IF;
  RAISE NOTICE 'PASS  una venta cerrada no se puede borrar';

  -- Y sigue intacta.
  PERFORM 1 FROM pharmacy_sales
   WHERE id = v_sale AND status = v_status AND total = v_total;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'FAIL  la venta cerrada cambio pese a todo';
  END IF;
  RAISE NOTICE 'PASS  la venta cerrada quedo intacta';
END $$;

-- ── 3. Nadie se auto-confirma una venta saltándose la RPC ────────────
DO $$
DECLARE v_sale uuid; v_err boolean := false; v_rows int;
BEGIN
  -- Un borrador propio, legítimo.
  INSERT INTO pharmacy_sales (organization_id, created_by)
  VALUES ('11111111-1111-1111-1111-111111111111', auth.uid())
  RETURNING id INTO v_sale;

  -- Intentar ascenderlo a 'confirmada' a mano: el WITH CHECK lo rechaza.
  BEGIN
    UPDATE pharmacy_sales
       SET status = 'confirmada', confirmed_at = now(), sale_number = 999999
     WHERE id = v_sale;
    GET DIAGNOSTICS v_rows = ROW_COUNT;
    IF v_rows > 0 THEN
      RAISE EXCEPTION 'FAIL  un borrador se auto-confirmo sin pasar por la RPC';
    END IF;
    v_err := true;  -- 0 filas también es rechazo
  EXCEPTION WHEN insufficient_privilege THEN
    v_err := true;
  END;

  IF NOT v_err THEN
    RAISE EXCEPTION 'FAIL  el borrador se pudo confirmar a mano';
  END IF;
  RAISE NOTICE 'PASS  un borrador no se confirma sin la RPC';

  -- Insertar directamente una venta ya confirmada tampoco.
  v_err := false;
  BEGIN
    INSERT INTO pharmacy_sales (organization_id, created_by, status, confirmed_at, sale_number)
    VALUES ('11111111-1111-1111-1111-111111111111', auth.uid(), 'confirmada', now(), 888888);
  EXCEPTION WHEN insufficient_privilege THEN v_err := true;
  END;
  IF NOT v_err THEN
    RAISE EXCEPTION 'FAIL  se pudo insertar una venta ya confirmada';
  END IF;
  RAISE NOTICE 'PASS  no se puede nacer confirmada';

  DELETE FROM pharmacy_sales WHERE id = v_sale;
END $$;

-- ── 4. El correlativo no se escribe desde el cliente ─────────────────
DO $$
DECLARE v_err boolean := false;
BEGIN
  BEGIN
    UPDATE pharmacy_sale_counters SET current_number = 0
     WHERE organization_id = '11111111-1111-1111-1111-111111111111';
    -- Sin policy de UPDATE: 0 filas o error, ambos son rechazo.
    IF FOUND THEN
      RAISE EXCEPTION 'FAIL  se pudo reiniciar el correlativo';
    END IF;
    v_err := true;
  EXCEPTION WHEN insufficient_privilege THEN v_err := true;
  END;
  IF NOT v_err THEN
    RAISE EXCEPTION 'FAIL  el correlativo es escribible';
  END IF;
  RAISE NOTICE 'PASS  el correlativo no se escribe desde el cliente';
END $$;

RESET ROLE;

SELECT 'RLS: TODAS LAS PRUEBAS PASARON' AS resultado;
