# Auditoría — Importación masiva de pacientes

**Fecha:** 2026-05-11
**Alcance:** `app/(dashboard)/patients/bulk-import-modal.tsx` + esquema `patients`
**Modo:** read-only, sin cambios de código

## 1. Estado actual

El modal (859 LOC, todo client-side) ejecuta un wizard de 4 pasos: **upload → mapping → preview → importing**. Parser CSV propio (no PapaParse) con detección de delimitador (`,` `;` `\t`) y soporte de comillas. Auto-mapeo de cabeceras vía `HEADER_ALIASES`. Validación por fila con Zod-light (no Zod real, validaciones manuales en `validateRow`, líneas 214-244). **No existe API route ni server action**: el cliente del navegador inserta directamente en `patients` vía `supabase.from("patients").insert(records)` (línea 415) usando RLS para autorización. Batches de 25 filas. Tabla `patients` con `UNIQUE(organization_id, dni)` (migración `013_multi_tenant.sql:225`); `dni` puede ser NULL (sin unique sobre email/phone).

## 2. Failure modes identificados

### Severidad ALTA

- **Sin endpoint server-side → sin atomicidad ni rate-limit**. Toda la importación corre desde el browser (`bulk-import-modal.tsx:380-436`). Si el admin cierra la pestaña a mitad, refresca, o pierde wifi, quedan filas parciales sin posibilidad de undo. No hay transacción ni "savepoint" — Supabase JS no expone `BEGIN/COMMIT` en `from().insert()`.
- **Bug de aliasing en HEADER_ALIASES** (`bulk-import-modal.tsx:84`): `apellido: "first_name" in {} ? "last_name" : "last_name"` — la expresión ternaria es código muerto pero también revela que **`apellido` (singular)** llega correctamente a `last_name`; no es bug funcional pero es señal de que el mapeo no fue testeado. Más grave: la línea 78 mapea `nombres` → `first_name`, pero `nombres` en planillas peruanas suele ser "nombres compuestos" (ej: "María Fernanda") y `apellidos` se usa para "García López" — el mapeo es correcto, pero si el CSV viene con una sola columna `nombre completo` no se separa.
- **Detección de duplicados ineficiente**: cuando un batch falla por `23505`, el código re-inserta **fila por fila** (`bulk-import-modal.tsx:418-430`). Para 1000 pacientes con muchos duplicados esto explota a ~1000 RPCs adicionales y puede tardar minutos. Sin pre-check contra DB de DNIs existentes.
- **Sin chunking del parse**: `FileReader.readAsText` (línea 300) carga el CSV entero en memoria y `parseCSV` itera con regex sobre todo el string. Con 10k filas funciona pero bloquea el main thread varios segundos (no hay Web Worker).
- **Pacientes sin DNI nunca son detectados como duplicados**: el `UNIQUE` es solo sobre `(organization_id, dni)` y `dni` es nullable. Importar dos veces el mismo CSV de 200 filas sin DNI crea **400 pacientes**. No hay dedupe por nombre+fecha_nacimiento.

### Severidad MEDIA

- **No hay timeout/retry**: si Supabase devuelve 503 o el cliente pierde red en medio batch, se pierde silenciosamente. `await supabase.from("patients").insert(...)` no se envuelve en try/catch (líneas 415-433); un throw inesperado deja el modal congelado en "Importando…".
- **El progreso es % de filas procesadas, no confirmadas**: si fallan los últimos 100, el bar llega a 100% antes de mostrar el error.
- **Logging cero**: no hay tabla `import_logs` ni inserción en `audit_log` (búsqueda en `supabase/migrations/` sin resultados). No queda registro de quién importó cuántos pacientes a qué hora — problema para Ley 29733 (Perú: trazabilidad de tratamiento de datos personales).
- **Validación de fecha frágil**: `parseDateFlexible` (`bulk-import-modal.tsx:195-212`) acepta DD/MM/YYYY y rechaza MM/DD/YYYY. Excel exportado en locale `en-US` rompería filas masivamente sin warning explícito ("invalid date" se silencia, simplemente no se setea birth_date).
- **Email/teléfono inválidos se silencian a `null`** (líneas 398-399, 231 marca warning). El admin ve "200 importados" pero 50 quedaron sin email — puede ser inesperado.
- **`document_type` default forzado a 'DNI'** (línea 397) incluso si el CSV traía 'CE' mal escrito. Pasaportes extranjeros se etiquetan como DNI.

### Severidad BAJA

- **No hay confirmación "estás por importar 847 filas, ¿continuar?"** antes del paso final.
- **Plantilla descargable** existe (`downloadTemplate`, líneas 444-455) — bien. Solo 1 fila de ejemplo, podría incluir 3 con casos típicos (extranjero, sin email, etc.).
- **Resumen final** muestra `success / duplicates / failed` (líneas 776-789) pero **no descarga un CSV de las filas fallidas** para que el admin las corrija — fricción operativa alta para Vitra.
- **Modal bloquea el body**; no se puede continuar usando la app durante una importación de 30+ segundos.

## 3. Recomendaciones por prioridad (pre-launch)

1. **(crítico)** Mover el insert a un **API route** `app/api/patients/bulk-import/route.ts` con `runtime = "nodejs"` y `maxDuration = 60`. Recibe el JSON ya validado, hace `insert(...).select("id")` en chunks de 100 con `onConflict` ignorado o `upsert`, devuelve resumen. Habilita rate-limit y RLS via service-role + verificación de membership.
2. **(crítico)** Pre-fetch de DNIs existentes de la org **antes** de insertar: una sola query `select dni from patients where organization_id = ? and dni = any(...)` y dedupe en memoria. Elimina la cascada de retries fila-por-fila.
3. **(alto)** Crear tabla `patient_imports` (id, org_id, user_id, file_name, total_rows, success, failed, duplicates, started_at, finished_at, error_csv_url) y un bucket `imports/` para guardar el CSV original + un CSV de errores descargable. Cumple Ley 29733 + permite undo manual.
4. **(alto)** Agregar warning fuerte en preview cuando `dni` está vacío en >20% de filas: "Sin DNI no se puede detectar duplicados — ¿continuar?".
5. **(medio)** Reemplazar parser CSV propio por **Papaparse** con `worker: true` y `step:` callback para procesar 10k+ filas sin bloquear UI.
6. **(medio)** Agregar control de fecha en mapping: dropdown "formato de fecha" (DD/MM/YYYY | MM/DD/YYYY | YYYY-MM-DD) que el admin elige explícitamente.
7. **(bajo)** Permitir descargar CSV de filas fallidas + filas duplicadas al terminar.

## 4. Veredicto

**No safe lanzar como está para Vitra (~150) sin las recomendaciones 1, 2 y 3.** Específicamente:

- 150 filas en batches de 25 = **6 batches secuenciales**. Si todos pasan limpio, ~3-5 segundos: tolerable. Si hay 1 duplicado por batch, dispara el path fila-por-fila (~150 RPCs extra) y tarda 30-60s con riesgo alto de cierre accidental de pestaña → estado parcial irrecuperable.
- Para clínicas futuras de 500-1000 pacientes el riesgo de pérdida parcial sin auditoría es **inaceptable** para datos de salud bajo Ley 29733.

**Mínimo viable pre-launch:** implementar (1) API route con chunked insert + (3) tabla `patient_imports` con CSV de respaldo. Esto solo: ~4-6 horas. Sin esto, la primera importación real de Vitra será un riesgo de soporte y posible incumplimiento regulatorio.

## 5. Test plan ejecutable hoy con CSV real de 200 filas

1. **Generar dataset sintético** de 200 pacientes (script Python o `vitra-seed-data.sql`) con: 150 con DNI único, 30 sin DNI, 10 con DNI duplicado dentro del mismo CSV, 5 con email inválido, 5 con fecha en formato MM/DD/YYYY.
2. **Caso A — happy path**: subir CSV limpio (150 únicos). Cronometrar tiempo total. Verificar que `success=150, duplicates=0, failed=0` y que `select count(*) from patients where organization_id=...` devuelve 150.
3. **Caso B — duplicados intra-CSV**: subir CSV con 10 DNI repetidos. Esperado: `success=140, duplicates=10`. Cronometrar — si tarda >30s, confirma el problema de retry fila-por-fila.
4. **Caso C — re-import idempotente**: correr Caso A dos veces seguidas. Esperado: segunda corrida `duplicates=150`. Si crea pacientes nuevos (porque DNI estaba null en algunos), confirma el gap de dedupe.
5. **Caso D — interrupción**: importar 200 filas y **cerrar la pestaña al 50%**. Verificar cuántos pacientes quedaron en DB. Confirmar que no hay forma de revertir desde la UI.
6. **Caso E — encoding**: exportar el CSV desde Excel en Windows con encoding ANSI (no UTF-8). Verificar si nombres con tildes ("González", "Núñez") se importan corruptos.
7. **Caso F — fecha ambigua**: subir CSV con `01/02/1990` interpretado como 1-feb-1990. Verificar valor en DB.
8. **Caso G — escala**: generar CSV de 1000 filas y subir. Medir si el browser congela, si el progress bar avanza, y tiempo total. Probar también desde 4G simulado en DevTools.

Resultados de los 7 casos deben loggearse en `docs/launch-prep/bulk-import-audit-results.md` antes de habilitar el botón en producción para Vitra.
