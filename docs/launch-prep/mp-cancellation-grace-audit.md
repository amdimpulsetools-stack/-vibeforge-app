# Auditoría MercadoPago — Cancelación y período de gracia

**Fecha:** 2026-05-11  
**Branch:** `claude/add-terms-privacy-fH9H7`  
**Alcance:** sólo lectura. Pre-launch público de Yenda.  
**Veredicto general:** la integración MP cubre el happy path (alta + cobro recurrente + alta de addons), pero los flujos de **cancelación self-serve** y **período de gracia ante pago fallido** están **ausentes o rotos**. Lanzar en este estado va a generar incidencias en mes 1.

---

## Sección 1 — Flujo de cancelación

| Pregunta | Respuesta |
|---|---|
| ¿Endpoint para que el cliente cancele? | **No existe.** No hay `app/api/mercadopago/cancel/`, ni método DELETE en `app/api/mercadopago/subscription/route.ts`. La búsqueda `preApproval.cancel` no devuelve ningún resultado. La única llamada a MP de modificación es `preApproval.update` para cambiar el monto al comprar addons (`app/api/mercadopago/subscription/route.ts:187`). |
| ¿Botón en la UI para cancelar? | **No.** En `app/(dashboard)/account/page.tsx` el "Danger Zone" (líneas 713-724) sólo tiene "Eliminar cuenta" — sin handler conectado. El plan section (líneas 1110-1182) sólo expone "Cambiar plan" → `/plans`. Nada en `app/(dashboard)/plans/page.tsx` permite cancelar (sólo cambiar a otro plan). El término "Cancelar" en `account/page.tsx:914` es el botón "Cancelar" del modal de addons, no de suscripción. |
| ¿Llama a la API de MP para cancelar la preapproval? | No, porque no hay flujo de cancelación. La única forma de "cancelar" hoy es indirecta: en `app/api/plans/route.ts:72-84`, al elegir otro plan, el sistema marca las suscripciones previas como `cancelled` **en la DB local pero NO en MP** — el cobro recurrente sigue activo en MercadoPago hasta que el usuario lo cancele manualmente desde su cuenta MP. |
| ¿Mantener acceso hasta fin del período pagado? | No implementado. No existe distinción entre `cancelled_immediately` y `cancel_at_period_end`. El campo `cancelled_at` (`migrations/003_plans_and_subscriptions.sql:72`) existe pero no se consulta para mantener acceso. La función `get_user_session_check` (`migrations/067_members_require_active_subscription.sql`) corta acceso apenas el status sale de `active`/`trialing`. |
| ¿Confirmación / doble click? | N/A — no hay flujo. |

**Estado real:** el cliente que quiera cancelar tiene que llamar a soporte o cancelar a mano desde MercadoPago, lo cual el equipo no se enterará automáticamente (sí llega webhook `subscription_preapproval` con `status=cancelled` que sí se mapea bien en `app/api/mercadopago/webhook/route.ts:117-122`, pero el churn pasa sin fricción ni "save offer").

---

## Sección 2 — Período de gracia ante pago fallido

| Pregunta | Respuesta |
|---|---|
| ¿Webhook maneja `payment.failed` / `rejected`? | **Sí parcialmente.** `app/api/mercadopago/webhook/route.ts:326-335` mapea `payment.status=rejected` → suscripción `past_due`. También maneja `subscription_preapproval` con `status=paused` → `past_due` (línea 120). |
| ¿Columna `subscription_status`? | Sí: `organization_subscriptions.status` con CHECK constraint `IN ('pending', 'active', 'trialing', 'past_due', 'cancelled', 'expired')` (`migrations/042_add_pending_status_to_subscriptions.sql`). El estado `past_due` existe pero **no funciona como gracia**. |
| ¿Cron diario que revisa vencimientos? | **No existe.** `vercel.json` lista 4 crons (reminders, daily-summary, fertility-followup, budget-pdf-cleanup) — **ninguno** toca billing/suscripciones. No hay un job que mire `mp_next_payment_date`, ni que expire trials, ni que escale `past_due → cancelled` después de N días. |
| ¿Email al usuario cuando falla el pago? | **No.** `grep -rn "email" app/api/mercadopago` sólo devuelve referencias a `payer_email` para identificar el pagador. Nunca se dispara una notificación al usuario ni al admin. No hay registro en `notifications`, no hay envío via Resend/SMTP. |
| ¿Cuántos retries hace MP? | Configuración por defecto de MP (3 intentos a lo largo de ~7 días en preapproval con `recurring`). **No está configurado explícitamente** en el body de `preApproval.create` (`app/api/mercadopago/checkout/route.ts:139-146`) — sólo se setean `frequency`, `frequency_type`, `transaction_amount`, `currency_id`. |

**Bug crítico (P0):** la función RPC `get_user_session_check` (`migrations/067_members_require_active_subscription.sql:34-44`) que usa el middleware (`lib/supabase/middleware.ts:176-188`) **sólo acepta `status='active'` o `'trialing' AND trial_ends_at > now()`**. En cuanto el webhook marca la suscripción como `past_due`, **el usuario es expulsado al instante** a `/select-plan` (owner/admin) o `/waiting-for-plan` (member). No hay gracia de 0 segundos, mucho menos 7 días. Un cliente con tarjeta vencida pierde acceso en el primer reintento fallido de MP.

---

## Sección 3 — Otros casos críticos

- **Reactivación de cancelada:** no implementada. El usuario puede iniciar un nuevo checkout (`POST /api/mercadopago/checkout`) que crea otra preapproval en MP — no reusa la anterior. No hay UX de "reanudar".
- **Upgrade/downgrade y prorating:** parcial. `app/api/plans/route.ts:71-108` cambia el plan en la DB pero **no actualiza el monto de la preapproval MP existente**. Resultado: el cliente ve un plan "Enterprise" en la UI pero MP le sigue cobrando el monto del plan anterior. Sin prorrateo ni crédito.
- **Cuotas pendientes / refunds:** el webhook registra `refunded` en `payment_history` (`app/api/mercadopago/webhook/route.ts:289-296`) pero no toma acción sobre la suscripción ni notifica. No hay endpoint para iniciar un refund.
- **Compra de addons sin método de pago:** correctamente bloqueada con `402` cuando falta `mp_preapproval_id` (`app/api/mercadopago/subscription/route.ts:157-166`).
- **Validación de webhook:** firma HMAC verificada con `timingSafeEqual` (`webhook/route.ts:67-78`) — sólido. Rate limit por IP (línea 21). En modo TEST se permite saltar la firma con un warning (línea 38).

---

## Sección 4 — Gaps por severidad

| Item | Estado | Severidad | Esfuerzo |
|---|---|---|---|
| `past_due` no concede gracia, expulsa instantáneamente | Bug | **P0 crítico** | M (1-2 días: actualizar RPC + agregar `grace_until` + lógica) |
| No hay endpoint `DELETE /api/mercadopago/subscription` | Faltante | **P0 crítico** | S (medio día: llamar `preApproval.update({status:'cancelled'})` + UI button) |
| Cambio de plan no actualiza monto en MP (cobra el viejo) | Bug | **P0 crítico** | S (4 horas: `preApproval.update` con nuevo monto en `/api/plans`) |
| Sin email/notificación de pago fallido | Faltante | **P1 alto** | M (1 día: hook en webhook + template + Resend) |
| Sin cron que expire trials y escale past_due → cancelled tras N días | Faltante | **P1 alto** | M (1 día: nuevo `app/api/cron/billing-sweep/route.ts` + entry en `vercel.json`) |
| Falta UI "Cancelar suscripción" con confirmación | Faltante | **P1 alto** | S (4 horas: en account o en plans) |
| Cancelación local no propaga a MP (al cambiar plan) | Bug | **P1 alto** | S (incluido en el fix de upgrade) |
| Sin reactivación self-serve de cancelada | Faltante | P2 medio | M |
| Sin prorrateo en upgrade/downgrade | Faltante | P2 medio | L |
| Refunds no automatizan baja de acceso | Gap | P3 bajo | S |
| MP retry policy no configurada explícitamente | Gap | P3 bajo | XS |

---

## Sección 5 — Recomendaciones pre-launch (mandatorias)

1. **Arreglar el corte instantáneo en `past_due`** (`migrations/067_*.sql` → nueva migración). Modificar `get_user_session_check` para aceptar `past_due` si `updated_at > now() - interval '7 days'`. Agregar columna `grace_period_ends_at` poblada por el webhook al recibir el primer `rejected`. Sin esto, todo cliente con un retry fallido se queda fuera **antes de que MP termine sus reintentos automáticos**.

2. **Endpoint + botón de cancelación self-serve.** `DELETE /api/mercadopago/subscription` que llame `preApproval.update({ id, body: { status: 'cancelled' } })`, marque `cancelled_at = now()` y un `access_until = current_period_end`. Modal de confirmación en `app/(dashboard)/account/page.tsx` (Danger Zone) o sección Plan. Modificar middleware para honrar `access_until` cuando status sea `cancelled`.

3. **Cron diario `app/api/cron/billing-sweep`** (agregar a `vercel.json`). Tareas: (a) `trialing` con `trial_ends_at < now()` → `expired`; (b) `past_due` con más de 7 días sin pago aprobado → `cancelled` + email; (c) sincronizar status desde MP por si se perdió un webhook (`preApproval.get` para suscripciones activas con `mp_next_payment_date < now() - 1 día`).

4. **Notificaciones por email** en webhook al detectar `rejected` y al pasar a `cancelled`. Templates: "Tu pago no se procesó — reintentaremos en 24h" y "Tu suscripción fue cancelada — tienes hasta DD/MM acceso". Usar la infra existente de notifications (`hooks/use-notifications.ts`) o Resend directo.

5. **Sincronizar cambio de plan con MP.** En `app/api/plans/route.ts:71-108`, antes de hacer el insert del nuevo plan, llamar `preApproval.update` sobre `mp_preapproval_id` con el nuevo `transaction_amount`. Si falla el update en MP → revertir y devolver error (igual que el patrón ya usado en addons en `subscription/route.ts:184-211`).

---

## Archivos clave

- `lib/mercadopago/client.ts` — singletons MP
- `app/api/mercadopago/checkout/route.ts` — alta de preapproval
- `app/api/mercadopago/webhook/route.ts` — handler único de eventos
- `app/api/mercadopago/subscription/route.ts` — GET status + PUT addons (sin DELETE)
- `app/api/plans/route.ts` — cambio de plan (no sincroniza con MP)
- `app/(dashboard)/account/page.tsx` — UI billing (sin cancel)
- `lib/supabase/middleware.ts:176-188` — gate de acceso
- `supabase/migrations/067_members_require_active_subscription.sql` — RPC del gate
- `supabase/migrations/003_plans_and_subscriptions.sql` — schema base
- `supabase/migrations/021_test_pricing_mercadopago.sql` — columnas MP
- `vercel.json` — crons (sin billing)

**Resumen brutal:** la integración cubre el "compra y cobra", pero todo lo que pasa después del primer mes (retención, fallos de tarjeta, downgrades, cancelación) está desatendido. Lanzar sin los 5 fixes anteriores garantiza tickets de soporte y churn por fricción técnica en las primeras semanas.
