# Openpay PE — Evaluación como pasarela de payment-links para Yenda

> **v2 — Verificado contra docs oficiales PE (`https://documents.openpay.pe/api-v2/`)** copiadas manualmente por el founder. La v1 de este reporte se reconstruyó desde resultados de búsqueda + docs MX/CO porque WebFetch a la URL devolvía 403; varios datos resultaron incorrectos. Las correcciones están marcadas explícitamente al final.

## Veredicto rápido (revisado)

Openpay PE **sí soporta** generación de link de pago hospedado vía `POST /v1/{MERCHANT_ID}/checkouts`. Auth HTTP Basic, webhooks con reintentos, PCI SAQ A vía hosted checkout. **PERO** — corrección crítica vs v1 — la doc PE oficial **NO menciona Yape ni Plin como métodos soportados**. Los medios documentados son: **tarjetas (crédito/débito), efectivo en tiendas (con código de barras), transferencias interbancarias y puntos bancarios**. Para una clínica peruana donde Yape es el método dominante de pagos chicos (consultas S/100–S/300), esto es un agujero grande. **Recomendación: NO arrancar la abstracción multi-gateway con Openpay PE — empezar con Culqi (Yape nativo) y agregar Openpay sólo si un cliente B2B específico lo exige por relación BBVA.**

## 1. Generación de links de pago — confirmado

Endpoint:
```
POST https://sandbox-api.openpay.pe/v1/{MERCHANT_ID}/checkouts          # nivel comercio
POST https://sandbox-api.openpay.pe/v1/{MERCHANT_ID}/customers/{CUSTOMER_ID}/checkouts  # nivel cliente
```

Request (campos verificados en doc oficial PE):

```json
{
  "amount": 250,
  "currency": "PEN",
  "description": "Cargo cobro con link",
  "redirect_url": "https://yenda.app/pago/ok",
  "order_id": "oid-12324",
  "expiration_date": "2026-05-12 12:50",
  "send_email": "true",
  "customer": {
    "name": "Cliente Perú",
    "last_name": "Vazquez Juarez",
    "phone_number": "4448936475",
    "email": "juan.vazquez@empresa.pe"
  }
}
```

| Campo | Tipo | Notas |
|---|---|---|
| `amount` | numeric | requerido, > 0 |
| `currency` | string | requerido, **solo `PEN` o `USD`** |
| `description` | string | requerido, ≤ 250 chars |
| `redirect_url` | string | requerido — la URL a la que vuelve el paciente luego de pagar |
| `order_id` | string | opcional, ≤ 100 chars, único por comercio. **Imprescindible para correlacionar el webhook** |
| `expiration_date` | datetime | opcional, ISO 8601 |
| `send_email` | boolean | opcional — Openpay envía email al cliente con el link |
| `customer` | object | requerido (al nivel comercio) — `name`, `last_name`, `email`, `phone_number` |

⚠️ **Hueco en la doc PE pasada**: el cuerpo de la respuesta del POST `/checkouts` **no aparece en lo que copiaste** (la sección "Crear Cobro con Link" muestra el request pero recorta antes del response, y "Consultar/Actualizar Cobro con Link" están como subtítulos sin contenido). Hay que validar en sandbox cuál es el campo exacto que trae la URL del checkout (probablemente `payment_method.url` o `checkout_link`, basado en la simetría con el endpoint `/charges` con redirect que sí muestra `payment_method: { type: "redirect", url: "..." }`).

## 2. Autenticación — confirmado

HTTP Basic Auth. La llave privada `sk_xxx` va como usuario, password vacío:

```bash
curl https://sandbox-api.openpay.pe/v1/{MERCHANT_ID}/charges \
  -u sk_e568c42a6c384b7ab02cd47d2e407cab:
```

- **2 tipos de llaves**: Privada (`sk_…`, server-to-server, todas las operaciones) y Pública (`pk_…`, solo para tokens/tarjetas vía Openpay.js).
- Sandbox y producción tienen llaves separadas. Producción se desbloquea tras aprobación KYC.
- Todas las peticiones deben ser HTTPS.
- **Header obligatorio en cargos directos a tarjeta**: `X-Forwarded-For` con la IP del dispositivo del cliente (anti-fraude). No queda claro si aplica al endpoint `/checkouts` — probablemente no, porque ahí Openpay maneja la captura. Validar en sandbox.

## 3. Webhooks — confirmado, sin firma HMAC

La doc PE confirma lo que la v1 ya señalaba: **no existe firma criptográfica tipo Stripe**. Autenticación de inbound webhooks vía **HTTP Basic Auth** con `user` + `password` que se configuran al registrar la URL.

```json
{
  "id": "wxvanstudf4ssme8khmc",
  "url": "https://yenda.app/api/payments/webhook/openpay_pe",
  "user": "yenda",
  "password": "<random-strong>",
  "event_types": ["charge.succeeded", "charge.failed", "charge.cancelled", "charge.refunded"],
  "status": "verified"
}
```

**Eventos disponibles (PE oficial)**:
- `charge.created`, `charge.succeeded`, `charge.failed`, `charge.cancelled`, `charge.refunded`, `charge.rescored.to.decline`
- `subscription.charge.failed`
- `payout.created`, `payout.succeeded`, `payout.failed`
- `transfer.succeeded`
- `fee.succeeded`, `fee.refund.succeeded`
- `spei.received` (probablemente residual de MX, no aplica a PE)
- `chargeback.created`, `chargeback.rejected`, `chargeback.accepted`
- `order.created`, `order.activated`, `order.payment.received`, `order.completed`, `order.expired`, `order.cancelled`, `order.payment.cancelled`

⚠️ **No hay un evento específico `checkout.completed`**. Cuando un paciente paga vía el link, lo más probable es que Openpay dispare `charge.succeeded` con el `order_id` que enviamos al crear el checkout. **Patrón a usar**: lookup por `order_id` (que en Yenda es el `payment_links.id` o un compuesto con `external_id`) en el handler del webhook.

**Requisitos del endpoint receptor (doc oficial)**:
- Solo dominios (no IPs)
- Puertos: 443/TCP, 8443/TCP, 10443/TCP
- HTTPS/TLS 1.2 obligatorio
- Certificado válido firmado por CA pública

**Reintentos**: Openpay reintenta hasta recibir 200. La política exacta (backoff, max retries) no está documentada en la versión PE — probablemente similar a MX/CO (cada hora x 24 h). **Idempotencia obligatoria del lado nuestro** por `transaction.id` o `order_id`.

**Recomendación de seguridad** (porque Basic Auth no es robusta):
1. Usar user/pass largos y aleatorios (32+ chars).
2. Después de recibir el webhook, **re-fetch del charge** vía `GET /v1/{merchant_id}/charges/{transaction_id}` con la API key privada para confirmar el estado real. Esto previene spoofing si alguien adivina/intercepta las creds del webhook.
3. Idempotencia por `(gateway, external_id)` en `payment_links`.
4. IP allowlist si Openpay PE publica rangos (no en doc; consultar a sales).

## 4. Pricing y comisiones — sigue siendo opaco

Sin tabla pública. Cifras públicas reportadas en notas de prensa BBVA/Openpay (no oficiales):
- Link de pago / cards locales: ~3.39%–3.44% + IGV
- Tarjetas extranjeras: ~3.99% + IGV
- Sin fee de afiliación, sin mínimo mensual publicados

⚠️ Hay que **confirmar con ventas Openpay PE** para tu volumen y ticket promedio. Para una clínica con tickets de S/200 y 200 pagos/mes, una diferencia de 0.5% son ~S/200/mes = ~US$50.

## 5. Onboarding

Sandbox: inmediato al crearse cuenta dev. Producción: requiere RUC + DNI representante + KYC + ideal cuenta BBVA. Tiempo típico: pocos días hábiles. Forms en `forms.openpay.pe`.

## 6. **CORRECCIÓN IMPORTANTE — Métodos de pago soportados**

La v1 afirmaba "Yape y Plin vía wallets interoperables". **La doc PE oficial copiada NO los menciona en ninguna parte**. La sección "Cobro con Link" especifica los métodos así:

> *"Permite realizar cobros a través de la generación de un link el cual puede ser compartido por medio de un email, redes sociales o bien por un mensaje de texto, de esta manera se logra que los comercios puedan recibir pagos con tarjetas de crédito, débito, **puntos bancarios, transferencias interbancarias y/o efectivo en tiendas**, todo esto sin la necesidad de que el comercio cuenta con un sitio web o app"*

Métodos confirmados en endpoints `/charges`:
- `card` — Visa, Mastercard, Amex (tarjetas locales y extranjeras)
- `store` — pago con código de barras en tienda física (efectivo)
- `bank_account` — transferencia bancaria

**No hay método `yape` ni `plin`** documentado en lo que pasaste. Esto es **el factor decisivo** para una clínica peruana, porque Yape es el rail dominante para pagos < S/500.

> **Posibilidad**: Yape puede estar disponible vía contrato con BBVA bajo el flag de "wallets" sin estar documentado públicamente. Verificar con ventas Openpay PE — si dicen que sí está, pedirles el endpoint/parámetro. Si dicen que no, descartar Openpay como gateway primario.

## 7. PCI compliance

Usando `/checkouts` con redirección a `openpay.pe`, el dato de tarjeta nunca toca servidores Yenda → **SAQ A** (versión más simple, ~22 controles vs 300+ de SAQ D). Esto **no aplica** si en el futuro usamos Openpay.js inline (queda en SAQ A-EP, más exigente).

## 8. SDKs

- **Oficial Node**: `openpay` v1.0.5, abandonado hace ~6 años. No usar.
- **Fork comunitario**: `@cgvweb/openpay-node` v3 (TypeScript, ESM). Usable.
- **Recomendado**: REST con `fetch` directo. La API es simple, son ~5 endpoints. Menos dependencia, mejor control de errores. Para Yenda con stack Next.js / Zod / TypeScript, el SDK no aporta valor.

## 9. Estimación de integración (MVP Yenda)

| Tarea | Estimado |
|---|---|
| Cliente REST + tipos Zod para `/checkouts` y `/charges/{id}` | 3–4 h |
| Server Action `createPaymentLink` + tabla `payment_links` + migración | 4–6 h |
| UI: botón en form de pago + modal con Copiar / WhatsApp deeplink | 3–4 h |
| Webhook `/api/payments/webhook/openpay_pe` con re-fetch + idempotencia | 5–7 h |
| Settings tab: ingreso de keys cifradas + test connection | 3–5 h |
| Pruebas E2E sandbox (link → pago tarjeta de prueba → webhook) | 3–4 h |
| **Total Openpay solo** | **~21–30 h (~3–4 días)** |
| Abstracción multi-gateway adicional | +6–8 h |

## 10. Comparativa con Culqi y MercadoPago — corregida

| Dimensión | **Openpay PE** | **Culqi** | **MercadoPago PE** |
|---|---|---|---|
| Link de pago hospedado | `POST /checkouts` | **CulqiLink** (`POST /v2/orders` + share URL) | `POST /checkout/preferences` → `init_point` |
| **Yape** | ❌ No documentado | ✅ **Sí, nativo** | ✅ Sí, vía Checkout API |
| **Plin** | ❌ No documentado | ✅ Sí (vía interoperabilidad bancaria) | ⚠️ Parcial |
| Pago en efectivo | ✅ tienda con barcode | ✅ PagoEfectivo, BCP, BBVA Agente | ✅ PagoEfectivo |
| Tarjetas | ✅ Visa/MC/Amex/Diners | ✅ Visa/MC/Amex/Diners | ✅ Visa/MC/Amex/Diners |
| Webhooks | Basic Auth, sin HMAC | HMAC con header firma | HMAC `x-signature` |
| SDK Node oficial | Abandonado (v1.0.5, ~2019) | `culqi-node` mantenido | `mercadopago` v2 mantenido |
| Sandbox inmediato | ✅ | ✅ | ✅ |
| Comisión link/tarjeta (ref) | ~3.39–3.44% + IGV | ~3.44% + IGV (Yape ~2.95%) | ~3.49% + IGV |
| Onboarding | RUC/DNI + ideal BBVA | RUC/DNI, 100% online | RUC + verificación email |
| Diferenciador | Backed by BBVA | **Foco LATAM/Yape** | Multi-país, ecosistema MELI |

**Veredicto comparativo**:
- 🥇 **Culqi** es el natural primero para Yenda. Yape nativo, SDK actualizado, CulqiLink pensado exactamente para "envía un link y cobra".
- 🥈 **MercadoPago** segundo. Más maduro, multi-país, pero menos foco Perú.
- 🥉 **Openpay PE** tercero. Tiene sentido sólo para clientes que ya operan con BBVA y prefieren centralizar, o para tickets altos donde Yape no aplica (ej. tratamientos FIV de S/15k).

## Recomendación arquitectónica

### Estrategia de rollout

1. **Construye la abstracción multi-gateway desde día 1** (interfaz `PaymentGateway`, tabla `payment_links`, ruta de webhook con `[gateway]` param). El costo extra es ~1 día.
2. **Primer gateway: Culqi**. Yape nativo cierra el caso de uso real de tu ICP.
3. **Segundo gateway (cuando un cliente B2B lo pida): Openpay PE**. La abstracción ya existe, agregar la implementación es ~2–3 días.
4. **Tercero opcional: MercadoPago**, si expandes fuera de Perú o si un cliente lo pide.

### Estructura

```
lib/payments/
  gateways/
    types.ts              // PaymentGateway interface
    culqi.ts              // primer gateway
    openpay-pe.ts         // segundo
    mercadopago-pe.ts     // tercero
  registry.ts             // resolveGateway(orgId, name) → PaymentGateway
  schemas.ts              // Zod schemas compartidos
  encryption.ts           // pgcrypto helpers para keys
```

### Interfaz `PaymentGateway`

```ts
export interface PaymentGateway {
  readonly name: 'culqi' | 'openpay_pe' | 'mercadopago_pe';

  createPaymentLink(input: {
    amountCents: number;
    currency: 'PEN' | 'USD';
    description: string;
    orderId: string;
    customer: { name: string; lastName?: string; email: string; phone?: string };
    expiresAt?: Date;
    redirectUrl: string;
  }): Promise<{
    externalId: string;
    url: string;
    expiresAt: Date | null;
    raw: unknown;
  }>;

  getStatus(externalId: string): Promise<{
    status: 'pending' | 'paid' | 'expired' | 'failed' | 'cancelled';
    paidAt?: Date;
    raw: unknown;
  }>;

  verifyWebhook(req: Request): Promise<{
    valid: boolean;
    event: { type: string; externalId: string; orderId: string; status: string; raw: unknown };
  }>;
}
```

### Tabla `payment_links` (Supabase)

```sql
create table public.payment_links (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  payment_id uuid references payments(id) on delete set null,
  appointment_id uuid references appointments(id) on delete set null,
  gateway text not null check (gateway in ('culqi','openpay_pe','mercadopago_pe')),
  external_id text not null,
  url text not null,
  status text not null default 'pending'
    check (status in ('pending','paid','expired','failed','cancelled')),
  amount_cents integer not null,
  currency text not null default 'PEN',
  expires_at timestamptz,
  paid_at timestamptz,
  raw_create jsonb,
  raw_last_event jsonb,
  created_at timestamptz default now(),
  created_by uuid references auth.users(id),
  unique (gateway, external_id)
);

alter table public.payment_links enable row level security;

create policy "org members read" on payment_links
  for select using (org_id in (select org_id from org_members where user_id = auth.uid()));

create index on payment_links (org_id, status);
create index on payment_links (payment_id);
```

### Webhook handler `app/api/payments/webhook/[gateway]/route.ts`

```ts
export async function POST(req: Request, { params }: { params: { gateway: string } }) {
  const gateway = resolveGateway(params.gateway);
  if (!gateway) return new Response('Unknown gateway', { status: 404 });

  const { valid, event } = await gateway.verifyWebhook(req);
  if (!valid) return new Response('Invalid signature', { status: 401 });

  // Idempotency: upsert payment_links by (gateway, external_id) + raw_last_event.
  // If status === 'paid', defensive re-fetch via gateway.getStatus(external_id),
  // then update payments + appointments in a transaction RPC.
  await processPaymentEvent(gateway.name, event);

  return new Response('OK', { status: 200 });
}
```

### Configuración (settings tab)

Tabla `gateway_credentials (org_id, gateway, public_key, private_key_encrypted, merchant_id, mode 'sandbox'|'live', enabled, webhook_user, webhook_password_encrypted)`. Cifrar `private_key` y `webhook_password` con `pgcrypto.pgp_sym_encrypt` usando `process.env.PAYMENTS_ENC_KEY`. UI write-only (mascarilla en lectura), botón "Probar conexión" que crea un link sandbox de S/1 y lo borra.

### Modal frontend

```tsx
<PaymentLinkModal url={url} expiresAt={expiresAt} phone={patient.phone}>
  <Button onClick={copy}>Copiar enlace</Button>
  {phone && (
    <Button onClick={() => window.open(`https://wa.me/${normalizePhone(phone)}?text=${encodeURIComponent(`Hola, aquí tu link de pago: ${url}`)}`, '_blank')}>
      Enviar por WhatsApp
    </Button>
  )}
</PaymentLinkModal>
```

Polling cada 10 s a `GET /api/payment-links/{id}/status` para reflejar "Pagado" en vivo (defensa por si webhook se atrasa).

---

## Cambios vs v1 (transparencia)

| Punto | v1 | Realidad PE oficial | Impacto |
|---|---|---|---|
| Yape soportado | "Sí, vía wallets interoperables" | **No mencionado en docs PE** | 🔴 Cambia veredicto |
| Plin soportado | "Sí" | No mencionado | 🔴 Cambia veredicto |
| Endpoint /checkouts | `POST /checkouts` → `checkout_link` | Endpoint confirmado, **response shape incierto** | 🟡 A validar en sandbox |
| Webhooks sin HMAC | Sí | ✅ Confirmado | ✅ Sin cambio |
| HTTP Basic auth | Sí | ✅ Confirmado | ✅ Sin cambio |
| PCI SAQ A vía hosted | Sí | ✅ Confirmado | ✅ Sin cambio |
| Eventos webhook | "charge.succeeded incluido" | ✅ Confirmado, sin `checkout.*` específico | 🟡 Mapear por `order_id` |
| SDK Node oficial abandonado | Sí | ✅ Confirmado | ✅ Sin cambio |
| Comisiones | ~3.39–3.49% | Sigue sin tabla pública | 🟡 Confirmar con sales |

## Huecos abiertos para validar antes de implementar

1. **Response shape de `POST /checkouts`** (la doc PE pasada lo recortó). Crear cuenta dev y probar en sandbox.
2. **¿Yape/Plin disponibles fuera de la doc pública?** Pregunta directa a ventas Openpay PE.
3. **Política exacta de reintentos del webhook** (intervalo, max retries, qué pasa después de 24 h).
4. **Tarifas reales** para volumen Yenda (~200–500 pagos/mes/org).
5. **`X-Forwarded-For` en `/checkouts`** — ¿obligatorio o sólo para `/charges` directos?
6. **Recurrencia (suscripciones)** — la doc PE muestra el módulo apuntando a `mrc.openpay.mx` (URLs MX). Confirmar si está habilitado en PE o si es una sección copy-pasted de la doc MX (relevante si más adelante quieres mensualizar tratamientos FIV).
