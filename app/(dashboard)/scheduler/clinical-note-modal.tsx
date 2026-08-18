"use client";

import { useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  ClinicalNotePanel,
  type ClinicalNotePanelHandle,
  type ClinicalNotePanelState,
} from "./clinical-note-panel";
import { ClinicalSidePanels } from "./clinical-side-panels";
import { ClinicalNotePrintButton } from "./clinical-note-print";
import { NotesTimeline } from "./notes-timeline";
import { useDermatologyAddon } from "@/hooks/use-dermatology-addon";
import {
  User,
  CalendarDays,
  Clock,
  Stethoscope,
  Lock,
  Save,
  Loader2,
  Cloud,
  CloudOff,
  FileText,
  History,
  Camera,
} from "lucide-react";
import { cn } from "@/lib/utils";

// Lazy-loaded: el panel de derma arrastra browser-image-compression, así que
// solo enviamos ese código al cliente cuando se abre la vista de fotos.
const BeforeAfterPhotosPanel = dynamic(
  () => import("@/components/dermatology/before-after-photos-panel").then((m) => m.BeforeAfterPhotosPanel),
  { ssr: false }
);
import { calculateAge } from "@/lib/export";
import {
  CLINICAL_PRIMARY_CTA,
  CLINICAL_SIGN_CTA,
  CLINICAL_SIGN_CTA_READY,
  CLINICAL_SIGNED_BADGE,
} from "@/lib/clinical-ui-tokens";

interface ClinicalNoteModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  appointmentId: string;
  patientId: string | null;
  doctorId: string;
  canEdit: boolean;
  /**
   * Photo uploads are operational (admin/reception take them at the
   * visit), unlike the SOAP note which stays doctor-only. Defaults to
   * canEdit when not provided.
   */
  canEditPhotos?: boolean;
  appointmentStatus: string;
  patientName?: string;
  patientDni?: string | null;
  patientBirthDate?: string | null;
  doctorName?: string;
  serviceName?: string;
  appointmentDate?: string;
  appointmentTime?: string;
  clinicName?: string;
}

export function ClinicalNoteModal({
  open,
  onOpenChange,
  appointmentId,
  patientId,
  doctorId,
  canEdit,
  canEditPhotos,
  appointmentStatus,
  patientName,
  patientDni,
  patientBirthDate,
  doctorName,
  serviceName,
  appointmentDate,
  appointmentTime,
  clinicName,
}: ClinicalNoteModalProps) {
  const patientAge = patientBirthDate ? calculateAge(patientBirthDate) : null;
  const panelRef = useRef<ClinicalNotePanelHandle>(null);
  const [panelState, setPanelState] = useState<ClinicalNotePanelState>({
    note: null,
    isLocked: false,
    hasContent: false,
    isSaving: false,
    isSigning: false,
    autoSaveStatus: "idle",
    isDirty: false,
    lastSavedAt: null,
  });

  // El addon de dermatología habilita la galería "Antes y Después", que es a
  // nivel paciente (cruza todas las consultas) — por eso cuelga del switcher
  // junto a Timeline, no de las tabs por-consulta del panel lateral.
  const { active: dermActive } = useDermatologyAddon();

  // View toggle: "note" = editor de la consulta actual, "timeline" =
  // historial de notas anteriores del paciente, "photos" = galería antes/
  // después del paciente. Mantenemos el panel de Nota siempre montado para
  // preservar estado del editor; Timeline y fotos se montan la primera vez que
  // se abren y permanecen montados para cachear datos.
  const [view, setView] = useState<"note" | "timeline" | "photos">("note");
  const [hasOpenedTimeline, setHasOpenedTimeline] = useState(false);
  const [hasOpenedPhotos, setHasOpenedPhotos] = useState(false);
  useEffect(() => {
    if (view === "timeline") setHasOpenedTimeline(true);
    if (view === "photos") setHasOpenedPhotos(true);
  }, [view]);

  // Si el addon se apaga mientras estamos en la vista de fotos, volver a Nota
  // para no quedar en una vista sin botón que la represente.
  useEffect(() => {
    if (!dermActive && view === "photos") setView("note");
  }, [dermActive, view]);

  // Reset al cerrar el modal — la próxima apertura empieza siempre en Nota.
  useEffect(() => {
    if (!open) setView("note");
  }, [open]);

  const isSigned = panelState.isLocked;
  const canSign =
    canEdit &&
    !panelState.isLocked &&
    panelState.hasContent &&
    !!panelState.note;

  // Ctrl+S / Cmd+S triggers save while the modal is open and editable.
  // Solo activo en modo Nota — en Timeline no hay nada que guardar.
  useEffect(() => {
    if (!open || !canEdit || isSigned || view !== "note") return;
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        if (!panelState.isSaving) panelRef.current?.save();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, canEdit, isSigned, panelState.isSaving, view]);

  // Escape or a click outside with unsaved edits must never discard the
  // note — flush the save first, then close. (Closing via the X is
  // covered by the panel's unmount keepalive persist.)
  const isDirty = panelState.isDirty && canEdit && !isSigned;
  const flushAndClose = async () => {
    try {
      await panelRef.current?.save();
    } finally {
      onOpenChange(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/* Móvil: pantalla completa. El contenido está pensado para dos
          columnas anchas; a 390 px un dialog centrado con 95vw dejaba
          márgenes muertos arriba y abajo mientras la nota (el editor SOAP
          + los paneles laterales, ya apilados por el grid de abajo) pedía
          todo el alto disponible. dvh y no vh porque 100vh incluye la
          barra de URL de iOS. Desde md: exactamente el dialog anterior. */}
      <DialogContent
        onEscapeKeyDown={(e) => {
          if (isDirty) {
            e.preventDefault();
            void flushAndClose();
          }
        }}
        onInteractOutside={(e) => {
          if (isDirty) {
            e.preventDefault();
            void flushAndClose();
          }
        }}
        className="top-0 left-0 h-[100dvh] max-h-[100dvh] w-full max-w-none translate-x-0 translate-y-0 overflow-y-auto rounded-none p-0 sm:rounded-none md:top-[50%] md:left-[50%] md:h-auto md:max-h-[92dvh] md:max-w-[95vw] md:translate-x-[-50%] md:translate-y-[-50%] md:rounded-xl xl:max-w-[1340px] 2xl:max-w-[1440px]"
      >
        {/* Sticky header — title, patient context, signed badge, global CTAs */}
        <DialogHeader className="sticky top-0 z-10 border-b border-border bg-card/95 backdrop-blur px-4 pt-4 pb-3 md:px-6 md:pt-5 md:pb-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <DialogTitle className="flex items-center gap-2 text-base">
                <Stethoscope className="h-5 w-5 text-emerald-500" />
                Historia Clínica
                {isSigned && (
                  <span className={CLINICAL_SIGNED_BADGE}>
                    <Lock className="h-3.5 w-3.5" />
                    Nota firmada
                    {panelState.note?.signed_at && (
                      <span className="opacity-70">
                        {new Date(panelState.note.signed_at).toLocaleDateString("es-PE", {
                          day: "2-digit",
                          month: "short",
                        })}
                      </span>
                    )}
                  </span>
                )}
              </DialogTitle>
              <DialogDescription asChild>
                <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                  {patientName && (
                    <span className="flex items-center gap-1">
                      <User className="h-3 w-3" />
                      {patientName}
                    </span>
                  )}
                  {patientDni && (
                    <span className="font-medium">DNI: {patientDni}</span>
                  )}
                  {patientAge != null && (
                    <span className="rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary">
                      {patientAge} años
                    </span>
                  )}
                  {appointmentDate && (
                    <span className="flex items-center gap-1">
                      <CalendarDays className="h-3 w-3" />
                      {appointmentDate}
                    </span>
                  )}
                  {appointmentTime && (
                    <span className="flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {appointmentTime}
                    </span>
                  )}
                  {serviceName && (
                    <span className="font-medium text-foreground">{serviceName}</span>
                  )}
                  {/* Auto-save indicator — the single canonical location.
                      min-w reserves its slot so appearing/disappearing text
                      never shifts the header row, and the opacity transition
                      lets it breathe instead of flickering per keystroke. */}
                  {canEdit && !isSigned && (
                    <span
                      className={cn(
                        "inline-flex min-w-[110px] items-center gap-1 text-[11px] transition-opacity duration-300",
                        panelState.autoSaveStatus === "idle" && "opacity-0",
                        panelState.autoSaveStatus === "dirty" && "text-amber-600 dark:text-amber-400",
                        panelState.autoSaveStatus === "saving" && "text-muted-foreground",
                        panelState.autoSaveStatus === "saved" && "text-success-500",
                        panelState.autoSaveStatus === "error" && "text-red-500"
                      )}
                      role="status"
                      aria-live="polite"
                    >
                      {panelState.autoSaveStatus === "dirty" && (
                        <>
                          <span className="h-1.5 w-1.5 rounded-full bg-current" /> Sin guardar
                        </>
                      )}
                      {panelState.autoSaveStatus === "saving" && (
                        <>
                          <Loader2 className="h-3 w-3 animate-spin" /> Guardando…
                        </>
                      )}
                      {panelState.autoSaveStatus === "saved" && (
                        <>
                          <Cloud className="h-3 w-3" /> Guardado{" "}
                          {panelState.lastSavedAt &&
                            panelState.lastSavedAt.toLocaleTimeString("es-PE", {
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                        </>
                      )}
                      {panelState.autoSaveStatus === "error" && (
                        <>
                          <CloudOff className="h-3 w-3" /> Error al guardar
                        </>
                      )}
                    </span>
                  )}
                </div>
              </DialogDescription>
            </div>

            {/* Global CTAs — solo en modo Nota (Timeline es read-only).
                Imprimir queda FUERA del guard de canEdit: entregar el PDF de
                una nota firmada es la operación más común del mostrador y no
                requiere permiso de edición. */}
            {view === "note" && (
              <div className="flex shrink-0 flex-wrap items-center gap-2">
                {panelState.note &&
                  panelState.hasContent &&
                  patientName &&
                  doctorName &&
                  serviceName && (
                    <ClinicalNotePrintButton
                      note={panelState.note}
                      patientName={patientName}
                      patientDni={patientDni}
                      doctorName={doctorName}
                      serviceName={serviceName}
                      appointmentDate={appointmentDate ?? ""}
                      appointmentTime={appointmentTime ?? ""}
                      clinicName={clinicName}
                    />
                  )}
                {canEdit && !isSigned && (
                <button
                  type="button"
                  onClick={() => panelRef.current?.save()}
                  disabled={panelState.isSaving || isSigned || !panelState.hasContent}
                  className={CLINICAL_PRIMARY_CTA}
                  title={!panelState.hasContent ? "Escribe algo antes de guardar" : "Guardar (Ctrl+S)"}
                  aria-label={panelState.note ? "Guardar nota clínica (Ctrl+S)" : "Crear nota clínica (Ctrl+S)"}
                >
                  {panelState.isSaving ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Save className="h-4 w-4" />
                  )}
                  {panelState.note ? "Guardar" : "Crear nota"}
                  <kbd className="ml-1 hidden rounded bg-foreground/10 px-1 py-0.5 text-[10px] font-mono font-normal text-foreground/70 lg:inline">
                    Ctrl+S
                  </kbd>
                </button>
                )}
                {canSign && (
                  <button
                    type="button"
                    onClick={() => panelRef.current?.sign()}
                    disabled={panelState.isSigning}
                    className={cn(CLINICAL_SIGN_CTA, CLINICAL_SIGN_CTA_READY)}
                    aria-label="Firmar nota clínica (acción irreversible)"
                  >
                    {panelState.isSigning ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Lock className="h-4 w-4" />
                    )}
                    Firmar nota
                  </button>
                )}
              </div>
            )}
          </div>
        </DialogHeader>

        {/* View toggle — Nota | Timeline. Sub-header sticky bajo el header
            principal para que esté siempre visible al hacer scroll. Solo
            mostrar si hay paciente vinculado (sin paciente no hay historial
            que mostrar). */}
        {patientId && (
          <div className="relative z-[9] border-b border-border bg-card/95 backdrop-blur px-4 py-2 md:sticky md:top-[68px] md:px-6">
            <div
              className="inline-flex items-center gap-1 rounded-lg bg-muted p-1"
              role="tablist"
              aria-label="Vista de la historia clínica"
            >
              <button
                type="button"
                role="tab"
                aria-selected={view === "note"}
                onClick={() => setView("note")}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                  view === "note"
                    ? "bg-card text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                <FileText className="h-3.5 w-3.5" />
                Nota
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={view === "timeline"}
                onClick={() => setView("timeline")}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                  view === "timeline"
                    ? "bg-card text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                <History className="h-3.5 w-3.5" />
                Timeline
              </button>
              {dermActive && (
                <button
                  type="button"
                  role="tab"
                  aria-selected={view === "photos"}
                  onClick={() => setView("photos")}
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                    view === "photos"
                      ? "bg-card text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  <Camera className="h-3.5 w-3.5" />
                  Antes y Después
                </button>
              )}
            </div>
          </div>
        )}

        {/* Body */}
        <div className="px-4 py-4 md:px-6 md:py-5">
          {/* Modo Nota — siempre montado para preservar estado del editor. */}
          <div
            className={cn(
              "grid grid-cols-1 gap-4 md:gap-6",
              // El SOAP tiene ancho de lectura fijo (~75ch) y el panel
              // lateral absorbe el resto — antes el panel era fijo a la
              // derecha de un modal enorme y el aire muerto quedaba en
              // el medio.
              "xl:grid-cols-[minmax(0,48rem)_minmax(360px,1fr)] 2xl:grid-cols-[minmax(0,48rem)_minmax(420px,1fr)]",
              isSigned && "xl:items-start",
              view !== "note" && "hidden"
            )}
          >
            {/* Left: SOAP Clinical Note — signed state is communicated by the
                green seal badge + read-only fields, not by dimming (the old
                opacity-90 was imperceptible and read as a rendering glitch). */}
            <div className={cn(isSigned && "rounded-xl border-t-2 border-t-success-500/60 pt-3")}>
              <ClinicalNotePanel
                ref={panelRef}
                appointmentId={appointmentId}
                patientId={patientId}
                doctorId={doctorId}
                canEdit={canEdit}
                appointmentStatus={appointmentStatus}
                patientName={patientName}
                patientDni={patientDni}
                doctorName={doctorName}
                serviceName={serviceName}
                appointmentDate={appointmentDate}
                appointmentTime={appointmentTime}
                clinicName={clinicName}
                wideLayout
                hideFooterActions
                onStateChange={setPanelState}
              />
            </div>

            {/* Right: tabbed side panels */}
            {patientId && (
              <div className="xl:border-l xl:border-border xl:pl-6">
                <ClinicalSidePanels
                  patientId={patientId}
                  doctorId={doctorId}
                  appointmentId={appointmentId}
                  clinicalNoteId={panelState.note?.id ?? null}
                  canEdit={canEdit}
                  isSigned={isSigned}
                  patientName={patientName}
                  patientDni={patientDni}
                  doctorName={doctorName}
                  appointmentDate={appointmentDate}
                  clinicName={clinicName}
                />
              </div>
            )}
          </div>

          {/* Modo Timeline — full-width, lazy-mounted la primera vez y luego
              persistido para cachear datos entre toggles. */}
          {hasOpenedTimeline && (
            <div className={cn(view !== "timeline" && "hidden")}>
              <NotesTimeline
                patientId={patientId}
                currentNoteId={panelState.note?.id ?? null}
              />
            </div>
          )}

          {/* Modo Antes y Después — galería a nivel paciente, full-width para
              que la comparación de fotos tenga aire. Lazy-mounted y persistido
              igual que el Timeline. Solo con addon de derma + paciente. */}
          {dermActive && patientId && hasOpenedPhotos && (
            <div className={cn(view !== "photos" && "hidden")}>
              <BeforeAfterPhotosPanel
                patientId={patientId}
                doctorId={doctorId}
                appointmentId={appointmentId}
                canEdit={canEditPhotos ?? canEdit}
              />
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
