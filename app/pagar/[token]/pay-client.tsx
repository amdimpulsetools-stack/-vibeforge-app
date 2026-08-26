"use client";

import { useCallback, useState } from "react";
import {
  AlertCircle,
  Clock,
  Loader2,
  Lock,
  RefreshCw,
  ShieldCheck,
} from "lucide-react";
import { SuccessCheck } from "@/components/ui/success-check";
import { openCulqiCheckout } from "./culqi-checkout";

// ── Contrato con GET /api/pay/[token] ─────────────────────────────────────

export type PayLinkStatus =
  | "pending"
  | "paid"
  | "cancelled"
  | "expired"
  | "processing";

export interface PayLinkData {
  clinic_name: string;
  concept: string;
  /**
   * `amount` viene en SOLES con decimales (80 = S/ 80.00), tal cual la
   * columna numeric(10,2) que expone GET /api/pay/[token]. La conversión a
   * céntimos para Culqi se deriva del flag AMOUNT_IS_CENTS — display y
   * checkout salen del mismo valor.
   */
  amount: number;
  currency: string;
  status: PayLinkStatus;
  public_key: string;
  is_test: boolean;
  expired: boolean;
}

const AMOUNT_IS_CENTS = false;

function toCents(amount: number): number {
  return AMOUNT_IS_CENTS ? Math.round(amount) : Math.round(amount * 100);
}

function formatAmount(amount: number, currency: string): string {
  const soles = toCents(amount) / 100;
  const symbol = currency === "PEN" ? "S/" : currency + " ";
  return `${symbol} ${soles.toLocaleString("es-PE", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

// ── Página ────────────────────────────────────────────────────────────────

type Phase = "idle" | "opening" | "confirming";

export function PayClient({
  token,
  initialData,
}: {
  token: string;
  initialData: PayLinkData;
}) {
  const [data, setData] = useState<PayLinkData>(initialData);
  const [phase, setPhase] = useState<Phase>("idle");
  const [email, setEmail] = useState("");
  const [emailTouched, setEmailTouched] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const emailValid = EMAIL_REGEX.test(email.trim());

  // Re-consulta el estado del enlace (pantalla "procesando").
  const refresh = useCallback(async () => {
    setRefreshing(true);
    try {
      const res = await fetch(`/api/pay/${token}`, { cache: "no-store" });
      if (res.ok) {
        const fresh = (await res.json()) as PayLinkData;
        setData(fresh);
      }
    } catch {
      // Sin red: se mantiene la vista actual, el paciente puede reintentar.
    } finally {
      setRefreshing(false);
    }
  }, [token]);

  const chargeWithToken = useCallback(
    async (culqiTokenId: string) => {
      setPhase("confirming");
      setErrorMsg(null);
      try {
        const res = await fetch(`/api/pay/${token}/charge`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            culqi_token_id: culqiTokenId,
            email: email.trim(),
          }),
        });
        const result = (await res.json().catch(() => null)) as {
          ok?: boolean;
          status?: PayLinkStatus;
          user_message?: string;
        } | null;

        if (result?.ok && result.status === "paid") {
          setData((d) => ({ ...d, status: "paid" }));
          setPhase("idle");
          return;
        }
        if (result?.status === "processing") {
          // El banco aún no confirma: mostramos la vista de "procesando"
          // (el backend evita el doble cobro si se reintenta).
          setData((d) => ({ ...d, status: "processing" }));
          setPhase("idle");
          return;
        }
        setErrorMsg(
          result?.user_message ||
            "No pudimos confirmar tu pago. No se realizó ningún cargo duplicado — inténtalo de nuevo."
        );
        setPhase("idle");
      } catch {
        setErrorMsg(
          "Se perdió la conexión mientras confirmábamos tu pago. Refresca esta página para ver si se registró antes de volver a intentar."
        );
        setPhase("idle");
      }
    },
    [token, email]
  );

  const startPayment = useCallback(() => {
    setEmailTouched(true);
    if (!emailValid || phase !== "idle") return;
    setErrorMsg(null);
    setPhase("opening");
    void openCulqiCheckout({
      publicKey: data.public_key,
      amountCents: toCents(data.amount),
      title: data.clinic_name,
      email: email.trim(),
      onToken: (tokenId) => {
        void chargeWithToken(tokenId);
      },
      onError: (userMessage) => {
        setErrorMsg(userMessage);
        setPhase("idle");
      },
      onClose: () => {
        // Cerró el modal sin pagar: botón habilitado otra vez, sin error.
        setPhase("idle");
      },
    });
  }, [data, email, emailValid, phase, chargeWithToken]);

  // ── Vistas por estado ───────────────────────────────────────────────────

  const effectiveStatus: PayLinkStatus =
    data.status === "pending" && data.expired ? "expired" : data.status;

  let body: React.ReactNode;

  if (phase === "confirming") {
    body = (
      <div className="flex flex-col items-center gap-4 py-10 text-center">
        <Loader2 className="h-10 w-10 animate-spin text-emerald-500" />
        <p className="text-base font-medium text-zinc-800">
          Confirmando tu pago…
        </p>
        <p className="text-sm text-zinc-500">
          No cierres esta pantalla, tomará solo unos segundos.
        </p>
      </div>
    );
  } else if (effectiveStatus === "paid") {
    body = (
      <div className="flex flex-col items-center gap-3 py-8 text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
          <SuccessCheck size={34} />
        </div>
        <h2 className="text-xl font-bold text-zinc-900">
          Pago recibido, gracias
        </h2>
        <p className="text-sm text-zinc-600">{data.concept}</p>
        <p className="text-3xl font-extrabold tracking-tight text-zinc-900">
          {formatAmount(data.amount, data.currency)}
        </p>
        <p className="mt-2 text-xs text-zinc-500">
          {data.clinic_name} registró tu pago. Puedes cerrar esta página.
        </p>
      </div>
    );
  } else if (effectiveStatus === "expired" || effectiveStatus === "cancelled") {
    body = (
      <div className="flex flex-col items-center gap-3 py-8 text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-zinc-100 text-zinc-500">
          <AlertCircle className="h-7 w-7" />
        </div>
        <h2 className="text-lg font-bold text-zinc-900">
          {effectiveStatus === "expired"
            ? "Este enlace de pago venció"
            : "Este cobro fue anulado"}
        </h2>
        <p className="max-w-xs text-sm text-zinc-600">
          Contacta a {data.clinic_name} para que te envíe un nuevo enlace de
          pago.
        </p>
      </div>
    );
  } else if (effectiveStatus === "processing") {
    body = (
      <div className="flex flex-col items-center gap-3 py-8 text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-amber-100 text-amber-600">
          <Clock className="h-7 w-7" />
        </div>
        <h2 className="text-lg font-bold text-zinc-900">
          Tu pago se está procesando
        </h2>
        <p className="max-w-xs text-sm text-zinc-600">
          Estamos esperando la confirmación del banco. Esto puede tardar unos
          minutos — no vuelvas a pagar.
        </p>
        <button
          type="button"
          onClick={() => void refresh()}
          disabled={refreshing}
          className="mt-2 inline-flex items-center gap-2 rounded-lg border border-zinc-300 bg-white px-4 py-2.5 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-50 disabled:opacity-50"
        >
          {refreshing ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <RefreshCw className="h-4 w-4" />
          )}
          Actualizar estado
        </button>
      </div>
    );
  } else {
    // pending → formulario de pago
    const showEmailError = emailTouched && !emailValid;
    body = (
      <div className="flex flex-col gap-5">
        <div className="text-center">
          <p className="text-sm text-zinc-600">{data.concept}</p>
          <p className="mt-1 text-4xl font-extrabold tracking-tight text-zinc-900">
            {formatAmount(data.amount, data.currency)}
          </p>
        </div>

        <div>
          <label
            htmlFor="pay-email"
            className="mb-1 block text-sm font-medium text-zinc-700"
          >
            Tu correo electrónico
          </label>
          <input
            id="pay-email"
            type="email"
            inputMode="email"
            autoComplete="email"
            placeholder="tucorreo@ejemplo.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            onBlur={() => setEmailTouched(true)}
            className={`w-full rounded-lg border bg-white px-3 py-2.5 text-base text-zinc-900 placeholder:text-zinc-400 focus:outline-none ${
              showEmailError
                ? "border-red-400 focus:border-red-500"
                : "border-zinc-300 focus:border-emerald-500"
            }`}
          />
          {showEmailError ? (
            <p className="mt-1 text-xs text-red-600">
              Ingresa un correo válido para enviarte la constancia.
            </p>
          ) : (
            <p className="mt-1 text-xs text-zinc-500">
              Te enviaremos la constancia del pago a este correo.
            </p>
          )}
        </div>

        {errorMsg && (
          <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-700">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        <button
          type="button"
          onClick={startPayment}
          disabled={phase !== "idle"}
          className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-3.5 text-base font-semibold text-white transition-colors hover:bg-emerald-500 active:bg-emerald-700 disabled:opacity-60"
        >
          {phase === "opening" ? (
            <Loader2 className="h-5 w-5 animate-spin" />
          ) : (
            <Lock className="h-4 w-4" />
          )}
          Pagar {formatAmount(data.amount, data.currency)}
        </button>

        <p className="text-center text-[11px] leading-relaxed text-zinc-400">
          Aceptamos tarjetas de débito/crédito y Yape. Tus datos van cifrados
          directamente a Culqi; {data.clinic_name} nunca ve tu tarjeta.
        </p>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-zinc-50 px-4 py-8 text-zinc-900">
      <div className="w-full max-w-md">
        {data.is_test && (
          <div className="mb-3 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-center text-xs font-medium text-amber-800">
            Modo de prueba — este pago no genera un cargo real.
          </div>
        )}

        <div className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
          <div className="mb-5 border-b border-zinc-100 pb-4 text-center">
            <p className="text-lg font-bold text-zinc-900">
              {data.clinic_name}
            </p>
            <p className="text-xs text-zinc-500">te envió este cobro</p>
          </div>
          {body}
        </div>

        <div className="mt-4 flex items-center justify-center gap-1.5 text-xs text-zinc-500">
          <ShieldCheck className="h-3.5 w-3.5 text-emerald-600" />
          Pago seguro procesado por Culqi
        </div>
      </div>
    </div>
  );
}
