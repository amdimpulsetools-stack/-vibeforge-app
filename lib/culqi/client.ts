// Cliente mínimo de la API Culqi v2 (server-side).
//
// El backend NUNCA ve tarjetas: los tokens (tkn_... / ype_...) los crea
// el navegador con el checkout de Culqi contra la public key de la
// clínica (PCI ok). Aquí solo se crean cargos con la secret key.
// JAMÁS loguear la secret key ni incluirla en errores.

const CULQI_API_BASE = "https://api.culqi.com/v2";
const CHARGE_TIMEOUT_MS = 25_000;

/** Prefijo ype_ = token de Yape; cualquier otro (tkn_) = tarjeta. */
export function isYapeSource(sourceId: string): boolean {
  return sourceId.startsWith("ype_");
}

export type CulqiPaymentMethod = "yape" | "tarjeta";

export function paymentMethodForSource(sourceId: string): CulqiPaymentMethod {
  return isYapeSource(sourceId) ? "yape" : "tarjeta";
}

// Forma real de los errores Culqi:
// { object: "error", type, charge_id?, code?, merchant_message, user_message }
export interface CulqiApiError {
  object: "error";
  type?: string;
  code?: string;
  charge_id?: string;
  merchant_message?: string;
  user_message?: string;
}

export interface CulqiCharge {
  object: string; // "charge"
  id: string; // chr_...
  amount: number; // céntimos
  currency_code: string;
  email?: string;
  source?: { id?: string; object?: string; type?: string };
  outcome?: { type?: string; code?: string; user_message?: string };
  metadata?: Record<string, string>;
}

export type CreateChargeResult =
  | { ok: true; charge: CulqiCharge }
  | {
      ok: false;
      /** Mensaje rescatable para mostrar al pagador (viene de Culqi o genérico). */
      userMessage: string;
      code?: string;
      merchantMessage?: string;
      /** true = fallo de red/timeout: NO sabemos si el cargo pasó. */
      indeterminate?: boolean;
    };

const GENERIC_USER_MESSAGE =
  "No pudimos procesar el pago. Inténtalo de nuevo o usa otro medio de pago.";

/**
 * Crea un cargo en Culqi (POST /v2/charges).
 * `amountCents` SIEMPRE debe venir del monto guardado en BD (en
 * céntimos, entero) — jamás de un valor enviado por el navegador.
 */
export async function createCharge(params: {
  secretKey: string;
  amountCents: number;
  email: string;
  sourceId: string;
  metadata?: Record<string, string>;
}): Promise<CreateChargeResult> {
  const { secretKey, amountCents, email, sourceId, metadata } = params;

  if (!Number.isInteger(amountCents) || amountCents <= 0) {
    return { ok: false, userMessage: GENERIC_USER_MESSAGE, code: "invalid_amount" };
  }

  let res: Response;
  try {
    res = await fetch(`${CULQI_API_BASE}/charges`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${secretKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        amount: amountCents,
        currency_code: "PEN",
        email,
        source_id: sourceId,
        ...(metadata ? { metadata } : {}),
      }),
      signal: AbortSignal.timeout(CHARGE_TIMEOUT_MS),
    });
  } catch {
    // Timeout o red caída DESPUÉS de enviar: el cargo pudo haberse
    // creado en Culqi. El webhook (/api/webhooks/culqi) reconcilia.
    return {
      ok: false,
      userMessage:
        "No recibimos respuesta del procesador de pagos. Si el cobro llegó a tu banco o Yape, se registrará automáticamente; no vuelvas a pagar sin verificar.",
      code: "network_error",
      indeterminate: true,
    };
  }

  let data: unknown = null;
  try {
    data = await res.json();
  } catch {
    // Respuesta no-JSON (proxy, HTML de error, etc.)
  }

  if (res.ok && data && (data as CulqiCharge).object === "charge") {
    return { ok: true, charge: data as CulqiCharge };
  }

  const err = (data ?? {}) as CulqiApiError;
  return {
    ok: false,
    userMessage: err.user_message || GENERIC_USER_MESSAGE,
    code: err.code,
    merchantMessage: err.merchant_message,
  };
}
