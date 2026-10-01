# Rendimiento de Conversaciones

> Cómo se mantiene rápida la bandeja de WhatsApp cuando una clínica acumula
> miles de conversaciones, qué presupuesto tiene cada pantalla y cómo
> comprobarlo antes de cada cambio. Complemento de `docs/conversaciones-setup.md`.

## Principio

Conversaciones es **aditiva y aislada**: sus lecturas y sondeos corren solo
con `/conversaciones` abierta y la pestaña visible. La agenda, Caja, pacientes,
tratamientos y presupuestos no comparten hooks, consultas ni intervalos con la
bandeja, así que el crecimiento de `wa_conversations` / `wa_messages` no puede
hacerlos más lentos. Lo único compartido es la base de Supabase, y por eso cada
consulta de la bandeja está obligada a usar un índice (ver banco de pruebas).

## Qué cambió (mig 277 + PR de rendimiento)

| Antes | Ahora |
|---|---|
| Lista: 300 conversaciones (≈ 120 KB) cada 8 s, cambiara algo o no | Primera página de **100** + "Cargar más conversaciones" por cursor. Cada **5 s** solo lo que cambió (`updated_at` posterior a la última vista, índice de la mig 277) y se mezcla en caché. Cada **60 s** un refresco completo como red de seguridad. |
| Chat: 150 mensajes cada 4 s | Últimos **50** + "Cargar mensajes anteriores" por cursor (la posición de lectura se conserva). Cada **3 s** solo los mensajes nuevos (`ts` posterior al último) y el estado ✓/✓✓ de los últimos 20 salientes aún no leídos. Cada **60 s** refresco completo. |
| Lista renderizaba todas las filas | Lista **virtualizada** (`@tanstack/react-virtual`): solo se pintan las filas visibles + 8 de margen, sea cual sea el tamaño de la página cargada. |
| Marcar como leído invalidaba la lista entera | Parche local (`patchLocal`) + PATCH; sin refetch. |

Lo que NO cambió: la API `/api/inbox/*`, el webhook, el envío, Yendy IA, las
políticas RLS ni ninguna tabla. La mig 277 es **solo un índice**.

## Presupuesto por pantalla

Topes que el banco de pruebas exige con 1 000 conversaciones / 50 000
mensajes en la org (y 30 000 conversaciones de otras clínicas de ruido):

| Consulta | Tope | Medido (1-oct-2026, Postgres local) |
|---|---|---|
| Lista, primera página (100) | 20 ms, sin Seq Scan | 0.05 ms |
| Lista, delta (`updated_at > hace 10 s`) | 20 ms, sin Seq Scan | 0.02 ms |
| Etiquetas / fichas de 100 conversaciones | 20 ms | 0.15 / 0.19 ms |
| Chat, últimos 50 | 10 ms, sin Seq Scan | 0.37 ms |
| Chat, cargar anteriores (cursor) | 10 ms | 0.03 ms |
| Chat, delta (`ts > último`) | 10 ms | 0.01 ms |
| Yendy: fichas (≤ 400) + casos (≤ 60) + últimos 20 del chat | 20 / 20 / 10 ms | 0.30 / 0.17 / 0.17 ms |
| Tick de programados vencidos (todas las orgs) | 10 ms | 0.01 ms |
| Agenda: lectura del trigger Agendó/Asistió por cita (mig 278) | 5 ms, sin Seq Scan | 0.01 ms |
| Minería: chats cerrados sin revisar (mig 279, índice parcial) | 5 ms, sin Seq Scan | 0.01 ms |

Tráfico por sondeo con la pantalla abierta y nada nuevo: lista **≈ 0 filas**
cada 5 s (antes ≈ 120 KB cada 8 s); chat ≈ 0 filas cada 3 s. En Supabase las
cifras absolutas serán mayores (red + PostgREST), pero la forma del plan es lo
que importa: ninguna consulta crece con el tamaño de la tabla.

Base de conocimientos de Yendy al tope: ≈ 166 KB de texto (≈ 42 k tokens),
en caché de prompt; se lee una vez por sugerencia, nunca en los sondeos.

## Cómo correr el banco de pruebas

```bash
runuser -u postgres -- bash supabase/tests/inbox/perf/run.sh
```

Levanta un Postgres desechable, aplica 206 → 275 → 276 → 277, siembra la
org A (1 000 conversaciones, 50 000 mensajes, etiquetas, 400 fichas, 120
casos) y mide cada consulta con `EXPLAIN (ANALYZE)`. **Falla** si alguna hace
un recorrido completo de `wa_conversations` o `wa_messages` o supera su tope.
Tarda ≈ 10 s. Correrlo:

- al añadir una consulta nueva a la bandeja (añadir también su `perf_check`
  en `supabase/tests/inbox/perf/30_measure.sql`);
- al añadir una migración `27x_wa_*.sql` (el banco la aplica sola);
- antes de cambiar intervalos o tamaños de página en `use-inbox.ts`.

El harness funcional (`supabase/tests/inbox/run.sh`) sigue siendo el que
valida RLS, contadores y rollbacks; los dos se corren antes de cada PR.

## Reglas para no perder lo ganado

1. Toda lectura nueva de la bandeja lleva `organization_id` o
   `conversation_id` en el `WHERE` y un `LIMIT`; nunca "todo lo de la org".
2. Ningún sondeo baja lo que ya está en caché: se pide por cursor
   (`updated_at` / `ts`) y se mezcla.
3. Nada de la bandeja se monta fuera de `/conversaciones` (ni en el layout,
   ni en el sidebar, ni en la agenda). El contador de no leídos, si algún día
   se muestra en el sidebar, será UNA consulta `count` cada minuto, no la lista.
4. Un índice nuevo = migración aditiva con rollback, `CREATE INDEX IF NOT
   EXISTS` y `lock_timeout`, como la 277. En orgs grandes, valorar
   `CONCURRENTLY` (fuera de transacción).
5. Lo único de Conversaciones que corre dentro de la agenda es el trigger
   de la mig 278 (Agendó/Asistió): una lectura por índice por cada cita
   creada o con cambio de estado, envuelta en `EXCEPTION WHEN OTHERS` para
   que jamás bloquee la cita. Cualquier otra señal agenda → bandeja debe
   seguir ese mismo patrón, nunca una consulta sin índice ni una que lance.
6. La minería de casos candidatos (mig 279) solo corre cuando un admin
   abre Ajustes → Casos candidatos (una vez por semana) o pulsa "Buscar
   ahora": 8 chats por corrida, cada chat una sola vez. Nunca en el
   webhook, el cron ni la bandeja.
7. Los Flows (fase 5) se ejecutan en el servidor (webhook + tick del cron);
   el editor React Flow solo carga la definición del flow que se edita.
