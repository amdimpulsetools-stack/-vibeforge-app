# Openpay PE — Evaluación como pasarela de payment-links para Yenda

> Fecha: 2026-05-06. Investigación basada en docs públicas y resultados de búsqueda. Las URLs `https://documents.openpay.pe/api-v2/` y `https://www.openpay.pe/` devolvieron HTTP 403 al WebFetch directo, por lo que se citaron fragmentos recuperados vía búsqueda web (Google indexó los mismos endpoints). Se marca explícitamente lo no verificable.

## Veredicto rápido

Openpay PE **sí soporta** generación de links de pago hospedados (endpoint `POST /v1/{merchant_id}/checkouts` que devuelve `checkout_link`), webhooks con reintento y autenticación HTTP Basic con API key. Es viable para Yenda y nos mantiene fuera de scope PCI. **Riesgos**: comisiones altas (~3.49% + IGV con cuenta BBVA, ~3.99% + IGV en tarjetas extranjeras), onboarding atado a BBVA, y el SDK Node oficial está abandonado (última publicación ~2019); habrá que usar el fork comunitario `@cgvweb/openpay-node` o llamar la REST API con `fetch` directo.

## 1. Generación de links de pago

Existe el endpoint **`POST https://sandbox-api.openpay.pe/v1/{merchant_id}/checkouts`** (y su versión en `api.openpay.pe` para prod). Devuelve un objeto `checkout` con campo `checkout_link` que es la URL hospedada que se envía al paciente. Request:

```json
{
  "amount": 250,
  "currency": "PEN",
  "description": "Cargo cobro con link",
  "redirect_url": "https://yenda.app/pago/ok",
  "order_id": "oid-12324",
  "expiration_date": "2026-05-12 12:50",
  "send_email": "true",
  "customer": { "name": "...", "last_name": "...", "phone_number": "...", "email": "..." }
}
```

Response (resumen): `id`, `amount`, `currency`, `status` (`available` cuando está activo), `checkout_link`, `creation_date`, `expiration_date`. Fuente: indexación pública del endpoint en `documents.openpay.pe/api-v2/` ([API Reference Openpay PE](https://documents.openpay.pe/api-v2/)). No hay que hospedar nada — basta con enviar `checkout_link` por WhatsApp.

## 2. Modelo de autenticación

HTTP Basic. *“The API key is the username. The password is not required and should be left blank”* (recuperado de la doc indexada). Formato: `Authorization: Basic base64(sk_xxx:)`. Existe par de claves **public** (frontend, opcional para Openpay.js) y **private** (`sk_...`, server-side). Cada merchant tiene un **`merchant_id`** que va en la ruta. URLs:

- Sandbox: `https://sandbox-api.openpay.pe/v1/{merchant_id}/...`
- Producción: `https://api.openpay.pe/v1/{merchant_id}/...`

No es por-store, es por-merchant. Sandbox y prod usan llaves separadas. Refs: [API Reference](https://documents.openpay.pe/api-v2/), análogo documentado en [Openpay MX](https://documents.openpay.mx/en/api).

## 3. Webhooks

Openpay permite registrar URLs en el dashboard que reciben eventos `charge.succeeded`, `charge.failed`, `charge.cancelled`, etc. Payload (formato MX/CO, idéntico en PE):

```json
{ "type":"charge.succeeded","event_date":"...","transaction":{ "id":"...","status":"completed","order_id":"...","method":"...","amount":...} }
```

*“The webhook should return an HTTP 200 OK status when it receives a notification, otherwise Openpay will retry sending the notification continuously”* y *“you should be prepared to receive the same notification more than once”* ([docs.openpay.co/en/docs/webhooks.html](https://docs.openpay.co/en/docs/webhooks.html)). **Verificación de firma HMAC**: la doc PE/MX documenta autenticación del webhook por **Basic Auth** con usuario/password configurables al registrar la URL — **NO** documenta firma HMAC tipo Stripe. (El producto `getopenpay.com` que sí firma con `signature-digest` es otra empresa distinta — no aplicar). Habrá que verificar por Basic Auth + IP allowlist + idempotencia por `transaction.id`.

## 4. Pricing y comisiones

No hay tabla pública detallada por método; cifras recogidas de notas de prensa y pricing visible:

- **Link de pago / cards locales**: ~3.39%–3.44% + IGV por transacción exitosa.
- **Tarjetas extranjeras**: ~3.99% + IGV.
- **Yape / Plin (vía Smart POS y wallets interoperables)**: ~3.44% + IGV.
- **Sin fee de afiliación, sin mínimo mensual** publicados; *“no high commissions and no enrollment fees”* ([openpay.pe](https://www.openpay.pe/)).
- La comisión final se fija en contrato y queda fija por operación.

Fuente cualitativa: [openpay.pe/comisiones](https://www.openpay.pe/comisiones), [eltiempo.pe](https://eltiempo.pe/economia/link-de-cobro-openpay-bbva-como-funciona-y-que-beneficios-trae-ru/), [BBVA Perú](https://www.bbva.pe/empresas/productos/cobros-y-pagos/soluciones-de-pago/link-de-pago.html). Hay que confirmar con ventas para el ticket promedio de la clínica.

## 5. Onboarding

Requiere **RUC + DNI** del representante; ideal tener **cuenta BBVA** (mejor tarifa y abonos diarios). Onboarding 100% online vía [forms.openpay.pe](https://forms.openpay.pe/). Tiempo típico reportado: pocos días hábiles para activar producción tras KYC. **Sandbox**: las llaves de sandbox se entregan al crear cuenta dev — no requiere KYC completo, así que se puede arrancar la integración antes de tener producción.

## 6. Métodos de pago soportados (Perú)

- Visa, Mastercard, Amex, Diners (locales y extranjeras).
- **Yape y Plin** vía wallets interoperables (BBVA + interoperabilidad BCR).
- Transferencia bancaria / PagoEfectivo en algunos planes.
- Cuotas (campos `payments` en charges, MX-compat — confirmar disponibilidad PE con sales).
- BBVA-specific: el link es procesado por la pasarela BBVA-Openpay.

Refs: [openpay.pe](https://www.openpay.pe/), [bbva.pe link-de-pago](https://www.bbva.pe/empresas/productos/cobros-y-pagos/soluciones-de-pago/link-de-pago.html).

## 7. PCI compliance

Usando `checkouts` (link hospedado en dominio `openpay.pe`), **el dato de tarjeta nunca toca servidores Yenda** — quedamos en **SAQ A** (versión más simple, ~22 controles). Esto es consistente con lo que el PCI SSC define para outsourcing total ([PCI SSC FAQs](https://www.dwt.com/blogs/privacy--security-law-blog/2025/03/pci-faqs-card-processing-ecommerce-merchants)). **No** podemos meter Openpay.js inline si queremos quedarnos en SAQ A; el redirect/link es lo correcto.

## 8. SDKs

- **Oficial**: [`open-pay/openpay-node`](https://github.com/open-pay/openpay-node) — npm `openpay`, **última versión 1.0.5 hace ~6 años**. Sin TypeScript. No recomendable.
- **Fork comunitario**: [`@cgvweb/openpay-node`](https://www.npmjs.com/package/@cgvweb/openpay-node) v3.0.0 (~2024), TypeScript + ESM + async/await. Recomendable si queremos SDK.
- **Alternativa**: REST con `fetch` nativo es simple (Basic auth + JSON). Para Yenda es probablemente más limpio que un SDK semi-mantenido.

## 9. Estimación de integración (MVP Yenda)

Asumiendo dev senior con stack Yenda existente:

| Tarea | Estimado |
|---|---|
| Cliente REST + tipos (Zod) para checkouts | 3–4 h |
| Server Action `createPaymentLink` + tabla `payment_links` + migración | 4–6 h |
| UI: botón en página de pago + modal con Copiar / WhatsApp deeplink | 3–4 h |
| Endpoint webhook `/api/payments/webhook/openpay` + verificación + idempotencia | 4–6 h |
| Settings tab: ingreso de keys + test connection | 3–5 h |
| Pruebas E2E sandbox (link → pago tarjeta de prueba → webhook) | 3–4 h |
| **Total** | **~20–29 h (≈ 3–4 días dev)** |

Suma 1–2 días extra para abstracción multi-gateway si se incluye desde el inicio (recomendado, ver §Recomendación).

## 10. Comparativa con Culqi y MercadoPago

| Dimensión | **Openpay PE** | **Culqi** | **MercadoPago PE** |
|---|---|---|---|
| Link de pago hospedado | `POST /checkouts` → `checkout_link` | **CulqiLink** (orders + share URL), endpoint `POST /v2/orders` | `POST /checkout/preferences` → `init_point` |
| Yape | Sí (wallets interoperables) | **Sí, nativo** (foco en Yape) | **Sí**, vía Checkout API |
| Webhooks | `charge.succeeded`, basic auth, retries | `order.status.changed`, HMAC con header firma | Webhooks v2 + IPN legacy, firma HMAC `x-signature` |
| SDK Node | Oficial abandonado; fork comunitario | `culqi-node` mantenido | `mercadopago` oficial v2 mantenido |
| Comisión link/tarjeta | ~3.39–3.44% + IGV | ~3.44% + IGV (Yape ~2.95%) | ~3.49% + IGV (varía) |
| Onboarding | RUC/DNI + ideal BBVA | RUC/DNI, 100% online | RUC + verificación email |
| Docs | [documents.openpay.pe](https://documents.openpay.pe/api-v2/) | [docs.culqi.com](https://docs.culqi.com/) | [mercadopago.com.pe/developers](https://www.mercadopago.com.pe/developers/en/docs/checkout-pro/overview) |

**Resumen**: para Perú con Yape + WhatsApp, **Culqi es el más nativo** (foco en LATAM Yape, SDK actualizado, CulqiLink pensado exactamente para nuestro caso). **MercadoPago** es el más maduro y multi-país. **Openpay PE** gana si el cliente ya factura por BBVA o quiere centralizar con su POS BBVA.

## Recomendación arquitectónica

### Estructura de carpetas

```
lib/payments/
  gateways/
    types.ts              // PaymentGateway interface
    openpay.ts            // implementación Openpay PE
    culqi.ts              // (futuro)
    mercadopago.ts        // (futuro)
  registry.ts             // resolveGateway(name) → PaymentGateway
  schemas.ts              // Zod schemas compartidos
```

### Interfaz `PaymentGateway`

```ts
export interface PaymentGateway {
  readonly name: 'openpay_pe' | 'culqi' | 'mercadopago_pe';
  createPaymentLink(input: {
    amount: number;        // en céntimos para evitar floats
    currency: 'PEN' | 'USD';
    description: string;
    orderId: string;       // FK a payments.id
    customer: { name: string; email?: string; phone?: string };
    expiresAt?: Date;
    redirectUrl: string;
  }): Promise<{ externalId: string; url: string; expiresAt: Date | null; raw: unknown }>;

  getStatus(externalId: string): Promise<{
    status: 'pending' | 'paid' | 'expired' | 'failed' | 'cancelled';
    paidAt?: Date;
    raw: unknown;
  }>;

  verifyWebhook(req: Request): Promise<{
    valid: boolean;
    event: { type: string; externalId: string; status: string; raw: unknown };
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
  gateway text not null check (gateway in ('openpay_pe','culqi','mercadopago_pe')),
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

### Webhook routing multi-gateway

`app/api/payments/webhook/[gateway]/route.ts` — un solo handler que:

1. Resuelve gateway por param (`openpay_pe`, `culqi`, `mercadopago_pe`).
2. Llama `gateway.verifyWebhook(req)` (cada implementación valida su firma).
3. Hace upsert idempotente en `payment_links` por `(gateway, external_id)`.
4. Si `status === 'paid'`, actualiza `payments.status` y `appointments.payment_status` en una transacción RPC.
5. Devuelve 200 incluso si el evento ya fue procesado (idempotencia).

### Configuración / settings tab

Crear tabla `gateway_credentials (org_id, gateway, public_key, private_key_encrypted, merchant_id, mode 'sandbox'|'live', enabled)`. **Cifrar `private_key`** con `pgcrypto` (`pgp_sym_encrypt`) usando una clave maestra en `process.env.PAYMENTS_ENC_KEY` (env, no en DB). El UI en `(dashboard)/settings/integraciones/pagos` permite por org: activar gateway, ingresar keys (write-only, mostrar mascarilla), botón “Probar conexión” que llama `gateway.createPaymentLink` con monto S/ 1 sandbox y borra. **No** usar env vars per-org porque rompe multi-tenant; mantener env solo para Yenda-as-platform si en el futuro se actúa como aggregator.

### Modal frontend

Componente `<PaymentLinkModal />` que recibe `{ url, expiresAt }`:
- Botón **Copiar** (Clipboard API + toast Sonner).
- Botón **Enviar por WhatsApp** → `https://wa.me/${phone}?text=${encodeURIComponent('Hola, aquí tu link de pago: ' + url)}`.
- Polling cada 10 s a `GET /api/payments/{id}/status` para reflejar “Pagado” en vivo (defensa por si el webhook se atrasa).

---

### Notas finales y huecos no verificables

- **No pude acceder directamente** a `https://documents.openpay.pe/api-v2/` ni a `https://www.openpay.pe/` (ambos devolvieron 403 al WebFetch, posible bloqueo geo/UA). Las cifras y formas exactas de payload se reconstruyeron desde resultados de búsqueda indexados de la misma URL y de la doc MX/CO, que comparten estructura. Antes de implementar, **descargar la PDF/HTML de la doc PE** desde el dashboard de developer y revisar las firmas exactas.
- **Firma HMAC del webhook**: la doc Openpay PE/MX/CO **no** documenta firma criptográfica tipo Stripe; usa Basic Auth en la URL del webhook + IP allowlist. Si esto se confirma, verificar credenciales por header `Authorization` recibido más idempotencia robusta por `transaction.id`.
- **Tarifas exactas**: confirmar con ventas de Openpay PE para volumen de Yenda; las cifras citadas son rangos públicos.
