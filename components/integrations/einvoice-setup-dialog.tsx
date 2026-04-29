"use client";

// Multi-step wizard to connect Nubefact (and future e-invoice providers)
// from Settings → Integraciones. Steps:
//
//   1. Datos fiscales — RUC, razón social, dirección, ubigeo
//   2. Credenciales — route + token + botón "Probar conexión" (live test)
//   3. Series — al menos 1 (B001 boleta o F001 factura), marcar default
//   4. Preferencias — auto-emit, auto-send-email
//
// On submit, POSTs to /api/einvoices/connect (idempotent — also used for
// "Editar" once already connected).

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import {
  Loader2,
  FileText,
  Plug,
  ListOrdered,
  Sliders,
  CheckCircle2,
  AlertCircle,
  Plus,
  X,
  Star,
  Info,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import type {
  EInvoiceConfigData,
  EInvoiceSeries,
} from "@/hooks/use-einvoice-config";
import { useOrganization } from "@/components/organization-provider";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved?: () => void;
  /** If provided, dialog opens in "edit" mode pre-filled with current config. */
  initialConfig?: EInvoiceConfigData | null;
  initialSeries?: EInvoiceSeries[];
}

interface FormState {
  // Step 1
  ruc: string;
  legal_name: string;
  trade_name: string;
  fiscal_address: string;
  ubigeo: string;

  // Step 2
  mode: "sandbox" | "production";
  route: string;
  token: string;
  connectionTested: boolean;
  connectionTestError: string | null;

  // Step 3
  series: Array<{
    doc_type: 1 | 2 | 3 | 4;
    series: string;
    current_number: number;
    is_default: boolean;
  }>;

  // Step 4
  default_currency: "PEN" | "USD";
  default_igv_percent: number;
  auto_emit_on_payment: boolean;
  auto_send_email: boolean;
}

const DOC_TYPE_LABELS: Record<number, string> = {
  1: "Factura",
  2: "Boleta",
  3: "Nota de crédito",
  4: "Nota de débito",
};

interface OrgDefaults {
  ruc?: string | null;
  legal_name?: string | null;
  fiscal_address?: string | null;
}

function emptyForm(orgDefaults?: OrgDefaults): FormState {
  return {
    ruc: orgDefaults?.ruc ?? "",
    legal_name: orgDefaults?.legal_name ?? "",
    trade_name: "",
    fiscal_address: orgDefaults?.fiscal_address ?? "",
    ubigeo: "",

    mode: "sandbox",
    route: "",
    token: "",
    connectionTested: false,
    connectionTestError: null,

    series: [
      { doc_type: 2, series: "B001", current_number: 0, is_default: true },
      { doc_type: 1, series: "F001", current_number: 0, is_default: true },
    ],

    default_currency: "PEN",
    default_igv_percent: 18,
    auto_emit_on_payment: false,
    auto_send_email: true,
  };
}

export function EInvoiceSetupDialog({
  open,
  onOpenChange,
  onSaved,
  initialConfig,
  initialSeries,
}: Props) {
  const isEdit = !!initialConfig;
  const { organization } = useOrganization();
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const [form, setForm] = useState<FormState>(emptyForm());
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);

  // Pull pre-fillable fiscal data from the org profile (Settings → Organización).
  // Ubigeo is NOT stored on `organizations` (only `district`), so it stays empty.
  const orgDefaults = useMemo<OrgDefaults>(() => {
    const orgRecord = organization as
      | (Record<string, unknown> & { address?: string | null })
      | null;
    const ruc =
      typeof orgRecord?.ruc === "string" && orgRecord.ruc.trim().length > 0
        ? (orgRecord.ruc as string)
        : null;
    const legalName =
      typeof orgRecord?.legal_name === "string" &&
      (orgRecord.legal_name as string).trim().length > 0
        ? (orgRecord.legal_name as string)
        : null;
    const fiscalAddress =
      typeof orgRecord?.address === "string" &&
      (orgRecord.address as string).trim().length > 0
        ? (orgRecord.address as string)
        : null;
    return { ruc, legal_name: legalName, fiscal_address: fiscalAddress };
  }, [organization]);

  const showOrgEmptyBanner =
    !isEdit && !orgDefaults.ruc && !orgDefaults.legal_name;

  // Reset form when dialog opens / initial values change
  useEffect(() => {
    if (!open) return;
    setStep(1);
    if (initialConfig) {
      setForm({
        ruc: initialConfig.ruc ?? "",
        legal_name: initialConfig.legal_name ?? "",
        trade_name: "",
        fiscal_address: initialConfig.fiscal_address ?? "",
        ubigeo: initialConfig.ubigeo ?? "",
        mode: initialConfig.mode,
        route: "",
        token: "",
        // Edit mode: route/token blank — user re-enters if they want to change.
        // If left blank we'd send empty; instead the connect route should
        // accept "keep existing" — but for now we require re-entry on edit
        // (more secure, less surprising).
        connectionTested: false,
        connectionTestError: null,
        series:
          initialSeries && initialSeries.length > 0
            ? initialSeries.map((s) => ({
                doc_type: s.doc_type as 1 | 2 | 3 | 4,
                series: s.series,
                current_number: s.current_number,
                is_default: s.is_default,
              }))
            : emptyForm().series,
        default_currency: initialConfig.default_currency,
        default_igv_percent: Number(initialConfig.default_igv_percent),
        auto_emit_on_payment: initialConfig.auto_emit_on_payment,
        auto_send_email: initialConfig.auto_send_email,
      });
    } else {
      setForm(emptyForm(orgDefaults));
    }
  }, [open, initialConfig, initialSeries, orgDefaults]);

  const setField = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  // ── Step 1 validation ─────────────────────────────────────────────────
  const step1Valid =
    /^\d{11}$/.test(form.ruc) &&
    form.legal_name.trim().length > 0 &&
    form.fiscal_address.trim().length > 0 &&
    (form.ubigeo === "" || /^\d{6}$/.test(form.ubigeo));

  // ── Step 2 validation ─────────────────────────────────────────────────
  const step2Filled =
    /^https?:\/\//.test(form.route) && form.token.trim().length >= 20;
  const step2Valid = step2Filled && form.connectionTested;

  // ── Step 3 validation ─────────────────────────────────────────────────
  const step3Valid =
    form.series.length > 0 &&
    form.series.every(
      (s) =>
        /^[A-Z0-9]{4}$/.test(s.series) &&
        s.doc_type >= 1 &&
        s.doc_type <= 4 &&
        s.current_number >= 0
    );

  const testConnection = async () => {
    setTesting(true);
    setField("connectionTested", false);
    setField("connectionTestError", null);
    try {
      const res = await fetch("/api/einvoices/test-connection", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider: "nubefact",
          mode: form.mode,
          route: form.route,
          token: form.token,
        }),
      });
      const data = (await res.json()) as { ok: boolean; error?: string };
      if (data.ok) {
        setField("connectionTested", true);
        toast.success("Conexión OK");
      } else {
        setField("connectionTestError", data.error ?? "No pudimos conectar.");
      }
    } catch (err) {
      setField(
        "connectionTestError",
        err instanceof Error ? err.message : "Error de red."
      );
    } finally {
      setTesting(false);
    }
  };

  const addSeries = () =>
    setForm((f) => ({
      ...f,
      series: [...f.series, { doc_type: 2, series: "", current_number: 0, is_default: false }],
    }));

  const removeSeries = (i: number) =>
    setForm((f) => ({ ...f, series: f.series.filter((_, idx) => idx !== i) }));

  const updateSeries = <K extends keyof FormState["series"][number]>(
    i: number,
    key: K,
    value: FormState["series"][number][K]
  ) =>
    setForm((f) => ({
      ...f,
      series: f.series.map((s, idx) =>
        idx === i ? { ...s, [key]: value } : key === "is_default" && value === true ? { ...s, is_default: s.doc_type === f.series[i].doc_type ? false : s.is_default } : s
      ),
    }));

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await fetch("/api/einvoices/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider: "nubefact",
          mode: form.mode,
          route: form.route,
          token: form.token,
          ruc: form.ruc,
          legal_name: form.legal_name,
          trade_name: form.trade_name || null,
          fiscal_address: form.fiscal_address,
          ubigeo: form.ubigeo || null,
          series: form.series,
          default_currency: form.default_currency,
          default_igv_percent: form.default_igv_percent,
          auto_emit_on_payment: form.auto_emit_on_payment,
          auto_send_email: form.auto_send_email,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        toast.error(data.error || "No pudimos guardar la configuración.");
        setSaving(false);
        return;
      }
      toast.success(
        isEdit ? "Configuración actualizada." : "Facturación electrónica conectada."
      );
      onSaved?.();
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error de red.");
    } finally {
      setSaving(false);
    }
  };

  const stepIcons = [FileText, Plug, ListOrdered, Sliders];
  const stepTitles = [
    "Datos fiscales de la clínica",
    "Credenciales de Nubefact",
    "Series autorizadas",
    "Preferencias",
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-full max-w-2xl max-h-[90vh] overflow-hidden p-0 gap-0 flex flex-col [&>button]:hidden">
        {/* Header */}
        <div className="border-b border-border px-6 py-4">
          <DialogTitle className="text-base font-semibold">
            {isEdit ? "Editar facturación electrónica" : "Conectar facturación electrónica"}
          </DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground mt-0.5">
            Conecta Nubefact para emitir boletas y facturas desde Yenda.
          </DialogDescription>

          {/* Stepper */}
          <div className="mt-4 flex items-center gap-2">
            {[1, 2, 3, 4].map((n) => {
              const Icon = stepIcons[n - 1];
              const active = step === n;
              const done = step > n;
              return (
                <div key={n} className="flex-1 flex items-center gap-2">
                  <div
                    className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold transition-colors ${
                      done
                        ? "bg-emerald-500 text-white"
                        : active
                          ? "bg-primary text-primary-foreground"
                          : "bg-muted text-muted-foreground"
                    }`}
                  >
                    {done ? <CheckCircle2 className="h-4 w-4" /> : <Icon className="h-3.5 w-3.5" />}
                  </div>
                  {n < 4 && (
                    <div className={`flex-1 h-0.5 ${done ? "bg-emerald-500" : "bg-muted"}`} />
                  )}
                </div>
              );
            })}
          </div>
          <div className="mt-2 text-xs text-muted-foreground">
            Paso {step} de 4 — {stepTitles[step - 1]}
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5">
          {step === 1 && (
            <div className="space-y-4">
              {showOrgEmptyBanner && (
                <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-3 text-xs text-emerald-700 dark:text-emerald-300 flex items-start gap-2">
                  <Info className="h-4 w-4 mt-0.5 shrink-0" />
                  <div className="flex-1">
                    Tip: configura primero el{" "}
                    <Link
                      href="/settings"
                      className="underline font-medium hover:text-emerald-800 dark:hover:text-emerald-200"
                    >
                      Perfil de organización
                    </Link>{" "}
                    en Ajustes → Organización para no tener que repetir estos
                    datos.
                  </div>
                </div>
              )}

              <Field
                label="RUC *"
                hint="11 dígitos"
                fromOrg={
                  !isEdit &&
                  !!orgDefaults.ruc &&
                  form.ruc === orgDefaults.ruc
                }
              >
                <input
                  type="text"
                  inputMode="numeric"
                  maxLength={11}
                  value={form.ruc}
                  onChange={(e) => setField("ruc", e.target.value.replace(/\D/g, ""))}
                  placeholder="20600695771"
                  className={inputCls}
                />
              </Field>
              <Field
                label="Razón social *"
                fromOrg={
                  !isEdit &&
                  !!orgDefaults.legal_name &&
                  form.legal_name === orgDefaults.legal_name
                }
              >
                <input
                  type="text"
                  value={form.legal_name}
                  onChange={(e) => setField("legal_name", e.target.value)}
                  placeholder="CLÍNICA EJEMPLO SAC"
                  className={inputCls}
                />
              </Field>
              <Field label="Nombre comercial" hint="Opcional, si difiere de la razón social">
                <input
                  type="text"
                  value={form.trade_name}
                  onChange={(e) => setField("trade_name", e.target.value)}
                  placeholder="Vitra"
                  className={inputCls}
                />
              </Field>
              <Field
                label="Dirección fiscal *"
                fromOrg={
                  !isEdit &&
                  !!orgDefaults.fiscal_address &&
                  form.fiscal_address === orgDefaults.fiscal_address
                }
              >
                <input
                  type="text"
                  value={form.fiscal_address}
                  onChange={(e) => setField("fiscal_address", e.target.value)}
                  placeholder="AV. JAVIER PRADO ESTE 1234, SAN ISIDRO, LIMA"
                  className={inputCls}
                />
              </Field>
              <Field label="Ubigeo" hint="Código de 6 dígitos (opcional)">
                <input
                  type="text"
                  inputMode="numeric"
                  maxLength={6}
                  value={form.ubigeo}
                  onChange={(e) => setField("ubigeo", e.target.value.replace(/\D/g, ""))}
                  placeholder="150131"
                  className={inputCls}
                />
              </Field>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-4">
              <div className="rounded-lg border border-blue-500/30 bg-blue-500/5 p-3 text-xs text-blue-700 dark:text-blue-300">
                Encuentra estos datos en tu panel de Nubefact, sección{" "}
                <b>API (Integración)</b>. Si la opción no aparece, escribe a{" "}
                <code>soporte@nubefact.com</code> para que la activen.
              </div>

              <Field label="Modo">
                <div className="flex gap-2">
                  <ModeButton
                    active={form.mode === "sandbox"}
                    onClick={() => {
                      setField("mode", "sandbox");
                      setField("connectionTested", false);
                    }}
                  >
                    Pruebas (sandbox)
                  </ModeButton>
                  <ModeButton
                    active={form.mode === "production"}
                    onClick={() => {
                      setField("mode", "production");
                      setField("connectionTested", false);
                    }}
                  >
                    Producción (envía a SUNAT)
                  </ModeButton>
                </div>
              </Field>

              <Field label="RUTA *" hint="URL completa que termina en un UUID">
                <input
                  type="text"
                  value={form.route}
                  onChange={(e) => {
                    setField("route", e.target.value.trim());
                    setField("connectionTested", false);
                  }}
                  placeholder="https://api.nubefact.com/api/v1/xxxx-xxxx-xxxx"
                  className={inputCls}
                />
              </Field>

              <Field label="TOKEN *">
                <input
                  type="text"
                  value={form.token}
                  onChange={(e) => {
                    setField("token", e.target.value.trim());
                    setField("connectionTested", false);
                  }}
                  placeholder="Token largo de hex (~64 chars)"
                  className={`${inputCls} font-mono text-xs`}
                />
              </Field>

              {/* Test connection */}
              <div className="flex items-center gap-3 pt-1">
                <button
                  onClick={testConnection}
                  disabled={!step2Filled || testing}
                  className="inline-flex items-center gap-2 rounded-lg border border-border bg-background px-4 py-2 text-sm font-medium hover:bg-accent transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {testing && <Loader2 className="h-4 w-4 animate-spin" />}
                  Probar conexión
                </button>

                {form.connectionTested && (
                  <span className="inline-flex items-center gap-1.5 text-sm text-emerald-600 dark:text-emerald-400">
                    <CheckCircle2 className="h-4 w-4" />
                    Conexión validada
                  </span>
                )}
                {form.connectionTestError && (
                  <span className="inline-flex items-start gap-1.5 text-xs text-rose-600 dark:text-rose-400">
                    <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
                    {form.connectionTestError}
                  </span>
                )}
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-4">
              <div className="text-xs text-muted-foreground">
                Las series son códigos de 4 caracteres que SUNAT autoriza para
                tu RUC. Empiezan con <b>F</b> para facturas (y notas de
                facturas) y con <b>B</b> para boletas (y notas de boletas).
                Marca una serie como predeterminada por tipo de documento.
              </div>

              <div className="space-y-2">
                {form.series.map((s, i) => (
                  <div
                    key={i}
                    className="rounded-lg border border-border p-3 space-y-2"
                  >
                    <div className="flex items-center gap-2">
                      <select
                        value={s.doc_type}
                        onChange={(e) =>
                          updateSeries(i, "doc_type", Number(e.target.value) as 1 | 2 | 3 | 4)
                        }
                        className={`${inputCls} flex-1`}
                      >
                        {Object.entries(DOC_TYPE_LABELS).map(([v, l]) => (
                          <option key={v} value={v}>
                            {l}
                          </option>
                        ))}
                      </select>
                      <input
                        type="text"
                        maxLength={4}
                        value={s.series}
                        onChange={(e) =>
                          updateSeries(i, "series", e.target.value.toUpperCase())
                        }
                        placeholder="B001"
                        className={`${inputCls} w-28 font-mono uppercase`}
                      />
                      <input
                        type="number"
                        min={0}
                        value={s.current_number}
                        onChange={(e) =>
                          updateSeries(i, "current_number", Number(e.target.value))
                        }
                        className={`${inputCls} w-28`}
                        title="Último correlativo emitido (0 si es nuevo)"
                      />
                      <button
                        onClick={() => updateSeries(i, "is_default", !s.is_default)}
                        title="Predeterminada"
                        className={`shrink-0 rounded-lg p-2 transition-colors ${
                          s.is_default
                            ? "bg-amber-500/20 text-amber-600"
                            : "text-muted-foreground hover:bg-accent"
                        }`}
                      >
                        <Star className={`h-4 w-4 ${s.is_default ? "fill-current" : ""}`} />
                      </button>
                      <button
                        onClick={() => removeSeries(i)}
                        className="shrink-0 rounded-lg p-2 text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors"
                        disabled={form.series.length === 1}
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              <button
                onClick={addSeries}
                className="inline-flex items-center gap-2 rounded-lg border border-dashed border-border px-4 py-2 text-sm font-medium text-muted-foreground hover:border-primary hover:text-foreground transition-colors w-full justify-center"
              >
                <Plus className="h-4 w-4" />
                Agregar serie
              </button>
            </div>
          )}

          {step === 4 && (
            <div className="space-y-4">
              <Field label="Moneda predeterminada">
                <div className="flex gap-2">
                  <ModeButton
                    active={form.default_currency === "PEN"}
                    onClick={() => setField("default_currency", "PEN")}
                  >
                    Soles (PEN)
                  </ModeButton>
                  <ModeButton
                    active={form.default_currency === "USD"}
                    onClick={() => setField("default_currency", "USD")}
                  >
                    Dólares (USD)
                  </ModeButton>
                </div>
              </Field>

              <Field label="IGV %">
                <input
                  type="number"
                  step="0.01"
                  min={0}
                  max={100}
                  value={form.default_igv_percent}
                  onChange={(e) => setField("default_igv_percent", Number(e.target.value))}
                  className={inputCls}
                />
              </Field>

              <ToggleRow
                label="Emitir comprobante automáticamente al registrar pago completo"
                hint="Si está activo, cuando una cita queda totalmente pagada se emite la boleta/factura sin acción manual."
                checked={form.auto_emit_on_payment}
                onChange={(v) => setField("auto_emit_on_payment", v)}
              />

              <ToggleRow
                label="Enviar PDF al paciente por email automáticamente"
                hint="Nubefact se encarga del envío. Solo si el paciente tiene email registrado."
                checked={form.auto_send_email}
                onChange={(v) => setField("auto_send_email", v)}
              />
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-border px-6 py-3 flex items-center justify-between gap-3">
          <button
            onClick={() => (step > 1 ? setStep((s) => (s - 1) as 1 | 2 | 3 | 4) : onOpenChange(false))}
            disabled={saving}
            className="rounded-lg px-4 py-2 text-sm font-medium text-muted-foreground hover:bg-accent transition-colors"
          >
            {step > 1 ? "Atrás" : "Cancelar"}
          </button>

          {step < 4 ? (
            <button
              onClick={() => setStep((s) => (s + 1) as 1 | 2 | 3 | 4)}
              disabled={
                (step === 1 && !step1Valid) ||
                (step === 2 && !step2Valid) ||
                (step === 3 && !step3Valid)
              }
              className="inline-flex items-center gap-2 rounded-lg bg-primary px-5 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50 transition-opacity"
            >
              Siguiente
            </button>
          ) : (
            <button
              onClick={handleSave}
              disabled={saving}
              className="inline-flex items-center gap-2 rounded-lg bg-primary px-5 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50 transition-opacity"
            >
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              {isEdit ? "Guardar cambios" : "Conectar"}
            </button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── Small UI helpers ─────────────────────────────────────────────────────

const inputCls =
  "rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40 transition-all w-full";

function Field({
  label,
  hint,
  fromOrg,
  children,
}: {
  label: string;
  hint?: string;
  fromOrg?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <div className="flex items-baseline justify-between mb-1">
        <span className="text-sm font-medium">{label}</span>
        {hint && <span className="text-xs text-muted-foreground">{hint}</span>}
      </div>
      {children}
      {fromOrg && (
        <div className="mt-1 text-[11px] text-muted-foreground/80 italic">
          Tomado del Perfil de organización
        </div>
      )}
    </label>
  );
}

function ModeButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex-1 rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
        active
          ? "border-primary bg-primary/10 text-primary"
          : "border-border bg-background hover:bg-accent text-muted-foreground"
      }`}
    >
      {children}
    </button>
  );
}

function ToggleRow({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex items-start gap-3 cursor-pointer rounded-lg border border-border p-3 hover:bg-accent/40 transition-colors">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 h-4 w-4 rounded accent-primary cursor-pointer"
      />
      <div className="flex-1">
        <div className="text-sm font-medium">{label}</div>
        {hint && <div className="text-xs text-muted-foreground mt-0.5">{hint}</div>}
      </div>
    </label>
  );
}
