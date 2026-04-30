"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Loader2, ChevronLeft, ChevronRight, FileSignature, Eraser, Check } from "lucide-react";
import {
  CONSENT_TYPE_OPTIONS,
  type InformedConsentCreatePayload,
  type InformedConsentSignatureMethod,
  type InformedConsentType,
} from "@/types/informed-consent";

type Step = 1 | 2 | 3;

export interface InformedConsentModalProps {
  open: boolean;
  onOpenChange: (next: boolean) => void;
  patientId: string;
  patientName: string;
  appointmentId?: string | null;
  serviceId?: string | null;
  serviceName?: string | null;
  doctorId?: string | null;
  doctorName?: string | null;
  onSaved?: (consentId: string, pdfUrl: string | null) => void;
}

export function InformedConsentModal(props: InformedConsentModalProps) {
  const {
    open,
    onOpenChange,
    patientId,
    patientName,
    appointmentId,
    serviceId,
    serviceName,
    doctorId,
    doctorName,
  } = props;

  const [step, setStep] = useState<Step>(1);
  const [submitting, setSubmitting] = useState(false);

  const [consentType, setConsentType] = useState<InformedConsentType | null>(null);
  const [procedureDescription, setProcedureDescription] = useState<string>(serviceName ?? "");
  const [risksExplained, setRisksExplained] = useState<string>("");
  const [signatureMethod, setSignatureMethod] = useState<InformedConsentSignatureMethod>("typed");
  const [signedByPatientName, setSignedByPatientName] = useState<string>(patientName ?? "");
  const [legalAccepted, setLegalAccepted] = useState<boolean>(false);
  const [drawnDataUrl, setDrawnDataUrl] = useState<string | null>(null);

  // Reset on close.
  useEffect(() => {
    if (!open) {
      setStep(1);
      setSubmitting(false);
      setConsentType(null);
      setProcedureDescription(serviceName ?? "");
      setRisksExplained("");
      setSignatureMethod("typed");
      setSignedByPatientName(patientName ?? "");
      setLegalAccepted(false);
      setDrawnDataUrl(null);
    }
  }, [open, patientName, serviceName]);

  const canAdvanceFromStep1 = useMemo(() => {
    return consentType !== null && procedureDescription.trim().length >= 4;
  }, [consentType, procedureDescription]);

  const canSubmit = useMemo(() => {
    if (signedByPatientName.trim().length < 2) return false;
    if (signatureMethod === "typed") return legalAccepted;
    return Boolean(drawnDataUrl);
  }, [signedByPatientName, signatureMethod, legalAccepted, drawnDataUrl]);

  const handleSubmit = async () => {
    if (!canSubmit || !consentType) return;
    setSubmitting(true);
    const payload: InformedConsentCreatePayload = {
      patient_id: patientId,
      appointment_id: appointmentId ?? null,
      service_id: serviceId ?? null,
      doctor_id: doctorId ?? null,
      consent_type: consentType,
      procedure_description: procedureDescription.trim(),
      risks_explained: risksExplained.trim() ? risksExplained.trim() : null,
      signed_by_patient_name: signedByPatientName.trim(),
      signature_method: signatureMethod,
      signature_data: signatureMethod === "drawn" ? drawnDataUrl : null,
    };

    try {
      const res = await fetch("/api/informed-consents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = (await res.json()) as {
        data?: { id: string; pdf_url: string | null };
        error?: string;
        warning?: string;
      };
      if (!res.ok || !json.data) {
        throw new Error(json.error ?? "No se pudo guardar el consentimiento");
      }
      toast.success("Consentimiento firmado y guardado");
      if (json.warning) toast.warning(json.warning);
      props.onSaved?.(json.data.id, json.data.pdf_url ?? null);
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error de red");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileSignature className="h-5 w-5 text-primary" />
            Consentimiento informado
          </DialogTitle>
          <DialogDescription>
            Paso {step} de 3 — {patientName}
          </DialogDescription>
        </DialogHeader>

        <div className="mt-2 max-h-[65vh] overflow-y-auto pr-1">
          {step === 1 && (
            <Step1
              consentType={consentType}
              setConsentType={setConsentType}
              procedureDescription={procedureDescription}
              setProcedureDescription={setProcedureDescription}
              risksExplained={risksExplained}
              setRisksExplained={setRisksExplained}
              serviceName={serviceName ?? null}
            />
          )}
          {step === 2 && consentType && (
            <Step2
              consentType={consentType}
              procedureDescription={procedureDescription}
              risksExplained={risksExplained}
              patientName={patientName}
              doctorName={doctorName ?? null}
              serviceName={serviceName ?? null}
            />
          )}
          {step === 3 && (
            <Step3
              signatureMethod={signatureMethod}
              setSignatureMethod={setSignatureMethod}
              signedByPatientName={signedByPatientName}
              setSignedByPatientName={setSignedByPatientName}
              legalAccepted={legalAccepted}
              setLegalAccepted={setLegalAccepted}
              drawnDataUrl={drawnDataUrl}
              setDrawnDataUrl={setDrawnDataUrl}
            />
          )}
        </div>

        <div className="mt-4 flex items-center justify-between gap-3 border-t border-border/40 pt-4">
          <button
            type="button"
            onClick={() => setStep((s) => Math.max(1, (s - 1) as Step) as Step)}
            disabled={step === 1 || submitting}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted disabled:opacity-40"
          >
            <ChevronLeft className="h-4 w-4" />
            Atrás
          </button>

          {step < 3 ? (
            <button
              type="button"
              onClick={() => {
                if (step === 1 && !canAdvanceFromStep1) {
                  if (consentType === null) {
                    toast.error("Selecciona el tipo de consentimiento");
                  } else {
                    toast.error("Describe el procedimiento (mínimo 4 caracteres)");
                  }
                  return;
                }
                setStep((s) => Math.min(3, (s + 1) as Step) as Step);
              }}
              className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90"
            >
              Siguiente
              <ChevronRight className="h-4 w-4" />
            </button>
          ) : (
            <button
              type="button"
              onClick={handleSubmit}
              disabled={!canSubmit || submitting}
              className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              {submitting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Check className="h-4 w-4" />
              )}
              Firmar y guardar
            </button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Step 1: type + description + risks ────────────────────────────
function Step1(props: {
  consentType: InformedConsentType | null;
  setConsentType: (v: InformedConsentType) => void;
  procedureDescription: string;
  setProcedureDescription: (v: string) => void;
  risksExplained: string;
  setRisksExplained: (v: string) => void;
  serviceName: string | null;
}) {
  return (
    <div className="space-y-4">
      <div>
        <label className="text-sm font-medium">
          Tipo de consentimiento <span className="text-destructive">*</span>
        </label>
        <div className="mt-2 grid grid-cols-2 gap-2">
          {CONSENT_TYPE_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => props.setConsentType(opt.value)}
              className={`text-left rounded-lg border p-3 transition-all ${
                props.consentType === opt.value
                  ? "border-primary bg-primary/5"
                  : "border-border hover:border-muted-foreground/30"
              }`}
            >
              <p className="text-sm font-medium">{opt.label}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{opt.description}</p>
            </button>
          ))}
        </div>
        {props.consentType === null && (
          <p className="mt-1.5 text-xs text-muted-foreground">
            Elige el tipo de consentimiento que corresponde al acto clínico.
          </p>
        )}
      </div>

      {props.serviceName && (
        <p className="text-xs text-muted-foreground">
          Servicio asociado: <span className="font-medium text-foreground">{props.serviceName}</span>
        </p>
      )}

      <div className="space-y-1.5">
        <label className="text-sm font-medium" htmlFor="procedure_description">
          Procedimiento o tratamiento
        </label>
        <textarea
          id="procedure_description"
          value={props.procedureDescription}
          onChange={(e) => props.setProcedureDescription(e.target.value)}
          rows={5}
          placeholder="Describe el procedimiento que se realizará y lo que el paciente debe esperar."
          className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-colors"
        />
      </div>

      <div className="space-y-1.5">
        <label className="text-sm font-medium" htmlFor="risks_explained">
          Riesgos explicados <span className="text-muted-foreground">(opcional)</span>
        </label>
        <textarea
          id="risks_explained"
          value={props.risksExplained}
          onChange={(e) => props.setRisksExplained(e.target.value)}
          rows={4}
          placeholder="Riesgos, alternativas, consecuencias previsibles del procedimiento."
          className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-colors"
        />
      </div>
    </div>
  );
}

// ─── Step 2: preview ───────────────────────────────────────────────
function Step2(props: {
  consentType: InformedConsentType;
  procedureDescription: string;
  risksExplained: string;
  patientName: string;
  doctorName: string | null;
  serviceName: string | null;
}) {
  const typeLabel =
    CONSENT_TYPE_OPTIONS.find((o) => o.value === props.consentType)?.label ?? props.consentType;

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        Vista previa simplificada. El PDF final incluirá el membrete completo de
        tu organización.
      </p>
      <div className="rounded-xl border border-border bg-card p-5 space-y-3">
        <h3 className="text-base font-semibold">Consentimiento informado — {typeLabel}</h3>
        <div className="text-sm">
          <p>
            <strong>Paciente:</strong> {props.patientName}
          </p>
          {props.doctorName && (
            <p>
              <strong>Médico tratante:</strong> {props.doctorName}
            </p>
          )}
          {props.serviceName && (
            <p>
              <strong>Servicio:</strong> {props.serviceName}
            </p>
          )}
        </div>
        <div>
          <p className="text-sm font-semibold">Procedimiento</p>
          <p className="text-sm whitespace-pre-wrap text-muted-foreground">
            {props.procedureDescription || <em>Sin descripción</em>}
          </p>
        </div>
        {props.risksExplained.trim() && (
          <div>
            <p className="text-sm font-semibold">Riesgos explicados</p>
            <p className="text-sm whitespace-pre-wrap text-muted-foreground">
              {props.risksExplained}
            </p>
          </div>
        )}
        <p className="text-xs text-muted-foreground border-t border-border/40 pt-3">
          Documento amparado por la Ley 29414 y el D.S. 027-2015-SA. El paciente podrá
          revocar su consentimiento en cualquier momento previo a la ejecución del acto.
        </p>
      </div>
    </div>
  );
}

// ─── Step 3: signature ─────────────────────────────────────────────
function Step3(props: {
  signatureMethod: InformedConsentSignatureMethod;
  setSignatureMethod: (m: InformedConsentSignatureMethod) => void;
  signedByPatientName: string;
  setSignedByPatientName: (v: string) => void;
  legalAccepted: boolean;
  setLegalAccepted: (v: boolean) => void;
  drawnDataUrl: string | null;
  setDrawnDataUrl: (v: string | null) => void;
}) {
  return (
    <div className="space-y-4">
      <div>
        <label className="text-sm font-medium">Método de firma</label>
        <div className="mt-2 grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => props.setSignatureMethod("typed")}
            className={`text-left rounded-lg border p-3 transition-all ${
              props.signatureMethod === "typed"
                ? "border-primary bg-primary/5"
                : "border-border hover:border-muted-foreground/30"
            }`}
          >
            <p className="text-sm font-medium">Tipear nombre</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Aceptación legal por nombre completo + casilla de conformidad.
            </p>
          </button>
          <button
            type="button"
            onClick={() => props.setSignatureMethod("drawn")}
            className={`text-left rounded-lg border p-3 transition-all ${
              props.signatureMethod === "drawn"
                ? "border-primary bg-primary/5"
                : "border-border hover:border-muted-foreground/30"
            }`}
          >
            <p className="text-sm font-medium">Firmar trazado</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Ideal para tablets en consultorio. El paciente firma con dedo o lápiz.
            </p>
          </button>
        </div>
      </div>

      <div className="space-y-1.5">
        <label className="text-sm font-medium" htmlFor="signed_by">
          Nombre completo del firmante
        </label>
        <input
          id="signed_by"
          value={props.signedByPatientName}
          onChange={(e) => props.setSignedByPatientName(e.target.value)}
          placeholder="Nombre tal como figura en el DNI"
          className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-colors"
        />
      </div>

      {props.signatureMethod === "typed" ? (
        <label className="flex gap-2 items-start cursor-pointer text-sm">
          <input
            type="checkbox"
            checked={props.legalAccepted}
            onChange={(e) => props.setLegalAccepted(e.target.checked)}
            className="mt-0.5 h-4 w-4 rounded border-input bg-background text-primary accent-primary cursor-pointer"
          />
          <span className="text-sm text-muted-foreground">
            Confirmo que he recibido la información clínica relevante, comprendí los
            riesgos y otorgo mi consentimiento informado, libre y voluntario, conforme
            a la Ley 29414 y al D.S. 027-2015-SA.
          </span>
        </label>
      ) : (
        <SignaturePad value={props.drawnDataUrl} onChange={props.setDrawnDataUrl} />
      )}
    </div>
  );
}

// ─── Drawn signature canvas ────────────────────────────────────────
function SignaturePad(props: {
  value: string | null;
  onChange: (v: string | null) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawingRef = useRef(false);
  const lastPointRef = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;
    const ctx = c.getContext("2d");
    if (!ctx) return;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, c.width, c.height);
    ctx.strokeStyle = "#111";
    ctx.lineWidth = 2;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
  }, []);

  const getPoint = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const c = canvasRef.current;
    if (!c) return { x: 0, y: 0 };
    const rect = c.getBoundingClientRect();
    return {
      x: ((e.clientX - rect.left) / rect.width) * c.width,
      y: ((e.clientY - rect.top) / rect.height) * c.height,
    };
  };

  const handleDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    drawingRef.current = true;
    lastPointRef.current = getPoint(e);
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const handleMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawingRef.current) return;
    const c = canvasRef.current;
    if (!c) return;
    const ctx = c.getContext("2d");
    if (!ctx) return;
    const p = getPoint(e);
    const last = lastPointRef.current ?? p;
    ctx.beginPath();
    ctx.moveTo(last.x, last.y);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    lastPointRef.current = p;
  };

  const handleUp = () => {
    drawingRef.current = false;
    lastPointRef.current = null;
    const c = canvasRef.current;
    if (!c) return;
    props.onChange(c.toDataURL("image/png"));
  };

  const handleClear = () => {
    const c = canvasRef.current;
    if (!c) return;
    const ctx = c.getContext("2d");
    if (!ctx) return;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, c.width, c.height);
    props.onChange(null);
  };

  return (
    <div className="space-y-2">
      <div className="rounded-lg border border-border bg-white p-2">
        <canvas
          ref={canvasRef}
          width={600}
          height={180}
          onPointerDown={handleDown}
          onPointerMove={handleMove}
          onPointerUp={handleUp}
          onPointerLeave={handleUp}
          className="w-full touch-none rounded bg-white"
          style={{ aspectRatio: "10 / 3" }}
        />
      </div>
      <div className="flex items-center justify-between text-xs">
        <span className="text-muted-foreground">
          {props.value ? "Firma capturada" : "Pasa el tablet al paciente para firmar"}
        </span>
        <button
          type="button"
          onClick={handleClear}
          className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-muted-foreground hover:bg-muted"
        >
          <Eraser className="h-3 w-3" />
          Limpiar
        </button>
      </div>
    </div>
  );
}
