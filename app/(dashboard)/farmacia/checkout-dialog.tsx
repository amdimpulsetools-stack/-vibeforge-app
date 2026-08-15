"use client";

/**
 * Cobro en dos pasos: (1) quién compra, (2) con qué paga.
 *
 * El paso de cliente es SALTABLE de un toque ("Público general"): en un
 * mostrador de farmacia la mayoría de las ventas no tienen ficha, y
 * obligar a elegir paciente sería obligar a ensuciar el padrón clínico
 * con compradores de paracetamol. patient_id nullable es de primera
 * clase en la mig 216, no un caso raro.
 *
 * El botón de cobrar llama a `pharmacy_confirm_sale` con el UUID del
 * borrador y NADA MÁS: ni importes, ni stock, ni turno de caja. El
 * navegador no inserta movimientos ni pagos — ese es el invariante
 * central del módulo. Como el UUID es la clave de idempotencia, un doble
 * clic o un reintento devuelven el mismo resultado en vez de cobrar dos
 * veces.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import {
  AlertTriangle,
  Check,
  ChevronLeft,
  Loader2,
  Printer,
  Receipt,
  User,
  Users,
  X,
} from "lucide-react";
import { SaleTicket } from "./sale-ticket";
import {
  formatPEN,
  saleLabel,
  type CartLine,
  type CartTotals,
  type ConfirmResult,
} from "./types";

export interface PaymentMethodOption {
  id: string;
  label: string;
}

interface PatientOption {
  id: string;
  name: string;
  doc: string | null;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  organizationId: string | null;
  saleId: string | null;
  lines: CartLine[];
  totals: CartTotals;
  methods: PaymentMethodOption[];
  clinicName: string;
  cashierName: string;
  /** Se dispara tras una confirmación exitosa: la página limpia el carrito. */
  onConfirmed: (result: ConfirmResult) => void;
}

type Step = "cliente" | "pago" | "exito";

export function CheckoutDialog({
  open,
  onOpenChange,
  organizationId,
  saleId,
  lines,
  totals,
  methods,
  clinicName,
  cashierName,
  onConfirmed,
}: Props) {
  const [step, setStep] = useState<Step>("cliente");
  const [patient, setPatient] = useState("");
  const [patientId, setPatientId] = useState<string | null>(null);
  const [patientOptions, setPatientOptions] = useState<PatientOption[]>([]);
  const [method, setMethod] = useState<string | null>(null);
  const [charging, setCharging] = useState(false);
  const [result, setResult] = useState<ConfirmResult | null>(null);
  const issuedAtRef = useRef<Date>(new Date());

  // Congelado al confirmar: el carrito se vacía en cuanto la venta cierra,
  // pero el ticket tiene que poder imprimirse después.
  const [printed, setPrinted] = useState<{
    lines: CartLine[];
    totals: CartTotals;
    customer: string | null;
    method: string;
  } | null>(null);

  const customerLabel = useMemo(
    () => (patientId ? patient.trim() : patient.trim() || null),
    [patient, patientId]
  );

  useEffect(() => {
    if (!open) return;
    setStep("cliente");
    setPatient("");
    setPatientId(null);
    setPatientOptions([]);
    setMethod(methods[0]?.label ?? null);
    setCharging(false);
    setResult(null);
    setPrinted(null);
  }, [open, methods]);

  // Autocomplete de pacientes: mismo criterio que el DiscountModal de
  // Almacén (tokens AND-eados, saneo del .or() de PostgREST, DNI por
  // prefijo). Elegir vincula por patient_id; escribir sin elegir queda
  // como etiqueta de texto en customer_label.
  useEffect(() => {
    const q = patient.trim();
    if (patientId || q.length < 2 || !organizationId) {
      setPatientOptions([]);
      return;
    }
    let cancelled = false;
    const handle = window.setTimeout(async () => {
      const supabase = createClient();
      const tokens = q
        .split(/\s+/)
        .slice(0, 5)
        .map((t) => t.replace(/[%_,().\\]/g, ""))
        .filter(Boolean);
      if (tokens.length === 0) {
        setPatientOptions([]);
        return;
      }
      let query = supabase
        .from("patients")
        .select("id, first_name, last_name, dni, document_type")
        .eq("organization_id", organizationId)
        .eq("status", "active");
      const joined = tokens.join("");
      if (/^\d+$/.test(joined)) {
        query = query.ilike("dni", `${joined}%`);
      } else {
        for (const tok of tokens) {
          query = query.or(
            `first_name.ilike.%${tok}%,last_name.ilike.%${tok}%,dni.ilike.%${tok}%`
          );
        }
      }
      const { data, error } = await query.order("last_name").limit(8);
      if (cancelled || error) return;
      setPatientOptions(
        (
          (data ?? []) as {
            id: string;
            first_name: string | null;
            last_name: string | null;
            dni: string | null;
            document_type: string | null;
          }[]
        ).map((p) => ({
          id: p.id,
          name: `${p.first_name ?? ""} ${p.last_name ?? ""}`.trim(),
          doc: p.dni ? `${p.document_type ?? "DNI"} ${p.dni}` : null,
        }))
      );
    }, 250);
    return () => {
      cancelled = true;
      window.clearTimeout(handle);
    };
  }, [patient, patientId, organizationId]);

  async function charge() {
    if (!saleId || !method || charging) return;
    setCharging(true);
    const supabase = createClient();

    // El cliente se graba en el BORRADOR (escritura permitida por RLS solo
    // mientras status='borrador'); el cobro lo hace la RPC.
    const { error: upErr } = await supabase
      .from("pharmacy_sales")
      .update({
        patient_id: patientId,
        customer_label: customerLabel,
      })
      .eq("id", saleId);

    if (upErr) {
      setCharging(false);
      toast.error("No se pudo guardar el cliente", { description: upErr.message });
      return;
    }

    const { data, error } = await supabase.rpc("pharmacy_confirm_sale", {
      p_sale_id: saleId,
      p_payment_method: method,
    });

    setCharging(false);

    if (error) {
      toast.error("No se pudo cobrar", { description: error.message });
      return;
    }

    const res = data as unknown as ConfirmResult;
    issuedAtRef.current = new Date();
    setPrinted({
      lines,
      totals,
      customer: customerLabel,
      method,
    });
    setResult(res);
    setStep("exito");

    // Los avisos de stock NO bloquean: la venta ya está cobrada y el
    // descuadre queda visible en el kardex, que es donde se arregla.
    for (const w of res.warnings ?? []) {
      toast.warning(w, { duration: 8000 });
    }

    onConfirmed(res);
  }

  const canCharge = Boolean(saleId) && Boolean(method) && lines.length > 0;

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        // Tras cobrar, cerrar es la única salida: la venta ya existe y el
        // diálogo no puede "cancelarse".
        if (!o && charging) return;
        onOpenChange(o);
      }}
    >
      <DialogContent
        aria-describedby={undefined}
        className={cn(
          "gap-0 p-5 sm:max-w-md sm:rounded-2xl",
          "max-sm:bottom-0 max-sm:left-0 max-sm:right-0 max-sm:top-auto",
          "max-sm:max-w-none max-sm:translate-x-0 max-sm:translate-y-0",
          "max-sm:rounded-t-2xl max-sm:rounded-b-none",
          "max-sm:pb-[max(1.25rem,env(safe-area-inset-bottom))]"
        )}
      >
        <div className="mx-auto mb-3 h-1 w-9 rounded-full bg-border sm:hidden" />

        {step === "exito" && result ? (
          <>
            <DialogTitle className="sr-only">Venta cobrada</DialogTitle>
            <div className="flex flex-col items-center text-center">
              <div className="grid h-12 w-12 place-items-center rounded-full bg-primary/15">
                <Check className="h-6 w-6 text-primary" />
              </div>
              <p className="mt-3 text-lg font-bold">{saleLabel(result.sale_number)}</p>
              <p className="text-2xl font-bold tabular-nums text-primary">
                {formatPEN(result.total)}
              </p>

              <p className="mt-2 text-xs text-muted-foreground">
                {result.cash_shift_id ? (
                  <>Registrado en el turno de caja abierto.</>
                ) : (
                  <>Sin turno abierto — quedará en “Fuera de turno”.</>
                )}
              </p>

              {(result.warnings?.length ?? 0) > 0 && (
                <div className="mt-3 w-full rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-left">
                  <p className="flex items-center gap-1.5 text-xs font-semibold text-amber-600 dark:text-amber-400">
                    <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                    Revisa el inventario
                  </p>
                  <ul className="mt-1 space-y-0.5">
                    {result.warnings.map((w, i) => (
                      <li key={i} className="text-[11px] text-muted-foreground">
                        {w}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>

            <div className="mt-5 grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => window.print()}
                className="inline-flex h-12 items-center justify-center gap-1.5 rounded-xl border border-border bg-card text-sm font-semibold hover:bg-accent"
              >
                <Printer className="h-4 w-4" /> Imprimir
              </button>
              <button
                type="button"
                onClick={() => onOpenChange(false)}
                className="h-12 rounded-xl bg-primary text-sm font-bold text-primary-foreground hover:bg-primary/90"
              >
                Nueva venta
              </button>
            </div>

            {printed && (
              <SaleTicket
                saleNumber={result.sale_number}
                clinicName={clinicName}
                cashierName={cashierName}
                customerLabel={printed.customer}
                lines={printed.lines}
                totals={printed.totals}
                paymentMethod={printed.method}
                issuedAt={issuedAtRef.current}
              />
            )}
          </>
        ) : step === "cliente" ? (
          <>
            <DialogTitle className="text-base font-bold">¿Quién compra?</DialogTitle>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Opcional. Sin paciente, la venta va a público general.
            </p>

            <div className="relative mt-4">
              {patientId ? (
                <div className="flex h-11 items-center justify-between rounded-xl border border-primary/40 bg-primary/5 px-3">
                  <span className="inline-flex items-center gap-1.5 truncate text-sm font-medium text-primary">
                    <User className="h-3.5 w-3.5 shrink-0" /> {patient}
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setPatientId(null);
                      setPatient("");
                    }}
                    aria-label="Quitar paciente"
                    className="rounded-md p-1 text-muted-foreground hover:text-foreground"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              ) : (
                <input
                  value={patient}
                  onChange={(e) => setPatient(e.target.value)}
                  placeholder="Nombre, apellido o DNI (opcional)"
                  autoFocus
                  className="h-11 w-full rounded-xl border border-border bg-card px-3 text-base outline-none focus:border-primary/50 md:text-sm"
                />
              )}
              {!patientId && patientOptions.length > 0 && (
                <ul className="mt-1 max-h-40 overflow-y-auto rounded-xl border border-border bg-popover shadow-sm">
                  {patientOptions.map((opt) => (
                    <li key={opt.id}>
                      <button
                        type="button"
                        onClick={() => {
                          setPatientId(opt.id);
                          setPatient(opt.name);
                          setPatientOptions([]);
                        }}
                        className="w-full px-3 py-1.5 text-left hover:bg-accent"
                      >
                        <span className="block truncate text-sm">{opt.name}</span>
                        <span className="block text-[11px] text-muted-foreground">
                          {opt.doc ?? "Sin documento"}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="mt-4 grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => {
                  setPatientId(null);
                  setPatient("");
                  setStep("pago");
                }}
                className="inline-flex h-12 items-center justify-center gap-1.5 rounded-xl border border-border bg-card text-sm font-semibold hover:bg-accent"
              >
                <Users className="h-4 w-4" /> Público general
              </button>
              <button
                type="button"
                onClick={() => setStep("pago")}
                className="h-12 rounded-xl bg-primary text-sm font-bold text-primary-foreground hover:bg-primary/90"
              >
                Continuar
              </button>
            </div>
          </>
        ) : (
          <>
            <button
              type="button"
              onClick={() => setStep("cliente")}
              className="mb-2 inline-flex w-fit items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground"
            >
              <ChevronLeft className="h-3.5 w-3.5" /> Volver
            </button>

            <DialogTitle className="text-base font-bold">¿Cómo paga?</DialogTitle>
            <p className="mt-0.5 truncate text-xs text-muted-foreground">
              {patientId ? patient : customerLabel || "Público general"}
            </p>

            <div className="mt-4 rounded-xl border border-border bg-muted/40 p-3 text-center">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                Total a cobrar
              </p>
              <p className="text-3xl font-bold tabular-nums text-primary">
                {formatPEN(totals.total)}
              </p>
            </div>

            <p className="mb-2 mt-4 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Método de pago
            </p>
            <div className="flex flex-wrap gap-2">
              {methods.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  No hay métodos de pago configurados en la organización.
                </p>
              ) : (
                methods.map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    aria-pressed={method === m.label}
                    onClick={() => setMethod(m.label)}
                    className={cn(
                      "h-11 rounded-xl border px-4 text-sm font-semibold transition-colors",
                      method === m.label
                        ? "border-primary bg-primary/15 text-primary"
                        : "border-border bg-card hover:border-primary/40"
                    )}
                  >
                    {m.label}
                  </button>
                ))
              )}
            </div>

            <button
              type="button"
              disabled={!canCharge || charging}
              onClick={() => void charge()}
              className="mt-5 inline-flex h-14 w-full items-center justify-center gap-2 rounded-xl bg-primary text-base font-bold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-40"
            >
              {charging ? (
                <>
                  <Loader2 className="h-5 w-5 animate-spin" /> Cobrando…
                </>
              ) : (
                <>
                  <Receipt className="h-5 w-5" /> Cobrar {formatPEN(totals.total)}
                </>
              )}
            </button>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
