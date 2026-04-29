"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { FileSignature, Loader2, Plus, ExternalLink } from "lucide-react";
import { InformedConsentModal } from "@/components/clinical/informed-consent-modal";
import { CONSENT_TYPE_LABELS, type InformedConsentRecord } from "@/types/informed-consent";

interface InformedConsentsPanelProps {
  patientId: string;
  patientName: string;
  doctorId?: string | null;
  doctorName?: string | null;
  appointmentId?: string | null;
  serviceId?: string | null;
  serviceName?: string | null;
  canCreate: boolean;
}

export function InformedConsentsPanel(props: InformedConsentsPanelProps) {
  const [items, setItems] = useState<InformedConsentRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);

  const fetchItems = useCallback(async () => {
    try {
      const res = await fetch(`/api/informed-consents?patient_id=${props.patientId}`);
      const json = (await res.json()) as { data?: InformedConsentRecord[] };
      setItems(json.data ?? []);
    } catch {
      toast.error("Error al cargar consentimientos");
    }
    setLoading(false);
  }, [props.patientId]);

  useEffect(() => {
    void fetchItems();
  }, [fetchItems]);

  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <FileSignature className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-semibold">Consentimientos firmados</h3>
        </div>
        {props.canCreate && (
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground transition-opacity hover:opacity-90"
          >
            <Plus className="h-3.5 w-3.5" />
            Nuevo
          </button>
        )}
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
            {items.map((c) => (
              <li
                key={c.id}
                className="flex items-center justify-between gap-3 rounded-lg border border-border/60 bg-background/40 px-3 py-2"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">
                    {CONSENT_TYPE_LABELS[c.consent_type] ?? c.consent_type}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {new Date(c.signed_at).toLocaleDateString("es-PE", {
                      year: "numeric",
                      month: "short",
                      day: "numeric",
                    })}{" "}
                    · firmado por {c.signed_by_patient_name}
                  </p>
                </div>
                {c.pdf_url && (
                  <a
                    href={c.pdf_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs text-muted-foreground hover:bg-muted"
                  >
                    <ExternalLink className="h-3 w-3" />
                    Ver
                  </a>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      <InformedConsentModal
        open={open}
        onOpenChange={setOpen}
        patientId={props.patientId}
        patientName={props.patientName}
        doctorId={props.doctorId ?? null}
        doctorName={props.doctorName ?? null}
        appointmentId={props.appointmentId ?? null}
        serviceId={props.serviceId ?? null}
        serviceName={props.serviceName ?? null}
        onSaved={() => {
          void fetchItems();
        }}
      />
    </div>
  );
}
