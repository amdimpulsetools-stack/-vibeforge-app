"use client";

import { useState, useRef, useEffect } from "react";
import { format, addDays, subDays, isToday } from "date-fns";
import { es } from "date-fns/locale";
import { useLanguage } from "@/components/language-provider";
import type { AppointmentWithRelations, Office } from "@/types/admin";
import { SCHEDULER_START_HOUR, SCHEDULER_END_HOUR, SCHEDULER_INTERVAL } from "@/types/admin";
import type { ViewMode } from "./page";
import {
  ChevronLeft,
  ChevronRight,
  Plus,
  CalendarDays,
  Clock,
  Percent,
  Lock,
  Coffee,
  Building2,
  Check,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";

interface SchedulerHeaderProps {
  currentDate: Date;
  viewMode: ViewMode;
  onDateChange: (date: Date) => void;
  onViewModeChange: (mode: ViewMode) => void;
  onNewAppointment: () => void;
  onNewBlock?: () => void;
  onBreakTime?: () => void;
  onShareAvailableSlots?: () => void;
  breakTimeEnabled?: boolean;
  appointments: AppointmentWithRelations[];
  offices: Office[];
  selectedOfficeIds: string[];
  onOfficeFilterChange: (officeIds: string[]) => void;
}

export function SchedulerHeader({
  currentDate,
  viewMode,
  onDateChange,
  onViewModeChange,
  onNewAppointment,
  onNewBlock,
  onBreakTime,
  onShareAvailableSlots,
  breakTimeEnabled,
  appointments,
  offices,
  selectedOfficeIds,
  onOfficeFilterChange,
}: SchedulerHeaderProps) {
  const { t } = useLanguage();
  const [officeDropdownOpen, setOfficeDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOfficeDropdownOpen(false);
      }
    }
    if (officeDropdownOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [officeDropdownOpen]);

  const allSelected = selectedOfficeIds.length === offices.length;

  const toggleOffice = (officeId: string) => {
    const isSelected = selectedOfficeIds.includes(officeId);
    if (isSelected) {
      // Don't allow deselecting the last one
      if (selectedOfficeIds.length <= 1) return;
      onOfficeFilterChange(selectedOfficeIds.filter((id) => id !== officeId));
    } else {
      onOfficeFilterChange([...selectedOfficeIds, officeId]);
    }
  };

  const toggleAll = () => {
    if (allSelected) {
      // Select only the first office
      if (offices.length > 0) onOfficeFilterChange([offices[0].id]);
    } else {
      onOfficeFilterChange(offices.map((o) => o.id));
    }
  };

  const totalSlots =
    ((SCHEDULER_END_HOUR - SCHEDULER_START_HOUR) * 60) / SCHEDULER_INTERVAL;
  const todayAppointments = appointments.filter(
    (a) => a.appointment_date === format(currentDate, "yyyy-MM-dd")
  );
  const pending = todayAppointments.filter(
    (a) => a.status === "scheduled" || a.status === "confirmed"
  ).length;
  const occupationPercent =
    totalSlots > 0
      ? Math.round((todayAppointments.length / (totalSlots * 2)) * 100)
      : 0;

  const navigateDate = (direction: number) => {
    if (viewMode === "day") {
      onDateChange(direction > 0 ? addDays(currentDate, 1) : subDays(currentDate, 1));
    } else {
      onDateChange(direction > 0 ? addDays(currentDate, 7) : subDays(currentDate, 7));
    }
  };

  const [calendarOpen, setCalendarOpen] = useState(false);
  // Estado propio del Popover md+: PopoverContent se monta en un portal
  // (document.body), así que el wrapper `hidden md:block` no lo oculta —
  // con estado compartido, abrir el modal móvil abría también el Popover
  // y se veían dos calendarios superpuestos.
  const [desktopCalendarOpen, setDesktopCalendarOpen] = useState(false);

  const handleCalendarSelect = (date: Date | undefined) => {
    if (date) {
      onDateChange(date);
      setCalendarOpen(false);
    }
  };

  // Escape cierra el calendario (en <md es un modal propio, no el Popover
  // de Radix, así que el manejo de teclado no viene gratis).
  useEffect(() => {
    if (!calendarOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setCalendarOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [calendarOpen]);

  // Estilo compartido por el trigger de "Hoy" en ambos breakpoints (en <md
  // abre un modal centrado; en md+ el Popover anclado de siempre).
  const todayTriggerClass = cn(
    "shrink-0 rounded-lg border px-3 py-2 text-sm font-medium transition-colors md:py-1.5",
    isToday(currentDate)
      ? "border-primary/40 bg-primary/10 text-primary hover:bg-primary/20"
      : "border-border text-muted-foreground hover:bg-accent hover:text-accent-foreground"
  );

  // Botones de acción de la fila móvil: cuadrado de 40×40 (área táctil
  // mínima) con el mismo lenguaje visual del filtro de consultorios.
  const mobileActionClass =
    "flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border transition-colors";

  // Móvil: fecha corta (la larga desborda a 390 px y empujaba "Nueva cita"
  // fuera del card, que es `overflow-hidden`). Desktop mantiene el formato
  // completo de siempre.
  const titleLong =
    viewMode === "day"
      ? format(currentDate, "EEEE, d MMMM yyyy", { locale: es })
      : `${format(currentDate, "d MMM", { locale: es })} — ${format(addDays(currentDate, 6), "d MMM yyyy", { locale: es })}`;
  const titleShort =
    viewMode === "day"
      ? format(currentDate, "EEE d MMM", { locale: es })
      : `${format(currentDate, "d MMM", { locale: es })} — ${format(addDays(currentDate, 6), "d MMM", { locale: es })}`;

  return (
    <div className="border-b border-border px-3 py-3 md:px-4 space-y-2 md:space-y-3">
      {/* Top row — en <md se parte en dos filas (navegación / acciones) */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex w-full items-center gap-1 md:w-auto md:gap-3">
          <button
            onClick={() => navigateDate(-1)}
            aria-label="Anterior"
            className="shrink-0 rounded-lg p-2.5 text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors md:p-2"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>

          <h2 className="flex-1 truncate text-center text-base font-semibold capitalize md:min-w-[200px] md:flex-none md:text-lg">
            <span className="md:hidden">{titleShort}</span>
            <span className="hidden md:inline">{titleLong}</span>
          </h2>

          <button
            onClick={() => navigateDate(1)}
            aria-label="Siguiente"
            className="shrink-0 rounded-lg p-2.5 text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors md:p-2"
          >
            <ChevronRight className="h-5 w-5" />
          </button>

          {/* Selector de fecha — <md: trigger suelto que abre un modal
              centrado (abajo). El Popover de Radix se anclaba al trigger y,
              estando éste pegado al borde derecho de la fila, el calendario
              se salía de la pantalla a 390 px. */}
          <button
            onClick={() => setCalendarOpen(true)}
            aria-label="Abrir calendario"
            aria-haspopup="dialog"
            aria-expanded={calendarOpen}
            className={cn(todayTriggerClass, "md:hidden")}
          >
            {t("scheduler.today")}
          </button>

          {/* md+ — posicionamiento anclado de siempre, intacto. */}
          <div className="hidden shrink-0 md:block">
            <Popover open={desktopCalendarOpen} onOpenChange={setDesktopCalendarOpen}>
              <PopoverTrigger asChild>
                <button className={todayTriggerClass}>{t("scheduler.today")}</button>
              </PopoverTrigger>
              <PopoverContent align="start" className="w-auto p-0">
                <div className="flex flex-col">
                  <Calendar
                    mode="single"
                    selected={currentDate}
                    onSelect={handleCalendarSelect}
                    defaultMonth={currentDate}
                    locale={es}
                  />
                  <div className="border-t border-border p-2">
                    <button
                      onClick={() => {
                        onDateChange(new Date());
                        setDesktopCalendarOpen(false);
                      }}
                      className="w-full rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:opacity-90 transition-opacity"
                    >
                      {t("scheduler.today")}
                    </button>
                  </div>
                </div>
              </PopoverContent>
            </Popover>
          </div>
        </div>

        {/* Fila de controles. En <md "Nueva cita" vive en el FAB (ver
            scheduler/page.tsx) y TODAS las acciones restantes son botones
            inline (ya no hay menú "⋯"): [toggle · consultorios · compartir ·
            bloquear · break]. Reparto sin aire muerto: gap fijo chico
            (gap-1.5) y el toggle con flex-1 absorbiendo el sobrante, en vez
            de justify-between empujando 35 px entre cada control.
            Cuentas a 390 px (main p-4 → card 358, header px-3 → 334 útiles):
            4 botones de 40 + 3 gaps de 6 = 178 para el grupo de iconos,
            + 6 de gap → el toggle recibe 150 px (mínimo real ~136). Entra
            en una línea. A 320 px quedan 264 útiles → el grupo no cabe
            junto al toggle y baja limpio a una segunda línea (los 4 iconos
            juntos, porque viven en su propio contenedor). md+ conserva el
            justify-end de siempre: el wrapper del grupo usa `md:contents`,
            así que sus hijos vuelven a ser hijos directos de la fila y el
            layout de escritorio queda pixel-idéntico. */}
        <div className="flex w-full flex-wrap items-center gap-1.5 md:w-auto md:flex-nowrap md:justify-end md:gap-2">
          {/* View toggle */}
          <div className="flex min-w-[8.5rem] flex-1 gap-1 rounded-lg bg-muted p-1 md:min-w-0 md:flex-none">
            <button
              onClick={() => onViewModeChange("day")}
              className={cn(
                "flex-1 rounded-md px-3 py-2 text-sm font-medium transition-colors md:flex-none md:py-1.5",
                viewMode === "day"
                  ? "bg-card text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              {t("scheduler.day_view")}
            </button>
            <button
              onClick={() => onViewModeChange("week")}
              className={cn(
                "flex-1 rounded-md px-3 py-2 text-sm font-medium transition-colors md:flex-none md:py-1.5",
                viewMode === "week"
                  ? "bg-card text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              {t("scheduler.week_view")}
            </button>
          </div>

          {/* Grupo de acciones. En <md es un bloque propio para que, si hay
              wrap (≤320 px), los iconos bajen juntos y no se desparramen.
              En md+ `contents` lo disuelve y sus hijos son hijos directos
              de la fila, exactamente como antes. */}
          <div className="flex items-center gap-1.5 md:contents">
          {/* Office filter */}
          {offices.length > 1 && (
            <div className="relative shrink-0" ref={dropdownRef}>
              <button
                onClick={() => setOfficeDropdownOpen((o) => !o)}
                className={cn(
                  "relative flex h-10 items-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-medium transition-colors md:h-auto",
                  !allSelected
                    ? "border-primary/40 bg-primary/10 text-primary hover:bg-primary/20"
                    : "border-border bg-muted/50 text-muted-foreground hover:bg-muted"
                )}
              >
                <Building2 className="h-4 w-4" />
                <span className="hidden sm:inline">
                  {allSelected
                    ? "Todos"
                    : selectedOfficeIds.length === 1
                      ? offices.find((o) => o.id === selectedOfficeIds[0])?.name ?? "1"
                      : `${selectedOfficeIds.length} consultorios`}
                </span>
                {/* Contador de <sm: badge superpuesto, no inline — inline
                    ensanchaba el botón de 40 a ~62 px al filtrar y eso
                    hacía saltar de línea la fila a 390 px. */}
                {!allSelected && (
                  <span className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground sm:hidden">
                    {selectedOfficeIds.length}
                  </span>
                )}
              </button>

              {officeDropdownOpen && (
                <div className="absolute right-0 top-full z-50 mt-1 min-w-[200px] rounded-lg border border-border bg-popover p-1 shadow-lg">
                  {/* Select all */}
                  <button
                    onClick={toggleAll}
                    className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm hover:bg-accent transition-colors"
                  >
                    <span
                      className={cn(
                        "flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors",
                        allSelected
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-muted-foreground/30"
                      )}
                    >
                      {allSelected && <Check className="h-3 w-3" />}
                    </span>
                    <span className="font-medium">Todos los consultorios</span>
                  </button>

                  <div className="my-1 h-px bg-border" />

                  {offices.map((office) => {
                    const checked = selectedOfficeIds.includes(office.id);
                    return (
                      <button
                        key={office.id}
                        onClick={() => toggleOffice(office.id)}
                        className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm hover:bg-accent transition-colors"
                      >
                        <span
                          className={cn(
                            "flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors",
                            checked
                              ? "border-primary bg-primary text-primary-foreground"
                              : "border-muted-foreground/30"
                          )}
                        >
                          {checked && <Check className="h-3 w-3" />}
                        </span>
                        <span className="truncate">{office.name}</span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* Acciones inline de <md — las tres viven acá como cuadrados de
              40×40 con el mismo lenguaje visual del filtro de consultorios
              (rounded-lg, borde + tinte). Antes Bloquear y Break Time
              estaban escondidas tras un menú "⋯"; caben en la fila, así
              que se muestran. Cada acción sigue viviendo en UN solo lugar
              por breakpoint (estos son md:hidden; los equivalentes de
              escritorio están en el bloque `hidden md:flex` de abajo). */}
          {onShareAvailableSlots && (
            <button
              onClick={onShareAvailableSlots}
              aria-label="Compartir horarios disponibles"
              title="Compartir horarios disponibles"
              className={cn(
                mobileActionClass,
                "border-primary/40 bg-primary/10 text-primary hover:bg-primary/20 md:hidden"
              )}
            >
              <Clock className="h-4 w-4" />
            </button>
          )}

          {onNewBlock && (
            <button
              onClick={onNewBlock}
              aria-label="Bloquear agenda"
              title="Bloquear agenda"
              className={cn(
                mobileActionClass,
                "border-amber-500/40 bg-amber-500/10 text-amber-600 hover:bg-amber-500/20 dark:text-amber-400 md:hidden"
              )}
            >
              <Lock className="h-4 w-4" />
            </button>
          )}

          {onBreakTime && (
            <button
              onClick={onBreakTime}
              aria-label={
                breakTimeEnabled ? "Break Time (activo)" : "Break Time"
              }
              title="Break Time"
              aria-pressed={Boolean(breakTimeEnabled)}
              className={cn(
                mobileActionClass,
                "relative md:hidden",
                breakTimeEnabled
                  ? "border-blue-500/40 bg-blue-500/10 text-blue-600 hover:bg-blue-500/20 dark:text-blue-400"
                  : "border-border bg-muted/50 text-muted-foreground hover:bg-muted"
              )}
            >
              <Coffee className="h-4 w-4" />
              {breakTimeEnabled && (
                <span className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-blue-500" />
              )}
            </button>
          )}

          {/* Acciones de escritorio — visibles sueltas solo desde md. */}
          <div className="hidden md:flex md:items-center md:gap-2">
          {/* Bloquear button */}
          {onNewBlock && (
            <button
              onClick={onNewBlock}
              className="flex items-center gap-1.5 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm font-medium text-amber-600 dark:text-amber-400 hover:bg-amber-500/20 transition-colors"
            >
              <Lock className="h-4 w-4" />
              Bloquear
            </button>
          )}

          {/* Break Time button */}
          {onBreakTime && (
            <div className="relative group">
              <button
                onClick={onBreakTime}
                className={cn(
                  "rounded-lg border p-2 transition-colors",
                  breakTimeEnabled
                    ? "border-blue-500/40 bg-blue-500/10 text-blue-600 dark:text-blue-400 hover:bg-blue-500/20"
                    : "border-border bg-muted/50 text-muted-foreground hover:bg-muted"
                )}
              >
                <Coffee className="h-4 w-4" />
                {breakTimeEnabled && (
                  <span className="absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full bg-blue-500" />
                )}
              </button>
              <div className="invisible group-hover:visible opacity-0 group-hover:opacity-100 transition-all duration-150 absolute left-1/2 -translate-x-1/2 top-full mt-2 z-50">
                <div className="relative rounded-lg bg-popover border border-border px-3 py-1.5 shadow-lg">
                  <div className="absolute -top-1 left-1/2 -translate-x-1/2 h-2 w-2 rotate-45 bg-popover border-l border-t border-border" />
                  <span className="text-xs font-medium text-foreground whitespace-nowrap">Break Time</span>
                </div>
              </div>
            </div>
          )}

          {/* Compartir horarios disponibles (para WhatsApp) */}
          {onShareAvailableSlots && (
            <div className="relative group">
              <button
                onClick={onShareAvailableSlots}
                className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 p-2 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/20 transition-colors"
              >
                <Clock className="h-4 w-4" />
              </button>
              <div className="invisible group-hover:visible opacity-0 group-hover:opacity-100 transition-all duration-150 absolute left-1/2 -translate-x-1/2 top-full mt-2 z-50">
                <div className="relative rounded-lg bg-popover border border-border px-3 py-1.5 shadow-lg">
                  <div className="absolute -top-1 left-1/2 -translate-x-1/2 h-2 w-2 rotate-45 bg-popover border-l border-t border-border" />
                  <span className="text-xs font-medium text-foreground whitespace-nowrap">
                    Compartir horarios
                  </span>
                </div>
              </div>
            </div>
          )}
          </div>

          {/* Nueva cita — en <md se oculta: la reemplaza el FAB circular de
              la página (así la segunda fila del header no se desperdicia
              con un botón que ocupaba la línea entera). */}
          <button
            onClick={onNewAppointment}
            className="hidden shrink-0 items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground hover:opacity-90 transition-opacity md:flex md:py-2"
          >
            <Plus className="h-4 w-4" />
            {t("scheduler.new_appointment")}
          </button>
          </div>
        </div>
      </div>

      {/* Overview counters — labels ocultos en <sm (icono + número).
          Móvil: grid de 3 columnas iguales → los chips cubren el ancho del
          contenedor sin aire muerto a la derecha (cada chip centra su
          contenido). md+ vuelve al flex de siempre, pixel-idéntico. */}
      <div className="grid grid-cols-3 gap-2 sm:flex sm:flex-wrap md:gap-4">
        <div className="flex items-center justify-center gap-2 rounded-lg bg-muted/50 px-3 py-1.5 sm:justify-start">
          <CalendarDays className="h-4 w-4 text-primary" />
          <span className="hidden text-sm text-muted-foreground sm:inline">{t("scheduler.overview_total")}:</span>
          <span className="text-sm font-semibold">{todayAppointments.length}</span>
        </div>
        <div className="flex items-center justify-center gap-2 rounded-lg bg-muted/50 px-3 py-1.5 sm:justify-start">
          <Clock className="h-4 w-4 text-blue-500" />
          <span className="hidden text-sm text-muted-foreground sm:inline">{t("scheduler.overview_pending")}:</span>
          <span className="text-sm font-semibold">{pending}</span>
        </div>
        <div className="flex items-center justify-center gap-2 rounded-lg bg-muted/50 px-3 py-1.5 sm:justify-start">
          <Percent className="h-4 w-4 text-emerald-500" />
          <span className="hidden text-sm text-muted-foreground sm:inline">{t("scheduler.overview_occupation")}:</span>
          <span className="text-sm font-semibold">{occupationPercent}%</span>
        </div>
      </div>

      {/* Date picker de <md — modal centrado en pantalla.
          El Popover de Radix se ancla al trigger y éste queda pegado al
          borde derecho de la fila de navegación, así que el calendario se
          cortaba por el borde de la pantalla a 390 px. Acá va `fixed`
          centrado con ancho acotado (nunca más ancho que la pantalla menos
          2rem) y alto máximo en dvh con scroll interno, de modo que el
          botón "Hoy" del pie siempre queda alcanzable. Escritorio: este
          bloque es `md:hidden`, el Popover anclado sigue igual. */}
      {calendarOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div
            className="absolute inset-0 bg-black/50"
            onClick={() => setCalendarOpen(false)}
            aria-hidden="true"
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Seleccionar fecha"
            className="absolute left-1/2 top-1/2 flex max-h-[calc(100dvh-3rem)] w-[min(340px,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-xl border border-border bg-popover text-popover-foreground shadow-lg"
          >
            <div className="min-h-0 flex-1 overflow-y-auto">
              <Calendar
                mode="single"
                selected={currentDate}
                onSelect={handleCalendarSelect}
                defaultMonth={currentDate}
                locale={es}
                className="mx-auto p-3"
              />
            </div>
            <div className="shrink-0 border-t border-border p-2">
              <button
                onClick={() => {
                  onDateChange(new Date());
                  setCalendarOpen(false);
                }}
                className="w-full rounded-md bg-primary px-3 py-2.5 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90"
              >
                {t("scheduler.today")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
