# Nubefact API — Referencia técnica para implementación

> Resumen técnico extraído del manual oficial Nubefact JSON V1 (PDF: `docs/NUBEFACT DOC API JSON V1.docx`).
> Esta es nuestra fuente de verdad al codear `lib/einvoice/nubefact-provider.ts`. Si algo cambia aquí, cambia la implementación.

---

## 1. Autenticación

### Headers obligatorios en cada request

```http
Authorization: Token token="<TOKEN>"
Content-Type: application/json
```

⚠️ **Detalle importante:** el header `Authorization` tiene el formato literal `Token token="..."` — no es un Bearer token estándar. Hay que construirlo tal cual.

### URL base por ambiente

| Ambiente | URL | Notas |
|---|---|---|
| Demo | `https://demo.nubefact.com/api/v1/<UUID>` | Sandbox. Cuenta gratis desde `nubefact.com/register` |
| Producción ONLINE | `https://api.nubefact.com/api/v1/<UUID>` | Cada empresa tiene su UUID único |
| OFFLINE | `http://localhost:8000/api/v1/<UUID>` | Apps desktop con Nubefact instalado localmente (no aplica a nosotros) |
| Reseller | `https://<subdomain>.pse.pe/api/v1/<UUID>` | Cada cliente tiene su subdomain + UUID |

**En nuestro caso (reseller):** Nubefact asigna a cada org de Yenda un subdomain + UUID + token. Guardamos `route` + `token` encriptados en `einvoice_configs`.

### Método

**Todas las operaciones son `POST`** a la misma URL. La operación se discrimina por el campo `"operacion"` dentro del body JSON.

---

## 2. Las 4 operaciones

### 2.1 `generar_comprobante` — emitir factura/boleta/NC/ND

```json
{
  "operacion": "generar_comprobante",
  "tipo_de_comprobante": 1,          // 1=Factura, 2=Boleta, 3=NC, 4=ND
  "serie": "FFF1",                   // 4 chars. F* para facturas+NC, B* para boletas+NC
  "numero": 1,                       // correlativo int
  "sunat_transaction": 1,            // 1=Venta interna (nuestro caso normal)
  "cliente_tipo_de_documento": 6,    // 6=RUC, 1=DNI, 4=CE, 7=Pasaporte, "-"=Varios, 0=No domiciliado
  "cliente_numero_de_documento": "20600695771",
  "cliente_denominacion": "NUBEFACT SA",
  "cliente_direccion": "...",        // obligatorio en factura, opcional en boleta
  "cliente_email": "...",            // opcional
  "fecha_de_emision": "12-03-2026",  // DD-MM-YYYY
  "moneda": 1,                       // 1=PEN, 2=USD, 3=EUR, 4=GBP
  "porcentaje_de_igv": 18.00,
  "total_gravada": 600,
  "total_igv": 108,
  "total": 708,
  "enviar_automaticamente_a_la_sunat": true,
  "enviar_automaticamente_al_cliente": false,  // si true, Nubefact envía email al paciente
  "items": [
    {
      "unidad_de_medida": "ZZ",      // NIU=productos, ZZ=servicios (nuestro default)
      "codigo": "001",
      "descripcion": "CONSULTA MÉDICA GINECOLOGÍA",
      "cantidad": 1,
      "valor_unitario": 200,         // sin IGV
      "precio_unitario": 236.00,     // con IGV
      "subtotal": 200,               // cantidad × valor_unitario
      "tipo_de_igv": 1,              // 1=Gravado, 8=Exonerado, 9=Inafecto, 12=Retiro muestras médicas
      "igv": 36,
      "total": 236,
      "codigo_producto_sunat": "85121800"  // código del catálogo SUNAT (opcional)
    }
  ]
}
```

**Respuesta (síncrona, 200 OK):**

```json
{
  "tipo_de_comprobante": 1,
  "serie": "FFF1",
  "numero": 1,
  "enlace": "https://www.nubefact.com/cpe/<uuid>",
  "enlace_del_pdf": "https://www.nubefact.com/cpe/<uuid>.pdf",
  "enlace_del_xml": "https://www.nubefact.com/cpe/<uuid>.xml",
  "enlace_del_cdr": "https://www.nubefact.com/cpe/<uuid>.cdr",
  "aceptada_por_sunat": true,
  "sunat_description": "La Factura numero FFF1-1, ha sido aceptada",
  "sunat_responsecode": "0",
  "sunat_soap_error": "",
  "cadena_para_codigo_qr": "20600695771 | 01 | FFF1 | 000001 | ...",
  "codigo_hash": "xMLFMnbgp1/bHEy572RKRTE9hPY="
}
```

✅ **Respuesta síncrona con todos los enlaces + CDR** — SUNAT procesa en la misma llamada. UX óptima para nosotros.

### 2.2 `consultar_comprobante` — consultar estado

```json
{
  "operacion": "consultar_comprobante",
  "tipo_de_comprobante": 1,
  "serie": "FFF1",
  "numero": 1
}
```

Respuesta similar a generar, más el campo `"anulado": false/true`.

**Cuándo usarlo:** si el emit falló con error de red pero puede haber entrado, consultamos antes de retry.

### 2.3 `generar_anulacion` — comunicación de baja

```json
{
  "operacion": "generar_anulacion",
  "tipo_de_comprobante": 1,
  "serie": "FFF1",
  "numero": 1,
  "motivo": "ERROR DEL SISTEMA",
  "codigo_unico": ""
}
```

**Respuesta:**

```json
{
  "numero": 1,
  "enlace": "https://www.nubefact.com/anulacion/<uuid>",
  "sunat_ticket_numero": "1494358661332",
  "aceptada_por_sunat": false,       // ← asíncrono, SUNAT demora
  "sunat_description": null,
  "enlace_del_pdf": "...",
  "enlace_del_xml": "...",
  "enlace_del_cdr": "..."
}
```

⚠️ **Anulación es asíncrona:** `aceptada_por_sunat` sale `false` + viene un `sunat_ticket_numero`. Hay que **polling con `consultar_anulacion`** cada X horas hasta que SUNAT confirme.

### 2.4 `consultar_anulacion`

```json
{
  "operacion": "consultar_anulacion",
  "tipo_de_comprobante": 1,
  "serie": "FFF1",
  "numero": 1
}
```

Cuando SUNAT procesa, `aceptada_por_sunat: true`.

---

## 3. Catálogos de valores críticos

### `tipo_de_comprobante`

| Valor | Tipo |
|---|---|
| `1` | Factura |
| `2` | Boleta de venta |
| `3` | Nota de crédito |
| `4` | Nota de débito |

### `cliente_tipo_de_documento`

| Valor | Documento |
|---|---|
| `6` | RUC — Registro Único de Contribuyente |
| `1` | DNI — Documento Nacional de Identidad |
| `"-"` | VARIOS — ventas <S/ 700 sin identificar ("consumidor final") |
| `4` | Carnet de Extranjería |
| `7` | Pasaporte |
| `A` | Cédula Diplomática |
| `B` | Doc. identidad país residencia (no domiciliado) |
| `0` | NO DOMICILIADO (exportación) |
| `G` | Salvoconducto |

**Para nuestro caso médico:** mayoría DNI (`1`), algunas RUC (`6`) cuando el pago es empresarial (seguros, clínica corporativa), ocasional CE (`4`) o Pasaporte (`7`) para pacientes extranjeros. "Varios" (`-`) es el fallback para boletas chicas sin documento.

### `moneda`

| Valor | Moneda |
|---|---|
| `1` | SOLES (PEN) — default |
| `2` | DÓLARES (USD) |
| `3` | EUROS (EUR) |
| `4` | LIBRA ESTERLINA (GBP) |

### `tipo_de_igv` (por cada item)

Los más relevantes para servicios médicos:

| Valor | Afectación IGV |
|---|---|
| `1` | **Gravado - Operación Onerosa** ← default para servicios médicos con IGV |
| `8` | **Exonerado - Operación Onerosa** ← servicios que SUNAT declara exonerados |
| `9` | Inafecto - Operación Onerosa |
| `12` | **Inafecto – Retiro por Muestras Médicas** ← relevante si la clínica da medicamentos gratis |
| `16` | Exportación |
| `17` | Exonerado - Transferencia Gratuita |

Los demás valores (2-7, 10-11, 13-15, 20) son casos de retiros/bonificaciones que NO aplican a una clínica estándar.

### `sunat_transaction`

| Valor | Transacción |
|---|---|
| `1` | **Venta interna** ← default |
| `2` | Exportación |
| `4` | Venta interna con anticipos |
| `30` | Operación sujeta a detracción |
| `34` | Operación sujeta a percepción |

Otros (29, 31-33, 35) son casos edge. Para Vitra y pilots iniciales solo `1`.

### `unidad_de_medida` (por item)

| Valor | Significado |
|---|---|
| `NIU` | Unidad (productos) |
| `ZZ` | **Servicios** ← nuestro default siempre |
| `4A` | Otros |

### Series válidas

- 4 caracteres exactos
- **F** + 3 chars para facturas y NC/ND de facturas (ej: `F001`, `FF01`)
- **B** + 3 chars para boletas y NC/ND de boletas (ej: `B001`, `BB01`)
- Debe estar previamente autorizada en SUNAT

---

## 4. Manejo de errores

### Códigos de error de Nubefact (en el body)

```json
{
  "errors": "El archivo enviado no cumple con el formato establecido",
  "codigo": 20
}
```

| Código | Significado | Acción |
|---|---|---|
| `10` | Token incorrecto o eliminado | Desactivar integración + pedir reconectar |
| `11` | Ruta/URL incorrecta | Ídem |
| `12` | Header Content-Type incorrecto | Bug nuestro, revisar código |
| `20` | Formato JSON inválido | Bug nuestro, log del payload |
| `21` | No se pudo completar la operación (con mensaje) | Leer mensaje, propagar al usuario |
| `22` | Documento fuera del plazo permitido | SUNAT rechazó por tiempo — error del usuario (emitió tarde) |
| `23` | Documento ya existe en Nubefact | Retry eligió mismo correlativo — bug de correlativo |
| `24` | Documento no existe (en consulta) | No crítico, propagar |
| `40` | Error interno desconocido | Retry con backoff |
| `50` / `51` | Cuenta suspendida / por falta de pago | Desactivar integración + alertar al owner |

### Códigos HTTP

| Código | Significado |
|---|---|
| `200` | Operación exitosa (incluye caso `errors` en body — **hay que revisar el body** también) |
| `400` | Solicitud incorrecta |
| `401` | No autorizado |
| `500` | Error de servidor Nubefact |

⚠️ **Importante:** un HTTP 200 NO garantiza éxito — Nubefact devuelve 200 con `errors` en el body para errores de validación. Siempre parsear el body.

---

## 5. Flujos especiales

### 5.1 Homologación de producción (obligatoria)

Nubefact exige emitir ~15 comprobantes de prueba antes de activar producción:
- 1 factura en soles
- 1 factura en dólares
- 1 factura exonerada/inafecta
- 1 factura exportación
- 1 NC modificando una factura
- 1 ND modificando una factura
- 1 factura combinada (gravada + exonerada)
- 1 consulta de estado
- + equivalentes en boleta
- 1 comunicación de baja

**Implicación para nosotros:** el wizard de setup en Settings debe incluir un paso "Homologación" que automatice la emisión de estos 15 comprobantes de prueba y reporte progreso.

### 5.2 Número correlativo

- Siempre incrementa desde `1` (por cada serie)
- Las **notas de crédito asociadas a una factura van con serie F** (no serie propia)
- Si intentas emitir un correlativo ya usado → error `23`
- **Nuestra responsabilidad:** llevar la cuenta en `einvoice_series.current_number` y usar `max+1` en cada emit (o pedirle a Nubefact el siguiente vía consulta — más seguro pero 1 round-trip extra)

### 5.3 PDF y representación impresa

**Nubefact genera el PDF automáticamente en 3 formatos:**
- A4
- A5 (mitad A4)
- Ticket (pequeño para impresora térmica)

Se elige con campo `formato_de_pdf` en el request. Si viene vacío, usa el default configurado en la cuenta.

**Alternativa:** generar nuestro propio PDF en Yenda con el branding de la clínica. Esto requiere:
- Generar código QR con el formato exacto SUNAT (ver manual sección REPRESENTACIÓN IMPRESA)
- Incluir todos los campos mínimos legales
- No es obligatorio Nubefact — el PDF de Nubefact es legalmente válido

**Recomendación MVP:** usar el PDF de Nubefact (campo `enlace_del_pdf` de la respuesta). En v2 podemos generar el nuestro con branding de la clínica.

### 5.4 Campos opcionales que activa la cuenta

Hay 3 campos de respuesta que vienen como base64 y son opcionales (hay que activarlos en "Configuración principal" de Nubefact):
- `xml_zip_base64`
- `pdf_zip_base64`
- `cdr_zip_base64`

**Utilidad:** guardarlos en nuestro Storage (Supabase Storage) como backup offline, en vez de depender de los enlaces de Nubefact. Recomiendo activar esto en producción.

---

## 6. Mapping Yenda → Nubefact

Cómo nuestras entidades se traducen al payload de Nubefact:

| Yenda | Nubefact |
|---|---|
| `appointments.patient_name` | `cliente_denominacion` |
| `patients.fiscal_doc_number` | `cliente_numero_de_documento` |
| `patients.fiscal_doc_type` (DNI/RUC/...) | mapeado a códigos (`1`/`6`/...) |
| `patients.fiscal_address` o `patients.address` | `cliente_direccion` |
| `patients.email` o `patients.fiscal_email` | `cliente_email` |
| `services.name` | item `descripcion` |
| `services.sunat_code` | `codigo_producto_sunat` |
| `services.igv_affectation` (gravado/exonerado/inafecto) | `tipo_de_igv` (1/8/9) |
| `services.unit_of_measure` | `unidad_de_medida` (default "ZZ") |
| `appointments.price_snapshot` | `valor_unitario` (sin IGV) |
| Cálculo nuestro: `price × 1.18` | `precio_unitario` (con IGV) |
| `appointments.discount_amount` | `descuento_global` o item `descuento` |
| Hoy | `fecha_de_emision` (DD-MM-YYYY) |
| `einvoice_configs.default_currency` | `moneda` (1 default) |

---

## 7. Contactos Nubefact (del manual)

- **Soporte técnico:** `soporte@nubefact.com`
- **Teléfono:** 01 468 3535 opción 2
- **WhatsApp:** 955 598 762
- **Ayuda web:** [ayuda.nubefact.com](https://ayuda.nubefact.com)

Si la opción "API (Integración)" no aparece en el panel → escribir a soporte para que la activen.

---

## 8. Checklist de implementación `NubefactProvider`

Cuando vayamos a codear, seguir este orden:

### Fase A — Skeleton y sandbox (~2 sesiones con IA)

- [ ] Migración 108: `einvoice_configs`, `einvoice_series`, `einvoices`, `einvoice_line_items`
- [ ] `lib/einvoice/types.ts` — tipos TS que reflejan el schema Nubefact (fuerte tipado)
- [ ] `lib/einvoice/provider.ts` — interfaz `EInvoiceProvider` abstracta
- [ ] `lib/einvoice/nubefact-provider.ts` — implementación real con fetch
- [ ] `lib/einvoice/mapper.ts` — convierte `InvoicePayload` interno (lo que Yenda maneja) a payload Nubefact JSON
- [ ] Env vars: `NUBEFACT_DEMO_ROUTE`, `NUBEFACT_DEMO_TOKEN` (para testing inicial)
- [ ] Test smoke: emit de factura gravada contra demo → print respuesta

### Fase B — UI básica (~2-3 sesiones)

- [ ] Tab nuevo "Facturación" en `/settings` con wizard de 4 pasos (datos clínica, certificado, series, preferencias)
- [ ] Campos fiscales en `services` (sunat_code, unit_of_measure, igv_affectation)
- [ ] Tab "Datos fiscales" en `patient-drawer`
- [ ] Botón "Emitir comprobante" en `appointment-sidebar`
- [ ] Dialog de emisión con preview totales
- [ ] Routes: `POST /api/einvoices/emit`, `POST /api/einvoices/[id]/cancel`, `GET /api/einvoices/[id]`

### Fase C — Lista y reportes (~2 sesiones)

- [ ] Página `/facturacion` con lista + filtros + KPIs
- [ ] Anulación con dialog + polling de estado
- [ ] Reenvío por email
- [ ] Download PDF/XML

### Fase D — Producción (después de pilot Vitra)

- [ ] Homologación automatizada (15 comprobantes de prueba)
- [ ] Switch demo → producción con verificación
- [ ] Webhooks o cron de polling para anulaciones pendientes
- [ ] Auto-emit al registrar pago (toggle)
- [ ] Libro de ventas formato SUNAT
- [ ] Almacenamiento de base64 del XML/PDF/CDR como backup

---

## 9. Asunciones operativas pendientes de confirmar con Nubefact

Cosas que el manual no aclara y debemos validar con ventas/soporte antes o durante el onboarding reseller:

1. **Certificado digital reseller:** ¿Nubefact provee uno compartido o cada clínica trae el suyo propio?
2. **Series autorizadas:** ¿las creamos desde el panel web o hay API para registrar nuevas?
3. **Rate limits:** ¿cuántos comprobantes por segundo/minuto en demo vs producción?
4. **SLA:** uptime garantizado y tiempo máximo de respuesta
5. **Costo por comprobante** exacto sobre el límite incluido del plan (el agente web dijo ~S/ 0.025, confirmar)
6. **Subdomain reseller:** ¿podemos elegirlo (ej. `yenda.pse.pe`) o nos lo asignan?
7. **White-label en emails:** ¿el correo que Nubefact envía al paciente (si activamos `enviar_automaticamente_al_cliente`) tiene nuestra marca o la de Nubefact?
8. **PDF custom branding:** ¿podemos subirles logo + colores de cada clínica o usan los nuestros?

Estas se resuelven en la primera llamada comercial.

---

## 10. Referencias

- Manual oficial (incluido en repo): `docs/NUBEFACT DOC API JSON V1.docx`
- Ejemplos JSON (incluidos): `docs/EJEMPLOS-DE-ARCHIVOS-JSON/`
- Código PHP ejemplo (incluido): `docs/PHP-INTEGRACION-CON-NUBEFACT-EJEMPLO-CODIGO-JSON/NubeFact-json.php`
- Página integración: https://www.nubefact.com/integracion
- Página reseller: https://www.nubefact.com/revendedor
- Form cotización reseller: https://www.nubefact.com/cotizar?tipo=PSE-RESELLER
