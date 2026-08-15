"use client";

/**
 * Módulo Caja — F3.
 *
 * Patrón de datos calcado de /almacen: client component, `useOrganization()`
 * para el org_id y el rol, cliente Supabase del navegador para las lecturas
 * y `supabase.rpc()` para las cuatro operaciones del turno (mig 215). No hay
 * rutas API: la RLS de la 214 restringe las lecturas y los RPC validan todo
 * lo demás.
 *
 * Dos cosas que esta pantalla NO hace, por diseño:
 *
 *   · No vincula cobros. Eso es 100% del trigger `caja_stamp_payment`: los
 *     cuatro formularios de cobro de la app siguen sin saber que la caja
 *     existe, y por eso no hay forma de "olvidar" atar un pago.
 *
 *   · No calcula el esperado. Lo calcula el RPC de cierre con la fórmula de
 *     la 215. Un segundo cálculo en JavaScript sería un segundo lugar donde
 *     el arqueo puede estar mal.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { useOrganization } from "@/components/organization-provider";
import { useOrgAddons } from "@/hooks/use-org-addons";
import { useUser } from "@/hooks/use-user";
import { toast } from "sonner";
import { AlertTriangle, Settings2, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { OpenCard } from "./open-card";
import { SummaryTab } from "./summary-tab";
import { MovementsTab } from "./movements-tab";
import { CloseResultCard, CloseTab, type ClosePayload } from "./close-tab";
import { HistoryTab } from "./history-tab";
import { MovementModal, type MovementPayload } from "./movement-modal";
import { SettingsModal, type SettingsPayload } from "./settings-modal";
import {
  MOVEMENT_COLUMNS,
  PAYMENT_COLUMNS,
  SHIFT_COLUMNS,
  elapsedSince,
  fmtTime,
  formatPEN,
  type CashMovement,
  type CashSettings,
  type CashShift,
  type CloseResult,
  type MovementType,
  type PaymentMethodLookup,
  type ShiftPayment,
  type ShiftSummary,
} from "./types";

/**
 * Tope del historial traído a memoria. Una clínica con dos cajas cierra ~60
 * turnos al mes; 400 son más de medio año de arqueos, suficiente para la
 * pregunta que se le hace a esta pantalla.
 */
const SHIFT_FETCH_LIMIT = 400;
const ORPHAN_FETCH_LIMIT = 200;

type TabKey = "abrir" | "resumen" | "movimientos" | "cerrar" | "historial";

export default function CajaPage() {
  const { organizationId, orgRole, isOrgAdmin } = useOrganization();
  const { user } = useUser();
  const { hasAddon, loading: addonsLoading } = useOrgAddons();
  const cajaEnabled = hasAddon("caja");

  const [settings, setSettings] = useState<CashSettings | null>(null);
  const [settingsLoaded, setSettingsLoaded] = useState(false);
  const [shifts, setShifts] = useState<CashShift[]>([]);
  const [payments, setPayments] = useState<ShiftPayment[]>([]);
  const [movements, setMovements] = useState<CashMovement[]>([]);
  const [orphans, setOrphans] = useState<ShiftPayment[]>([]);
  const [summary, setSummary] = useState<ShiftSummary | null>(null);
  const [methods, setMethods] = useState<PaymentMethodLookup[]>([]);
  const [authors, setAuthors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [tab, setTab] = useState<TabKey>("resumen");
  const [movementFor, setMovementFor] = useState<MovementType | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [closeResult, setCloseResult] = useState<CloseResult | null>(null);
  const [attaching, setAttaching] = useState<string | null>(null);

  // ── Turno abierto ────────────────────────────────────────────────────
  // Con scope 'organization' la caja de la clínica es la de cualquiera; con
  // scope 'user', solo la propia. Un admin ve por RLS los turnos de todos,
  // así que sin este filtro "su" caja podría ser la de otra persona.
  const openShift = useMemo(() => {
    const open = shifts.filter((s) => s.status === "open");
    if (settings?.shift_scope === "organization") return open[0] ?? null;
    return open.find((s) => s.opened_by === user?.id) ?? null;
  }, [shifts, settings?.shift_scope, user?.id]);

  const closedShifts = useMemo(
    () => shifts.filter((s) => s.status === "closed"),
    [shifts]
  );

  // Se expresa por exclusión y no por lista blanca a propósito: las orgs
  // anteriores a la mig 020 guardan a recepción como 'member'/'assistant'
  // (ver mig 192), y una lista blanca de los tres roles canónicos las
  // dejaría sin poder abrir su caja. El filtro real lo hace el RPC.
  const canOpen = orgRole !== "doctor";

  // ── Carga ────────────────────────────────────────────────────────────
  const loadCore = useCallback(async () => {
    if (!organizationId) return;
    const supabase = createClient();
    setLoading(true);
    setLoadError(null);

    const [setRes, shiftRes, methodRes] = await Promise.all([
      supabase
        .from("cash_settings")
        .select(
          "organization_id,shift_scope,require_blind_count,default_opening_float,difference_tolerance,activated_at"
        )
        .eq("organization_id", organizationId)
        .maybeSingle(),
      supabase
        .from("cash_shifts")
        .select(SHIFT_COLUMNS)
        .eq("organization_id", organizationId)
        .order("opened_at", { ascending: false })
        .limit(SHIFT_FETCH_LIMIT),
      supabase
        .from("lookup_values")
        .select("id,label,icon,lookup_categories!inner(slug)")
        .eq("lookup_categories.slug", "payment_method")
        .eq("is_active", true)
        .or(`organization_id.is.null,organization_id.eq.${organizationId}`)
        .order("display_order"),
    ]);

    if (shiftRes.error) {
      setLoadError(shiftRes.error.message);
      setLoading(false);
      setSettingsLoaded(true);
      return;
    }

    const nextSettings = (setRes.data as unknown as CashSettings | null) ?? null;
    const nextShifts = (shiftRes.data ?? []) as unknown as CashShift[];
    setSettings(nextSettings);
    setSettingsLoaded(true);
    setShifts(nextShifts);
    setMethods((methodRes.data ?? []) as unknown as PaymentMethodLookup[]);
    setLoading(false);

    // Quién abrió cada turno. Va aparte porque opened_by apunta a auth.users
    // y el nombre vive en user_profiles: un arqueo sin responsable visible no
    // controla nada (mismo criterio que el kardex de Almacén).
    const ids = [
      ...new Set(
        nextShifts.flatMap((s) => [s.opened_by, s.closed_by]).filter(Boolean)
      ),
    ] as string[];
    if (ids.length > 0) {
      const { data } = await supabase
        .from("user_profiles")
        .select("id,full_name,email")
        .in("id", ids);
      const map: Record<string, string> = {};
      for (const row of (data ?? []) as {
        id: string;
        full_name: string | null;
        email: string | null;
      }[]) {
        const label = row.full_name?.trim() || row.email?.trim();
        if (label) map[row.id] = label;
      }
      setAuthors((prev) => ({ ...prev, ...map }));
    }
  }, [organizationId]);

  /** Detalle del turno: resumen (RPC), cobros y movimientos. */
  const loadShiftDetail = useCallback(async (shiftId: string | null) => {
    if (!shiftId) {
      setSummary(null);
      setPayments([]);
      setMovements([]);
      return;
    }
    const supabase = createClient();
    const [sumRes, payRes, movRes] = await Promise.all([
      supabase.rpc("caja_shift_summary", { p_shift: shiftId }),
      supabase
        .from("patient_payments")
        .select(PAYMENT_COLUMNS)
        .eq("cash_shift_id", shiftId)
        .order("created_at", { ascending: false }),
      supabase
        .from("cash_movements")
        .select(MOVEMENT_COLUMNS)
        .eq("shift_id", shiftId)
        .order("created_at", { ascending: false }),
    ]);

    if (!sumRes.error) setSummary(sumRes.data as unknown as ShiftSummary);
    setPayments((payRes.data ?? []) as unknown as ShiftPayment[]);
    setMovements((movRes.data ?? []) as unknown as CashMovement[]);
  }, []);

  /** Bandeja "fuera de turno" (solo admin). */
  const loadOrphans = useCallback(async () => {
    if (!organizationId || !isOrgAdmin || !settings) return;
    const supabase = createClient();
    const { data } = await supabase
      .from("patient_payments")
      .select(PAYMENT_COLUMNS)
      .eq("organization_id", organizationId)
      .is("cash_shift_id", null)
      // Antes de activar el módulo NINGÚN pago tenía turno: sin este corte
      // la bandeja mostraría el histórico entero de la clínica.
      .gte("created_at", settings.activated_at)
      .order("created_at", { ascending: false })
      .limit(ORPHAN_FETCH_LIMIT);
    setOrphans((data ?? []) as unknown as ShiftPayment[]);
  }, [organizationId, isOrgAdmin, settings]);

  useEffect(() => {
    void loadCore();
  }, [loadCore]);

  useEffect(() => {
    void loadShiftDetail(openShift?.id ?? null);
  }, [loadShiftDetail, openShift?.id]);

  useEffect(() => {
    void loadOrphans();
  }, [loadOrphans]);

  // La pestaña por defecto depende de si hay caja abierta. Depende del
  // booleano y no del objeto: `openShift` es un memo que cambia de identidad
  // en cada recarga, y con él en las dependencias un admin que estuviera
  // mirando Historial saltaría a Resumen sin haber tocado nada.
  const hasOpenShift = openShift !== null;
  useEffect(() => {
    setTab(hasOpenShift ? "resumen" : "abrir");
  }, [hasOpenShift]);

  // ── Acciones ─────────────────────────────────────────────────────────
  const doOpenShift = useCallback(
    async (float: number, notes: string | null): Promise<boolean> => {
      if (!organizationId) return false;
      const supabase = createClient();
      const { error } = await supabase.rpc("caja_open_shift", {
        p_org: organizationId,
        p_float: float,
        p_office: null,
        p_notes: notes,
      });
      if (error) {
        toast.error("No se pudo abrir la caja", { description: error.message });
        return false;
      }
      toast.success("Caja abierta", {
        description: `Fondo inicial ${formatPEN(float)}`,
      });
      await loadCore();
      return true;
    },
    [organizationId, loadCore]
  );

  const addMovement = useCallback(
    async (payload: MovementPayload): Promise<boolean> => {
      if (!organizationId || !user?.id || !openShift) return false;
      const supabase = createClient();
      // El signo lo pone aquí el tipo de movimiento; el CHECK
      // cash_mov_sign_chk (mig 214) lo verifica en la base.
      const outflow =
        payload.movementType === "egreso" ||
        payload.movementType === "sangria" ||
        payload.movementType === "devolucion";
      const amount = outflow
        ? -Math.abs(payload.amount)
        : Math.abs(payload.amount);

      const { data, error } = await supabase
        .from("cash_movements")
        .insert({
          organization_id: organizationId,
          shift_id: openShift.id,
          movement_type: payload.movementType,
          amount,
          tender_kind: "efectivo",
          reason_code: payload.reasonCode,
          notes: payload.notes,
          created_by: user.id,
        })
        .select(MOVEMENT_COLUMNS)
        .single();

      if (error || !data) {
        toast.error("No se pudo registrar el movimiento", {
          description: error?.message ?? "Intenta de nuevo.",
        });
        return false;
      }

      setMovements((prev) => [data as unknown as CashMovement, ...prev]);
      toast.success("Movimiento registrado", {
        description: `${formatPEN(Math.abs(amount))} · ${
          outflow ? "sale del cajón" : "entra al cajón"
        }`,
      });
      // El esperado lo lleva el servidor: se vuelve a pedir en vez de
      // recalcularlo aquí.
      void loadShiftDetail(openShift.id);
      return true;
    },
    [organizationId, user?.id, openShift, loadShiftDetail]
  );

  const doCloseShift = useCallback(
    async (payload: ClosePayload): Promise<string | null> => {
      if (!openShift) return "No hay una caja abierta.";
      const supabase = createClient();
      const { data, error } = await supabase.rpc("caja_close_shift", {
        p_shift: openShift.id,
        p_counted_cash: payload.countedCash,
        p_counted_by_method: payload.countedByMethod,
        p_notes: payload.notes,
        p_reason: payload.reason,
      });
      if (error) return error.message;

      setCloseResult(data as unknown as CloseResult);
      await loadCore();
      return null;
    },
    [openShift, loadCore]
  );

  const doAttach = useCallback(
    async (paymentId: string) => {
      if (!openShift) return;
      setAttaching(paymentId);
      const supabase = createClient();
      const { error } = await supabase.rpc("caja_attach_payment", {
        p_payment: paymentId,
        p_shift: openShift.id,
      });
      setAttaching(null);
      if (error) {
        toast.error("No se pudo atribuir el pago", { description: error.message });
        return;
      }
      toast.success("Pago atribuido al turno abierto");
      setOrphans((prev) => prev.filter((p) => p.id !== paymentId));
      void loadShiftDetail(openShift.id);
    },
    [openShift, loadShiftDetail]
  );

  const saveSettings = useCallback(
    async (payload: SettingsPayload): Promise<boolean> => {
      if (!organizationId) return false;
      const supabase = createClient();
      const { data, error } = await supabase
        .from("cash_settings")
        .upsert(
          { organization_id: organizationId, ...payload },
          { onConflict: "organization_id" }
        )
        .select(
          "organization_id,shift_scope,require_blind_count,default_opening_float,difference_tolerance,activated_at"
        )
        .single();

      if (error || !data) {
        toast.error("No se pudo guardar la configuración", {
          description: error?.message ?? "Intenta de nuevo.",
        });
        return false;
      }
      const wasActivating = settings === null;
      setSettings(data as unknown as CashSettings);
      toast.success(wasActivating ? "Módulo Caja activado" : "Ajustes guardados", {
        description: wasActivating
          ? "Los cobros nuevos ya se vinculan al turno abierto."
          : undefined,
      });
      return true;
    },
    [organizationId, settings]
  );

  // ── Derivados de la interfaz ─────────────────────────────────────────
  /** Métodos no-efectivo con movimiento en el turno, para conciliar al cerrar. */
  const electronicMethods = useMemo(() => {
    const acc = new Map<string, number>();
    for (const p of payments) {
      if (p.tender_kind === "efectivo") continue;
      const key = p.payment_method?.trim() || "Sin método declarado";
      acc.set(key, (acc.get(key) ?? 0) + Number(p.amount));
    }
    return [...acc.entries()]
      .map(([method, total]) => ({ method, total }))
      .sort((a, b) => b.total - a.total);
  }, [payments]);

  const tabs = useMemo<TabKey[]>(() => {
    const list: TabKey[] = openShift
      ? ["resumen", "movimientos", "cerrar"]
      : ["abrir"];
    if (isOrgAdmin) list.push("historial");
    return list;
  }, [openShift, isOrgAdmin]);

  // ── Render ───────────────────────────────────────────────────────────

  // Gate del módulo (mismo criterio que /almacen: defensa de interfaz, la
  // RLS de la 214 sigue autorizando por pertenencia a la organización).
  if (!addonsLoading && !cajaEnabled) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-16 text-center">
        <Wallet className="mx-auto mb-3 h-8 w-8 text-muted-foreground" />
        <p className="text-sm font-semibold">Módulo Caja no activo</p>
        <p className="mx-auto mt-1 max-w-md text-xs text-muted-foreground">
          Los turnos de caja y el arqueo se activan como módulo desde la
          configuración de tu organización.
        </p>
        {isOrgAdmin && (
          <Link href="/settings?tab=modulos" className="mt-4 inline-block">
            <Button variant="outline" size="sm">
              Ver módulos
            </Button>
          </Link>
        )}
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-16 text-center">
        <AlertTriangle className="mx-auto mb-3 h-8 w-8 text-red-500" />
        <p className="text-sm font-semibold text-red-500">
          No se pudo cargar la caja
        </p>
        <p className="mt-1 text-xs text-muted-foreground">{loadError}</p>
        <Button variant="outline" size="sm" className="mt-4" onClick={() => void loadCore()}>
          Reintentar
        </Button>
      </div>
    );
  }

  // Sin fila en cash_settings el módulo está apagado (mig 214): el trigger
  // no vincula nada y esta pantalla no tiene de qué hablar. El admin la
  // enciende creando la fila; el resto solo puede esperar.
  if (settingsLoaded && !settings) {
    return (
      <>
        <div className="mx-auto max-w-3xl px-4 py-16 text-center">
          <Wallet className="mx-auto mb-3 h-8 w-8 text-muted-foreground" />
          <p className="text-sm font-semibold">Configura tu caja</p>
          <p className="mx-auto mt-1 max-w-md text-xs text-muted-foreground">
            {isOrgAdmin
              ? "Define cómo trabajan tus turnos y actívala. Los cobros ya registrados no se tocan: solo los nuevos empiezan a vincularse al turno abierto."
              : "Un administrador todavía no ha configurado el módulo Caja en esta organización."}
          </p>
          {isOrgAdmin && (
            <Button className="mt-4" onClick={() => setSettingsOpen(true)}>
              <Settings2 className="h-4 w-4" /> Configurar caja
            </Button>
          )}
        </div>
        <SettingsModal
          open={settingsOpen}
          onOpenChange={setSettingsOpen}
          settings={null}
          onSubmit={saveSettings}
        />
      </>
    );
  }

  if (closeResult) {
    return (
      <div className="mx-auto max-w-[1500px] space-y-4 px-4 pb-14 pt-4 sm:px-6">
        <CloseResultCard result={closeResult} onDone={() => setCloseResult(null)} />
      </div>
    );
  }

  const tolerance = Number(settings?.difference_tolerance ?? 0);

  return (
    <div className="mx-auto max-w-[1500px] space-y-4 px-4 pb-14 pt-4 sm:px-6">
      <div className="flex flex-wrap items-start justify-between gap-3 print:hidden">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-extrabold tracking-tight">
            <Wallet className="h-6 w-6 text-primary" /> Caja
          </h1>
          {openShift ? (
            <p className="text-sm text-muted-foreground">
              Abierta por {authors[openShift.opened_by] ?? "—"} ·{" "}
              {fmtTime(openShift.opened_at)} (hace {elapsedSince(openShift.opened_at)}) ·
              fondo {formatPEN(Number(openShift.opening_float))}
            </p>
          ) : (
            <p className="text-sm text-muted-foreground">
              Sin caja abierta. Ábrela para que los cobros del día queden en un
              turno.
            </p>
          )}
        </div>

        {isOrgAdmin && (
          <Button
            variant="outline"
            size="icon"
            aria-label="Ajustes de Caja"
            onClick={() => setSettingsOpen(true)}
          >
            <Settings2 className="h-4 w-4" />
          </Button>
        )}
      </div>

      <Tabs value={tab} onValueChange={(v) => setTab(v as TabKey)}>
        {tabs.length > 1 && (
          <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0 print:hidden">
            <TabsList>
              {tabs.includes("abrir") && <TabsTrigger value="abrir">Abrir caja</TabsTrigger>}
              {tabs.includes("resumen") && <TabsTrigger value="resumen">Resumen</TabsTrigger>}
              {tabs.includes("movimientos") && (
                <TabsTrigger value="movimientos">Movimientos</TabsTrigger>
              )}
              {tabs.includes("cerrar") && <TabsTrigger value="cerrar">Cerrar caja</TabsTrigger>}
              {tabs.includes("historial") && (
                <TabsTrigger value="historial">Historial</TabsTrigger>
              )}
            </TabsList>
          </div>
        )}

        {tabs.includes("abrir") && (
          <TabsContent value="abrir" className="mt-4">
            {loading ? (
              <CardSkeleton />
            ) : (
              <OpenCard
                defaultFloat={Number(settings?.default_opening_float ?? 0)}
                tolerance={tolerance}
                canOpen={canOpen}
                recentClosed={closedShifts.slice(0, 5)}
                authors={authors}
                onOpen={doOpenShift}
              />
            )}
          </TabsContent>
        )}

        {openShift && (
          <>
            <TabsContent value="resumen" className="mt-4">
              <SummaryTab
                summary={summary}
                openingFloat={Number(openShift.opening_float)}
                paymentMethods={methods}
              />
            </TabsContent>

            <TabsContent value="movimientos" className="mt-4">
              <MovementsTab
                payments={payments}
                movements={movements}
                paymentMethods={methods}
                authors={authors}
                onNewMovement={(t) => setMovementFor(t)}
              />
            </TabsContent>

            <TabsContent value="cerrar" className="mt-4">
              <CloseTab
                summary={summary}
                tolerance={tolerance}
                electronicMethods={electronicMethods}
                onClose={doCloseShift}
              />
            </TabsContent>
          </>
        )}

        {isOrgAdmin && (
          <TabsContent value="historial" className="mt-4">
            <HistoryTab
              shifts={closedShifts}
              authors={authors}
              tolerance={tolerance}
              orphanPayments={orphans}
              openShiftId={openShift?.id ?? null}
              attaching={attaching}
              onAttach={(id) => void doAttach(id)}
            />
          </TabsContent>
        )}
      </Tabs>

      <MovementModal
        open={movementFor !== null}
        onOpenChange={(o) => !o && setMovementFor(null)}
        movementType={movementFor}
        onSubmit={addMovement}
      />

      <SettingsModal
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
        settings={settings}
        onSubmit={saveSettings}
      />
    </div>
  );
}

function CardSkeleton() {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {Array.from({ length: 2 }).map((_, i) => (
        <div key={i} className="rounded-2xl border border-border/60 bg-card p-5">
          <div className="h-4 w-32 animate-pulse rounded bg-muted" />
          <div className="mt-3 h-3 w-full animate-pulse rounded bg-muted/60" />
          <div className="mt-6 h-9 w-full animate-pulse rounded-lg bg-muted" />
        </div>
      ))}
    </div>
  );
}
