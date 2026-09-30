# Checklist de migraciones

Para toda migración que vaya a la base de producción. Son cinco minutos, y evitan que una clínica abra la agenda y la encuentre vacía.

---

## Antes de empezar: el preview no aísla la base

- Salvo que *Preview* tenga su propio `NEXT_PUBLIC_SUPABASE_URL` (ver `docs/despliegues-y-previews.md`), **el preview y producción leen la misma base de datos**. Aplicar una migración "para verla en el preview" es aplicarla en producción: todas las clínicas la ven en ese mismo instante.
- El preview sirve para probar el **código** nuevo contra el esquema actual. `/api/health/schema` abierto desde el preview revisa la base real.
- **Orden seguro:** primero se despliega el código que funciona con el esquema de antes y con el de después, y luego se aplica la migración. Por ejemplo, un hint `tabla!constraint_que_ya_existe(...)` funciona antes y después de una FK nueva. Nunca se hace al revés.

---

## 1. Antes de aplicar

1. **`npm run check:embeds`**: revisa los embeds del código sin tocar la base. Tiene que pasar.
2. **Busca `REFERENCES` / `FOREIGN KEY` en la migración.** Para cada FK nueva A → B, pregúntate:
   - ¿A y B ya tienen alguna FK entre sí, en cualquier dirección?
   - ¿Se leen juntas, con un embed `B(...)` desde A o `A(...)` desde B?

   La **Consulta 2** de `supabase/checks/multi_fk_pairs.sql` responde la primera pregunta: pones los dos nombres de tabla y la corres. Si devuelve alguna fila, la FK nueva vuelve ambiguo el par:
   - **Preferido:** no agregar la FK. Se usa una columna de rastro sin FK y la integridad la garantiza el RPC, como `transferred_from_appointment_id` en la 273.
   - **Si la FK es imprescindible:** en el mismo PR, **todos** los embeds de ese par llevan hint `tabla!nombre_constraint(...)`, y ese código se despliega **antes** de aplicar la migración.
3. **Corre la Consulta 1** de `multi_fk_pairs.sql` y guarda el resultado. Es la línea base para comparar después.
4. **Ten el rollback a mano:** `supabase/migrations/rollbacks/NNN_*_rollback.sql`. Léelo antes, porque algunos conservan columnas a propósito.

## 2. Aplicar

- En horario de poco uso (tarde-noche o domingo), nunca mientras recepción está agendando.
- Una migración a la vez. Si hay varias, haz la verificación completa entre una y otra.

## 3. Después de aplicar (en los 5 minutos siguientes)

1. **Consulta 1 otra vez.** Si aparece una fila nueva o sube algún `n_fks`, hay un par que se volvió ambiguo: ve a "Si algo falla".
2. **Abre `https://yenda.app/api/health/schema`** con sesión de owner/admin. Si tienes varias orgs, añade `?org_id=<uuid>`. La respuesta tiene que decir **`"ok": true`**. Cada entrada de `results` con `ok: false` trae `code`, `message`, `hint` y `source`; `source` indica qué archivo revisar.
3. **Abre la agenda** en la semana actual y confirma que se ven las citas. Después abre una ficha de cita y la Caja.

## 4. Si algo falla

**Qué se ve:** la agenda muestra el aviso *"No se pudieron cargar las citas."* con un botón Reintentar; ya no queda en blanco sin avisar. Las citas **no** se perdieron.

**Según el `code` del health check (o del aviso):**

| Código | Qué pasó | Qué hacer |
|---|---|---|
| `PGRST201` | Una FK nueva volvió ambiguo un embed | Quitar la FK nueva (SQL de abajo) |
| `PGRST200` | Un hint apunta a un constraint que no existe | Restaurar el constraint o corregir el hint (Consulta 3 de `multi_fk_pairs.sql`) |
| `42703` | Falta una columna que el código pide | La migración quedó a medias, o un rollback la borró |

**Arreglo inmediato para `PGRST201`,** sin deploy y sin tocar datos (la columna y sus valores se quedan):

```sql
ALTER TABLE <tabla> DROP CONSTRAINT IF EXISTS <constraint_nuevo>;
NOTIFY pgrst, 'reload schema';
```

- **Si no está claro qué pasó:** corre el rollback de la migración (`supabase/migrations/rollbacks/NNN_*_rollback.sql`) y luego `NOTIFY pgrst, 'reload schema';`. Supabase recarga el esquema solo tras un DDL, pero forzarlo no cuesta nada.
- **Si lo que falla es el código y no la base:** usa Instant Rollback en Vercel (ver `docs/despliegues-y-previews.md`).
- Repite `/api/health/schema` hasta ver `ok: true` y vuelve a mirar la agenda.
- Después, en el repo: una migración que deje el esquema como quedó en producción (sin la FK) o los hints que falten.

---

## Ejemplo: el incidente del 30-sep-2026

1. La mig 273 agregó `patient_payments.transferred_from_appointment_id` con FK a `appointments`, la **segunda** FK entre esas dos tablas.
2. PostgREST ya no supo qué relación usar en el embed `patient_payments(amount)` de la agenda y devolvió `PGRST201`.
3. El código trataba el error como "no hay citas", así que la agenda se vio en blanco y sin aviso, aunque las citas estaban intactas (el historial las mostraba).
4. Las pruebas locales de la 273 pasaron porque corren en Postgres y no pasan por PostgREST.
5. El arreglo (PR #383) quitó la FK y dejó un hint explícito en la agenda. Con este checklist, la Consulta 2 lo habría marcado antes de aplicar.
