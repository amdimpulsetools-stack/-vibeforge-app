-- 258: endurecer la RLS de UPDATE de `prescriptions` (owner/admin/doctor)
--
-- Hallazgo colateral de la spec docs/spec-receta-a-recepcion.md §5.6 — es
-- higiene preexistente, NO parte de la feature. `prescriptions_update`
-- (mig 053:96-97) es org-wide y sin `WITH CHECK`:
--
--   CREATE POLICY "prescriptions_update" ON prescriptions
--     FOR UPDATE USING (organization_id IN (SELECT get_user_org_ids()));
--
-- La UI nunca lo expuso (el botón de suspender vive tras `canEdit`), pero
-- PostgREST sí: una recepcionista con la clave pública y su propia sesión
-- puede cambiar `medication` de una receta ya firmada. El agujero existe
-- desde 2024 y es independiente de la V1 — pero la V1 le pone delante una
-- pantalla que muestra recetas, y eso acorta la distancia entre "posible" y
-- "trivial". Por eso se arregla junto con ella y no después.
--
-- Se restringe UPDATE a owner/admin/doctor: EL MISMO criterio que el servidor
-- ya aplica al CREAR (`CLINICAL_WRITE_ROLES` en app/api/prescriptions/route.ts:33,
-- "recetar es un acto médico: recepción NO receta"). Editar una receta
-- firmada es, como mínimo, tan clínico como crearla.
--
-- ── Qué protegía el USING actual, y se conserva íntegro ──────────────────
-- `get_user_org_ids()` filtra `is_active = true` desde la mig 235:43-52, así
-- que la policy vieja ya excluía a los miembros DESACTIVADOS. `is_org_admin()`
-- (235:54-66) y `get_user_org_role()` (235:68-78) filtran `is_active` igual y
-- reciben el `organization_id` de la propia fila, de modo que el aislamiento
-- por organización queda idéntico. No se afloja nada al cambiar de helper: lo
-- único que se quita es a los roles no clínicos (receptionist / assistant /
-- member, y con ellos la asesora de fertilidad, que suele ser 'member').
--
-- ── Qué se añade: WITH CHECK explícito ──────────────────────────────────
-- Sin `WITH CHECK`, Postgres reutiliza el `USING` también como comprobación
-- de la fila RESULTANTE, así que a efectos prácticos el efecto es el mismo;
-- se escribe explícito por dos razones: (1) el día que alguien afloje el
-- USING para que más gente vea una fila, no aflojará la escritura sin darse
-- cuenta; (2) iguala el estilo de `medication_catalog_write` (mig 248:66-77),
-- que ya usa este par de helpers.
--
-- Honestidad sobre su alcance: esto impide mover una receta a una org donde
-- el autor NO sea owner/admin/doctor. Lo que una policy RLS no puede expresar
-- es "que no cambie de organización", porque no ve la fila OLD: alguien con
-- rol clínico en DOS clínicas podría, por API directa, mover la fila entre
-- las suyas. Cerrar eso necesita un trigger BEFORE UPDATE y queda FUERA de
-- esta migración a propósito — no se cambian dos cosas a la vez en una tabla
-- clínica. Queda anotado, no resuelto.
--
-- ── Qué NO se toca, y por qué ───────────────────────────────────────────
--   · SELECT: recepción TIENE que poder leer la receta de la cita — es la V1
--     entera. Además el acceso ya queda auditado (`logClinicalAccess`).
--   · INSERT: el servidor ya lo cubre con CLINICAL_WRITE_ROLES.
--   · DELETE: mismo patrón org-wide, pero borrar una receta no es lo que la
--     V1 pone al alcance de nadie nuevo. Se deja como está.
--
-- ── Comprobado que NO rompe nada (evidencia) ────────────────────────────
--   · El ÚNICO UPDATE de la aplicación es `PATCH /api/prescriptions/[id]`
--     (app/api/prescriptions/[id]/route.ts:56-61), que va con el cliente del
--     USUARIO, no con service role. Su único llamador es `toggleActive` en
--     app/(dashboard)/patients/prescriptions-panel.tsx:104-116 — suspender /
--     reactivar (`is_active`) — y el botón está tras `canEdit`
--     (prescriptions-panel.tsx:284), que vale `isAdmin || !!currentDoctorId`
--     en la historia clínica del paciente (patient-drawer.tsx:2035) y
--     `currentDoctorId === appointment.doctor_id` en la agenda
--     (appointment-sidebar.tsx:2600-2603). En los dos caminos: owner, admin o
--     doctor. Suspender una receta sigue funcionando para quien ya podía.
--   · Ningún cron ni ruta con service_role escribe en `prescriptions` (y el
--     service_role salta la RLS de todos modos).
--   · `appointment_id` y `clinical_note_id` son ON DELETE SET NULL
--     (053:74-75): al borrar una cita, Postgres hace un UPDATE sobre
--     `prescriptions`. Ese UPDATE lo ejecuta el trigger de integridad
--     referencial con SECURITY_NOFORCE_RLS, así que NO pasa por estas
--     policies. Recepción sigue pudiendo borrar y cancelar citas igual.

DROP POLICY IF EXISTS "prescriptions_update" ON prescriptions;
CREATE POLICY "prescriptions_update" ON prescriptions
  FOR UPDATE TO authenticated
  USING (
    is_org_admin(organization_id)
    OR get_user_org_role(organization_id) = 'doctor'
  )
  WITH CHECK (
    is_org_admin(organization_id)
    OR get_user_org_role(organization_id) = 'doctor'
  );
