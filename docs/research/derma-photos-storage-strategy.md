# Estrategia de almacenamiento de fotos clínicas (Dermatología / Estética)

> **Status:** análisis técnico, NO implementación.
> **Autor:** Research agent
> **Fecha:** 2026-05-06
> **Branch:** `claude/add-terms-privacy-fH9H7`
> **Driver:** pregunta del founder sobre cómo evitar "sobrecargar la database" al implementar antes/después en el addon `dermatology` (ver `docs/plan-vertical-dermatologia.md`).

---

## 1. La pregunta de fondo: ¿"sobrecargar la database"?

La preocupación es legítima en intención pero parte de un mal modelo mental. **Las fotos no van en la database de Postgres.** Si las metiéramos como `BYTEA` en una columna, sí — sería catastrófico (bloat de tabla, vacuum lentísimo, backups gigantes, queries con `SELECT *` colgadas, replicación rota). Eso nadie lo está proponiendo, y el proyecto ya tiene el patrón correcto.

En Yenda hoy ya se usa **Supabase Storage**, que es **almacenamiento de objetos S3-compatible** detrás de un CDN — no es Postgres. La DB solo guarda metadata (un `storage_path` text de ~80 bytes). La foto vive en otro plano.

Evidencia en el repo:

- `supabase/migrations/015a_storage_buckets.sql` crea los buckets `avatars` y `org-assets` (públicos).
- `supabase/migrations/120_informed_consent.sql` crea el bucket privado `informed-consents` con RLS por `organization_id`.
- `supabase/migrations/053_clinical_history_extensions.sql:107` define `clinical_attachments` que ya guarda `storage_path text` — exactamente el patrón correcto.
- `app/api/clinical-attachments/route.ts:79` ya sube a `supabase.storage.from("clinical-files").upload(...)` con path `${org_id}/${patient_id}/${timestamp}.${ext}`.

**Cálculo de volumen real (post-compresión, ver §4):**

- 1 paciente × 6 fotos (2 visitas, 3 ángulos) × 250 KB ≈ 1.5 MB.
- 1 clínica × 100 pacientes activos/mes × 6 fotos × 250 KB ≈ 150 MB/mes ≈ **1.8 GB/año por org**.
- 50 orgs en plan Pro = 90 GB/año total. El plan Pro de Supabase ($25/mes) trae **100 GB de Storage incluido + 200 GB de egress**. Cabe holgado.

Conclusión: la "sobrecarga de database" es un fantasma. El problema real es **costo de Storage agregado a escala** y **latencia de carga de galerías**, ambos solucionables con compresión + transformaciones server-side (ver §3, §4, §7).

---

## 2. ¿Por qué Google Drive (o Dropbox/iCloud) es mala idea para esto?

Vincular un Drive del owner suena tentador ("que cada clínica use su Drive y listo"). Es trampa por al menos siete razones:

1. **OAuth per-org per-user**: cada org tendría que autenticar con Google, manejar refresh tokens, re-consentir scopes cuando Google los rota. Ya tenemos un patrón análogo en `mig 106_google_calendar_integration.sql` y sabemos que mantenerlo es fricción real.
2. **Rate limits**: Drive API impone 1,000 queries/100s por usuario y 10,000 queries/100s por proyecto. Una galería con 30 thumbnails dispara 30 requests al cargar — saturable.
3. **Modelo de propiedad equivocado**: los archivos pertenecen al usuario Google que autenticó, no a la org. Si la doctora se va, sus archivos se van con ella. Bomba de tiempo legal y de continuidad.
4. **Compliance Ley 29733 (Perú)**: las fotos médicas son **datos sensibles de salud** (categoría especial, art. 2.5). Subirlas a Google consumer (Workspace personal del owner) sin un BAA/DPA equivalente y sin control sobre la región del bucket = exposición regulatoria. Supabase corre en AWS con encriptación at-rest y firmamos un único DPA por toda la plataforma.
5. **Modelo de sharing de Drive es discoverable**: links "anyone with the link" se filtran (correo reenviado, screenshots, history del navegador del owner). El paciente firmó consentimiento para fotos clínicas, no para que terminen indexadas por error.
6. **No hay CDN ni transformaciones**: cada thumbnail descarga la foto original. Galería de 30 fotos × 2 MB = 60 MB en cada apertura. Lentísimo en 4G.
7. **Backups y portabilidad**: si Google cierra la cuenta del owner por TOS violation (ha pasado con contenido médico mal clasificado por su classifier), perdemos el acervo clínico de la clínica. Sin recurso.

Veredicto: **no**. Drive resuelve un problema imaginario y trae siete reales.

---

## 3. Arquitectura recomendada: Supabase Storage + Image Transformations

Stack propuesto:

- **Bucket nuevo** `clinical-photos` (separado de `clinical-files` para poder configurar `file_size_limit` distinto, transformaciones distintas, y políticas de retención distintas a documentos PDF).
  - `public: false`
  - `file_size_limit: 5_242_880` (5 MB — cap defensivo después de la compresión client-side de 1.5 MB; deja margen para fotos grandes legítimas).
  - `allowed_mime_types: ['image/webp', 'image/jpeg', 'image/png']`.
- **Path strategy**: `{organization_id}/{patient_id}/{photo_id}.webp` — mismo patrón que ya usa `clinical-files`, lo que permite reutilizar el helper `(storage.foldername(name))[1]::uuid` en RLS.
- **RLS path-based**: SELECT/INSERT/UPDATE/DELETE gateados por `(storage.foldername(name))[1]::uuid IN (SELECT get_user_org_ids())`. Mismo patrón que `informed-consents` (ver `mig 120` líneas 70-83).
- **Acceso por signed URL** con TTL corto (1h para galerías, 24h para compartir externamente con consentimiento). Ya tenemos el patrón en `app/api/clinical-attachments/[id]/route.ts:78` que llama `.from("clinical-files").createSignedUrl(...)`. Replicar.
- **Image Transformations de Supabase**: Supabase Storage soporta `?width=400&quality=70&resize=cover` en la URL — devuelve una variante redimensionada cacheada en el CDN sin tocar el original. Crítico para galería: thumbnail 400×400 q=60 (~25 KB), modal 1200×1200 q=80 (~200 KB), original solo on-demand para "ver original".
- **Original siempre se preserva**: para defensa médico-legal, el "original" tras compresión client-side (ver §4) ES el original legal. No se vuelve a transformar destructivamente server-side.

**Deuda pre-existente que hay que cerrar de paso:** el bucket `clinical-files` se usa en código (`app/api/clinical-attachments/route.ts:80`, `app/api/clinical-attachments/[id]/route.ts:35,78`) pero **no existe migración que lo cree** (busqué `clinical-files` en `supabase/migrations/` — cero resultados). Funciona porque alguien lo creó a mano en el dashboard de Supabase. La migración `1XX_clinical_storage_buckets.sql` que cree `clinical-photos` debe también crear (`ON CONFLICT DO NOTHING`) `clinical-files` y agregar sus policies, para que un re-deploy en branch nuevo no se rompa.

---

## 4. Compresión client-side ANTES de subir

Para dermatología/estética la nitidez importa (zoom para ver textura de piel, tamaño de poro, cambio de pigmentación), pero un iPhone moderno saca 12-24 MP en HEIC/JPEG de 4-8 MB que es overkill. El plan vertical (`docs/plan-vertical-dermatologia.md:36, 238`) ya pide compresión: **max 1200px lado largo, WebP**. Buen target. Yo iría un poco más generoso para preservar zoom diagnóstico:

- **Resize**: `max(width, height) = 1600px` con `Lanczos` o el algoritmo del browser (nativo `canvas.drawImage` ya hace bicubic). 1600px aguanta zoom 2× sin pixelado y mantiene ~1.2 MB.
- **Re-encode WebP** con `quality: 0.82`. WebP a 0.82 visualmente equivalente a JPEG 0.92 con ~55% del tamaño.
- **Strip EXIF**: GPS, modelo de cámara, hora. Privacidad del paciente y del consultorio. El re-encode en canvas ya lo hace nativamente — ningún metadata sobrevive el roundtrip por canvas.
- **Fallback JPEG q=0.85**: si Safari iOS < 14 (raro a 2026 pero existe en clínicas con tablets viejas), encodear JPEG.

**Librería recomendada: `browser-image-compression`** (~13 KB gzipped, MIT, mantenida, soporta WebP, web worker para no bloquear el main thread).

```ts
import imageCompression from "browser-image-compression";
const compressed = await imageCompression(file, {
  maxSizeMB: 1.5,
  maxWidthOrHeight: 1600,
  useWebWorker: true,
  fileType: "image/webp",
  initialQuality: 0.82,
});
```

Alternativas evaluadas:
- `compressorjs` (similar tamaño, no soporta WebP nativamente — no).
- Canvas API a mano: ~80 líneas, ahorra una dep, pero hay que manejar EXIF orientation (iPhone retratos vienen rotados con tag EXIF), web workers, y errores de OOM en imágenes grandes en Android viejo. **No vale el ahorro de 13 KB.**

---

## 5. Esquema DB sugerido

El plan vertical (`plan-vertical-dermatologia.md:222, 230`) propone **extender `clinical_attachments`** vs crear tabla nueva. Voto por **tabla nueva** por tres razones: (a) evita columnas nullable que solo aplican a fotos derma (`phase`, `body_zone`, `is_face_visible`, dosis); (b) RLS y triggers más simples; (c) `clinical_attachments` queda para PDFs/documentos que tienen otro lifecycle (no se comparan, no se anonimizan, no van a galería pública).

```sql
CREATE TABLE patient_photos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  appointment_id UUID REFERENCES appointments(id) ON DELETE SET NULL,
  service_id UUID REFERENCES services(id) ON DELETE SET NULL,
  doctor_id UUID REFERENCES doctors(id) ON DELETE SET NULL,
  clinical_note_id UUID REFERENCES clinical_notes(id) ON DELETE SET NULL,

  storage_path TEXT NOT NULL,                -- "{org_id}/{patient_id}/{photo_id}.webp"
  phase TEXT NOT NULL CHECK (phase IN ('before','after','progress','final','reference')),
  body_zone TEXT,                            -- FK lógico a catálogo body_zones (Tier 1.2)
  taken_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  width INT, height INT,
  size_bytes INT,
  mime_type TEXT NOT NULL DEFAULT 'image/webp',

  is_face_visible BOOLEAN DEFAULT false,     -- privacidad: blur en listas si true
  consent_id UUID REFERENCES informed_consents(id),  -- consentimiento de fotografías que la autoriza

  uploaded_by UUID NOT NULL REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ                     -- soft delete (ver §8 derecho de borrado)
);

CREATE INDEX idx_patient_photos_patient ON patient_photos(patient_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_patient_photos_appointment ON patient_photos(appointment_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_patient_photos_zone ON patient_photos(patient_id, body_zone) WHERE deleted_at IS NULL;

ALTER TABLE patient_photos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "patient_photos_select" ON patient_photos
  FOR SELECT USING (organization_id IN (SELECT get_user_org_ids()));
CREATE POLICY "patient_photos_insert" ON patient_photos
  FOR INSERT WITH CHECK (organization_id IN (SELECT get_user_org_ids()));
CREATE POLICY "patient_photos_update" ON patient_photos
  FOR UPDATE USING (organization_id IN (SELECT get_user_org_ids()));
-- DELETE solo via RPC `soft_delete_patient_photo(id)` para forzar deleted_at + audit log.
```

Tabla complementaria `photo_access_log(photo_id, viewed_by, viewed_at, ip, user_agent)` — append-only, RLS solo SELECT por org owners + creador. Ver §8.

**Lo que NO hay que hacer:**
- `BYTEA` en Postgres. Nunca.
- `JSONB` con base64 de la foto. Variante peor del anterior.
- Guardar el signed URL en la columna. Expira. Ver `mig 122` que ya corrigió este mismo error en `informed_consents.pdf_url` — no repetirlo.

---

## 6. UX considerations (atadas a `plan-vertical-dermatologia.md`)

- **Galería en drawer del paciente** (`§1 del plan` — "se lee desde el paciente"): grid 3-col en mobile / 4-col en desktop, thumbnails 400×400 servidos vía `?width=400&quality=60`. Lazy-load con `next/image` + `loading="lazy"` + intersection observer.
- **Antes/después comparator** (Tier 1.1): librería `react-compare-image` (~8 KB, MIT) o `react-compare-slider` (más mantenida). Slider draggable nativo, sin dependencias pesadas. Cargar las dos imágenes a 1200×1200 q=80.
- **Lightbox**: `yet-another-react-lightbox` (~15 KB, MIT) para ver original con keyboard nav y zoom pinch en mobile.
- **Upload**: drag-drop multi-file con preview pre-upload (después de la compresión, para que la doctora vea exactamente qué se sube), barra de progreso por foto. Soportar paste desde clipboard (cosmetóloga puede usar tablet con Apple Pencil para anotar antes de subir — out of scope MVP).
- **Etiquetas**: `phase` + `body_zone` obligatorios al subir. Sin etiquetas, el comparador no puede emparejar antes/después. Default: `body_zone` viene preseleccionado del último procedimiento del paciente (`appointments.service_id` → mapping a body_zone).
- **Blur de fotos faciales** en listas si `is_face_visible = true`: CSS `filter: blur(20px)` con overlay "click para ver" — patrón estándar que ya viven con apps tipo Instagram NSFW filter.

---

## 7. Costos a 12 meses

Asumimos los números de §1: **1.8 GB/año por org activa con 100 pacientes/mes**.

| Escenario | Storage | Bandwidth (galería 30 fotos × 5 vistas/mes × 50% hit CDN) | Costo Supabase |
|---|---|---|---|
| 1 org (Vitra/Dermosalud) | 2 GB | ~5 GB egress | Incluido en Pro $25/mes |
| 10 orgs activas | 18 GB | ~50 GB egress | Incluido en Pro $25/mes |
| 50 orgs activas | 90 GB | ~250 GB egress | $25 + ~$5 egress overage = $30/mes |
| 200 orgs activas | 360 GB | ~1 TB egress | $25 + (260 GB × $0.021) + (800 GB × $0.09) = ~$103/mes |

A escala de 200 orgs (proyección optimista 12-18 meses), **el costo de fotos es ~$100/mes — trivial vs el revenue**. A 50 orgs (target realista 6 meses), es ruido estadístico.

**Mitigaciones si hace falta:**
- Mover fotos > 6 meses a tier "cold" (Backblaze B2, $6/TB/mes vs Supabase $21/TB/mes). Implementación: cron mensual + columna `archived_at`. **No hacer hasta llegar a 50+ GB en una sola org.** Premature optimization.
- Cuotas por plan: Independiente 1 GB, Clínica 5 GB, Empresarial 20 GB. Ya está marcado como TODO en `PRD.md:749` (storage UX de soft-wall). Atarlo al rollout del addon `dermatology` MVP.

---

## 8. Compliance Ley 29733 (Perú)

Las fotos clínicas son **datos sensibles de salud** (Ley 29733, art. 2.5 inc. 5). Esto activa requisitos extra que la arquitectura propuesta cumple, pero hay que ser explícitos:

1. **Consentimiento previo documentado**. Ya existe `informed_consents` con `consent_type = 'fotografias'` (ver `mig 120`, línea 23). El plan vertical (`§6 Riesgos`) ya marca esto como prerequisito bloqueante. Implementación: el endpoint `POST /api/patient-photos` debe rechazar si no hay un `informed_consents` activo del paciente con `consent_type = 'fotografias'`. La columna `consent_id` en `patient_photos` lo hace explícito.
2. **Derecho de acceso, rectificación y cancelación (ARCO)**. Soft delete con `deleted_at` permite el flujo: paciente solicita borrado → admin marca `deleted_at` → cron diario borra el objeto en Storage 30 días después (ventana de gracia para revertir error humano y para compliance con retención mínima de historia clínica que en Perú es de 15 años, OJO — los datos deben mantenerse en el record clínico aunque se "oculten" del frontend; consultar legal antes del hard delete).
3. **Auditoría de accesos** (`photo_access_log`): mandatorio en datos sensibles. Cada signed URL generada se registra con `viewed_by`, `viewed_at`, `ip`, `user_agent`. Permite responder a un paciente "¿quién vio mi foto el 15 de marzo?" en segundos.
4. **Encriptación at-rest y in-transit**: Supabase Storage encripta AES-256 at-rest y serve HTTPS. ✓.
5. **Backup y DR**: Supabase Pro hace daily backups con 7 días de retención. Para 15 años de retención clínica formal, agendar dump mensual del bucket a S3 Glacier propio (out of scope MVP).
6. **Transferencia internacional**: Supabase corre en AWS us-east-1 por default. Ley 29733 permite transferencia internacional con consentimiento explícito y país con nivel adecuado de protección. **Acción**: agregar cláusula al consentimiento de fotografías mencionando que el almacenamiento es en infraestructura cloud internacional con garantías equivalentes. Sugerencia: que legal revise el wording.

---

## 9. Plan de implementación sugerido

Alineado con el roadmap del addon (`plan-vertical-dermatologia.md §3`). Solo cubre la parte de fotos — el body mapping, skin profile y catálogo de procedimientos son tracks paralelos.

**Sprint 1 — Foundation (3-4 días)**
- Migración `1XX_clinical_storage_buckets.sql`: crea `clinical-photos` + retroactivamente `clinical-files` (cierra deuda pre-existente).
- Migración `1XX_patient_photos.sql`: tabla + RLS + índices + RPC `soft_delete_patient_photo`.
- `lib/photos/upload.ts`: helper compress (`browser-image-compression`) + upload + insert metadata. Una función limpia.
- API `POST /api/patient-photos`, `GET /api/patient-photos?patient_id=...` (con signed URLs frescos cada vez, patrón de mig 122), `DELETE` que llama el RPC.
- Botón "Foto antes/después" en `appointment-sidebar.tsx` (gated por addon `dermatology` activo + service categoría estética + consent de fotografías firmado).

**Sprint 2 — Galería + comparator (3 días)**
- Tab "Galería" en drawer paciente (`patient-drawer/photos-tab.tsx`).
- Comparator antes/después con `react-compare-slider`.
- Lightbox con `yet-another-react-lightbox`.
- `photo_access_log` + middleware que registra accesos.

**Sprint 3 — Pulido (2 días)**
- Bulk upload (drag-drop multi-file).
- Cuotas por plan + soft-wall message (cierra TODO `PRD.md:749`).
- Cron diario para hard-delete de fotos con `deleted_at` > 30 días.

Total: **~9 días de un agente bien briefeado**. Coincide con el estimado del plan vertical.

---

## 10. TL;DR para el founder

1. **Las fotos NO van en la database.** Van en Supabase Storage (que es S3, no Postgres). El proyecto ya hace esto bien con `clinical-files`. La preocupación es válida en intención pero parte de un mal modelo mental.
2. **No vincules Google Drive.** Es OAuth complejo, rate-limited, sin CDN, con compliance malo para datos médicos sensibles bajo Ley 29733.
3. **Comprimir client-side antes de subir** con `browser-image-compression`: 1600px lado largo, WebP q=0.82, sin EXIF. Reduce 8 MB → 1.2 MB sin perder calidad diagnóstica.
4. **Crea bucket `clinical-photos` separado** con RLS por org_id, sirve thumbnails con `?width=400&quality=60` (transformaciones de Supabase, gratis), original solo on-demand.
5. **Tabla nueva `patient_photos`** con `phase`, `body_zone`, `is_face_visible`, `consent_id` y `deleted_at`. Soft delete + auditoría de accesos.
6. **Costo a 50 orgs activas**: ~$30/mes total. A 200 orgs: ~$100/mes. Despreciable vs revenue.
7. **Cierra de paso una deuda existente**: el bucket `clinical-files` se usa en código pero ninguna migración lo crea (vive solo en el dashboard del proyecto Supabase actual). Próximo deploy en branch limpio se rompe.

---

## Apéndice — Archivos del repo citados

- `docs/plan-vertical-dermatologia.md` — plan vertical dermatología completo.
- `supabase/migrations/015a_storage_buckets.sql` — patrón de buckets `avatars` / `org-assets`.
- `supabase/migrations/053_clinical_history_extensions.sql:107-133` — tabla `clinical_attachments` (referencia de patrón).
- `supabase/migrations/120_informed_consent.sql:58-83` — patrón de bucket privado con RLS path-based (replicar para `clinical-photos`).
- `supabase/migrations/122_get_user_id_by_email.sql` y `123_consent_hardening_and_terms_gate.sql` — patrón "no persistir signed URL, generar on-demand" (aplicable directo a fotos).
- `app/api/clinical-attachments/route.ts:75-104` — patrón existente de upload + insert metadata.
- `app/api/clinical-attachments/[id]/route.ts:73-79` — patrón existente de signed URL on-demand.
- `app/(dashboard)/scheduler/appointment-sidebar.tsx:193,226` — punto de inserción del botón "Foto antes/después" (sidebar de la cita).
- `PRD.md:749, 752` — TODOs alineados con este plan.
