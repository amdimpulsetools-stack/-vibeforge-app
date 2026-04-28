"use client";

// Modal de "Vista previa del membrete" para Settings → Perfil de organización.
//
// Lee los datos del form en vivo (no de la BD) — el usuario ve el header
// como va a salir antes de guardar, y puede iterar el branding sin
// commitear cambios. Usa el mismo renderClinicHeader() que después usan los
// templates de PDF reales, así "lo que ves es lo que sale" está garantizado.
//
// Tabs internos para alternar entre los 4 tipos de documento. El header es
// el mismo en los 4; lo que cambia es el body placeholder que ilustra cómo
// queda el membrete contextualizado.

import { useState } from "react";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Pill, FlaskConical, Stethoscope, ClipboardList, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { renderClinicHeader, type ClinicHeaderData } from "@/lib/pdf/clinic-header";

type DocType = "prescription" | "exam" | "note" | "treatment";

interface DocTab {
  key: DocType;
  label: string;
  icon: typeof Pill;
  /** Body placeholder rendered below the letterhead. Built per-doc to
   *  give a realistic feel of how each PDF looks. */
  buildBody: (color: string) => string;
}

const TABS: DocTab[] = [
  {
    key: "prescription",
    label: "Receta",
    icon: Pill,
    buildBody: (color) => `
      <div style="margin-top:12px;">
        <div style="font-size:10px;color:#6b7280;margin-bottom:6px;">RECETA MÉDICA · 28-04-2026 · Folio 0042</div>
        <div style="display:flex;gap:24px;font-size:11px;color:#374151;margin-bottom:12px;">
          <div><strong>Paciente:</strong> María García</div>
          <div><strong>DNI:</strong> 12345678</div>
          <div><strong>Edad:</strong> 34 años</div>
        </div>
        <div style="margin-top:8px;font-size:11px;color:#374151;line-height:1.6;">
          <strong style="color:${color};">Rx</strong>
          <ol style="padding-left:20px;margin:6px 0;">
            <li><strong>Paracetamol 500 mg</strong> · 1 tab cada 8h por 5 días · Vía oral · Cantidad: 15 tab</li>
            <li><strong>Loratadina 10 mg</strong> · 1 tab al día por 7 días · Vía oral · Cantidad: 7 tab</li>
          </ol>
        </div>
        <div style="margin-top:24px;font-size:10px;color:#9ca3af;border-top:1px solid #e5e7eb;padding-top:8px;">
          Dr. Juan Pérez · CMP 12345 · Firma: __________________
        </div>
      </div>`,
  },
  {
    key: "exam",
    label: "Orden de exámenes",
    icon: FlaskConical,
    buildBody: (color) => `
      <div style="margin-top:12px;">
        <div style="font-size:10px;color:#6b7280;margin-bottom:6px;">ORDEN DE EXÁMENES · 28-04-2026</div>
        <div style="display:flex;gap:24px;font-size:11px;color:#374151;margin-bottom:12px;">
          <div><strong>Paciente:</strong> María García</div>
          <div><strong>DNI:</strong> 12345678</div>
        </div>
        <div style="font-size:11px;color:#374151;margin-bottom:8px;">
          <strong>Diagnóstico presuntivo:</strong> R10.4 - Otros dolores abdominales y los no especificados
        </div>
        <div style="font-size:11px;color:#374151;line-height:1.6;">
          <strong style="color:${color};">Solicito:</strong>
          <ul style="padding-left:20px;margin:6px 0;">
            <li>Hemograma completo · <em>en ayunas</em></li>
            <li>Glucosa basal · <em>en ayunas</em></li>
            <li>Ecografía abdominal</li>
          </ul>
        </div>
        <div style="margin-top:24px;font-size:10px;color:#9ca3af;border-top:1px solid #e5e7eb;padding-top:8px;">
          Dr. Juan Pérez · CMP 12345
        </div>
      </div>`,
  },
  {
    key: "note",
    label: "Nota clínica",
    icon: Stethoscope,
    buildBody: (color) => `
      <div style="margin-top:12px;">
        <div style="font-size:10px;color:#6b7280;margin-bottom:6px;">NOTA CLÍNICA SOAP · 28-04-2026 · 10:30</div>
        <div style="display:flex;gap:24px;font-size:11px;color:#374151;margin-bottom:12px;">
          <div><strong>Paciente:</strong> María García</div>
          <div><strong>DNI:</strong> 12345678</div>
          <div><strong>Servicio:</strong> Consulta general</div>
        </div>
        <div style="font-size:11px;color:#374151;line-height:1.6;display:grid;grid-template-columns:1fr 1fr;gap:10px;">
          <div><strong style="color:${color};">S</strong> · Paciente refiere dolor abdominal de 3 días.</div>
          <div><strong style="color:${color};">O</strong> · PA 120/80, FC 78, T° 36.8°C.</div>
          <div><strong style="color:${color};">A</strong> · Dolor abdominal a estudiar.</div>
          <div><strong style="color:${color};">P</strong> · Solicitar exámenes complementarios.</div>
        </div>
      </div>`,
  },
  {
    key: "treatment",
    label: "Plan de tratamiento",
    icon: ClipboardList,
    buildBody: (color) => `
      <div style="margin-top:12px;">
        <div style="font-size:10px;color:#6b7280;margin-bottom:6px;">PLAN DE TRATAMIENTO · 28-04-2026</div>
        <div style="display:flex;gap:24px;font-size:11px;color:#374151;margin-bottom:12px;">
          <div><strong>Paciente:</strong> María García</div>
          <div><strong>DNI:</strong> 12345678</div>
        </div>
        <div style="font-size:11px;color:#374151;line-height:1.6;">
          <div><strong style="color:${color};">Tratamiento:</strong> Plan de fertilidad — fase inicial</div>
          <ul style="padding-left:20px;margin:6px 0;">
            <li>1era consulta de fertilidad · 1 sesión · S/350</li>
            <li>Ecografía folicular · 3 sesiones · S/180 c/u</li>
            <li>Inducción de ovulación · seguimiento mensual</li>
          </ul>
          <div style="margin-top:8px;color:${color};font-weight:600;">Total: S/890</div>
        </div>
      </div>`,
  },
];

interface ClinicHeaderPreviewModalProps {
  open: boolean;
  onClose: () => void;
  clinic: ClinicHeaderData;
}

export function ClinicHeaderPreviewModal({
  open,
  onClose,
  clinic,
}: ClinicHeaderPreviewModalProps) {
  const [activeTab, setActiveTab] = useState<DocType>("prescription");
  const tab = TABS.find((t) => t.key === activeTab) ?? TABS[0];
  const color = clinic.print_color_primary || "#10b981";

  // The header is rendered with the same helper that print templates use.
  // No client-side fakery here: this HTML is what the PDF will contain.
  const headerHtml = renderClinicHeader(clinic, {
    compact: activeTab === "prescription",
  });

  return (
    <Dialog open={open} onOpenChange={(v) => (v ? null : onClose())}>
      <DialogContent className="max-w-3xl max-h-[92vh] overflow-y-auto p-0 [&>button]:hidden">
        {/* Sticky header with tabs */}
        <div className="sticky top-0 z-10 border-b border-border bg-card/95 backdrop-blur px-5 py-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <DialogTitle className="text-base">Vista previa del membrete</DialogTitle>
              <DialogDescription className="text-xs">
                Así se verá el encabezado en cada documento PDF que se imprima.
              </DialogDescription>
            </div>
            <button
              onClick={onClose}
              className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
              aria-label="Cerrar"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Tabs */}
          <div className="mt-3 flex flex-wrap gap-1" role="tablist">
            {TABS.map((t) => {
              const Icon = t.icon;
              const isActive = t.key === activeTab;
              return (
                <button
                  key={t.key}
                  type="button"
                  role="tab"
                  aria-selected={isActive}
                  onClick={() => setActiveTab(t.key)}
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-all",
                    isActive
                      ? "bg-primary/10 text-primary border border-primary/30"
                      : "border border-border bg-card text-muted-foreground hover:text-foreground hover:bg-accent/50"
                  )}
                >
                  <Icon className="h-3.5 w-3.5" />
                  {t.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Preview canvas — emulates a sheet of paper. The HTML is rendered
             with dangerouslySetInnerHTML on purpose: same code path that
             will produce the actual PDF. */}
        <div className="px-5 py-5 bg-muted/30">
          <div className="mx-auto w-full max-w-[640px] rounded-lg bg-white shadow-md p-8 text-slate-900">
            <div
              dangerouslySetInnerHTML={{
                __html: headerHtml + tab.buildBody(color),
              }}
            />
          </div>
          <p className="mt-3 text-center text-[11px] text-muted-foreground">
            Vista previa con datos de ejemplo · El cuerpo del documento cambia según el tipo · El membrete es siempre el mismo.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
