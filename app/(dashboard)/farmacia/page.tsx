"use client";

/**
 * Módulo Farmacia (POS) — F4.
 *
 * Patrón de datos calcado de /almacen y /caja: client component,
 * `useOrganization()` para el org_id y el rol, cliente Supabase del
 * navegador para catálogo/lotes/kardex y `supabase.rpc()` para cobrar y
 * anular. Sin rutas API — la RLS de la mig 216 restringe las lecturas y
 * la escritura directa a BORRADORES, y los RPC de la 217 hacen el resto.
 *
 * EL INVARIANTE QUE MANDA: esta pantalla nunca inserta un movimiento de
 * inventario ni un pago. Solo edita su borrador. Descontar stock y
 * cobrar es exclusivamente `pharmacy_confirm_sale`, y el UUID del
 * borrador es su clave de idempotencia — por eso el borrador se crea en
 * la base al agregar el PRIMER producto y no al pulsar Cobrar.
 *
 * Tampoco calcula lo que se cobra: los totales del carrito son una vista
 * previa con la fórmula compartida (`lib/pharmacy/pricing.ts`). El
 * importe real lo recalcula el servidor sobre columnas GENERATED.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { useOrganization } from "@/components/organization-provider";
import { useOrgAddons } from "@/hooks/use-org-addons";
import { useUser } from "@/hooks/use-user";
import { useUserProfile } from "@/hooks/use-user-profile";
import { toast } from "sonner";
import { AlertTriangle, Loader2, ShoppingCart } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { ProductPicker } from "./product-picker";
import { CartPanel } from "./cart-panel";
import { CheckoutDialog, type PaymentMethodOption } from "./checkout-dialog";
import { DaySalesTab } from "./day-sales-tab";
import {
  LOT_COLUMNS,
  MOVEMENT_COLUMNS,
  SALE_COLUMNS,
  SALE_ITEM_COLUMNS,
  SELLABLE_PRODUCT_COLUMNS,
  cartTotals,
  clampQty,
  computeStock,
  computeStockByLot,
  formatPEN,
  limaToday,
  nearestLotByProduct,
  type CartLine,
  type ConfirmResult,
  type InventoryLot,
  type InventoryMovement,
  type PharmacySale,
  type PharmacySaleItem,
  type SellableProduct,
} from "./types";

const MOVEMENT_FETCH_LIMIT = 4000;
/** Rejilla de frecuentes: 12 tarjetas entran sin scroll en un mostrador. */
const FREQUENT_COUNT = 12;

/** `.in()` viaja en la URL: mismo tope que patient-inventory-panel. */
const IN_CHUNK = 100;

function chunk<T>(list: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out;
}

export default function FarmaciaPage() {
  const { organizationId, organization, orgRole, isOrgAdmin } = useOrganization();
  const { user } = useUser();
  const { profile } = useUserProfile();
  const { hasAddon, loading: addonsLoading } = useOrgAddons();
  const almacenEnabled = hasAddon("almacen");

  // Mismo criterio que /caja: se expresa por exclusión porque las orgs
  // anteriores a la mig 020 guardan a recepción como 'member'/'assistant'.
  // El filtro de verdad lo hace el RPC.
  const canSell = orgRole !== "doctor";

  // Quién cobró, para el pie del ticket: un comprobante sin responsable
  // no controla nada. El email es el respaldo cuando el perfil no tiene
  // nombre, mismo criterio que el kardex de Almacén.
  const cashierName = profile?.full_name?.trim() || user?.email || "—";

  const [products, setProducts] = useState<SellableProduct[]>([]);
  const [lots, setLots] = useState<InventoryLot[]>([]);
  const [movements, setMovements] = useState<InventoryMovement[]>([]);
  const [methods, setMethods] = useState<PaymentMethodOption[]>([]);
  const [expiryAlertDays, setExpiryAlertDays] = useState(90);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  // ── Carrito ────────────────────────────────────────────────────────────
  const [saleId, setSaleId] = useState<string | null>(null);
  const [lines, setLines] = useState<CartLine[]>([]);
  const [busy, setBusy] = useState(false);
  const [query, setQuery] = useState("");
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [cartOpen, setCartOpen] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);

  // ── Ventas (historial por sale_date) ───────────────────────────────────
  const [tab, setTab] = useState("vender");
  const [sales, setSales] = useState<PharmacySale[]>([]);
  const [itemsBySale, setItemsBySale] = useState<Record<string, PharmacySaleItem[]>>({});
  const [patientNames, setPatientNames] = useState<Record<string, string>>({});
  const [salesLoading, setSalesLoading] = useState(false);
  // Rango del historial, en fecha civil de Lima (default: hoy).
  const [salesRange, setSalesRange] = useState<{ from: string; to: string }>(() => {
    const today = limaToday();
    return { from: today, to: today };
  });

  const totals = useMemo(() => cartTotals(lines), [lines]);
  const stockByProduct = useMemo(() => computeStock(movements), [movements]);
  const stockByLot = useMemo(() => computeStockByLot(movements), [movements]);
  const lotByProduct = useMemo(() => nearestLotByProduct(lots), [lots]);

  // ── Carga del catálogo ─────────────────────────────────────────────────
  const load = useCallback(async () => {
    if (!organizationId) return;
    const supabase = createClient();
    setLoading(true);
    setLoadError(null);

    const [prodRes, lotRes, movRes, setRes, methodRes] = await Promise.all([
      supabase
        .from("inventory_products")
        .select(SELLABLE_PRODUCT_COLUMNS)
        .eq("organization_id", organizationId)
        .eq("is_discontinued", false)
        .eq("is_sellable", true)
        .order("name"),
      supabase
        .from("inventory_lots")
        .select(LOT_COLUMNS)
        .eq("organization_id", organizationId),
      supabase
        .from("inventory_movements")
        .select(MOVEMENT_COLUMNS)
        .eq("organization_id", organizationId)
        .order("movement_date", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(MOVEMENT_FETCH_LIMIT),
      supabase
        .from("inventory_settings")
        .select("expiry_alert_days")
        .eq("organization_id", organizationId)
        .maybeSingle(),
      supabase
        .from("lookup_values")
        .select("id,label,lookup_categories!inner(slug)")
        .eq("lookup_categories.slug", "payment_method")
        .eq("is_active", true)
        .or(`organization_id.is.null,organization_id.eq.${organizationId}`)
        .order("display_order"),
    ]);

    if (prodRes.error) {
      setLoadError(prodRes.error.message);
      setLoading(false);
      return;
    }

    setProducts((prodRes.data ?? []) as unknown as SellableProduct[]);
    setLots((lotRes.data ?? []) as unknown as InventoryLot[]);
    setMovements((movRes.data ?? []) as unknown as InventoryMovement[]);
    if (setRes.data) {
      setExpiryAlertDays(
        (setRes.data as unknown as { expiry_alert_days: number }).expiry_alert_days ?? 90
      );
    }
    setMethods(
      ((methodRes.data ?? []) as unknown as { id: string; label: string }[]).map((m) => ({
        id: m.id,
        label: m.label,
      }))
    );
    setLoading(false);
  }, [organizationId]);

  useEffect(() => {
    void load();
  }, [load]);

  // ── Historial de ventas ────────────────────────────────────────────────
  // Filtra por sale_date (fecha del hecho, mig 232), no por confirmed_at:
  // una venta de ayer registrada hoy aparece en el día de ayer.
  const loadSales = useCallback(async () => {
    if (!organizationId) return;
    const supabase = createClient();
    setSalesLoading(true);

    const { data, error } = await supabase
      .from("pharmacy_sales")
      .select(SALE_COLUMNS)
      .eq("organization_id", organizationId)
      .in("status", ["confirmada", "anulada"])
      .gte("sale_date", salesRange.from)
      .lte("sale_date", salesRange.to)
      .order("sale_date", { ascending: false })
      .order("sale_number", { ascending: false });

    if (error) {
      setSalesLoading(false);
      return;
    }

    const rows = (data ?? []) as unknown as PharmacySale[];
    setSales(rows);

    if (rows.length > 0) {
      // Troceado: 100 uuids por .in() para no reventar la URL (mismo
      // criterio que patient-inventory-panel).
      const itemRows: PharmacySaleItem[] = [];
      for (const ids of chunk(rows.map((s) => s.id), IN_CHUNK)) {
        const { data: part } = await supabase
          .from("pharmacy_sale_items")
          .select(SALE_ITEM_COLUMNS)
          .in("sale_id", ids)
          .order("position");
        itemRows.push(...(((part ?? []) as unknown) as PharmacySaleItem[]));
      }

      const grouped: Record<string, PharmacySaleItem[]> = {};
      for (const it of itemRows) {
        (grouped[it.sale_id] ??= []).push(it);
      }
      setItemsBySale(grouped);

      const pids = [...new Set(rows.map((s) => s.patient_id).filter(Boolean))] as string[];
      if (pids.length > 0) {
        const map: Record<string, string> = {};
        for (const ids of chunk(pids, IN_CHUNK)) {
          const { data: pats } = await supabase
            .from("patients")
            .select("id,first_name,last_name")
            .in("id", ids);
          for (const p of ((pats ?? []) as { id: string; first_name: string | null; last_name: string | null }[])) {
            map[p.id] = `${p.first_name ?? ""} ${p.last_name ?? ""}`.trim();
          }
        }
        setPatientNames(map);
      }
    } else {
      setItemsBySale({});
    }

    setSalesLoading(false);
  }, [organizationId, salesRange]);

  useEffect(() => {
    if (tab === "ventas") void loadSales();
  }, [tab, loadSales]);

  // ── Búsqueda ───────────────────────────────────────────────────────────
  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return products
      .filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          (p.sku ?? "").toLowerCase().includes(q)
      )
      .slice(0, 24);
  }, [products, query]);

  /**
   * Los 12 más vendidos del mes por movimientos de venta. Con historial
   * insuficiente cae a orden alfabético: una clínica que estrena el módulo
   * no puede encontrarse la rejilla vacía.
   */
  const frequent = useMemo(() => {
    const since = new Date();
    since.setMonth(since.getMonth() - 1);
    const sinceIso = since.toISOString().slice(0, 10);

    const sold: Record<string, number> = {};
    for (const m of movements) {
      if (m.reason_code !== "venta") continue;
      if (m.movement_date < sinceIso) continue;
      sold[m.product_id] = (sold[m.product_id] ?? 0) + Math.abs(Number(m.quantity));
    }

    const ranked = products
      .filter((p) => sold[p.id])
      .sort((a, b) => sold[b.id] - sold[a.id]);

    if (ranked.length >= FREQUENT_COUNT) return ranked.slice(0, FREQUENT_COUNT);
    const rest = products.filter((p) => !sold[p.id]);
    return [...ranked, ...rest].slice(0, FREQUENT_COUNT);
  }, [products, movements]);

  // ── Mutaciones del borrador ────────────────────────────────────────────

  /** Crea el borrador la primera vez. Su UUID es la clave de idempotencia. */
  const ensureDraft = useCallback(async (): Promise<string | null> => {
    if (saleId) return saleId;
    if (!organizationId || !user?.id) return null;

    const supabase = createClient();
    const { data, error } = await supabase
      .from("pharmacy_sales")
      .insert({
        organization_id: organizationId,
        created_by: user.id,
        status: "borrador",
      })
      .select("id")
      .single();

    if (error || !data) {
      toast.error("No se pudo abrir la venta", { description: error?.message });
      return null;
    }
    const id = (data as { id: string }).id;
    setSaleId(id);
    return id;
  }, [saleId, organizationId, user?.id]);

  const addProduct = useCallback(
    async (product: SellableProduct) => {
      if (busy) return;
      setBusy(true);
      try {
        // Ya está en el carrito: sube la cantidad en vez de duplicar la línea.
        const existing = lines.find((l) => l.product.id === product.id);
        if (existing) {
          const next = clampQty(existing.quantity + 1);
          const supabase = createClient();
          const { error } = await supabase
            .from("pharmacy_sale_items")
            .update({ quantity: next })
            .eq("id", existing.id);
          if (error) {
            toast.error("No se pudo actualizar la cantidad", {
              description: error.message,
            });
            return;
          }
          setLines((prev) =>
            prev.map((l) => (l.id === existing.id ? { ...l, quantity: next } : l))
          );
          return;
        }

        const draft = await ensureDraft();
        if (!draft || !organizationId) return;

        const lot = product.track_lots ? (lotByProduct[product.id] ?? null) : null;
        const supabase = createClient();
        const { data, error } = await supabase
          .from("pharmacy_sale_items")
          .insert({
            sale_id: draft,
            organization_id: organizationId,
            product_id: product.id,
            lot_id: lot?.id ?? null,
            description: product.name,
            quantity: 1,
            unit_price: product.sale_price,
            line_discount: 0,
            igv_affectation: product.igv_affectation ?? 1,
            position: lines.length + 1,
          })
          .select("id")
          .single();

        if (error || !data) {
          toast.error("No se pudo agregar el producto", {
            description: error?.message,
          });
          return;
        }

        setLines((prev) => [
          ...prev,
          {
            id: (data as { id: string }).id,
            product,
            quantity: 1,
            unitPrice: Number(product.sale_price),
            lineDiscount: 0,
            lotId: lot?.id ?? null,
          },
        ]);
      } finally {
        setBusy(false);
      }
    },
    [busy, lines, ensureDraft, organizationId, lotByProduct]
  );

  const patchLine = useCallback(
    async (line: CartLine, patch: Partial<CartLine>, dbPatch: Record<string, unknown>) => {
      const supabase = createClient();
      setLines((prev) => prev.map((l) => (l.id === line.id ? { ...l, ...patch } : l)));
      const { error } = await supabase
        .from("pharmacy_sale_items")
        .update(dbPatch)
        .eq("id", line.id);
      if (error) {
        toast.error("No se pudo guardar el cambio", { description: error.message });
        // Se revierte en pantalla: la base es la que manda.
        setLines((prev) => prev.map((l) => (l.id === line.id ? line : l)));
      }
    },
    []
  );

  const removeLine = useCallback(async (line: CartLine) => {
    const supabase = createClient();
    setLines((prev) => prev.filter((l) => l.id !== line.id));
    const { error } = await supabase
      .from("pharmacy_sale_items")
      .delete()
      .eq("id", line.id);
    if (error) toast.error("No se pudo quitar el producto", { description: error.message });
  }, []);

  const clearCart = useCallback(async () => {
    const id = saleId;
    setLines([]);
    setSaleId(null);
    setCartOpen(false);
    if (!id) return;
    // Borrar el borrador arrastra sus líneas por CASCADE.
    const supabase = createClient();
    await supabase.from("pharmacy_sales").delete().eq("id", id);
  }, [saleId]);

  const onConfirmed = useCallback(
    (result: ConfirmResult) => {
      // La venta ya no es un borrador: se suelta sin borrar nada.
      setLines([]);
      setSaleId(null);
      setCartOpen(false);
      void load();
      if (tab === "ventas") void loadSales();
      toast.success(`Venta cobrada · ${formatPEN(result.total)}`);
    },
    [load, loadSales, tab]
  );

  // ── ?add=<productId> — el puente desde Almacén ──────────────────────────
  // Almacén ya no descuenta por "Venta"; su botón manda aquí con el producto
  // en la mano. Se consume una sola vez y se limpia de la URL para que un
  // refresco no vuelva a agregarlo.
  const addedFromQuery = useRef(false);
  useEffect(() => {
    if (addedFromQuery.current || loading || products.length === 0) return;
    const wanted = new URLSearchParams(window.location.search).get("add");
    if (!wanted) return;
    addedFromQuery.current = true;

    const product = products.find((p) => p.id === wanted);
    const url = new URL(window.location.href);
    url.searchParams.delete("add");
    window.history.replaceState(null, "", url.toString());

    if (product) void addProduct(product);
    else toast.error("Ese producto ya no está disponible para vender.");
  }, [loading, products, addProduct]);

  // ── Teclado ────────────────────────────────────────────────────────────
  // '/' o F2 → buscador; F9 → cobrar; Esc → limpiar. Con el mismo guard
  // anti-burbujeo que el DiscountModal de Almacén: sin él, escribir el
  // nombre de un producto dispararía los atajos.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const el = e.target as HTMLElement | null;
      const typing =
        el &&
        (el.tagName === "INPUT" ||
          el.tagName === "TEXTAREA" ||
          el.isContentEditable);

      if (e.key === "F2" || (e.key === "/" && !typing)) {
        e.preventDefault();
        searchRef.current?.focus();
        searchRef.current?.select();
        return;
      }
      if (e.key === "F9") {
        e.preventDefault();
        if (lines.length > 0) setCheckoutOpen(true);
        return;
      }
      if (e.key === "Escape" && !typing && lines.length > 0) {
        e.preventDefault();
        void clearCart();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [lines.length, clearCart]);

  // ── Estados de salida ──────────────────────────────────────────────────
  if (!addonsLoading && !almacenEnabled) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-16 text-center">
        <ShoppingCart className="mx-auto mb-3 h-8 w-8 text-muted-foreground" />
        <p className="text-sm font-semibold">Módulo Farmacia no activo</p>
        <p className="mx-auto mt-1 max-w-md text-xs text-muted-foreground">
          La venta de productos al mostrador viaja con el módulo Almacén, que se
          activa desde la configuración de tu organización.
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

  if (!canSell) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-16 text-center">
        <ShoppingCart className="mx-auto mb-3 h-8 w-8 text-muted-foreground" />
        <p className="text-sm font-semibold">Farmacia es de recepción</p>
        <p className="mx-auto mt-1 max-w-md text-xs text-muted-foreground">
          El cobro al mostrador lo hace quien atiende la caja. Para descontar
          insumos usados en una consulta, usa Almacén.
        </p>
        <Link href="/almacen" className="mt-4 inline-block">
          <Button variant="outline" size="sm">
            Ir a Almacén
          </Button>
        </Link>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-16 text-center">
        <AlertTriangle className="mx-auto mb-3 h-8 w-8 text-red-500" />
        <p className="text-sm font-semibold text-red-500">
          No se pudo cargar la farmacia
        </p>
        <p className="mt-1 text-xs text-muted-foreground">{loadError}</p>
        <Button variant="outline" size="sm" className="mt-4" onClick={() => void load()}>
          Reintentar
        </Button>
      </div>
    );
  }

  const cart = (
    <CartPanel
      lines={lines}
      lots={lots}
      stockByLot={stockByLot}
      expiryAlertDays={expiryAlertDays}
      busy={busy}
      onQty={(line, quantity) => {
        if (quantity <= 0) return void removeLine(line);
        void patchLine(line, { quantity }, { quantity });
      }}
      onDiscount={(line, lineDiscount) =>
        void patchLine(line, { lineDiscount }, { line_discount: lineDiscount })
      }
      onLot={(line, lotId) => void patchLine(line, { lotId }, { lot_id: lotId })}
      onRemove={(line) => void removeLine(line)}
      onClear={() => void clearCart()}
      onCheckout={() => setCheckoutOpen(true)}
    />
  );

  return (
    <div className="mx-auto max-w-[1500px] space-y-4 px-4 pb-14 pt-4 sm:px-6 print:hidden">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-extrabold tracking-tight">
            <ShoppingCart className="h-6 w-6 text-primary" /> Farmacia
          </h1>
          <p className="text-sm text-muted-foreground">
            Vende al mostrador: descuenta stock, cobra y entrega su nota de venta.
          </p>
        </div>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="vender">Vender</TabsTrigger>
          <TabsTrigger value="ventas">Ventas</TabsTrigger>
        </TabsList>

        <TabsContent value="vender" className="mt-4">
          {loading ? (
            <div className="grid h-64 place-items-center">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <div className="lg:grid lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] lg:gap-4">
              {/* Izquierda: buscar y elegir */}
              <div className="lg:h-[calc(100vh-15rem)]">
                <ProductPicker
                  ref={searchRef}
                  query={query}
                  onQuery={setQuery}
                  results={results}
                  frequent={frequent}
                  stockByProduct={stockByProduct}
                  onPick={(p) => void addProduct(p)}
                />
              </div>

              {/* Derecha: carrito adherido (solo escritorio) */}
              <aside className="hidden lg:block">
                <div className="sticky top-4 h-[calc(100vh-15rem)] rounded-2xl border border-border bg-card/40 p-3">
                  {cart}
                </div>
              </aside>
            </div>
          )}
        </TabsContent>

        <TabsContent value="ventas" className="mt-4">
          <DaySalesTab
            sales={sales}
            itemsBySale={itemsBySale}
            patientNames={patientNames}
            loading={salesLoading}
            range={salesRange}
            onRange={setSalesRange}
            isOrgAdmin={isOrgAdmin}
            organizationId={organizationId}
            onVoided={() => {
              void loadSales();
              void load();
            }}
          />
        </TabsContent>
      </Tabs>

      {/* ── Móvil: barra inferior + bottom-sheet ───────────────────────── */}
      {tab === "vender" && lines.length > 0 && (
        <button
          type="button"
          onClick={() => setCartOpen(true)}
          className="fixed inset-x-3 bottom-3 z-40 flex h-14 items-center justify-between rounded-2xl bg-primary px-4 text-primary-foreground shadow-lg lg:hidden"
          style={{ bottom: "max(0.75rem, env(safe-area-inset-bottom))" }}
        >
          <span className="inline-flex items-center gap-2 text-sm font-bold">
            <span className="relative">
              <ShoppingCart className="h-5 w-5" />
              <span className="absolute -right-2 -top-2 grid h-4 min-w-4 place-items-center rounded-full bg-background px-1 text-[10px] font-bold text-primary">
                {lines.length}
              </span>
            </span>
            Ver carrito
          </span>
          <span className="text-base font-bold tabular-nums">
            {formatPEN(totals.total)}
          </span>
        </button>
      )}

      <Dialog open={cartOpen} onOpenChange={setCartOpen}>
        <DialogContent
          aria-describedby={undefined}
          className={cn(
            "gap-0 p-4 sm:max-w-md sm:rounded-2xl lg:hidden",
            "max-sm:bottom-0 max-sm:left-0 max-sm:right-0 max-sm:top-auto",
            "max-sm:max-w-none max-sm:translate-x-0 max-sm:translate-y-0",
            "max-sm:rounded-t-2xl max-sm:rounded-b-none",
            "max-sm:pb-[max(1rem,env(safe-area-inset-bottom))]"
          )}
        >
          <div className="mx-auto mb-2 h-1 w-9 rounded-full bg-border sm:hidden" />
          <DialogTitle className="sr-only">Carrito</DialogTitle>
          <div className="max-h-[70vh]">{cart}</div>
        </DialogContent>
      </Dialog>

      <CheckoutDialog
        open={checkoutOpen}
        onOpenChange={setCheckoutOpen}
        organizationId={organizationId}
        saleId={saleId}
        lines={lines}
        totals={totals}
        methods={methods}
        clinicName={organization?.name ?? "Clínica"}
        cashierName={cashierName}
        onConfirmed={onConfirmed}
      />
    </div>
  );
}
