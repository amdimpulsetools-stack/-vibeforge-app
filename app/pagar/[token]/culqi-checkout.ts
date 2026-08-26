/**
 * ══════════════════════════════════════════════════════════════════════════
 *  ÚNICO PUNTO DE ACOPLAMIENTO CON CULQI (Checkout Custom / checkout-js)
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Todo lo que sabe de Culqi vive en este archivo: la URL del script, la
 * instanciación de `CulqiCheckout`, la forma del config y los callbacks.
 * El resto de la página solo llama a `openCulqiCheckout(...)` con una
 * interfaz neutra. Si el API real de Culqi difiere, SOLO se toca este
 * archivo.
 *
 * ⚠️ VALIDAR EN SANDBOX ANTES DEL LANZAMIENTO ⚠️
 * La superficie exacta del checkout-js (nombres de callbacks, forma del
 * config, campos del token) fue verificada contra la documentación pública
 * de Culqi ("Checkout Custom", docs.culqi.com/es/documentacion/checkout/
 * checkout-custom) y contra integraciones reales publicadas (ago-2026),
 * pero DEBE probarse con llaves de prueba (pk_test_...) antes de salir a
 * producción: tarjeta 4111 1111 1111 1111 y Yape de prueba.
 *
 * Superficie asumida (Checkout Custom vigente — CulqiJS v2/v3/v4 y
 * Checkout v4 están descontinuándose):
 *   - Script:   https://js.culqi.com/checkout-js  → expone window.CulqiCheckout
 *   - Uso:      const c = new CulqiCheckout(publicKey, { settings, client, options, appearance })
 *   - Callback: c.culqi = () => { ... }  // lee c.token (tkn_/ype_) o c.error
 *               c.closeCheckout = () => { ... }   // usuario cerró el modal
 *   - Abrir:    c.open()   Cerrar: c.close()
 *   - settings.amount va en CÉNTIMOS (8000 = S/ 80.00), currency "PEN".
 */

const CULQI_SCRIPT_URL = "https://js.culqi.com/checkout-js";

// ── Tipos mínimos de la superficie de Culqi que consumimos ────────────────

interface CulqiTokenLike {
  /** "tkn_..." (tarjeta) o "ype_..." (Yape) */
  id: string;
  object?: string;
}

interface CulqiErrorLike {
  user_message?: string;
  merchant_message?: string;
  code?: string;
  object?: string;
}

interface CulqiCheckoutInstance {
  open: () => void;
  close: () => void;
  /** Culqi invoca esta función tras tokenizar (éxito o error). */
  culqi: () => void;
  /** Culqi invoca esta función cuando el usuario cierra el modal. */
  closeCheckout: () => void;
  token?: CulqiTokenLike;
  order?: unknown;
  error?: CulqiErrorLike;
}

type CulqiCheckoutCtor = new (
  publicKey: string,
  config: Record<string, unknown>
) => CulqiCheckoutInstance;

declare global {
  interface Window {
    CulqiCheckout?: CulqiCheckoutCtor;
  }
}

// ── Carga única del script ────────────────────────────────────────────────

let scriptPromise: Promise<void> | null = null;

function loadCulqiScript(): Promise<void> {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("Culqi solo está disponible en el navegador"));
  }
  if (window.CulqiCheckout) return Promise.resolve();
  if (scriptPromise) return scriptPromise;

  scriptPromise = new Promise<void>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(
      `script[src="${CULQI_SCRIPT_URL}"]`
    );
    const script = existing ?? document.createElement("script");
    const onLoad = () => resolve();
    const onError = () => {
      // Permite reintentar si falló la red (4G inestable).
      scriptPromise = null;
      script.remove();
      reject(new Error("No se pudo cargar Culqi"));
    };
    script.addEventListener("load", onLoad, { once: true });
    script.addEventListener("error", onError, { once: true });
    if (!existing) {
      script.src = CULQI_SCRIPT_URL;
      script.async = true;
      document.head.appendChild(script);
    }
  });
  return scriptPromise;
}

// ── Interfaz pública ──────────────────────────────────────────────────────

export interface OpenCulqiCheckoutParams {
  /** Llave pública de Culqi (pk_test_... o pk_live_...). */
  publicKey: string;
  /** Monto en céntimos de sol (8000 = S/ 80.00). */
  amountCents: number;
  /** Título mostrado en la cabecera del checkout (nombre de la clínica). */
  title: string;
  /** Email del paciente — pre-llena el campo del checkout. */
  email?: string;
  /** Token generado (tkn_... tarjeta | ype_... Yape). Se llama a lo más una vez. */
  onToken: (tokenId: string) => void;
  /** Error de tokenización o de carga, con mensaje apto para el paciente. */
  onError: (userMessage: string) => void;
  /** El paciente cerró el checkout sin completar el pago. */
  onClose?: () => void;
}

/**
 * Carga el script de Culqi (si hace falta), abre el Checkout Custom en modo
 * modal con tarjeta + Yape, y reporta el resultado por callbacks.
 */
export async function openCulqiCheckout({
  publicKey,
  amountCents,
  title,
  email,
  onToken,
  onError,
  onClose,
}: OpenCulqiCheckoutParams): Promise<void> {
  try {
    await loadCulqiScript();
  } catch {
    onError(
      "No se pudo cargar el módulo de pago. Revisa tu conexión e inténtalo de nuevo."
    );
    return;
  }

  const Ctor = window.CulqiCheckout;
  if (!Ctor) {
    onError(
      "El módulo de pago no está disponible en este momento. Inténtalo de nuevo."
    );
    return;
  }

  // `settled` evita dobles disparos: al recibir token cerramos el modal
  // nosotros mismos, lo que también dispara closeCheckout — sin esta guarda
  // ese cierre se reportaría como cancelación.
  let settled = false;

  const config = {
    settings: {
      title,
      currency: "PEN",
      amount: amountCents,
    },
    ...(email ? { client: { email } } : {}),
    options: {
      lang: "es",
      installments: false,
      modal: true,
      paymentMethods: {
        tarjeta: true,
        yape: true,
      },
      paymentMethodsSort: ["tarjeta", "yape"],
    },
    appearance: {
      theme: "default",
      // Acento esmeralda de la app (emerald-500 / emerald-600).
      defaultStyle: {
        bannerColor: "#10b981",
        buttonBackground: "#059669",
        menuColor: "#059669",
        linksColor: "#059669",
      },
    },
  };

  let instance: CulqiCheckoutInstance;
  try {
    instance = new Ctor(publicKey, config);
  } catch {
    onError("No se pudo iniciar el pago. Inténtalo de nuevo.");
    return;
  }

  instance.culqi = () => {
    if (instance.token?.id) {
      if (settled) return;
      settled = true;
      const tokenId = instance.token.id;
      try {
        instance.close();
      } catch {
        // El modal puede haberse cerrado solo; el token ya es nuestro.
      }
      onToken(tokenId);
      return;
    }
    if (instance.error) {
      // Error de tokenización: el checkout sigue abierto para reintentar;
      // solo propagamos el mensaje por si queremos mostrarlo también.
      onError(
        instance.error.user_message ||
          "No pudimos procesar los datos de pago. Inténtalo de nuevo."
      );
    }
  };

  instance.closeCheckout = () => {
    if (settled) return;
    settled = true;
    try {
      instance.close();
    } catch {
      // Ya estaba cerrado.
    }
    onClose?.();
  };

  try {
    instance.open();
  } catch {
    onError("No se pudo abrir la ventana de pago. Inténtalo de nuevo.");
  }
}
