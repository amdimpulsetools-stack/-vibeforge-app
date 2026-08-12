"use client";

/**
 * Tab Productos — la pantalla en la que la asesora entra 20 veces al día.
 *
 * Tabla en escritorio (la pregunta real es "¿qué me falta?" y "¿qué se me
 * vence?", que es barrer una columna con el ojo) y filas de dos líneas en
 * móvil — el mismo componente cambiando de forma, no dos listas distintas.
 *
 * La barra de resumen vive acá y no en la página porque cada mitad ES un
 * filtro: la alerta y el filtro son el mismo objeto.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, Minus, PackagePlus, Search, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  TONE_CLS,
  expiryStatus,
  fmtQty,
  formatPEN,
  stockStatus,
  type InventoryLot,
  type InventoryProduct,
} from "./types";

type StatusFilter = "stock_bajo" | "por_vencer" | null;
type SortKey = "nombre" | "stock_bajo" | "vence";

const SORT_LABELS: Record<SortKey, string> = {
  nombre: "Nombre",
  stock_bajo: "Stock bajo primero",
  vence: "Vence primero",
};

const SORT_STORAGE_KEY = "almacen:orden";

interface Props {
  products: InventoryProduct[];
  stockByProduct: Record<string, number>;
  lotByProduct: Record<string, InventoryLot | undefined>;
  expiryAlertDays: number;
  isAdmin: boolean;
  onDiscount: (product: InventoryProduct) => void;
  onEntry: (product: InventoryProduct) => void;
  onNewProduct: () => void;
}

export function ProductTable({
  products,
  stockByProduct,
  lotByProduct,
  expiryAlertDays,
  isAdmin,
  onDiscount,
  onEntry,
  onNewProduct,
}: Props) {
  const [rawSearch, setRawSearch] = useState("");
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>(null);
  const [sort, setSort] = useState<SortKey>("nombre");
  const searchRef = useRef<HTMLInputElement>(null);
  const tableRef = useRef<HTMLDivElement>(null);

  // Debounce 200 ms: 35–200 filas caben en memoria, no hay round-trip.
  useEffect(() => {
    const t = setTimeout(() => setSearch(rawSearch.trim().toLowerCase()), 200);
    return () => clearTimeout(t);
  }, [rawSearch]);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(SORT_STORAGE_KEY);
      if (saved === "nombre" || saved === "stock_bajo" || saved === "vence") {
        setSort(saved);
      }
    } catch {
      /* localStorage bloqueado: el orden por defecto basta */
    }
  }, []);

  // "/" enfoca la búsqueda, Esc la limpia. Nunca autofocus (en móvil abriría
  // el teclado al entrar a la pantalla).
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const el = e.target as HTMLElement | null;
      const typing =
        el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable);
      if (e.key === "/" && !typing) {
        e.preventDefault();
        searchRef.current?.focus();
      } else if (e.key === "Escape" && el === searchRef.current) {
        setRawSearch("");
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const categories = useMemo(() => {
    const set = new Set<string>();
    for (const p of products) if (p.category?.trim()) set.add(p.category.trim());
    return [...set].sort((a, b) => a.localeCompare(b, "es"));
  }, [products]);

  const decorated = useMemo(
    () =>
      products.map((p) => {
        const stock = stockByProduct[p.id] ?? 0;
        const lot = lotByProduct[p.id];
        return {
          product: p,
          stock,
          lot,
          st: stockStatus(stock, Number(p.min_stock)),
          exp: expiryStatus(lot?.expiry_date, expiryAlertDays),
        };
      }),
    [products, stockByProduct, lotByProduct, expiryAlertDays]
  );

  const lowStockCount = decorated.filter((d) => d.st?.tone === "warn" || d.st?.tone === "crit").length;
  const expiringCount = decorated.filter(
    (d) => d.exp.days !== null && d.exp.days >= 0 && d.exp.days <= expiryAlertDays
  ).length;
  const expiredCount = decorated.filter((d) => d.exp.days !== null && d.exp.days < 0).length;

  const rows = useMemo(() => {
    let out = decorated;

    if (search) {
      out = out.filter((d) => {
        const p = d.product;
        return (
          p.name.toLowerCase().includes(search) ||
          (p.category ?? "").toLowerCase().includes(search) ||
          (p.sku ?? "").toLowerCase().includes(search) ||
          (d.lot?.lot_code ?? "").toLowerCase().includes(search)
        );
      });
    }
    if (category) out = out.filter((d) => (d.product.category ?? "").trim() === category);
    if (statusFilter === "stock_bajo") out = out.filter((d) => d.st !== null);
    if (statusFilter === "por_vencer")
      out = out.filter((d) => d.exp.days !== null && d.exp.days <= expiryAlertDays);

    const sorted = [...out];
    if (sort === "nombre") {
      sorted.sort((a, b) => a.product.name.localeCompare(b.product.name, "es"));
    } else if (sort === "stock_bajo") {
      const rank = (t: string | undefined) => (t === "crit" ? 0 : t === "warn" ? 1 : 2);
      sorted.sort(
        (a, b) =>
          rank(a.st?.tone) - rank(b.st?.tone) ||
          a.product.name.localeCompare(b.product.name, "es")
      );
    } else {
      sorted.sort((a, b) => {
        const av = a.exp.days ?? Number.POSITIVE_INFINITY;
        const bv = b.exp.days ?? Number.POSITIVE_INFINITY;
        return av - bv || a.product.name.localeCompare(b.product.name, "es");
      });
    }
    return sorted;
  }, [decorated, search, category, statusFilter, sort, expiryAlertDays]);

  function applyFilter(f: StatusFilter) {
    setStatusFilter((cur) => (cur === f ? null : f));
    tableRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function pickSort(v: SortKey) {
    setSort(v);
    try {
      localStorage.setItem(SORT_STORAGE_KEY, v);
    } catch {
      /* sin persistencia, no pasa nada */
    }
  }

  // ── Vacío primera vez ────────────────────────────────────────────────
  if (products.length === 0) {
    return (
      <div className="rounded-2xl border border-primary/30 bg-primary/5 p-10 text-center">
        <PackagePlus className="mx-auto mb-3 h-8 w-8 text-primary" />
        <p className="text-base font-bold">Tu almacén está vacío</p>
        <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
          Agrega los medicamentos e insumos que manejas. Empieza por los 10 que
          más rotan — los demás los vas sumando sobre la marcha.
        </p>
        {isAdmin && (
          <Button className="mt-5" onClick={onNewProduct}>
            Agregar producto
          </Button>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* ── Barra de resumen: una línea, no un banner. No se puede cerrar. ── */}
      {(lowStockCount > 0 || expiringCount > 0) && (
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-xl border border-amber-500/25 bg-amber-500/5 px-3 py-2 text-xs">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-amber-500" />
          {lowStockCount > 0 && (
            <button
              type="button"
              onClick={() => applyFilter("stock_bajo")}
              className="font-semibold text-amber-600 underline-offset-2 hover:underline dark:text-amber-400"
            >
              {lowStockCount === 1
                ? "1 producto con stock bajo"
                : `${lowStockCount} productos con stock bajo`}
            </button>
          )}
          {lowStockCount > 0 && expiringCount > 0 && (
            <span className="text-muted-foreground">·</span>
          )}
          {expiringCount > 0 && (
            <button
              type="button"
              onClick={() => applyFilter("por_vencer")}
              className="font-semibold text-red-600 underline-offset-2 hover:underline dark:text-red-400"
            >
              {expiringCount === 1
                ? `1 vence en menos de ${expiryAlertDays} días`
                : `${expiringCount} vencen en menos de ${expiryAlertDays} días`}
            </button>
          )}
        </div>
      )}
      {expiredCount > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-red-500" />
          <button
            type="button"
            onClick={() => applyFilter("por_vencer")}
            className="font-semibold text-red-600 underline-offset-2 hover:underline dark:text-red-400"
          >
            {expiredCount === 1
              ? "1 producto vencido — no lo vendas"
              : `${expiredCount} productos vencidos — no los vendas`}
          </button>
        </div>
      )}

      {/* ── Búsqueda + filtros ── */}
      <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center">
        <div className="relative sm:max-w-xs sm:flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            ref={searchRef}
            value={rawSearch}
            onChange={(e) => setRawSearch(e.target.value)}
            placeholder="Buscar producto o lote…"
            aria-label="Buscar producto o lote"
            className="h-10 w-full rounded-xl border border-border bg-card pl-9 pr-9 text-base outline-none transition-colors focus:border-primary/50 md:text-sm"
          />
          {rawSearch && (
            <button
              type="button"
              onClick={() => setRawSearch("")}
              aria-label="Limpiar búsqueda"
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1 text-muted-foreground hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        <div className="-mx-4 flex items-center gap-1.5 overflow-x-auto px-4 pb-0.5 sm:mx-0 sm:flex-1 sm:px-0">
          <Chip active={category === null} onClick={() => setCategory(null)}>
            Todos
          </Chip>
          {categories.map((c) => (
            <Chip key={c} active={category === c} onClick={() => setCategory(c)}>
              {c}
            </Chip>
          ))}
          {lowStockCount > 0 && (
            <Chip
              tone="warn"
              active={statusFilter === "stock_bajo"}
              onClick={() => applyFilter("stock_bajo")}
            >
              Stock bajo ({lowStockCount})
            </Chip>
          )}
          {(expiringCount > 0 || expiredCount > 0) && (
            <Chip
              tone="crit"
              active={statusFilter === "por_vencer"}
              onClick={() => applyFilter("por_vencer")}
            >
              Por vencer ({expiringCount + expiredCount})
            </Chip>
          )}
        </div>

        <label className="hidden items-center gap-1.5 text-xs text-muted-foreground lg:flex">
          Ordenar:
          <select
            value={sort}
            onChange={(e) => pickSort(e.target.value as SortKey)}
            className="h-8 rounded-lg border border-border bg-card px-2 text-xs outline-none"
          >
            {(Object.keys(SORT_LABELS) as SortKey[]).map((k) => (
              <option key={k} value={k}>
                {SORT_LABELS[k]}
              </option>
            ))}
          </select>
        </label>
      </div>

      {/* ── Sin resultados ── */}
      {rows.length === 0 ? (
        <div className="rounded-2xl border border-border/60 bg-card p-10 text-center">
          {search ? (
            <>
              <p className="text-sm font-semibold">
                No hay productos que coincidan con «{rawSearch.trim()}»
              </p>
              <Button
                variant="outline"
                size="sm"
                className="mt-4"
                onClick={() => setRawSearch("")}
              >
                Limpiar búsqueda
              </Button>
            </>
          ) : statusFilter === "stock_bajo" ? (
            <p className="text-sm text-muted-foreground">
              Ningún producto con stock bajo. Todo en orden.
            </p>
          ) : statusFilter === "por_vencer" ? (
            <p className="text-sm text-muted-foreground">
              Ningún producto por vencer. Todo en orden.
            </p>
          ) : (
            <p className="text-sm text-muted-foreground">
              Ningún producto en esta categoría.
            </p>
          )}
        </div>
      ) : (
        <div
          ref={tableRef}
          className="-mx-4 border-y border-border/60 bg-card sm:mx-0 sm:rounded-2xl sm:border"
        >
          {/* ── Escritorio ── */}
          <div className="hidden overflow-x-auto md:block">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-wider text-muted-foreground">
                  <th className="px-4 py-2.5 font-semibold">Producto</th>
                  <th className="px-4 py-2.5 font-semibold">Stock</th>
                  <th className="px-4 py-2.5 font-semibold">Lote / Vence</th>
                  <th className="px-4 py-2.5 text-right font-semibold">Precio</th>
                  <th className="w-16 px-4 py-2.5" />
                </tr>
              </thead>
              <tbody>
                {rows.map(({ product: p, stock, lot, st, exp }) => (
                  <tr
                    key={p.id}
                    className={cn(
                      "border-t border-border/40",
                      exp.days !== null && exp.days < 0 && "bg-red-500/[.04]"
                    )}
                  >
                    <td className="px-4 py-3">
                      <p className="font-semibold">{p.name}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {[p.presentation, p.category].filter(Boolean).join(" · ")}
                      </p>
                    </td>
                    <td className="px-4 py-3">
                      <p
                        className={cn(
                          "font-bold tabular-nums",
                          stock < 0 && "text-red-500"
                        )}
                      >
                        {fmtQty(stock)}{" "}
                        <span className="text-xs font-normal text-muted-foreground">
                          {p.base_unit.toLowerCase()}
                        </span>
                      </p>
                      {st && (
                        <span
                          className={cn(
                            "mt-1 inline-block rounded-full px-2 py-0.5 text-[10px] font-bold",
                            TONE_CLS[st.tone]
                          )}
                        >
                          {st.label}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <p className="text-xs text-muted-foreground">
                        {lot?.lot_code ?? "—"}
                      </p>
                      {exp.chip ? (
                        <span
                          className={cn(
                            "mt-1 inline-block rounded-full px-2 py-0.5 text-[10px] font-bold",
                            TONE_CLS[exp.tone]
                          )}
                        >
                          {exp.label}
                        </span>
                      ) : (
                        <p className="mt-0.5 text-[11px] text-muted-foreground">
                          {exp.label}
                        </p>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right font-medium tabular-nums">
                      {formatPEN(Number(p.sale_price))}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-1">
                        <button
                          type="button"
                          onClick={() => onDiscount(p)}
                          aria-label={`Registrar salida de ${p.name}`}
                          title="Registrar salida"
                          className="grid h-10 w-10 place-items-center rounded-xl border border-primary/30 bg-primary/10 text-primary transition-colors hover:bg-primary/20 active:scale-95"
                        >
                          <Minus className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => onEntry(p)}
                          aria-label={`Registrar entrada de ${p.name}`}
                          title="Registrar entrada"
                          className="grid h-10 w-10 place-items-center rounded-xl border border-border text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                        >
                          <PackagePlus className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* ── Móvil: filas de dos líneas, sin marco de card ── */}
          <ul className="divide-y divide-border/40 md:hidden">
            {rows.map(({ product: p, stock, lot, st, exp }) => (
              <li
                key={p.id}
                className={cn(
                  "flex items-center gap-3 px-4 py-3",
                  exp.days !== null && exp.days < 0 && "bg-red-500/[.04]"
                )}
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">{p.name}</p>
                  <p className="mt-0.5 truncate text-xs tabular-nums text-muted-foreground">
                    <span className={cn(stock < 0 && "font-bold text-red-500")}>
                      {fmtQty(stock)} {p.base_unit.toLowerCase()}
                    </span>
                    {" · "}
                    {formatPEN(Number(p.sale_price))}
                    {exp.days !== null && (
                      <>
                        {" · "}
                        <span
                          className={cn(
                            exp.tone === "crit" && "text-red-500",
                            exp.tone === "warn" && "text-amber-500"
                          )}
                        >
                          {exp.label}
                        </span>
                      </>
                    )}
                  </p>
                  {(st || lot) && (
                    <div className="mt-1 flex flex-wrap items-center gap-1.5">
                      {st && (
                        <span
                          className={cn(
                            "rounded-full px-2 py-0.5 text-[10px] font-bold",
                            TONE_CLS[st.tone]
                          )}
                        >
                          {st.label}
                        </span>
                      )}
                      {lot && (
                        <span className="text-[10px] text-muted-foreground">
                          Lote {lot.lot_code}
                        </span>
                      )}
                    </div>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => onDiscount(p)}
                  aria-label={`Registrar salida de ${p.name}`}
                  className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-primary/30 bg-primary/10 text-primary active:scale-95"
                >
                  <Minus className="h-5 w-5" />
                </button>
              </li>
            ))}
          </ul>

          <div className="border-t border-border/40 px-4 py-2.5 text-[11px] text-muted-foreground">
            {rows.length === products.length
              ? `${products.length} ${products.length === 1 ? "producto" : "productos"}`
              : `${rows.length} de ${products.length} productos`}
          </div>
        </div>
      )}
    </div>
  );
}

function Chip({
  active,
  tone,
  onClick,
  children,
}: {
  active: boolean;
  tone?: "warn" | "crit";
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "shrink-0 whitespace-nowrap rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
        active
          ? tone === "crit"
            ? "border-red-500/40 bg-red-500/15 text-red-600 dark:text-red-400"
            : tone === "warn"
              ? "border-amber-500/40 bg-amber-500/15 text-amber-600 dark:text-amber-400"
              : "border-primary/40 bg-primary/15 text-primary"
          : tone === "crit"
            ? "border-red-500/25 bg-red-500/5 text-red-600/80 hover:bg-red-500/10 dark:text-red-400/80"
            : tone === "warn"
              ? "border-amber-500/25 bg-amber-500/5 text-amber-600/80 hover:bg-amber-500/10 dark:text-amber-400/80"
              : "border-border bg-card text-muted-foreground hover:text-foreground"
      )}
    >
      {children}
    </button>
  );
}
