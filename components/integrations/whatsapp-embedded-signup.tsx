"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, CheckCircle2, XCircle, X, ShieldCheck, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { useLanguage } from "@/components/language-provider";
import { useOrganization } from "@/components/organization-provider";
import { WhatsAppIcon } from "@/components/icons/whatsapp-icon";

// ─────────────────────────────────────────────────────────────────────
// Embedded Signup de WhatsApp (Meta) — el flujo "estilo Kommo".
//
// La clínica pulsa "Conectar con Facebook", se abre el popup oficial de
// Facebook Login for Business, elige su negocio y su número, y Meta nos
// entrega (a) un `code` de un solo uso vía el callback de FB.login y
// (b) waba_id + phone_number_id vía postMessage (sessionInfoListener).
// Con ambos, POST /api/whatsapp/embedded-signup cierra la conexión en
// el servidor (intercambio del code, suscripción de webhooks, register).
//
// El SDK de Facebook se carga LAZY: solo cuando el usuario abre este
// diálogo — jamás en el resto del dashboard.
// ─────────────────────────────────────────────────────────────────────

// featureType del Embedded Signup:
//   - 'whatsapp_business_app_onboarding' → modo COEXISTENCE: el número
//     sigue funcionando en la app de WhatsApp Business del celular,
//     además de la API (el default que ofrecemos).
//   - '' (string vacío) → flujo clásico: número dedicado solo API (el
//     número no puede estar activo en ninguna app de WhatsApp).
// Ambas opciones se exponen como radio; esta constante es el único
// sitio a tocar si Meta renombra el feature.
const COEXISTENCE_FEATURE_TYPE = "whatsapp_business_app_onboarding";

// Misma versión de Graph API que lib/whatsapp/client.ts (META_API_VERSION).
// Duplicada como literal porque este archivo es client-side y no debe
// arrastrar el cliente server-only; si subes la versión allá, súbela aquí.
const FB_SDK_GRAPH_VERSION = "v21.0";

const META_APP_ID = process.env.NEXT_PUBLIC_META_APP_ID;
const META_ES_CONFIG_ID = process.env.NEXT_PUBLIC_META_ES_CONFIG_ID;

/** Gate: sin App ID + Config ID el botón de Embedded Signup no existe. */
export function isEmbeddedSignupEnabled(): boolean {
  return !!META_APP_ID && !!META_ES_CONFIG_ID;
}

// ── Tipos mínimos del SDK de Facebook ────────────────────────────────
interface FBLoginResponse {
  authResponse?: { code?: string } | null;
  status?: string;
}

interface FacebookSdk {
  init(params: { appId: string; autoLogAppEvents: boolean; xfbml: boolean; version: string }): void;
  login(
    callback: (response: FBLoginResponse) => void,
    options: {
      config_id: string;
      response_type: string;
      override_default_response_type: boolean;
      extras: { setup: Record<string, never>; featureType: string; sessionInfoVersion: string };
    }
  ): void;
}

declare global {
  interface Window {
    FB?: FacebookSdk;
    fbAsyncInit?: () => void;
  }
}

// ── Carga lazy y única del SDK ───────────────────────────────────────
let sdkPromise: Promise<FacebookSdk> | null = null;

function loadFacebookSdk(): Promise<FacebookSdk> {
  if (sdkPromise) return sdkPromise;
  sdkPromise = new Promise<FacebookSdk>((resolve, reject) => {
    if (window.FB) {
      resolve(window.FB);
      return;
    }
    window.fbAsyncInit = () => {
      if (!window.FB) {
        reject(new Error("FB SDK no inicializó"));
        return;
      }
      window.FB.init({
        appId: META_APP_ID!,
        autoLogAppEvents: true,
        xfbml: true,
        version: FB_SDK_GRAPH_VERSION,
      });
      resolve(window.FB);
    };
    const script = document.createElement("script");
    script.src = "https://connect.facebook.net/en_US/sdk.js";
    script.async = true;
    script.defer = true;
    script.crossOrigin = "anonymous";
    script.onerror = () => {
      // Permite reintentar (p. ej. adblocker desactivado después).
      sdkPromise = null;
      reject(new Error("No se pudo cargar el SDK de Facebook"));
    };
    document.body.appendChild(script);
  });
  return sdkPromise;
}

// ── Componente ───────────────────────────────────────────────────────

type Phase = "idle" | "sdk" | "popup" | "processing" | "done" | "error";

interface SessionInfo {
  wabaId: string;
  phoneNumberId: string | null;
}

interface WhatsAppEmbeddedSignupProps {
  open: boolean;
  onClose: () => void;
  /** Conexión guardada en el servidor con éxito. */
  onConnected?: () => void;
  /** Abre el wizard manual (camino alternativo avanzado). */
  onOpenManual: () => void;
}

export function WhatsAppEmbeddedSignup({
  open,
  onClose,
  onConnected,
  onOpenManual,
}: WhatsAppEmbeddedSignupProps) {
  const { language } = useLanguage();
  const { isOrgAdmin } = useOrganization();
  const es = language === "es";

  const [phase, setPhase] = useState<Phase>("idle");
  const [coexistence, setCoexistence] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [result, setResult] = useState<{
    display_phone_number: string | null;
    verified_name: string | null;
    warning?: string;
  } | null>(null);

  // El postMessage (waba_id/phone_number_id) y el callback de FB.login
  // (code) llegan en orden no determinista: refs + finalize() cuando
  // están ambos.
  const codeRef = useRef<string | null>(null);
  const sessionRef = useRef<SessionInfo | null>(null);
  const finalizedRef = useRef(false);
  const coexistenceRef = useRef(true);

  useEffect(() => {
    coexistenceRef.current = coexistence;
  }, [coexistence]);

  const finalize = useCallback(async () => {
    const code = codeRef.current;
    const session = sessionRef.current;
    if (!code || !session || finalizedRef.current) return;
    if (!session.phoneNumberId) {
      // FINISH_ONLY_WABA: se creó la WABA pero no se llegó a elegir número.
      setPhase("error");
      setErrorMsg(
        es
          ? "El proceso terminó sin seleccionar un número. Vuelve a intentarlo y completa el paso del número de teléfono."
          : "The flow finished without selecting a phone number. Try again and complete the phone number step."
      );
      return;
    }
    finalizedRef.current = true;
    setPhase("processing");
    try {
      const res = await fetch("/api/whatsapp/embedded-signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code,
          waba_id: session.wabaId,
          phone_number_id: session.phoneNumberId,
          coexistence: coexistenceRef.current,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        finalizedRef.current = false;
        setPhase("error");
        setErrorMsg(
          data?.error ||
            (es ? "No pudimos completar la conexión con Meta." : "Could not complete the Meta connection.")
        );
        return;
      }
      setResult({
        display_phone_number: data.display_phone_number ?? null,
        verified_name: data.verified_name ?? null,
        warning: data.warning,
      });
      setPhase("done");
      toast.success(es ? "WhatsApp conectado correctamente." : "WhatsApp connected successfully.");
      onConnected?.();
    } catch {
      finalizedRef.current = false;
      setPhase("error");
      setErrorMsg(es ? "Error de red. Vuelve a intentarlo." : "Network error. Try again.");
    }
  }, [es, onConnected]);

  // sessionInfoListener: Meta postea eventos WA_EMBEDDED_SIGNUP desde el
  // popup. Solo aceptamos mensajes con origin de facebook.com.
  useEffect(() => {
    if (!open) return;
    const listener = (event: MessageEvent) => {
      if (
        event.origin !== "https://www.facebook.com" &&
        event.origin !== "https://web.facebook.com"
      ) {
        return;
      }
      let payload: {
        type?: string;
        event?: string;
        data?: { waba_id?: string; phone_number_id?: string; error_message?: string; current_step?: string };
      };
      try {
        payload = typeof event.data === "string" ? JSON.parse(event.data) : event.data;
      } catch {
        return;
      }
      if (payload?.type !== "WA_EMBEDDED_SIGNUP") return;

      if (payload.event === "FINISH" || payload.event === "FINISH_ONLY_WABA") {
        sessionRef.current = {
          wabaId: payload.data?.waba_id ?? "",
          phoneNumberId: payload.data?.phone_number_id ?? null,
        };
        void finalize();
      } else if (payload.event === "CANCEL") {
        setPhase((p) => (p === "processing" || p === "done" ? p : "idle"));
        toast.info(
          es
            ? "Conexión cancelada. Puedes volver a intentarlo cuando quieras."
            : "Connection cancelled. You can try again anytime."
        );
      } else if (payload.event === "error" || payload.data?.error_message) {
        setPhase("error");
        setErrorMsg(
          payload.data?.error_message ||
            (es ? "Meta reportó un error durante la conexión." : "Meta reported an error during signup.")
        );
      }
    };
    window.addEventListener("message", listener);
    return () => window.removeEventListener("message", listener);
  }, [open, es, finalize]);

  // Reset al reabrir.
  useEffect(() => {
    if (open) {
      setPhase("idle");
      setErrorMsg(null);
      setResult(null);
      codeRef.current = null;
      sessionRef.current = null;
      finalizedRef.current = false;
    }
  }, [open]);

  const launchSignup = useCallback(async () => {
    if (!META_APP_ID || !META_ES_CONFIG_ID) return;
    setErrorMsg(null);
    codeRef.current = null;
    sessionRef.current = null;
    finalizedRef.current = false;
    setPhase("sdk");
    let fb: FacebookSdk;
    try {
      fb = await loadFacebookSdk();
    } catch {
      setPhase("error");
      setErrorMsg(
        es
          ? "No se pudo cargar el componente de Facebook. Desactiva el bloqueador de anuncios e inténtalo de nuevo."
          : "Could not load the Facebook component. Disable your ad blocker and try again."
      );
      return;
    }
    setPhase("popup");
    fb.login(
      (response) => {
        const code = response?.authResponse?.code;
        if (code) {
          codeRef.current = code;
          void finalize();
        } else {
          // Cerró el popup de login sin autorizar (el CANCEL del
          // sessionInfoListener cubre las cancelaciones dentro del flujo).
          setPhase((p) => (p === "popup" ? "idle" : p));
        }
      },
      {
        config_id: META_ES_CONFIG_ID,
        response_type: "code",
        override_default_response_type: true,
        extras: {
          setup: {},
          featureType: coexistenceRef.current ? COEXISTENCE_FEATURE_TYPE : "",
          sessionInfoVersion: "3",
        },
      }
    );
  }, [es, finalize]);

  if (!open) return null;

  const busy = phase === "sdk" || phase === "popup" || phase === "processing";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="relative w-full max-w-lg max-h-[92dvh] overflow-y-auto rounded-2xl border border-border bg-card shadow-2xl">
        {/* Header */}
        <div className="flex items-start justify-between gap-4 border-b border-border/60 px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-wa-500/10">
              <WhatsAppIcon className="h-5 w-5 text-wa-500" />
            </div>
            <div>
              <h2 className="text-lg font-semibold">
                {es ? "Conectar WhatsApp Business" : "Connect WhatsApp Business"}
              </h2>
              <p className="text-xs text-muted-foreground">
                {es
                  ? "Con tu cuenta de Facebook, en ~2 minutos"
                  : "With your Facebook account, in ~2 minutes"}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-5 px-6 py-6">
          {phase === "done" && result ? (
            <div className="space-y-4">
              <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-5">
                <div className="flex items-start gap-3">
                  <CheckCircle2 className="h-6 w-6 text-emerald-500 shrink-0" />
                  <div>
                    <p className="text-sm font-semibold text-emerald-700 dark:text-emerald-400">
                      {es ? "WhatsApp conectado correctamente" : "WhatsApp connected successfully"}
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {result.verified_name && (
                        <>
                          {result.verified_name}
                          {" · "}
                        </>
                      )}
                      {result.display_phone_number && (
                        <span className="font-mono">{result.display_phone_number}</span>
                      )}
                    </p>
                    <p className="text-xs text-muted-foreground mt-2">
                      {es
                        ? "Ya puedes crear plantillas y enviar recordatorios a tus pacientes."
                        : "You can now create templates and send reminders to your patients."}
                    </p>
                  </div>
                </div>
              </div>
              {result.warning && (
                <div className="flex items-start gap-2 rounded-xl border border-amber-500/30 bg-amber-500/5 p-4">
                  <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                  <p className="text-xs text-amber-700 dark:text-amber-400">{result.warning}</p>
                </div>
              )}
              <button
                onClick={onClose}
                className="w-full rounded-lg bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground hover:opacity-90 transition-opacity"
              >
                {es ? "Finalizar" : "Finish"}
              </button>
            </div>
          ) : (
            <>
              <p className="text-sm text-muted-foreground">
                {es
                  ? "Se abrirá una ventana de Meta para elegir tu negocio y tu número de WhatsApp. Nosotros nos encargamos del resto: token, webhooks y registro."
                  : "A Meta window will open to pick your business and WhatsApp number. We handle the rest: token, webhooks and registration."}
              </p>

              {/* Modo de conexión: coexistence (default) vs número dedicado */}
              <div className="space-y-2">
                <p className="text-sm font-medium">
                  {es ? "¿Cómo quieres usar tu número?" : "How do you want to use your number?"}
                </p>
                <label
                  className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3.5 transition-colors ${
                    coexistence ? "border-primary/50 bg-primary/5" : "border-border/60 hover:bg-accent/50"
                  }`}
                >
                  <input
                    type="radio"
                    name="wa-mode"
                    className="mt-0.5 accent-emerald-500"
                    checked={coexistence}
                    onChange={() => setCoexistence(true)}
                    disabled={busy}
                  />
                  <span>
                    <span className="block text-sm font-medium">
                      {es ? "Mantener mi app de WhatsApp Business" : "Keep my WhatsApp Business app"}
                      <span className="ml-2 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold text-emerald-700 dark:text-emerald-400">
                        {es ? "Recomendado" : "Recommended"}
                      </span>
                    </span>
                    <span className="block text-xs text-muted-foreground mt-0.5">
                      {es
                        ? "Sigues chateando desde tu celular como siempre; Yenda envía recordatorios por el mismo número."
                        : "Keep chatting from your phone as usual; Yenda sends reminders through the same number."}
                    </span>
                  </span>
                </label>
                <label
                  className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3.5 transition-colors ${
                    !coexistence ? "border-primary/50 bg-primary/5" : "border-border/60 hover:bg-accent/50"
                  }`}
                >
                  <input
                    type="radio"
                    name="wa-mode"
                    className="mt-0.5 accent-emerald-500"
                    checked={!coexistence}
                    onChange={() => setCoexistence(false)}
                    disabled={busy}
                  />
                  <span>
                    <span className="block text-sm font-medium">
                      {es ? "Número dedicado solo para la API" : "Dedicated API-only number"}
                    </span>
                    <span className="block text-xs text-muted-foreground mt-0.5">
                      {es
                        ? "El número deja de usarse en la app del celular y queda exclusivo para envíos desde Yenda."
                        : "The number stops working in the phone app and becomes exclusive to Yenda sends."}
                    </span>
                  </span>
                </label>
              </div>

              {phase === "error" && errorMsg && (
                <div className="flex items-start gap-2 rounded-xl border border-destructive/30 bg-destructive/5 p-4">
                  <XCircle className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
                  <p className="text-xs text-destructive">{errorMsg}</p>
                </div>
              )}

              <button
                onClick={launchSignup}
                disabled={busy || !isOrgAdmin}
                className="flex w-full items-center justify-center gap-2 rounded-lg bg-[#1877F2] px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition-opacity hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {busy ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  // Glifo "f" de Facebook — botón oficial de login.
                  <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor">
                    <path d="M13.5 21v-8h2.7l.4-3.2h-3.1V7.7c0-.9.3-1.6 1.6-1.6h1.7V3.2c-.3 0-1.3-.1-2.5-.1-2.5 0-4.2 1.5-4.2 4.3v2.4H7.4V13h2.7v8h3.4z" />
                  </svg>
                )}
                {phase === "sdk"
                  ? es ? "Cargando Facebook..." : "Loading Facebook..."
                  : phase === "popup"
                    ? es ? "Completa el proceso en la ventana de Meta" : "Complete the flow in the Meta window"
                    : phase === "processing"
                      ? es ? "Guardando conexión..." : "Saving connection..."
                      : phase === "error"
                        ? es ? "Reintentar con Facebook" : "Retry with Facebook"
                        : es ? "Conectar con Facebook" : "Connect with Facebook"}
              </button>

              {!isOrgAdmin && (
                <p className="text-center text-xs text-muted-foreground">
                  {es
                    ? "Solo el owner o admin de la clínica puede conectar WhatsApp."
                    : "Only the clinic owner or admin can connect WhatsApp."}
                </p>
              )}

              <div className="flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
                <ShieldCheck className="h-3.5 w-3.5" />
                {es
                  ? "Tus credenciales se guardan cifradas (AES-256)."
                  : "Your credentials are stored encrypted (AES-256)."}
              </div>

              {/* Camino alternativo: el wizard manual de siempre */}
              <p className="text-center text-xs text-muted-foreground">
                {es ? "¿Prefieres pegar tus credenciales? " : "Prefer pasting your credentials? "}
                <button
                  onClick={onOpenManual}
                  className="font-medium text-emerald-600 hover:underline"
                >
                  {es ? "Configuración manual avanzada" : "Advanced manual setup"}
                </button>
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
