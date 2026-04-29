"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import {
  Camera,
  ExternalLink,
  FileSignature,
  Loader2,
  PenTool,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { CONSENT_TYPE_LABELS, type InformedConsentType } from "@/types/informed-consent";
import { ConsentEntryButton } from "./consent-entry-button";

/**
 * Row shape returned by the `get_patient_consents_unified` RPC.
 * Declared explicitly because our supabase client isn't generated
 * with the Database generic, so .rpc<T>() cannot infer this.
 */
export interface UnifiedConsentRow {
  source: "digital" | "scanned";
  id: string;
  registered_at: string;
  doctor_id: string | null;
  doctor_name: string | null;
  consent_type: string;
  description: string | null;
  asset_url: string | null;
  signature_method: string | null;
  appointment_id: string | null;
}

interface ConsentsUnifiedPanelProps {
  patientId: string;
  patientName: string;
  doctorId?: string | null;
  doctorName?: string | null;
  appointmentId?: string | null;
  serviceId?: string | null;
  serviceName?: string | null;
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("es-PE", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function consentTypeLabel(row: UnifiedConsentRow): string {
  if (row.source === "scanned") return "Foto del consentimiento";
  return (
    CONSENT_TYPE_LABELS[row.consent_type as InformedConsentType] ?? row.consent_type
  );
}

export function ConsentsUnifiedPanel(props: ConsentsUnifiedPanelProps) {
  const [items, setItems] = useState<UnifiedConsentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [opening, setOpening] = useState<string | null>(null);

  const fetchItems = useCallback(async () => {
    setLoading(true);
    const supabase = createClient();
    const { data, error } = await supabase.rpc("get_patient_consents_unified", {
      p_patient_id: props.patientId,
    });
    if (error) {
      toast.error("Error al cargar consentimientos");
      setItems([]);
    } else {
      setItems((data ?? []) as UnifiedConsentRow[]);
    }
    setLoading(false);
  }, [props.patientId]);

  useEffect(() => {
    void fetchItems();
  }, [fetchItems]);

  const handleView = async (row: UnifiedConsentRow) => {
    if (row.source === "digital") {
      if (!row.asset_url) {
        toast.error("Este consentimiento no tiene PDF disponible");
        return;
      }
      window.open(row.asset_url, "_blank", "noopener,noreferrer");
      return;
    }
    // Scanned: ask the API for a short-lived signed URL.
    setOpening(row.id);
    try {
      const res = await fetch(`/api/clinical-attachments/${row.id}`);
      const json = (await res.json().catch(() => ({}))) as {
        url?: string;
        error?: string;
      };
      if (json.url) {
        window.open(json.url, "_blank", "noopener,noreferrer");
      } else {
        toast.error(json.error || "No se pudo abrir el archivo");
      }
    } catch {
      toast.error("No se pudo abrir el archivo");
    } finally {
      setOpening(null);
    }
  };

  const digitalCount = items.filter((it) => it.source === "digital").length;
  const scannedCount = items.length - digitalCount;

  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <FileSignature className="h-4 w-4 text-primary" />
          <div>
            <h3 className="text-sm font-semibold">
              {items.length === 0
                ? "Consentimientos"
                : `${items.length} consentimiento${items.length === 1 ? "" : "s"}`}
            </h3>
            {items.length > 0 && (
              <p className="text-[11px] text-muted-foreground">
                {scannedCount} foto{scannedCount === 1 ? "" : "s"} · {digitalCount} digital
                {digitalCount === 1 ? "" : "es"}
              </p>
            )}
          </div>
        </div>
        <ConsentEntryButton
          patientId={props.patientId}
          patientName={props.patientName}
          doctorId={props.doctorId ?? null}
          doctorName={props.doctorName ?? null}
          appointmentId={props.appointmentId ?? null}
          serviceId={props.serviceId ?? null}
          serviceName={props.serviceName ?? null}
          onCreated={() => {
            void fetchItems();
          }}
        />
      </div>

      <div className="mt-3 space-y-2">
        {loading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            Cargando…
          </div>
        ) : items.length === 0 ? (
          <p className="text-xs text-muted-foreground italic">
            No hay consentimientos registrados.
          </p>
        ) : (
          <ul className="space-y-1.5">
            {items.map((row) => {
              const isDigital = row.source === "digital";
              return (
                <li
                  key={`${row.source}:${row.id}`}
                  className="flex items-center justify-between gap-3 rounded-lg border border-border/60 bg-background/40 px-3 py-2"
                >
                  <div className="flex min-w-0 items-center gap-2.5">
                    <span
                      className={
                        isDigital
                          ? "inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium text-emerald-600 dark:text-emerald-400"
                          : "inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground"
                      }
                    >
                      {isDigital ? (
                        <PenTool className="h-3 w-3" />
                      ) : (
                        <Camera className="h-3 w-3" />
                      )}
                      {isDigital ? "Digital" : "Foto"}
                    </span>
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">
                        {consentTypeLabel(row)}
                      </p>
                      <p className="text-xs text-muted-foreground truncate">
                        {formatDate(row.registered_at)}
                        {row.doctor_name ? ` · ${row.doctor_name}` : ""}
                        {row.description && row.source === "digital"
                          ? ` · ${row.description}`
                          : ""}
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleView(row)}
                    disabled={opening === row.id}
                    className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs text-muted-foreground hover:bg-muted disabled:opacity-60"
                  >
                    {opening === row.id ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <ExternalLink className="h-3 w-3" />
                    )}
                    Ver
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
