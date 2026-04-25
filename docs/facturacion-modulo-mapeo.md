# Módulo de Facturación Electrónica — mapeo de implementación en Yenda

> **Backend:** Nubefact (reseller, white-label).
> **UX:** toda la experiencia vive dentro de Yenda. El usuario (recepción, admin, owner) nunca ve la marca Nubefact.
> **Objetivo de diferenciación:** el doctor/recepcionista emite boletas y facturas desde el mismo lugar donde ya gestiona citas y cobros — un solo flujo, una sola pantalla.

---

## 0. Principio arquitectónico

**Interfaz abstracta `EInvoiceProvider`**. Toda la lógica de facturación en Yenda habla con esta interfaz, nunca directo con Nubefact. Implementaciones intercambiables:

- `NubefactProvider` (hoy)
- `FactproProvider` (futuro, si decidimos)
- `SunatDirectProvider` (en 2-3 años si escalamos)

Beneficio: migrar de proveedor = cambiar una implementación, no reescribir UI ni flows.

```ts
interface EInvoiceProvider {
  emit(orgId: string, payload: InvoicePayload): Promise<EmitResult>;
  cancel(orgId: string, invoiceId: string, reason: string): Promise<void>;
  getStatus(orgId: string, invoiceId: string): Promise<InvoiceStatus>;
  getPdfUrl(orgId: string, invoiceId: string): Promise<string>;
  submitDailySummary(orgId: string, date: string): Promise<SummaryResult>;
}
```

---

## 1. Schema de DB (migraciones necesarias)

### Tabla nueva: `einvoice_configs` — una por org

| Columna | Tipo | Descripción |
|---|---|---|
| `organization_id` | UUID UNIQUE | FK a organizations |
| `provider` | TEXT | `'nubefact'` hoy; abre puerta a otros |
| `is_active` | BOOLEAN | Si el módulo está activo para esta org |
| `mode` | TEXT | `'sandbox'` \| `'production'` |
| `ruc` | TEXT | RUC de la clínica (11 dígitos) |
| `legal_name` | TEXT | Razón social SUNAT |
| `trade_name` | TEXT | Nombre comercial (opcional) |
| `fiscal_address` | TEXT | Dirección fiscal completa |
| `ubigeo` | TEXT | Código UBIGEO de SUNAT |
| `api_token_encrypted` | TEXT | Token de Nubefact (AES-256-GCM con ENCRYPTION_KEY) |
| `api_route_encrypted` | TEXT | Ruta única de la sub-cuenta Nubefact |
| `certificate_status` | TEXT | `'pending'` \| `'active'` \| `'expiring'` \| `'expired'` |
| `certificate_expires_at` | TIMESTAMPTZ | Fecha expiración certificado digital |
| `default_currency` | TEXT | `'PEN'` default |
| `auto_emit_on_payment` | BOOLEAN | Si emite comprobante automático al registrar pago completo |
| `auto_send_email` | BOOLEAN | Enviar PDF al paciente automáticamente |
| `last_error` | TEXT | Último error de emisión (para banner en UI) |
| `last_error_at` | TIMESTAMPTZ | |
| `created_at` / `updated_at` | TIMESTAMPTZ | |

### Tabla nueva: `einvoice_series` — series autorizadas por SUNAT, multi-serie por org

| Columna | Tipo | Descripción |
|---|---|---|
| `organization_id` | UUID FK | |
| `doc_type` | TEXT | `'factura'` \| `'boleta'` \| `'nota_credito'` \| `'nota_debito'` |
| `series` | TEXT | Ej: `'F001'` (factura), `'B001'` (boleta) |
| `current_number` | BIGINT | Último número emitido |
| `is_active` | BOOLEAN | |
| UNIQUE (org, doc_type, series) | | |

### Tabla nueva: `einvoices` — 1 fila por comprobante emitido

| Columna | Tipo | Descripción |
|---|---|---|
| `id` | UUID PK | |
| `organization_id` | UUID FK | |
| `appointment_id` | UUID FK NULL | Cita origen (si aplica) |
| `patient_id` | UUID FK NULL | |
| `treatment_plan_id` | UUID FK NULL | Si fue por plan completo |
| `doc_type` | TEXT | factura/boleta/NC/ND |
| `series` | TEXT | F001, B001, etc. |
| `number` | BIGINT | Correlativo |
| `customer_doc_type` | TEXT | `'RUC'` \| `'DNI'` \| `'CE'` \| `'PASSPORT'` |
| `customer_doc_number` | TEXT | |
| `customer_name` | TEXT | |
| `customer_address` | TEXT NULL | Obligatorio para facturas, opcional boletas |
| `customer_email` | TEXT NULL | Para envío del PDF |
| `subtotal` | NUMERIC(12,2) | Base sin IGV |
| `igv_amount` | NUMERIC(12,2) | IGV (18% Perú) |
| `discount_amount` | NUMERIC(12,2) | |
| `total` | NUMERIC(12,2) | Total cobrado |
| `currency` | TEXT | PEN |
| `status` | TEXT | `'draft'` \| `'sending'` \| `'accepted'` \| `'rejected'` \| `'cancelled'` |
| `provider_id` | TEXT | ID interno en Nubefact |
| `sunat_cdr_url` | TEXT | URL del CDR para descargar |
| `pdf_url` | TEXT | URL del PDF generado por Nubefact |
| `xml_url` | TEXT | URL del XML firmado |
| `sunat_response` | JSONB | Respuesta cruda de SUNAT (auditoría) |
| `issued_at` | TIMESTAMPTZ | |
| `cancelled_at` | TIMESTAMPTZ NULL | |
| `cancellation_reason` | TEXT NULL | |
| `issued_by_user_id` | UUID FK | Quién emitió (auditoría) |

### Tabla nueva: `einvoice_line_items` — items de cada comprobante

| Columna | Tipo | |
|---|---|---|
| `einvoice_id` | UUID FK | |
| `service_id` | UUID FK NULL | Si el item está ligado a un servicio del catálogo |
| `description` | TEXT | |
| `quantity` | NUMERIC(10,2) | |
| `unit_price` | NUMERIC(12,2) | |
| `subtotal` | NUMERIC(12,2) | |
| `igv_affectation` | TEXT | `'gravado'` \| `'exonerado'` \| `'inafecto'` |
| `unit_of_measure` | TEXT | Código SUNAT (NIU, ZZ) |

### Extensiones a tablas existentes

**`services`** (catálogo de servicios):
- `sunat_code` TEXT — código tributario SUNAT
- `unit_of_measure` TEXT — default `'ZZ'` (servicios)
- `igv_affectation` TEXT — default `'gravado'`
- `exempt_sunat_code` TEXT NULL — razón de exoneración si aplica (atención médica puede ser exonerada en ciertos casos)

**`patients`**:
- `fiscal_doc_type` TEXT — tipo de documento fiscal (DNI default, RUC si empresa)
- `fiscal_doc_number` TEXT — redundante con `dni` pero separado por flexibilidad
- `legal_name` TEXT NULL — razón social si es empresa
- `fiscal_address` TEXT NULL — dirección fiscal (diferente de contacto)
- `ubigeo` TEXT NULL

**`patient_payments`**:
- `einvoice_id` UUID FK NULL — comprobante emitido por este pago

**`appointments`**:
- `einvoice_id` UUID FK NULL — comprobante emitido por esta cita

---

## 2. UI — pantallas y componentes nuevos

### 2.1 Setup inicial — `/settings/facturacion` (nuevo tab en Settings)

**Wizard de 4 pasos:**

1. **Datos de la clínica**: RUC, razón social, nombre comercial, dirección fiscal, ubigeo.
2. **Certificado digital**: upload del `.pfx` + contraseña. Yenda lo envía a Nubefact para almacenarlo (nunca lo guardamos nosotros).
3. **Series autorizadas**: ingresar series activas en SUNAT (F001, B001, etc.). Validar con Nubefact que estén registradas.
4. **Preferencias**: emitir automático al cobrar, enviar PDF por email, sandbox vs producción.

**Estado conectado**: card con RUC + razón social + fecha expiración certificado + botón "Editar" + "Desactivar".

### 2.2 Catálogo de servicios — extensión a `/admin/services`

En el form de crear/editar servicio:
- Nuevo bloque "Datos fiscales":
  - Código SUNAT (lookup desde catálogo precargado)
  - Unidad de medida (default `ZZ`)
  - Afectación IGV (gravado/exonerado/inafecto)
- Badge "⚠ Fiscal incompleto" en la lista si falta alguno → para que owners completen antes de emitir

### 2.3 Ficha del paciente — extensión a `patient-drawer.tsx`

Nuevo tab "Datos fiscales":
- Tipo de documento (DNI/RUC/CE/Pasaporte)
- Número
- Si RUC: razón social + dirección fiscal + ubigeo
- Email fiscal (puede ser distinto al de contacto)

Con búsqueda en SUNAT por RUC/DNI (Nubefact expone endpoint de consulta — lo proxyeamos).

### 2.4 Panel de emisión — **donde vive la magia**

Dos puntos de entrada:

#### A) Desde el sidebar de la cita (`appointment-sidebar.tsx`)

Cuando el estado es `completed` o se registra un pago completo:
- Botón nuevo **"Emitir comprobante"** junto al botón de pago
- Click → abre **drawer/dialog de emisión** con:
  - Tipo (auto: factura si cliente tiene RUC, boleta si no)
  - Serie (auto desde `einvoice_series` activa del tipo)
  - Items pre-llenados desde el servicio de la cita + precio + descuento inline si existe
  - Datos fiscales del paciente (editables si incompletos)
  - Totales (subtotal / IGV / total) — calculados en vivo
  - Botón **"Emitir"** → POST a Nubefact → espera respuesta → mensaje "✓ Comprobante emitido" con número + link al PDF
  - Opción de enviar PDF al email del paciente (checkbox, on por default si hay email)

#### B) Desde el dashboard de caja — `/facturacion` (página nueva)

Vista enfocada para recepción / contador:
- Lista de todos los comprobantes emitidos, filtrable por fecha, tipo, estado, serie
- Columnas: número, fecha, paciente, total, estado (aceptado/rechazado/anulado), acciones
- Acciones por fila:
  - **Ver PDF** (abre en tab nueva desde `pdf_url` de Nubefact)
  - **Reenviar por email**
  - **Anular** (genera nota de crédito + comunicación de baja)
  - **Descargar XML** (para contador)
- Card superior con KPIs:
  - Facturación del mes
  - IGV acumulado
  - Comprobantes pendientes de emisión (citas completadas/pagadas sin comprobante — alerta)
  - Comprobantes rechazados por SUNAT (a atender)

### 2.5 Dialog de anulación

- Select de motivo (SUNAT exige catálogo: "error en datos", "duplicidad", "operación no realizada", etc.)
- Confirmación destructive
- Genera automáticamente la nota de crédito asociada
- Nubefact envía la comunicación de baja a SUNAT

### 2.6 Reportes — extensión a `/reports`

Nuevo tab **"Facturación"** (junto a Operacional, Financiero, etc.):
- **Libro de ventas**: tabla ordenada cronológicamente, formato SUNAT. Export CSV + XML (para el contador)
- **IGV por período**: resumen mensual de base imponible + IGV + total, desglosado por tipo de comprobante
- **Top servicios facturados**: cuáles generan más revenue con IGV
- **Clientes frecuentes con factura** (empresas con RUC que vienen seguido)

### 2.7 Email del paciente — template nuevo

Plantilla `einvoice_sent` con:
- Logo de la clínica
- Saludo personalizado
- Link al PDF del comprobante
- Mensaje legal SUNAT obligatorio
- Sin branding de Yenda ni Nubefact

---

## 3. Flujos end-to-end

### 3.1 Flujo óptimo — emisión al cobrar

```
Paciente llega → Cita completada → Recepción "Registrar pago" → 
  Modal pago con checkbox "Emitir comprobante" (ON por default) →
    Dialog emisión (pre-llenado con datos de la cita + paciente) →
      Click "Emitir" →
        POST a Nubefact (vía nuestro backend, nunca directo desde el cliente) →
          Respuesta síncrona (Nubefact responde en 2-5s con CDR) →
            einvoices.status = 'accepted' →
              PDF descargable →
                Email automático al paciente (si configurado) →
                  Toast "Comprobante emitido: F001-00042"
```

### 3.2 Flujo desacoplado — emisión diferida

Para cuando la clínica emite comprobantes en lote al final del día:

```
Citas cobradas sin comprobante acumulan en "Pendientes" →
  Dashboard /facturacion muestra counter "12 pendientes" →
    Admin click "Emitir todo" →
      Para cada cita, emit automático →
        Reporte final: "10 emitidos, 2 fallaron (revisar)"
```

### 3.3 Flujo de planes de tratamiento

Cuando una paciente paga un plan completo de S/ 4,180 por adelantado:
- Opción A: **1 comprobante por el total** (plan completo como item)
- Opción B: **1 comprobante por sesión** conforme se van realizando
- Config por org o por plan específico

### 3.4 Flujo de anulación

```
Usuario click "Anular" en comprobante →
  Dialog con motivo obligatorio →
    einvoices.status = 'cancelling' →
      POST a Nubefact "comunicación de baja" →
        Nubefact envía a SUNAT (asíncrono, puede tardar horas) →
          Webhook / polling de estado →
            einvoices.status = 'cancelled' cuando SUNAT confirma →
              Notification al user "Comprobante F001-00042 anulado"
```

### 3.5 Flujo de consulta SUNAT (cuando Nubefact responde "pendiente")

Rara vez la emisión no es síncrona (SUNAT caído, tráfico). En ese caso:
- `einvoices.status = 'sending'`
- Job en background (cron cada 5 min) que re-consulta Nubefact
- Cuando viene respuesta, actualiza status + notifica al emisor

---

## 4. Edge cases que debemos resolver

| Caso | Solución |
|---|---|
| **Consumidor final sin DNI** | Permitir boleta con `customer_doc_number = '00000000'`, `customer_doc_type = 'DNI'`, `customer_name = 'CLIENTES VARIOS'` (práctica estándar peruana) |
| **Paciente extranjero** | Soportar CE y Pasaporte como doc fiscal |
| **Servicios médicos exonerados** | Campo `igv_affectation = 'exonerado'` en servicios, con código SUNAT correcto. Algunos procedimientos específicos califican |
| **Anticipo de plan** | Facturar el anticipo como "a cuenta" + al final del plan, nota de crédito/débito ajuste |
| **Descuento aplicado** | Ya lo manejamos a nivel appointment; se traduce a descuento global en el comprobante |
| **Cita cancelada con pago** | Al cancelar, si hay comprobante emitido → obligatorio generar nota de crédito |
| **Series agotadas** | Alerta cuando se está llegando al 90% del correlativo permitido |
| **Certificado por vencer** | Banner rojo en dashboard 30 días antes de expiración del certificado digital |
| **SUNAT caído** | Queue de emisión + retry + notificación al usuario ("se emitirá cuando SUNAT responda") |
| **Duplicidad** | Validar que un appointment no tenga ya un einvoice ACCEPTED antes de re-emitir |

---

## 5. Permisos / roles

| Acción | Owner | Admin | Recep. | Doctor |
|---|---|---|---|---|
| Configurar módulo facturación | ✅ | ✅ | ❌ | ❌ |
| Emitir comprobante | ✅ | ✅ | ✅ | ❌ |
| Anular comprobante | ✅ | ✅ | ⚠️ con auth del admin | ❌ |
| Ver libro de ventas | ✅ | ✅ | ❌ | ❌ |
| Editar datos fiscales del paciente | ✅ | ✅ | ✅ | ❌ |

---

## 6. Prioridades para rollout

### 🔴 P0 — MVP para pilot con Vitra (semana 1 post-activación Nubefact)

- Migración 108: `einvoice_configs` + `einvoice_series` + `einvoices` + `einvoice_line_items`
- `lib/einvoice/` con interface `EInvoiceProvider` + `NubefactProvider`
- Setup wizard en Settings → Facturación (4 pasos)
- Extensión a `services` con campos fiscales
- Extensión a `patients` con tab Datos fiscales
- Botón "Emitir" en sidebar de cita + dialog de emisión
- Página `/facturacion` básica con lista + filtros + ver PDF + reenviar email
- Anulación con dialog
- Email template `einvoice_sent`
- Permisos en roles

### 🟠 P1 — Semana 2-3 post-pilot

- Auto-emisión al registrar pago (toggle)
- Dashboard de KPIs (facturación del mes, IGV, pendientes)
- Lookup de RUC/DNI contra Nubefact (autocompletar datos del paciente)
- Emisión en lote "Emitir todo lo pendiente"
- Queue de reintentos para SUNAT caído
- Alertas: certificado por vencer, series al 90%

### 🟡 P2 — Mes 2+

- Reporte de libro de ventas formato SUNAT (export XML/CSV)
- Reporte IGV mensual
- Notas de crédito con flujo completo
- Facturación por plan de tratamiento (config)
- Webhook de Nubefact para estado asíncrono
- Top servicios facturados
- Multi-serie (más de F001, por si operan varias sucursales)

---

## 7. Preguntas abiertas que Nubefact debe responder

Antes de codear, necesitamos que Nubefact confirme estas cosas en su respuesta al email:

1. **¿API devuelve síncrono o asíncrono?** Si es síncrono (emit → CDR en la misma llamada), UX es óptima. Si es asíncrono, necesitamos queue + polling.
2. **¿Soporta webhook** cuando SUNAT confirma/rechaza?
3. **¿Pueden generar el PDF con nuestro branding** (logo Yenda/clínica) o usa template suyo?
4. **¿La clínica necesita certificado digital propio** o Nubefact provee uno compartido en modo reseller?
5. **Consulta de RUC/DNI** — ¿viene incluido o es API separada?
6. **Formato del CDR** (URL directa, base64, XML embebido)
7. **Rate limits** en emisión (comprobantes por segundo / minuto)
8. **SLA y uptime** real
9. **Soporte de notas de crédito/débito** vía API o solo comprobantes principales
10. **Homologación**: ¿Yenda homologa una sola vez para toda la plataforma o cada cliente homologa su sub-cuenta?

---

## 8. Diferenciación — por qué esto es **un selling point real**

Con este módulo, Yenda deja de ser solo "gestión" y se vuelve **operación fiscal integrada**:

- El doctor/recep emite **sin salir a otro sistema** — ahorro real de 3-5 minutos por cita
- El paciente recibe su comprobante **automático por email** con branding de la clínica
- El contador recibe el **libro de ventas formateado SUNAT** sin intervención del owner
- Los KPIs de ingresos, IGV y cobranza **están en el mismo dashboard** que ocupación y pacientes nuevos

Competidores en Perú (Medigest, Hiscito, Medic Soft) requieren que emitas en Nubefact/Efact aparte y pegues el número manualmente. Esa fricción es nuestra ventaja.

---

## 9. Siguiente paso inmediato

1. **Enviar email a Nubefact** (ya tenemos la carta en `docs/outreach-facturacion-electronica.md`) incluyendo las 10 preguntas de la sección 7.
2. **Cuando Nubefact responda**, validar las asunciones de este doc + ajustar P0 si algo cambia.
3. **Arrancar migración 108 + interfaz `EInvoiceProvider`** aunque Nubefact tarde — la base abstracta puede empezarse sin credenciales.
4. **Setup wizard UI** puede hacerse en paralelo sin token real.

Cuando lleguen las credenciales sandbox de Nubefact, el esqueleto ya debería estar listo para enchufar y probar.
