"use client";

/**
 * F6 — Productos de Almacén/Farmacia dentro de la ficha del paciente.
 *
 * UN SOLO componente para los dos lados de la historia, porque son la
 * misma pregunta hecha desde dos pestañas distintas:
 *
 *   scope 'clinical' → "¿qué se le PUSO?"     (kardex, sin dinero)
 *   scope 'sales'    → "¿qué se le VENDIÓ?"   (pharmacy_sales, con dinero)
 *
 * Dos invariantes que gobiernan el archivo entero:
 *
 * 1. LOS PARES DESHECHOS NO EXISTEN. Deshacer en Almacén no borra: inserta
 *    un contra-asiento (`ajuste` con `reverses_movement_id`). Ese contra-
 *    asiento NO copia `patient_id` (ver `undoMovement` en almacen/page.tsx),
 *    así que filtrar por paciente lo deja fuera del resultado y el original
 *    anulado se seguiría mostrando PARA SIEMPRE en la ficha. Por eso hay una
 *    segunda consulta que trae los contra-asientos que apuntan a estos ids,
 *    y solo entonces se aplica `reversedPairIds()`.
 *
 * 2. AQUÍ NO SE SUMA DINERO A NADA. Las aplicaciones clínicas no llevan
 *    importe por diseño, y las compras de farmacia viven fuera del saldo
 *    pendiente del paciente (el RPC de deuda filtra `source='clinical'`,
 *    mig 213). El subtotal de esta sección es informativo y no toca ninguna
 *    card de resumen.
 */

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Loader2, Package, Syringe, ChevronDown, ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import { useOrgAddons } from "@/hooks/use-org-addons";
import {
  REASON_LABELS,
  fmtDate,
  fmtQty,
  formatPEN,
  reversedPairIds,
  type InventoryMovement,
  type ReasonCode,
} from "../almacen/types";
import {
  SALE_COLUMNS,
  SALE_ITEM_COLUMNS,
  saleLabel,
  type PharmacySale,
  type PharmacySaleItem,
} from "../farmacia/types";

// ── Tipos locales ───────────────────────────────────────────────────────
//
// NO se amplía `InventoryMovement` de almacen/types.ts: ese literal lo
// construye a mano el optimistic update de almacen/page.tsx y añadirle un
// campo requerido rompería la compilación de aquel archivo. Esta es la
// forma exacta de lo que ESTA pantalla selecciona, y nada más.

interface PatientMovementRow {
  id: string;
  product_id: string;
  quantity: number;
  movement_date: string;
  reason_code: ReasonCode | null;
  reverses_movement_id: string | null;
  inventory_products: { name: string; base_unit: string } | null;
  inventory_lots: { lot_code: string } | null;
}

/** Solo lo que `reversedPairIds()` necesita leer. */
interface ReversalRef {
  id: string;
  reverses_movement_id: string | null;
}

interface SalesData {
  sales: PharmacySale[];
  itemsBySale: Record<string, PharmacySaleItem[]>;
}

export interface PatientInventoryPanelProps {
  patientId: string;
  scope: "clinical" | "sales";
  /** 'compact' = filas apiladas (drawer). 'table' = cards + tabla (vista ancha). */
  variant?: "compact" | "table";
  /**
   * Salta a la pestaña del otro scope. El llamador decide si existe: en
   * Finanzas solo se pasa cuando el usuario TIENE pestaña Clínico
   * (isAdmin || currentDoctorId), así el enlace nunca lleva a una pestaña
   * que ese rol no puede abrir. Sin callback no se pinta el enlace.
   */
  onNavigateToCounterpart?: () => void;
}

// ── Constantes ──────────────────────────────────────────────────────────

/**
 * Lo que cuenta como "aplicado al paciente". La MERMA queda fuera aunque
 * arrastre patient_id: una ampolla rota no se le puso a nadie, y verla en
 * la historia clínica es peor que no verla.
 */
const CLINICAL_REASONS: ReasonCode[] = ["uso_en_cita", "uso_interno", "muestra_medica"];

const MOVEMENT_SELECT =
  "id,product_id,quantity,movement_date,reason_code,reverses_movement_id," +
  "inventory_products(name,base_unit),inventory_lots(lot_code)";

const ROW_LIMIT = 300;

/** `.in()` viaja en la URL: 300 uuids son ~11 kB y algunos proxies cortan. */
const IN_CHUNK = 100;

function chunk<T>(list: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out;
}

// ── Carga ───────────────────────────────────────────────────────────────

async function fetchApplications(patientId: string): Promise<PatientMovementRow[]> {
  const supabase = createClient();

  const { data } = await supabase
    .from("inventory_movements")
    .select(MOVEMENT_SELECT)
    .eq("patient_id", patientId)
    .in("reason_code", CLINICAL_REASONS)
    .order("movement_date", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(ROW_LIMIT);

  const rows = (data ?? []) as unknown as PatientMovementRow[];
  if (rows.length === 0) return rows;

  // Los contra-asientos no llevan patient_id: hay que ir a buscarlos por
  // el id al que apuntan, o un "deshacer" quedaría invisible aquí.
  const refs: ReversalRef[] = [];
  for (const ids of chunk(rows.map((r) => r.id), IN_CHUNK)) {
    const { data: rev } = await supabase
      .from("inventory_movements")
      .select("id,reverses_movement_id")
      .in("reverses_movement_id", ids);
    refs.push(...((rev ?? []) as unknown as ReversalRef[]));
  }

  // `reversedPairIds` solo lee `id` y `reverses_movement_id`; el cast evita
  // duplicar el helper (y con él la regla) en este archivo.
  const reversed = reversedPairIds([...rows, ...refs] as unknown as InventoryMovement[]);
  return rows.filter((r) => !reversed.has(r.id));
}

export async function fetchPatientPharmacySales(patientId: string): Promise<SalesData> {
  const supabase = createClient();

  const { data } = await supabase
    .from("pharmacy_sales")
    .select(SALE_COLUMNS)
    .eq("patient_id", patientId)
    .in("status", ["confirmada", "anulada"])
    .order("confirmed_at", { ascending: false })
    .limit(ROW_LIMIT);

  const sales = (data ?? []) as unknown as PharmacySale[];
  const itemsBySale: Record<string, PharmacySaleItem[]> = {};
  if (sales.length === 0) return { sales, itemsBySale };

  for (const ids of chunk(sales.map((s) => s.id), IN_CHUNK)) {
    const { data: itemRows } = await supabase
      .from("pharmacy_sale_items")
      .select(SALE_ITEM_COLUMNS)
      .in("sale_id", ids)
      .order("position");
    for (const it of (itemRows ?? []) as unknown as PharmacySaleItem[]) {
      (itemsBySale[it.sale_id] ??= []).push(it);
    }
  }

  return { sales, itemsBySale };
}

/** Query key compartida: el drawer y este panel se reparten UN solo fetch. */
export function patientSalesQueryKey(patientId: string) {
  return ["patient-inventory", patientId, "sales"] as const;
}

/**
 * Ventas de farmacia del paciente. Lo usa este panel y también el drawer,
 * que necesita saber qué ventas están anuladas para marcar sus pagos — con
 * la misma key React Query dedupe y no hay una segunda petición.
 */
export function usePatientPharmacySales(patientId: string, enabled: boolean) {
  return useQuery({
    queryKey: patientSalesQueryKey(patientId),
    enabled,
    queryFn: () => fetchPatientPharmacySales(patientId),
  });
}

// ── Presentación ────────────────────────────────────────────────────────

const META = {
  clinical: {
    title: "Productos aplicados",
    empty: "Sin productos aplicados",
    Icon: Syringe,
    iconCls: "text-sky-500",
  },
  sales: {
    title: "Compras en farmacia",
    empty: "Sin compras registradas",
    Icon: Package,
    iconCls: "text-indigo-500",
  },
} as const;

function PanelHeader({
  scope,
  count,
  right,
}: {
  scope: "clinical" | "sales";
  count: number;
  right?: React.ReactNode;
}) {
  const { Icon, title, iconCls } = META[scope];
  return (
    <div className="flex items-center justify-between gap-2">
      <div className="flex min-w-0 items-center gap-1.5">
        <Icon className={cn("h-4 w-4 shrink-0", iconCls)} />
        <span className="truncate text-xs font-semibold">{title}</span>
        {count > 0 && (
          <span className="shrink-0 rounded-full bg-muted px-1.5 text-[10px] font-medium">
            {count}
          </span>
        )}
      </div>
      {right}
    </div>
  );
}

function CounterpartLink({
  scope,
  count,
  onNavigate,
}: {
  scope: "clinical" | "sales";
  count: number;
  onNavigate?: () => void;
}) {
  if (!onNavigate || count <= 0) return null;
  const label =
    scope === "clinical"
      ? `Ver ${count} ${count === 1 ? "compra" : "compras"} en Finanzas`
      : `Ver ${count} ${count === 1 ? "aplicación" : "aplicaciones"} en Clínico`;
  return (
    <button
      type="button"
      onClick={onNavigate}
      className="flex items-center gap-1 text-[10px] font-medium text-muted-foreground transition-colors hover:text-primary"
    >
      {label}
      <ArrowRight className="h-3 w-3" />
    </button>
  );
}

function PanelSpinner() {
  return (
    <div className="flex items-center justify-center py-6">
      <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
    </div>
  );
}

function EmptyRow({ text }: { text: string }) {
  return <p className="py-6 text-center text-xs text-muted-foreground">{text}</p>;
}

/** El lote 'SIN-LOTE' es el relleno del importador: no es información. */
function lotCode(row: PatientMovementRow): string | null {
  const code = row.inventory_lots?.lot_code;
  if (!code || code === "SIN-LOTE") return null;
  return code;
}

function applicationMeta(row: PatientMovementRow): string {
  const parts = [fmtDate(row.movement_date)];
  const lot = lotCode(row);
  if (lot) parts.push(`Lote ${lot}`);
  if (row.reason_code) parts.push(REASON_LABELS[row.reason_code]);
  return parts.join(" · ");
}

/** Sin importes: una aplicación no lleva dinero (§2 de la cabecera). */
function ApplicationCard({ row }: { row: PatientMovementRow }) {
  return (
    <div className="flex items-start justify-between gap-2 rounded-lg border border-border px-3 py-2">
      <div className="min-w-0">
        <p className="break-words text-xs font-medium">
          {row.inventory_products?.name ?? "Producto"}
        </p>
        <p className="text-[10px] text-muted-foreground">{applicationMeta(row)}</p>
      </div>
      <span className="shrink-0 text-right text-xs font-medium tabular-nums">
        {fmtQty(Math.abs(Number(row.quantity)))}{" "}
        <span className="text-[10px] text-muted-foreground">
          {row.inventory_products?.base_unit ?? ""}
        </span>
      </span>
    </div>
  );
}

function SaleCard({
  sale,
  items,
  expanded,
  onToggle,
}: {
  sale: PharmacySale;
  items: PharmacySaleItem[];
  expanded: boolean;
  onToggle: () => void;
}) {
  const anulada = sale.status === "anulada";
  return (
    <div className={cn("rounded-lg border border-border", anulada && "opacity-70")}>
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-start justify-between gap-2 px-3 py-2 text-left transition-colors hover:bg-muted/30"
      >
        <div className="min-w-0">
          <p className="flex flex-wrap items-center gap-1.5 text-xs font-medium">
            <span className="tabular-nums">{saleLabel(sale.sale_number)}</span>
            {anulada && (
              <span className="rounded-full bg-red-500/10 px-1.5 py-0.5 text-[9px] font-semibold text-red-600 dark:text-red-400">
                Anulada
              </span>
            )}
          </p>
          <p className="text-[10px] text-muted-foreground">
            {fmtDate(sale.confirmed_at ?? sale.created_at)} · {items.length}{" "}
            {items.length === 1 ? "ítem" : "ítems"}
          </p>
        </div>
        <span className="flex shrink-0 items-center gap-1">
          <span
            className={cn(
              "text-xs font-medium tabular-nums",
              anulada && "line-through text-muted-foreground"
            )}
          >
            {formatPEN(sale.total)}
          </span>
          <ChevronDown
            className={cn(
              "h-3 w-3 text-muted-foreground transition-transform",
              expanded && "rotate-180"
            )}
          />
        </span>
      </button>

      {expanded && (
        <ul className="space-y-1 border-t border-border px-3 py-2">
          {items.length === 0 && (
            <li className="text-[10px] text-muted-foreground">Sin detalle de ítems</li>
          )}
          {items.map((it) => (
            <li key={it.id} className="flex items-baseline justify-between gap-2 text-[10px]">
              <span className="min-w-0 break-words text-muted-foreground">
                {fmtQty(it.quantity)} × {it.description}
              </span>
              <span className="shrink-0 tabular-nums">{formatPEN(it.line_total)}</span>
            </li>
          ))}
          {sale.void_reason && (
            <li className="pt-1 text-[10px] italic text-muted-foreground">
              Motivo de anulación: {sale.void_reason}
            </li>
          )}
        </ul>
      )}
    </div>
  );
}

/** Resumen de ítems en una línea, para la columna de la tabla ancha. */
function itemsSummary(items: PharmacySaleItem[]): string {
  if (items.length === 0) return "—";
  return items.map((it) => `${fmtQty(it.quantity)} × ${it.description}`).join(", ");
}

// ── Componente ──────────────────────────────────────────────────────────

export function PatientInventoryPanel({
  patientId,
  scope,
  variant = "compact",
  onNavigateToCounterpart,
}: PatientInventoryPanelProps) {
  const { hasAddon } = useOrgAddons();
  const enabled = hasAddon("almacen");
  const [expandedSale, setExpandedSale] = useState<string | null>(null);

  // El panel se monta SOLO dentro de la pestaña activa que le corresponde
  // (Clínico o Finanzas), así que montarse ya es la señal de "esta pestaña
  // está abierta": en 'info' no se dispara ni una petición.
  const applications = useQuery({
    queryKey: ["patient-inventory", patientId, "clinical"],
    enabled: enabled && scope === "clinical",
    queryFn: () => fetchApplications(patientId),
  });

  const sales = useQuery({
    queryKey: patientSalesQueryKey(patientId),
    enabled: enabled && scope === "sales",
    queryFn: () => fetchPatientPharmacySales(patientId),
  });

  // Conteos del OTRO scope, solo para el enlace cruzado. Se piden únicamente
  // cuando hay a dónde saltar: sin callback no se toca la red.
  //
  // Clínico → Finanzas: un count(head) sin filas, lo más barato que hay.
  const salesCount = useQuery({
    queryKey: ["patient-inventory", patientId, "sales", "count"],
    enabled: enabled && scope === "clinical" && !!onNavigateToCounterpart,
    queryFn: async () => {
      const { count } = await createClient()
        .from("pharmacy_sales")
        .select("id", { count: "exact", head: true })
        .eq("patient_id", patientId)
        .in("status", ["confirmada", "anulada"]);
      return count ?? 0;
    },
  });

  // Finanzas → Clínico: NO vale un count SQL, porque los pares deshechos
  // solo se pueden descartar en cliente (ver §1). Se reutiliza la MISMA key
  // que el panel clínico y se toma la longitud, así que al saltar de pestaña
  // los datos ya están en caché y no hay una segunda petición.
  const applicationsCount = useQuery({
    queryKey: ["patient-inventory", patientId, "clinical"],
    enabled: enabled && scope === "sales" && !!onNavigateToCounterpart,
    queryFn: () => fetchApplications(patientId),
    select: (rows: PatientMovementRow[]) => rows.length,
  });

  if (!enabled) return null;

  const counterpartCount =
    (scope === "clinical" ? salesCount.data : applicationsCount.data) ?? 0;

  if (scope === "clinical") {
    const rows = applications.data ?? [];
    return (
      <div className="space-y-3">
        <PanelHeader scope="clinical" count={rows.length} />

        {applications.isLoading ? (
          <PanelSpinner />
        ) : rows.length === 0 ? (
          <EmptyRow text={META.clinical.empty} />
        ) : variant === "table" ? (
          <>
            <div className="space-y-2 md:hidden">
              {rows.map((r) => (
                <ApplicationCard key={r.id} row={r} />
              ))}
            </div>
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full min-w-[600px] text-sm">
                <thead>
                  <tr className="border-b border-border text-xs text-muted-foreground">
                    <th className="px-3 py-2 text-left font-medium">Fecha</th>
                    <th className="px-3 py-2 text-left font-medium">Producto</th>
                    <th className="px-3 py-2 text-right font-medium">Cantidad</th>
                    <th className="px-3 py-2 text-left font-medium">Lote</th>
                    <th className="px-3 py-2 text-left font-medium">Motivo</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.id} className="border-b border-border/50 hover:bg-muted/30">
                      <td className="px-3 py-2.5 whitespace-nowrap">{fmtDate(r.movement_date)}</td>
                      <td className="px-3 py-2.5">{r.inventory_products?.name ?? "Producto"}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums">
                        {fmtQty(Math.abs(Number(r.quantity)))}{" "}
                        <span className="text-xs text-muted-foreground">
                          {r.inventory_products?.base_unit ?? ""}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 text-muted-foreground">{lotCode(r) ?? "—"}</td>
                      <td className="px-3 py-2.5 text-muted-foreground">
                        {r.reason_code ? REASON_LABELS[r.reason_code] : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        ) : (
          <div className="space-y-2">
            {rows.map((r) => (
              <ApplicationCard key={r.id} row={r} />
            ))}
          </div>
        )}

        <CounterpartLink
          scope="clinical"
          count={counterpartCount}
          onNavigate={onNavigateToCounterpart}
        />
      </div>
    );
  }

  // ── scope 'sales' ─────────────────────────────────────────────────────
  const saleRows = sales.data?.sales ?? [];
  const itemsBySale = sales.data?.itemsBySale ?? {};
  // Solo confirmadas: una venta anulada no es plata que entró.
  const subtotal = saleRows
    .filter((s) => s.status === "confirmada")
    .reduce((acc, s) => acc + Number(s.total ?? 0), 0);

  return (
    <div className="space-y-3">
      <PanelHeader
        scope="sales"
        count={saleRows.length}
        right={
          subtotal > 0 ? (
            <span className="shrink-0 text-xs font-semibold tabular-nums">
              {formatPEN(subtotal)}
            </span>
          ) : undefined
        }
      />

      {sales.isLoading ? (
        <PanelSpinner />
      ) : saleRows.length === 0 ? (
        <EmptyRow text={META.sales.empty} />
      ) : variant === "table" ? (
        <>
          <div className="space-y-2 md:hidden">
            {saleRows.map((s) => (
              <SaleCard
                key={s.id}
                sale={s}
                items={itemsBySale[s.id] ?? []}
                expanded={expandedSale === s.id}
                onToggle={() => setExpandedSale(expandedSale === s.id ? null : s.id)}
              />
            ))}
          </div>
          <div className="hidden overflow-x-auto md:block">
            <table className="w-full min-w-[600px] text-sm">
              <thead>
                <tr className="border-b border-border text-xs text-muted-foreground">
                  <th className="px-3 py-2 text-left font-medium">Fecha</th>
                  <th className="px-3 py-2 text-left font-medium">N°</th>
                  <th className="px-3 py-2 text-left font-medium">Ítems</th>
                  <th className="px-3 py-2 text-left font-medium">Estado</th>
                  <th className="px-3 py-2 text-right font-medium">Total</th>
                </tr>
              </thead>
              <tbody>
                {saleRows.map((s) => {
                  const anulada = s.status === "anulada";
                  return (
                    <tr
                      key={s.id}
                      className={cn(
                        "border-b border-border/50 hover:bg-muted/30",
                        anulada && "opacity-70"
                      )}
                    >
                      <td className="px-3 py-2.5 whitespace-nowrap">
                        {fmtDate(s.confirmed_at ?? s.created_at)}
                      </td>
                      <td className="px-3 py-2.5 tabular-nums">{saleLabel(s.sale_number)}</td>
                      <td className="px-3 py-2.5 text-xs text-muted-foreground">
                        {itemsSummary(itemsBySale[s.id] ?? [])}
                      </td>
                      <td className="px-3 py-2.5">
                        {anulada ? (
                          <span className="rounded-full bg-red-500/10 px-2 py-0.5 text-[10px] font-semibold text-red-600 dark:text-red-400">
                            Anulada
                          </span>
                        ) : (
                          <span className="text-xs text-muted-foreground">Confirmada</span>
                        )}
                      </td>
                      <td
                        className={cn(
                          "px-3 py-2.5 text-right font-medium tabular-nums",
                          anulada && "line-through text-muted-foreground"
                        )}
                      >
                        {formatPEN(s.total)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      ) : (
        <div className="space-y-2">
          {saleRows.map((s) => (
            <SaleCard
              key={s.id}
              sale={s}
              items={itemsBySale[s.id] ?? []}
              expanded={expandedSale === s.id}
              onToggle={() => setExpandedSale(expandedSale === s.id ? null : s.id)}
            />
          ))}
        </div>
      )}

      {/* Fija, no condicional: el número de arriba NO es deuda del paciente
          y nadie debería tener que deducirlo del contexto. */}
      <p className="text-[10px] text-muted-foreground">
        Compras de farmacia — no incluidas en el saldo pendiente de arriba.
      </p>

      <CounterpartLink
        scope="sales"
        count={counterpartCount}
        onNavigate={onNavigateToCounterpart}
      />
    </div>
  );
}
