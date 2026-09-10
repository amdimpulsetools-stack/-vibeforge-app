-- Rollback 258. Restaura la policy de la mig 053 EXACTAMENTE como estaba
-- (sin `TO authenticated` y sin `WITH CHECK`), con lo que vuelve el agujero
-- de §5.6: cualquier miembro ACTIVO de la organización —recepción incluida—
-- puede hacer UPDATE de cualquier receta por PostgREST.
--
-- Nada de la aplicación depende de que ese agujero exista: el único UPDATE
-- que hace la app (`PATCH /api/prescriptions/[id]` → suspender/reactivar) lo
-- lanzan owner, admin o doctor, que siguen cubiertos por la policy antigua.
-- Este rollback afloja, no repara.

DROP POLICY IF EXISTS "prescriptions_update" ON prescriptions;
CREATE POLICY "prescriptions_update" ON prescriptions
  FOR UPDATE USING (organization_id IN (SELECT get_user_org_ids()));
