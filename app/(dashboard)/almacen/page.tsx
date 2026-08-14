"use client";

/**
 * Módulo Almacén — F1.
 *
 * Patrón de datos igual que /captacion: client component, `useOrganization()`
 * para el org_id y fetch directo con el cliente Supabase del navegador. No hay
 * rutas API: la RLS de la migración 209 ya restringe todo (lectura para
 * miembros, escritura del catálogo solo owner/admin, INSERT de movimientos
 * para cualquier miembro con `created_by = auth.uid()`).
 *
 * Invariante: NO existe columna `stock`. El saldo es SUM(quantity) sobre
 * `inventory_movements`, derivado en cliente desde el mismo array que
 * alimenta el kardex — una sola fuente, imposible que se desincronicen.
 *
 * F1 = Productos (funcional) + Movimientos (kardex simple). Vencimientos y
 * Rentabilidad quedan como tabs con placeholder (F2/F3).
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { useOrganization } from "@/components/organization-provider";
import { useOrgAddons } from "@/hooks/use-org-addons";
import { useUser } from "@/hooks/use-user";
import { toast } from "sonner";
import { AlertTriangle, Package, PackagePlus, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ProductTable } from "./product-table";
import { MovementList } from "./movement-list";
import { ExpiryList } from "./expiry-list";
import { ProfitTab } from "./profit-tab";
import { DiscountModal, type DiscountPayload } from "./discount-modal";
import { EntryModal, type EntryPayload } from "./entry-modal";
import { ProductModal, type ProductPayload } from "./product-modal";
import {
  DEFAULT_SETTINGS,
  LOT_COLUMNS,
  MOVEMENT_COLUMNS,
  PRODUCT_COLUMNS,
  avgCostByProduct,
  computeStock,
  computeStockByLot,
  fmtQty,
  lastCostByProduct,
  monthToLastDay,
  nearestLotByProduct,
  type InventoryLot,
  type InventoryMovement,
  type InventoryProduct,
  type InventorySettings,
} from "./types";

type TabKey = "productos" | "movimientos" | "vencimientos" | "rentabilidad";
const TABS: TabKey[] = ["productos", "movimientos", "vencimientos", "rentabilidad"];

/**
 * Tope defensivo del kardex traído a memoria. F1 arranca en cero movimientos
 * y una clínica de 35 productos genera del orden de 200/mes; el día que esto
 * quede corto, el saldo pasa a un agregado en servidor (F2).
 */
const MOVEMENT_FETCH_LIMIT = 5000;

function today(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate()
  ).padStart(2, "0")}`;
}

export default function AlmacenPage() {
  const { organizationId, isOrgAdmin } = useOrganization();
  const { user } = useUser();
  const { hasAddon, loading: addonsLoading } = useOrgAddons();
  const almacenEnabled = hasAddon("almacen");

  const [tab, setTab] = useState<TabKey>("productos");
  const [products, setProducts] = useState<InventoryProduct[]>([]);
  const [lots, setLots] = useState<InventoryLot[]>([]);
  const [movements, setMovements] = useState<InventoryMovement[]>([]);
  const [authors, setAuthors] = useState<Record<string, string>>({});
  const [settings, setSettings] = useState<InventorySettings>(DEFAULT_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [discountFor, setDiscountFor] = useState<InventoryProduct | null>(null);
  const [entryOpen, setEntryOpen] = useState(false);
  const [entryFor, setEntryFor] = useState<string | null>(null);
  const [productOpen, setProductOpen] = useState(false);

  // Tabs por query param, sin useSearchParams: la página no necesita
  // suspenderse por esto y así la campanita puede enlazar ?tab=movimientos.
  useEffect(() => {
    const q = new URLSearchParams(window.location.search).get("tab");
    if (q && (TABS as string[]).includes(q)) setTab(q as TabKey);
  }, []);

  function changeTab(next: string) {
    const value = (TABS as string[]).includes(next) ? (next as TabKey) : "productos";
    setTab(value);
    const url = new URL(window.location.href);
    url.searchParams.set("tab", value);
    window.history.replaceState(null, "", url.toString());
  }

  // ── Carga ──────────────────────────────────────────────────────────────
  const load = useCallback(async () => {
    if (!organizationId) return;
    const supabase = createClient();
    setLoading(true);
    setLoadError(null);

    const [prodRes, lotRes, movRes, setRes] = await Promise.all([
      supabase
        .from("inventory_products")
        .select(PRODUCT_COLUMNS)
        .eq("organization_id", organizationId)
        .eq("is_discontinued", false)
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
        .select("expiry_alert_days,warn_on_negative")
        .eq("organization_id", organizationId)
        .maybeSingle(),
    ]);

    if (prodRes.error || movRes.error) {
      setLoadError(prodRes.error?.message ?? movRes.error?.message ?? null);
      setLoading(false);
      return;
    }

    const prods = (prodRes.data ?? []) as unknown as InventoryProduct[];
    const movs = (movRes.data ?? []) as unknown as InventoryMovement[];
    setProducts(prods);
    setLots((lotRes.data ?? []) as unknown as InventoryLot[]);
    setMovements(movs);
    if (setRes.data) setSettings(setRes.data as unknown as InventorySettings);
    setLoading(false);

    // Quién registró cada movimiento. Va aparte porque `created_by` apunta a
    // auth.users y el nombre vive en user_profiles. El email es el fallback
    // cuando el perfil no tiene nombre: un control de seguridad sin autor
    // visible no controla nada.
    const ids = [...new Set(movs.map((m) => m.created_by).filter(Boolean))] as string[];
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
      setAuthors(map);
    }
  }, [organizationId]);

  useEffect(() => {
    void load();
  }, [load]);

  // ── Derivados ──────────────────────────────────────────────────────────
  const stockByProduct = useMemo(() => computeStock(movements), [movements]);
  const stockByLot = useMemo(() => computeStockByLot(movements), [movements]);
  const lotByProduct = useMemo(() => nearestLotByProduct(lots), [lots]);
  const lastCosts = useMemo(() => lastCostByProduct(movements), [movements]);
  const avgCosts = useMemo(() => avgCostByProduct(movements), [movements]);
  const categories = useMemo(() => {
    const set = new Set<string>();
    for (const p of products) if (p.category?.trim()) set.add(p.category.trim());
    return [...set].sort((a, b) => a.localeCompare(b, "es"));
  }, [products]);

  // ── Deshacer: contra-asiento, jamás DELETE ─────────────────────────────
  const undoMovement = useCallback(
    async (original: InventoryMovement, productName: string, baseUnit: string) => {
      if (!organizationId || !user?.id) return;
      const supabase = createClient();

      const { data, error } = await supabase
        .from("inventory_movements")
        .insert({
          organization_id: organizationId,
          product_id: original.product_id,
          lot_id: original.lot_id,
          movement_type: "ajuste",
          quantity: -Number(original.quantity),
          // El contra-asiento hereda el costo del original: así el CPP se
          // des-promedia exacto al deshacer una entrada (auditoría 13-ago)
          // y la anulación queda valorizada en el kardex.
          unit_cost: original.unit_cost,
          movement_date: today(),
          reason_code: "error_registro",
          notes: `Deshace mov. #${original.id.slice(0, 8)}`,
          reverses_movement_id: original.id,
          created_by: user.id,
        })
        .select(MOVEMENT_COLUMNS)
        .single();

      if (error || !data) {
        toast.error("No se pudo deshacer el movimiento", {
          description: "Revisa tu conexión e intenta de nuevo.",
        });
        return;
      }

      const reversal = data as unknown as InventoryMovement;
      // El stock del toast se calcula sobre la lista NUEVA: el closure de un
      // toast creado antes de la venta veía el stock viejo y decía "volvió a
      // 12" cuando eran 10 (hallazgo menor de la auditoría).
      let restored = 0;
      setMovements((prev) => {
        const next = [reversal, ...prev];
        restored = next
          .filter((m) => m.product_id === original.product_id)
          .reduce((acc, m) => acc + Number(m.quantity), 0);
        return next;
      });
      toast.success("Movimiento deshecho", {
        description: `${productName} volvió a ${fmtQty(restored)} ${baseUnit.toLowerCase()}`,
      });
    },
    [organizationId, user?.id]
  );

  // ── El gesto de descuento ──────────────────────────────────────────────
  const registerDiscount = useCallback(
    async (payload: DiscountPayload) => {
      if (!organizationId || !user?.id) return;
      const supabase = createClient();
      const p = payload.product;
      const qty = -Math.abs(payload.quantity);
      const tempId = `tmp-${Math.random().toString(36).slice(2)}`;

      // Update optimista: la fila baja al instante, el POST viaja detrás.
      const optimistic: InventoryMovement = {
        id: tempId,
        organization_id: organizationId,
        product_id: p.id,
        lot_id: payload.lotId,
        movement_type: payload.movementType,
        quantity: qty,
        unit_cost: null,
        unit_sale_price: null,
        cost_total: null,
        revenue_total: null,
        movement_date: today(),
        reason_code: payload.reasonCode,
        notes: null,
        patient_id: payload.patientId,
        reverses_movement_id: null,
        created_at: new Date().toISOString(),
        created_by: user.id,
      };
      setMovements((prev) => [optimistic, ...prev]);

      const { data, error } = await supabase
        .from("inventory_movements")
        .insert({
          organization_id: organizationId,
          product_id: p.id,
          lot_id: payload.lotId,
          movement_type: payload.movementType,
          quantity: qty,
          // COGS congelado: el costo promedio ponderado VIGENTE al momento de
          // la salida (fallback: última compra). Así el margen de esta venta
          // no cambia aunque mañana el proveedor suba o baje el precio.
          unit_cost: avgCosts[p.id] ?? lastCosts[p.id] ?? null,
          // El precio congelado solo existe en la venta: `inv_mov_price_chk`
          // prohíbe unit_sale_price fuera de una salida, y una aplicación en
          // consulta todavía no sabemos si se cobró (eso llega en F2).
          unit_sale_price:
            payload.reasonCode === "venta" ? Number(p.sale_price) : null,
          movement_date: today(),
          reason_code: payload.reasonCode,
          // FK real cuando se eligió del autocomplete; la nota queda igual
          // para que el kardex muestre el nombre sin resolver la FK.
          patient_id: payload.patientId,
          notes: payload.patientNote ? `Paciente: ${payload.patientNote}` : null,
          created_by: user.id,
        })
        .select(MOVEMENT_COLUMNS)
        .single();

      if (error || !data) {
        setMovements((prev) => prev.filter((m) => m.id !== tempId));
        toast.error("No se pudo registrar la salida", {
          description: "Revisa tu conexión e intenta de nuevo.",
        });
        return;
      }

      const saved = data as unknown as InventoryMovement;
      setMovements((prev) => prev.map((m) => (m.id === tempId ? saved : m)));

      const remaining = (stockByProduct[p.id] ?? 0) + qty;
      toast.success(`Salieron ${fmtQty(payload.quantity)} de ${p.name}`, {
        description: [
          `Quedan ${fmtQty(remaining)}`,
          payload.motiveLabel,
          payload.patientNote,
        ]
          .filter(Boolean)
          .join(" · "),
        duration: 8000,
        action: {
          label: "Deshacer",
          onClick: () => void undoMovement(saved, p.name, p.base_unit),
        },
      });
    },
    [organizationId, user?.id, stockByProduct, avgCosts, lastCosts, undoMovement]
  );

  // ── Entrada de mercadería ──────────────────────────────────────────────
  const registerEntry = useCallback(
    async (payload: EntryPayload): Promise<boolean> => {
      if (!organizationId || !user?.id) return false;
      const supabase = createClient();
      const product = products.find((p) => p.id === payload.productId);
      if (!product) return false;

      const expiryDate = payload.expiryDate
        ? monthToLastDay(payload.expiryDate)
        : null;

      // Lote: se reusa si ya existe (UNIQUE product_id + lot_code) y se crea
      // si no. Un upsert intentaría UPDATE, que la RLS solo permite a admins.
      let lotId: string | null = null;
      if (payload.lotCode) {
        const existing = lots.find(
          (l) => l.product_id === product.id && l.lot_code === payload.lotCode
        );
        if (existing) {
          lotId = existing.id;
        } else {
          const { data, error } = await supabase
            .from("inventory_lots")
            .insert({
              organization_id: organizationId,
              product_id: product.id,
              lot_code: payload.lotCode,
              expiry_date: expiryDate,
              unit_cost: payload.unitCost,
              supplier: payload.supplier,
              created_by: user.id,
            })
            .select(LOT_COLUMNS)
            .single();
          if (error || !data) {
            toast.error("No se pudo registrar el lote", {
              description: error?.message ?? "Intenta de nuevo.",
            });
            return false;
          }
          const lot = data as unknown as InventoryLot;
          lotId = lot.id;
          setLots((prev) => [...prev, lot]);
        }
      }

      const { data, error } = await supabase
        .from("inventory_movements")
        .insert({
          organization_id: organizationId,
          product_id: product.id,
          lot_id: lotId,
          movement_type: "entrada",
          quantity: Math.abs(payload.quantity),
          unit_cost: payload.unitCost,
          movement_date: today(),
          reason_code: "compra",
          notes: payload.supplier ? `Proveedor: ${payload.supplier}` : null,
          created_by: user.id,
        })
        .select(MOVEMENT_COLUMNS)
        .single();

      if (error || !data) {
        toast.error("No se pudo registrar la entrada", {
          description: error?.message ?? "Revisa tu conexión e intenta de nuevo.",
        });
        return false;
      }

      const saved = data as unknown as InventoryMovement;
      setMovements((prev) => [saved, ...prev]);

      const total = (stockByProduct[product.id] ?? 0) + Math.abs(payload.quantity);
      toast.success(
        `Entraron ${fmtQty(payload.quantity)} de ${product.name}`,
        {
          description: [
            payload.lotCode ? `Lote ${payload.lotCode}` : null,
            expiryDate ? `Vence ${expiryDate.slice(5, 7)}/${expiryDate.slice(0, 4)}` : null,
            `Ahora hay ${fmtQty(total)}`,
          ]
            .filter(Boolean)
            .join(" · "),
        }
      );
      return true;
    },
    [organizationId, user?.id, products, lots, stockByProduct]
  );

  // ── Nuevo producto ─────────────────────────────────────────────────────
  const createProduct = useCallback(
    async (payload: ProductPayload): Promise<boolean> => {
      if (!organizationId || !user?.id) return false;
      const supabase = createClient();
      const { initial_stock, initial_cost, ...productFields } = payload;

      const { data, error } = await supabase
        .from("inventory_products")
        .insert({
          organization_id: organizationId,
          ...productFields,
          created_by: user.id,
        })
        .select(PRODUCT_COLUMNS)
        .single();

      if (error || !data) {
        const duplicate = error?.code === "23505";
        toast.error(
          duplicate ? "Ya tienes un producto con ese nombre" : "No se pudo guardar el producto",
          {
            description: duplicate
              ? "Usa el que ya existe o cámbiale el nombre."
              : (error?.message ?? "Intenta de nuevo."),
          }
        );
        return false;
      }

      const saved = data as unknown as InventoryProduct;
      setProducts((prev) =>
        [...prev, saved].sort((a, b) => a.name.localeCompare(b.name, "es"))
      );

      // Stock inicial → primera entrada del kardex con el costo congelado.
      // El producto jamás guarda costo (invariante mig 209): si esta inserción
      // falla, el producto queda creado y el stock se carga con "Entrada".
      if (initial_stock > 0 && initial_cost != null) {
        const { data: movData, error: movError } = await supabase
          .from("inventory_movements")
          .insert({
            organization_id: organizationId,
            product_id: saved.id,
            movement_type: "entrada",
            quantity: initial_stock,
            unit_cost: initial_cost,
            movement_date: today(),
            reason_code: "saldo_inicial",
            created_by: user.id,
          })
          .select(MOVEMENT_COLUMNS)
          .single();
        if (movError || !movData) {
          toast.warning("Producto creado, pero el stock inicial no se registró", {
            description: "Cárgalo con el botón Entrada.",
          });
        } else {
          setMovements((prev) => [movData as unknown as InventoryMovement, ...prev]);
        }
      }

      toast.success("Producto agregado", {
        description:
          initial_stock > 0
            ? `${saved.name} · ${fmtQty(initial_stock)} ${saved.base_unit.toLowerCase()} de saldo inicial`
            : saved.name,
      });
      return true;
    },
    [organizationId, user?.id]
  );

  // ── Render ─────────────────────────────────────────────────────────────

  // Gate del módulo. Hasta aquí el único freno era que el enlace no se pintara
  // en el sidebar: escribiendo /almacen en la barra de direcciones, cualquier
  // miembro de cualquier organización entraba y podía crear productos y
  // movimientos sin tener el addon.
  //
  // OJO: esto es defensa de interfaz, no de datos. Las RLS de la migración 209
  // siguen autorizando por pertenencia a la organización, así que una llamada
  // directa a la API todavía pasaría. Endurecerlas con un EXISTS sobre
  // `organization_addons` es el cierre definitivo y va aparte, para no tocar
  // permisos de base con una clínica a punto de entrar en producción.
  if (!addonsLoading && !almacenEnabled) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-16 text-center">
        <Package className="mx-auto mb-3 h-8 w-8 text-muted-foreground" />
        <p className="text-sm font-semibold">Módulo Almacén no activo</p>
        <p className="mx-auto mt-1 max-w-md text-xs text-muted-foreground">
          El control de inventario, stock y vencimientos se activa como módulo
          desde la configuración de tu organización.
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
          No se pudo cargar el almacén
        </p>
        <p className="mt-1 text-xs text-muted-foreground">{loadError}</p>
        <Button variant="outline" size="sm" className="mt-4" onClick={() => void load()}>
          Reintentar
        </Button>
      </div>
    );
  }

  return (
    // max-w amplio + menos aire vertical: la queja real del founder fue el
    // espacio en blanco en pantallas grandes.
    <div className="mx-auto max-w-[1500px] space-y-4 px-4 pb-14 pt-4 sm:px-6">
      <div className="flex flex-wrap items-start justify-between gap-3 print:hidden">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-extrabold tracking-tight">
            <Package className="h-6 w-6 text-primary" /> Almacén
          </h1>
          <p className="text-sm text-muted-foreground">
            Lo que tienes, lo que sale y lo que está por vencerse.
          </p>
        </div>

        {/* Escritorio: dos botones. Móvil: un solo "+" con dos ítems. */}
        <div className="hidden items-center gap-2 sm:flex">
          <Button
            onClick={() => {
              setEntryFor(null);
              setEntryOpen(true);
            }}
            disabled={products.length === 0}
          >
            <PackagePlus className="h-4 w-4" /> Entrada
          </Button>
          {isOrgAdmin && (
            <Button variant="outline" onClick={() => setProductOpen(true)}>
              <Plus className="h-4 w-4" /> Producto
            </Button>
          )}
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild className="sm:hidden">
            <Button size="icon" aria-label="Agregar">
              <Plus className="h-5 w-5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem
              onSelect={() => {
                setEntryFor(null);
                setEntryOpen(true);
              }}
              disabled={products.length === 0}
            >
              <PackagePlus className="mr-2 h-4 w-4" /> Entrada de mercadería
            </DropdownMenuItem>
            {isOrgAdmin && (
              <DropdownMenuItem onSelect={() => setProductOpen(true)}>
                <Plus className="mr-2 h-4 w-4" /> Nuevo producto
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Guard del tope de kardex (auditoría 13-ago): con el límite alcanzado,
          los movimientos MÁS ANTIGUOS quedan fuera y stock/CPP dejarían de
          ser confiables en silencio. Se avisa fuerte; el fix real es el
          agregado en servidor (F2). */}
      {movements.length >= MOVEMENT_FETCH_LIMIT && (
        <div className="flex items-center gap-2 rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs font-semibold text-red-600 dark:text-red-400">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
          El kardex superó los {MOVEMENT_FETCH_LIMIT.toLocaleString("es-PE")} movimientos:
          los saldos mostrados pueden estar incompletos. Avisa a soporte para
          activar el cálculo en servidor.
        </div>
      )}

      <Tabs value={tab} onValueChange={changeTab}>
        <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0 print:hidden">
          <TabsList>
            <TabsTrigger value="productos">Productos</TabsTrigger>
            <TabsTrigger value="movimientos">Movimientos</TabsTrigger>
            <TabsTrigger value="vencimientos">Vencimientos</TabsTrigger>
            <TabsTrigger value="rentabilidad">Rentabilidad</TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="productos" className="mt-4">
          {loading ? (
            <TableSkeleton />
          ) : (
            <ProductTable
              products={products}
              stockByProduct={stockByProduct}
              lotByProduct={lotByProduct}
              expiryAlertDays={settings.expiry_alert_days}
              isAdmin={isOrgAdmin}
              onDiscount={(p) => setDiscountFor(p)}
              onEntry={(p) => {
                setEntryFor(p.id);
                setEntryOpen(true);
              }}
              onNewProduct={() => setProductOpen(true)}
            />
          )}
        </TabsContent>

        <TabsContent value="movimientos" className="mt-4">
          {loading ? (
            <TableSkeleton />
          ) : (
            <MovementList
              movements={movements}
              products={products}
              authors={authors}
            />
          )}
        </TabsContent>

        <TabsContent value="vencimientos" className="mt-4">
          {loading ? (
            <TableSkeleton />
          ) : (
            <ExpiryList
              products={products}
              lots={lots}
              movements={movements}
              lastCosts={lastCosts}
              avgCosts={avgCosts}
              expiryAlertDays={settings.expiry_alert_days}
            />
          )}
        </TabsContent>

        <TabsContent value="rentabilidad" className="mt-4">
          {loading ? (
            <TableSkeleton />
          ) : (
            <ProfitTab
              products={products}
              movements={movements}
              stockByProduct={stockByProduct}
              lastCosts={lastCosts}
              avgCosts={avgCosts}
            />
          )}
        </TabsContent>
      </Tabs>

      <DiscountModal
        open={discountFor !== null}
        onOpenChange={(o) => !o && setDiscountFor(null)}
        organizationId={organizationId}
        product={discountFor}
        stock={discountFor ? (stockByProduct[discountFor.id] ?? 0) : 0}
        lot={discountFor ? (lotByProduct[discountFor.id] ?? null) : null}
        lotStock={
          discountFor && lotByProduct[discountFor.id]
            ? (stockByLot[lotByProduct[discountFor.id].id] ?? 0)
            : null
        }
        expiryAlertDays={settings.expiry_alert_days}
        warnOnNegative={settings.warn_on_negative}
        onSubmit={(payload) => void registerDiscount(payload)}
      />

      <EntryModal
        open={entryOpen}
        onOpenChange={setEntryOpen}
        products={products}
        preselectedProductId={entryFor}
        lastCosts={lastCosts}
        onSubmit={registerEntry}
      />

      <ProductModal
        open={productOpen}
        onOpenChange={setProductOpen}
        categories={categories}
        onSubmit={createProduct}
      />
    </div>
  );
}

function TableSkeleton() {
  return (
    <div className="-mx-4 border-y border-border/60 bg-card sm:mx-0 sm:rounded-2xl sm:border">
      <div className="divide-y divide-border/40">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="flex items-center gap-3 px-4 py-3.5">
            <div className="flex-1 space-y-2">
              <div className="h-3.5 w-40 animate-pulse rounded bg-muted" />
              <div className="h-2.5 w-24 animate-pulse rounded bg-muted/60" />
            </div>
            <div className="h-9 w-9 animate-pulse rounded-xl bg-muted" />
          </div>
        ))}
      </div>
    </div>
  );
}
