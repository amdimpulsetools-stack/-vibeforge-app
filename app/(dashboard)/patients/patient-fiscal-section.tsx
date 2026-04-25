"use client";

// Fiscal data block for the patient drawer. Only mounted when e-invoicing
// is connected for the org (the drawer hides this entire tab otherwise).
//
// Data is stored in the existing `patients` row (added by migration 108):
// fiscal_doc_type, fiscal_doc_number, legal_name, fiscal_address,
// ubigeo, fiscal_email. These are SEPARATE from the patient's everyday
// contact info — same person can have a personal DNI for clinical use
// and a company RUC for billing.

import { useState } from "react";
import { toast } from "sonner";
import { Loader2, FileText, Receipt } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import type { PatientWithTags } from "@/types/admin";

interface Props {
  patient: PatientWithTags;
  onUpdate: () => void;
}

const DOC_TYPE_OPTIONS = [
  { value: "1", label: "DNI — Persona natural" },
  { value: "6", label: "RUC — Empresa o RUC personal" },
  { value: "4", label: "Carnet de Extranjería" },
  { value: "7", label: "Pasaporte" },
  { value: "-", label: "Varios — Consumidor final (boletas <S/700)" },
];

interface FiscalRow {
  fiscal_doc_type?: string | null;
  fiscal_doc_number?: string | null;
  legal_name?: string | null;
  fiscal_address?: string | null;
  ubigeo?: string | null;
  fiscal_email?: string | null;
}

export function PatientFiscalSection({ patient, onUpdate }: Props) {
  const fiscal = patient as unknown as FiscalRow & PatientWithTags;

  // Reasonable defaults: prefill DNI from contact DNI if no fiscal one set.
  const [docType, setDocType] = useState(fiscal.fiscal_doc_type ?? "1");
  const [docNumber, setDocNumber] = useState(
    fiscal.fiscal_doc_number ?? patient.dni ?? ""
  );
  const [legalName, setLegalName] = useState(fiscal.legal_name ?? "");
  const [fiscalAddress, setFiscalAddress] = useState(
    fiscal.fiscal_address ?? ""
  );
  const [ubigeo, setUbigeo] = useState(fiscal.ubigeo ?? "");
  const [fiscalEmail, setFiscalEmail] = useState(
    fiscal.fiscal_email ?? patient.email ?? ""
  );
  const [saving, setSaving] = useState(false);

  const isRuc = docType === "6";

  // Document number validation
  const docNumberValid = (() => {
    if (docType === "1") return /^\d{8}$/.test(docNumber);
    if (docType === "6") return /^\d{11}$/.test(docNumber);
    if (docType === "-") return true;
    return docNumber.trim().length > 0;
  })();

  const handleSave = async () => {
    if (!docNumberValid) {
      toast.error("Número de documento inválido");
      return;
    }
    if (isRuc && legalName.trim().length === 0) {
      toast.error("Razón social obligatoria para RUC");
      return;
    }
    setSaving(true);
    const supabase = createClient();
    const { error } = await supabase
      .from("patients")
      .update({
        fiscal_doc_type: docType,
        fiscal_doc_number: docNumber.trim(),
        legal_name: legalName.trim() || null,
        fiscal_address: fiscalAddress.trim() || null,
        ubigeo: ubigeo.trim() || null,
        fiscal_email: fiscalEmail.trim() || null,
      })
      .eq("id", patient.id);
    setSaving(false);
    if (error) {
      toast.error("Error al guardar: " + error.message);
      return;
    }
    toast.success("Datos fiscales guardados.");
    onUpdate();
  };

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-blue-500/30 bg-blue-500/5 p-3 flex items-start gap-2">
        <Receipt className="h-4 w-4 text-blue-600 dark:text-blue-400 mt-0.5 shrink-0" />
        <div className="text-xs text-blue-700 dark:text-blue-300 leading-relaxed">
          Estos datos se usan al emitir comprobantes electrónicos. Pueden
          diferir del nombre y email del paciente (por ejemplo, si la consulta
          la paga la empresa con RUC).
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <label className="block">
          <div className="text-xs font-medium mb-1">Tipo de documento</div>
          <select
            value={docType}
            onChange={(e) => setDocType(e.target.value)}
            className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
          >
            {DOC_TYPE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>

        <label className="block">
          <div className="text-xs font-medium mb-1">
            Número de documento {docType !== "-" && "*"}
          </div>
          <input
            type="text"
            value={docNumber}
            onChange={(e) =>
              setDocNumber(e.target.value.replace(/\s/g, ""))
            }
            placeholder={
              docType === "1" ? "12345678" : docType === "6" ? "20600695771" : ""
            }
            disabled={docType === "-"}
            className={`w-full rounded-lg border border-input bg-background px-3 py-2 text-sm font-mono disabled:opacity-50 ${
              docNumber && !docNumberValid ? "border-rose-500" : ""
            }`}
          />
        </label>
      </div>

      {isRuc && (
        <label className="block">
          <div className="text-xs font-medium mb-1">Razón social *</div>
          <input
            type="text"
            value={legalName}
            onChange={(e) => setLegalName(e.target.value)}
            placeholder="EMPRESA EJEMPLO SAC"
            className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm uppercase"
          />
          <div className="text-[11px] text-muted-foreground mt-1">
            Nombre exacto registrado en SUNAT.
          </div>
        </label>
      )}

      <label className="block">
        <div className="text-xs font-medium mb-1">
          Dirección fiscal{" "}
          <span className="text-muted-foreground font-normal">
            {isRuc ? "(obligatoria para facturas)" : "(opcional)"}
          </span>
        </div>
        <input
          type="text"
          value={fiscalAddress}
          onChange={(e) => setFiscalAddress(e.target.value)}
          placeholder="AV. JAVIER PRADO 1234, SAN ISIDRO, LIMA"
          className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
        />
      </label>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <label className="block">
          <div className="text-xs font-medium mb-1">
            Ubigeo{" "}
            <span className="text-muted-foreground font-normal">(opcional)</span>
          </div>
          <input
            type="text"
            inputMode="numeric"
            maxLength={6}
            value={ubigeo}
            onChange={(e) => setUbigeo(e.target.value.replace(/\D/g, ""))}
            placeholder="150131"
            className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm font-mono"
          />
        </label>

        <label className="block">
          <div className="text-xs font-medium mb-1">
            Email para comprobantes
          </div>
          <input
            type="email"
            value={fiscalEmail}
            onChange={(e) => setFiscalEmail(e.target.value)}
            placeholder="facturas@empresa.com"
            className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
          />
          <div className="text-[11px] text-muted-foreground mt-1">
            Si lo dejas vacío usaremos el email principal del paciente.
          </div>
        </label>
      </div>

      <button
        onClick={handleSave}
        disabled={saving}
        className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50 transition-opacity"
      >
        {saving ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <FileText className="h-4 w-4" />
        )}
        Guardar datos fiscales
      </button>
    </div>
  );
}
