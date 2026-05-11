# P0 — Fuga cross-tenant en Portal del Paciente (F-01 / F-02)

**Fecha:** 2026-05-11
**Auditor:** Senior Security Engineer (revisión asistida)
**Alcance:** rutas bajo `app/api/portal/**` que usan `createAdminClient()` (service-role, salta RLS).
**Modo:** read-only. No se modificó código.

---

## 1. Estado actual y planteamiento del problema

Al releer los archivos efectivamente desplegados en la rama `claude/add-terms-privacy-fH9H7`, ambos hallazgos del MVP readiness audit (`docs/research/yenda-base-mvp-readiness-2026-05-06.md`) y de `docs/security-review-2026-04-22.md` **ya tienen el parche aplicado en código**, con comentarios marcados `SECURITY (F-01)` / `SECURITY (F-02)`. Sin embargo, conviene documentar la corrección, validar regresiones equivalentes y dejar el plan de prueba — ya que la propia presencia de los comentarios indica que el patrón es frágil y se puede reintroducir.

### F-01 — `app/api/portal/plans/route.ts:41-45`
```ts
const { data: payments } = await supabase
  .from("patient_payments")
  .select("treatment_plan_id, amount")
  .eq("organization_id", session.organization_id)   // mitiga F-01
  .in("treatment_plan_id", planIds);
```
La consulta usa `createAdminClient()` (RLS off). Sin el `.eq("organization_id", ...)` cualquier colisión de `treatment_plan_id` (importaciones, restores, semillas) devolvería pagos de otra organización al paciente. El filtro adicional sugerido en el security review (`.eq("patient_id", session.patient_id)`) **no está aplicado** y debería añadirse como defensa en profundidad.

### F-02 — `app/api/portal/appointments/cancel/route.ts:84-90`
```ts
const { error } = await supabase
  .from("appointments")
  .update({ status: "cancelled" })
  .eq("id", appointment_id)
  .eq("patient_id", session.patient_id)
  .eq("organization_id", session.organization_id)
  .in("status", ["scheduled", "confirmed"]);
```
El UPDATE ya repite las constraints de patient+org y restringe el status. Cierra el TOCTOU descrito en F-02.

> **Nota:** el path original referido como `app/api/portal/plans/cancel/route.ts` **no existe** en el árbol; el archivo correcto es `appointments/cancel`. El audit MVP lo documentó mal.

## 2. Causa raíz

`createAdminClient()` retorna el cliente con service-role key, que **omite RLS** por diseño. El patrón predominante en `app/api/portal/**` es: (a) leer la sesión con `getPortalSession(slug)`, (b) instanciar admin client, (c) consultar/mutar la tabla. El paso (c) tiene que **re-asertar** `organization_id` y `patient_id` en cada consulta porque no hay red de seguridad RLS. El bug se introdujo por confiar en un filtro previo (los `planIds` vienen de un SELECT scoped) y olvidar que admin-client no propaga ningún contexto de tenant.

## 3. Diff propuesto — refuerzo adicional

### 3.1 `app/api/portal/plans/route.ts` (defensa en profundidad)
```diff
   const { data: payments } = await supabase
     .from("patient_payments")
     .select("treatment_plan_id, amount")
     .eq("organization_id", session.organization_id)
+    .eq("patient_id", session.patient_id)
     .in("treatment_plan_id", planIds);
```

### 3.2 `app/api/portal/register/route.ts:57-64` (regresión equivalente detectada)
El UPDATE sobre `patients` cuando ya existe un DNI **no** repite `organization_id` (aunque el SELECT previo sí lo hace, mismo patrón TOCTOU/admin-client que F-02):
```diff
     await supabase
       .from("patients")
       .update({
         portal_email: email,
         portal_phone: phone.trim(),
         portal_verified_at: new Date().toISOString(),
       })
-      .eq("id", existingByDni.id);
+      .eq("id", existingByDni.id)
+      .eq("organization_id", session.organization_id);
```

### 3.3 No se requieren cambios en
- `app/api/portal/appointments/route.ts` — ya filtra por patient+org.
- `app/api/portal/appointments/cancel/route.ts` — ya parchado (F-02).
- `app/api/portal/profile/route.ts:38-42` — UPDATE ya con `.eq("organization_id", ...)`.

## 4. Plan de prueba (manual)

1. **Setup:** crear organizaciones `org-A` y `org-B`, cada una con un paciente y un `treatment_plan` activo. Insertar manualmente en `patient_payments` una fila para org-B reutilizando el `treatment_plan_id` de org-A (simulación de colisión).
2. **F-01:** loguearse al portal de org-A como paciente A. `GET /api/portal/plans?slug=org-a`. Verificar que `paid` solo contiene el monto pagado por A en org-A; los pagos de org-B no deben aparecer (suma `paid` igual a 0 para ese plan si no hubo pagos en A).
3. **F-02:** con la sesión cookie de org-A, hacer `POST /api/portal/appointments/cancel` enviando `appointment_id` de una cita real de org-B (UUID conocido). Esperado: `404 cita no encontrada` y la cita de org-B sigue con `status='scheduled'` en DB.
4. **Register hardening:** loguearse al portal de org-A sin `patient_id` linkeado, hacer `POST /api/portal/register` con un DNI que existe en org-B. Esperado: se crea/actualiza solo dentro de org-A, no se muta el registro de org-B.
5. **Regresión RLS:** ejecutar `SELECT count(*) FROM patient_payments WHERE patient_id = '<paciente_a>'` desde el dashboard SQL de Supabase como rol `authenticated` falsificando el `request.jwt.claims` para org-B. Debe retornar 0.

## 5. Evaluación de riesgo

| Atributo | Valor |
|----------|-------|
| Severidad | P0 (PHI cross-tenant + datos financieros) |
| Probabilidad de explotación | Baja-Media: requiere colisión de UUID o adivinanza de UUID válido + sesión activa de portal. La ruta de descubrimiento más probable es por **import/restore mal hecho** (UUID reutilizado), no por enumeración. |
| Vector | Autenticado por portal (paciente) → otra organización |
| ¿Bloqueante para lanzamiento público? | **Sí, must-fix.** Las correcciones F-01 y F-02 ya están en código. Falta merge del refuerzo `.eq("patient_id", ...)` en plans y `.eq("organization_id", ...)` en register. |
| Tiempo estimado de implementación | 15 minutos de edición + 30 minutos de QA manual |

## 6. Workaround mientras se valida (gate de feature flag)

Hasta que el QA del punto 4 esté firmado, recomendar que las nuevas organizaciones tengan el portal **desactivado por defecto**. La columna ya existe: `booking_settings.portal_enabled` (ver `app/(dashboard)/settings/booking-settings-tab.tsx:29` y migración `093_patient_portal.sql`).

Acciones concretas:
1. **Default en DB:** verificar que `booking_settings.portal_enabled` tenga `DEFAULT false` para nuevas filas. Si no, agregar migración: `ALTER TABLE booking_settings ALTER COLUMN portal_enabled SET DEFAULT false;`
2. **Gate en sidebar / landing:** en `app/portal/[slug]/page.tsx` (y rutas hijas) leer `booking_settings.portal_enabled` y devolver 404 si está apagado. Hoy varias rutas confían en `portal_allow_cancel` pero **no** chequean `portal_enabled` como kill-switch global.
3. **Gate en API:** añadir al inicio de cada handler de `app/api/portal/**` (excepto `auth/*`) una verificación tipo:
   ```ts
   const { data: bs } = await supabase
     .from("booking_settings")
     .select("portal_enabled")
     .eq("organization_id", session.organization_id)
     .single();
   if (!bs?.portal_enabled) {
     return NextResponse.json({ error: "portal_disabled" }, { status: 403 });
   }
   ```
4. **Comunicación:** notificar a las clínicas piloto (Vitra) que el portal queda en beta privada hasta el sign-off del audit; activarlo manualmente vía settings cuando el equipo lo pida.

---

**Archivos relevantes**
- `/home/user/-vibeforge-app/app/api/portal/plans/route.ts`
- `/home/user/-vibeforge-app/app/api/portal/appointments/cancel/route.ts`
- `/home/user/-vibeforge-app/app/api/portal/appointments/route.ts`
- `/home/user/-vibeforge-app/app/api/portal/profile/route.ts`
- `/home/user/-vibeforge-app/app/api/portal/register/route.ts`
- `/home/user/-vibeforge-app/lib/portal-auth.ts`
- `/home/user/-vibeforge-app/docs/security-review-2026-04-22.md`
- `/home/user/-vibeforge-app/supabase/migrations/093_patient_portal.sql`
