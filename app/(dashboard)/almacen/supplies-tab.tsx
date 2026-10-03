"use client";

/**
 * Pestaña "Insumos" de Almacén (v1, 03-oct-2026).
 *
 * Pedido de la Dra. Patricia: "cada paciente usa una bata descartable, ayer
 * compramos 200 y recién me avisaron cuando no teníamos… nada está contado".
 * Esta primera versión es deliberadamente simple: una lista de lo que la
 * clínica consume y nunca vende (is_sellable = false, mig 213), con tres
 * acciones a mano por fila —Ingreso, Retiro, Conteo— que escriben en el
 * MISMO kardex de Almacén (`inventory_movements`, append-only). Nada se
 * ata a pacientes ni citas: eso llega en la versión profesional (kits por
 * servicio). Lo que sí se obtiene desde hoy: stock real, consumo de los
 * últimos 30 días, días de cobertura al ritmo actual y semáforo de mínimo.
 *
 * No calcula dinero de pacientes. El costo de un retiro es COGS de almacén
 * (CPP vigente), igual que una aplicación en consulta.
 */

import { useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowDownToLine,
  ArrowUpFromLine,
  ClipboardCheck,
  Loader2,
  MoreHorizontal,
  Package,
  Plus,
  Search,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  TONE_CLS,
  fmtQty,
  reversedPairIds,
  stockStatus,
  type InventoryMovement,
  type InventoryProduct,
  type ReasonCode,
} from "./types";

export type SupplyWithdrawReason = Extract<
  ReasonCode,
  "uso_interno" | "rotura" | "vencido" | "robo_perdida" | "otro"
>;

export interface SupplyWithdrawInput {
  product: InventoryProduct;
  quantity: number;
  reasonCode: SupplyWithdrawReason;
  note: string | null;
}

export interface SupplyCountInput {
  product: InventoryProduct;
  counted: number;
  note: string | null;
}

interface Props {
  /** Insumos activos (is_sellable = false, no archivados). */
  supplies: InventoryProduct[];
  /** Productos de venta activos: candidatos a "convertir en insumo". */
  sellableCandidates: InventoryProduct[];
  movements: InventoryMovement[];
  stockByProduct: Record<string, number>;
  /** Crear, editar, archivar y convertir (editor de almacén, mig 267). */
  canEdit: boolean;
  /** Registrar movimientos: cualquier miembro con sesión (RLS 209). */
  canMove: boolean;
  onNewSupply: () => void;
  onEntry: (product: InventoryProduct) => void;
  onWithdraw: (input: SupplyWithdrawInput) => Promise<void>;
  onCount: (input: SupplyCountInput) => Promise<void>;
  onEdit: (product: InventoryProduct) => void;
  onArchive: (product: InventoryProduct) => void;
  onConvert: (product: InventoryProduct, toSupply: boolean) => Promise<void>;
}

const WITHDRAW_REASONS: { code: SupplyWithdrawReason; label: string; hint: string }[] = [
  { code: "uso_interno", label: "Uso interno", hint: "Se consumió en la clínica (lo normal)." },
  { code: "rotura", label: "Rotura / dañado", hint: "Se malogró y se descartó." },
  { code: "vencido", label: "Vencido", hint: "Pasó su fecha y se descartó." },
  { code: "robo_perdida", label: "Pérdida", hint: "No aparece y no se sabe por qué." },
  { code: "otro", label: "Otro", hint: "Explícalo en la nota." },
];

const DAY_MS = 86_400_000;

function unitLabel(p: InventoryProduct): string {
  return (p.base_unit || "UND").toLowerCase();
}

export function SuppliesTab({
  supplies,
  sellableCandidates,
  movements,
  stockByProduct,
  canEdit,
  canMove,
  onNewSupply,
  onEntry,
  onWithdraw,
  onCount,
  onEdit,
  onArchive,
  onConvert,
}: Props) {
  const [search, setSearch] = useState("");
  const [panel, setPanel] = useState<{ productId: string; mode: "retiro" | "conteo" } | null>(null);
  const [convertOpen, setConvertOpen] = useState(false);
  const [converting, setConverting] = useState<string | null>(null);

  // Consumo de los últimos 30 días y último movimiento, por insumo. Los
  // pares deshechos (contra-asientos) no cuentan: no fueron consumo real.
  const stats = useMemo(() => {
    const ids = new Set(supplies.map((p) => p.id));
    const reversed = reversedPairIds(movements);
    const since = new Date(Date.now() - 30 * DAY_MS).toISOString().slice(0, 10);
    const out: Record<string, { consumed30: number; lastDate: string | null }> = {};
    for (const m of movements) {
      if (!ids.has(m.product_id)) continue;
      const cur = out[m.product_id] ?? { consumed30: 0, lastDate: null };
      if (!cur.lastDate || m.movement_date > cur.lastDate) cur.lastDate = m.movement_date;
      if (
        (m.movement_type === "salida" || m.movement_type === "merma") &&
        m.movement_date >= since &&
        !reversed.has(m.id)
      ) {
        cur.consumed30 += Math.abs(Number(m.quantity));
      }
      out[m.product_id] = cur;
    }
    return out;
  }, [supplies, movements]);

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return supplies
      .filter((p) => !q || p.name.toLowerCase().includes(q) || (p.category ?? "").toLowerCase().includes(q))
      .map((p) => {
        const stock = stockByProduct[p.id] ?? 0;
        const st = stockStatus(stock, Number(p.min_stock));
        const s = stats[p.id] ?? { consumed30: 0, lastDate: null };
        const perDay = s.consumed30 / 30;
        const coverageDays = perDay > 0 && stock > 0 ? Math.floor(stock / perDay) : null;
        return { p, stock, st, consumed30: s.consumed30, lastDate: s.lastDate, coverageDays };
      })
      .sort((a, b) => {
        const rank = (t: string | undefined) => (t === "crit" ? 0 : t === "warn" ? 1 : 2);
        const r = rank(a.st?.tone) - rank(b.st?.tone);
        return r !== 0 ? r : a.p.name.localeCompare(b.p.name, "es");
      });
  }, [supplies, stockByProduct, stats, search]);

  const lowCount = rows.filter((r) => r.st?.tone === "warn").length;
  const outCount = rows.filter((r) => r.st?.tone === "crit").length;

  return (
    <div className="space-y-4">
      {/* Resumen */}
      <div className="grid grid-cols-3 gap-3">
        <SummaryCard label="Insumos" value={String(supplies.length)} />
        <SummaryCard label="Bajo mínimo" value={String(lowCount)} tone={lowCount > 0 ? "warn" : undefined} />
        <SummaryCard label="Sin stock" value={String(outCount)} tone={outCount > 0 ? "crit" : undefined} />
      </div>

      {/* Barra */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative flex-1 sm:max-w-xs">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar insumo…"
            className="pl-8"
          />
        </div>
        {canEdit && (
          <div className="flex items-center gap-2">
            {sellableCandidates.length > 0 && (
              <Button variant="outline" size="sm" onClick={() => setConvertOpen((v) => !v)}>
                Traer de Productos
              </Button>
            )}
            <Button size="sm" onClick={onNewSupply}>
              <Plus className="mr-1 h-4 w-4" />
              Nuevo insumo
            </Button>
          </div>
        )}
      </div>

      {/* Convertir un producto de venta en insumo (ya lo habían cargado como producto). */}
      {convertOpen && canEdit && (
        <div className="rounded-xl border border-border bg-card p-3">
          <p className="mb-2 text-xs text-muted-foreground">
            Si ya habías cargado batas o espéculos como producto de venta, pásalos aquí. Conservan su
            stock, sus lotes y su historial; solo dejan de salir en el POS de Farmacia.
          </p>
          <div className="flex max-h-48 flex-wrap gap-1.5 overflow-y-auto">
            {sellableCandidates.map((p) => (
              <button
                key={p.id}
                type="button"
                disabled={converting === p.id}
                onClick={async () => {
                  setConverting(p.id);
                  await onConvert(p, true);
                  setConverting(null);
                }}
                className="rounded-full border border-border px-2.5 py-1 text-xs hover:bg-accent disabled:opacity-50"
              >
                {converting === p.id ? <Loader2 className="inline h-3 w-3 animate-spin" /> : null} {p.name}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Lista */}
      {rows.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border p-8 text-center">
          <Package className="mx-auto mb-2 h-8 w-8 text-muted-foreground/60" />
          <p className="text-sm font-medium">Todavía no hay insumos</p>
          <p className="mx-auto mt-1 max-w-sm text-xs text-muted-foreground">
            Crea los que más se gastan (batas, espéculos, papel camilla, algodón) y carga lo que hay en el
            estante hoy. Desde ahí, cada ingreso y cada retiro queda contado.
          </p>
          {canEdit && (
            <Button size="sm" className="mt-4" onClick={onNewSupply}>
              <Plus className="mr-1 h-4 w-4" />
              Nuevo insumo
            </Button>
          )}
        </div>
      ) : (
        <div className="-mx-4 border-y border-border/60 bg-card sm:mx-0 sm:rounded-2xl sm:border">
          <div className="divide-y divide-border/40">
            {rows.map(({ p, stock, st, consumed30, lastDate, coverageDays }) => {
              const open = panel?.productId === p.id ? panel.mode : null;
              return (
                <div key={p.id} className="px-4 py-3">
                  <div className="flex items-center gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="truncate text-sm font-medium">{p.name}</p>
                        {st?.chip && (
                          <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${TONE_CLS[st.tone]}`}>
                            {st.label}
                          </span>
                        )}
                      </div>
                      <p className="mt-0.5 text-[11px] text-muted-foreground">
                        {p.category ? `${p.category} · ` : ""}
                        mínimo {fmtQty(Number(p.min_stock))} {unitLabel(p)}
                        {consumed30 > 0 && (
                          <>
                            {" · "}
                            {fmtQty(consumed30)} usados en 30 d
                            {coverageDays != null && (
                              <span className={coverageDays <= 7 ? " font-semibold text-amber-600 dark:text-amber-400" : ""}>
                                {" · "}
                                alcanzan ~{coverageDays} d
                              </span>
                            )}
                          </>
                        )}
                        {lastDate && ` · último mov. ${lastDate.split("-").reverse().join("/")}`}
                      </p>
                    </div>

                    <div className="shrink-0 text-right">
                      <p className={`text-base font-bold tabular-nums ${stock < 0 ? "text-red-600" : ""}`}>
                        {fmtQty(stock)}
                      </p>
                      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{unitLabel(p)}</p>
                    </div>

                    {canMove && (
                      <div className="hidden shrink-0 items-center gap-1 sm:flex">
                        <Button variant="outline" size="sm" className="h-8 px-2" title="Ingreso (compra)" onClick={() => onEntry(p)}>
                          <ArrowDownToLine className="h-3.5 w-3.5" />
                          <span className="ml-1 hidden md:inline">Ingreso</span>
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-8 px-2"
                          title="Retiro (consumo, rotura, vencido)"
                          onClick={() => setPanel(open === "retiro" ? null : { productId: p.id, mode: "retiro" })}
                        >
                          <ArrowUpFromLine className="h-3.5 w-3.5" />
                          <span className="ml-1 hidden md:inline">Retiro</span>
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-8 px-2"
                          title="Conteo físico: escribe lo que hay y el sistema ajusta"
                          onClick={() => setPanel(open === "conteo" ? null : { productId: p.id, mode: "conteo" })}
                        >
                          <ClipboardCheck className="h-3.5 w-3.5" />
                          <span className="ml-1 hidden md:inline">Conteo</span>
                        </Button>
                      </div>
                    )}

                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" aria-label="Más acciones">
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        {canMove && (
                          <>
                            <DropdownMenuItem onClick={() => onEntry(p)}>Ingreso</DropdownMenuItem>
                            <DropdownMenuItem onClick={() => setPanel({ productId: p.id, mode: "retiro" })}>Retiro</DropdownMenuItem>
                            <DropdownMenuItem onClick={() => setPanel({ productId: p.id, mode: "conteo" })}>Conteo físico</DropdownMenuItem>
                          </>
                        )}
                        {canEdit && (
                          <>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem onClick={() => onEdit(p)}>Editar</DropdownMenuItem>
                            <DropdownMenuItem onClick={() => void onConvert(p, false)}>Pasar a producto de venta</DropdownMenuItem>
                            <DropdownMenuItem className="text-red-600" onClick={() => onArchive(p)}>Archivar</DropdownMenuItem>
                          </>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>

                  {open === "retiro" && (
                    <WithdrawPanel
                      product={p}
                      stock={stock}
                      onCancel={() => setPanel(null)}
                      onSubmit={async (input) => {
                        await onWithdraw(input);
                        setPanel(null);
                      }}
                    />
                  )}
                  {open === "conteo" && (
                    <CountPanel
                      product={p}
                      stock={stock}
                      onCancel={() => setPanel(null)}
                      onSubmit={async (input) => {
                        await onCount(input);
                        setPanel(null);
                      }}
                    />
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      <p className="text-[11px] text-muted-foreground">
        Cada ingreso, retiro y conteo queda en la pestaña Movimientos con fecha, motivo y quién lo hizo. Los
        retiros se valorizan al costo promedio de compra; nunca tocan el dinero de las pacientes.
      </p>
    </div>
  );
}

function SummaryCard({ label, value, tone }: { label: string; value: string; tone?: "warn" | "crit" }) {
  return (
    <div className="rounded-xl border border-border bg-card px-3 py-2.5">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</p>
      <p
        className={`mt-0.5 text-lg font-bold tabular-nums ${
          tone === "crit" ? "text-red-600" : tone === "warn" ? "text-amber-600" : ""
        }`}
      >
        {value}
      </p>
    </div>
  );
}

function WithdrawPanel({
  product,
  stock,
  onCancel,
  onSubmit,
}: {
  product: InventoryProduct;
  stock: number;
  onCancel: () => void;
  onSubmit: (input: SupplyWithdrawInput) => Promise<void>;
}) {
  const [qty, setQty] = useState("1");
  const [reason, setReason] = useState<SupplyWithdrawReason>("uso_interno");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const n = Number(qty);
  const valid = Number.isFinite(n) && n > 0;
  const remaining = stock - (valid ? n : 0);

  return (
    <div className="mt-3 rounded-xl border border-border bg-muted/30 p-3">
      <div className="grid gap-3 sm:grid-cols-[120px_1fr]">
        <div>
          <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Cantidad
          </label>
          <Input type="number" min="0" step="1" inputMode="decimal" value={qty} onChange={(e) => setQty(e.target.value)} autoFocus className="tabular-nums" />
          <div className="mt-1.5 flex gap-1">
            {[1, 2, 5, 10].map((q) => (
              <button key={q} type="button" onClick={() => setQty(String(q))} className="rounded-md border border-border px-2 py-0.5 text-[11px] hover:bg-accent">
                {q}
              </button>
            ))}
          </div>
        </div>
        <div>
          <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Motivo
          </label>
          <div className="flex flex-wrap gap-1.5">
            {WITHDRAW_REASONS.map((r) => (
              <button
                key={r.code}
                type="button"
                title={r.hint}
                onClick={() => setReason(r.code)}
                className={`rounded-full border px-2.5 py-1 text-xs transition-colors ${
                  reason === r.code ? "border-primary bg-primary/10 font-semibold text-primary" : "border-border hover:bg-accent"
                }`}
              >
                {r.label}
              </button>
            ))}
          </div>
          <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Nota (opcional)" className="mt-2" maxLength={200} />
        </div>
      </div>
      <div className="mt-3 flex items-center justify-between gap-2">
        <p className={`text-xs ${remaining < 0 ? "font-semibold text-red-600" : "text-muted-foreground"}`}>
          {remaining < 0 ? (
            <>
              <AlertTriangle className="mr-1 inline h-3.5 w-3.5" />
              Quedaría en {fmtQty(remaining)}: hay menos de lo que el sistema cree. Haz un conteo después.
            </>
          ) : (
            <>Quedarán {fmtQty(remaining)} {unitLabel(product)}.</>
          )}
        </p>
        <div className="flex gap-2">
          <Button variant="ghost" size="sm" onClick={onCancel} disabled={busy}>
            Cancelar
          </Button>
          <Button
            size="sm"
            disabled={!valid || busy}
            onClick={async () => {
              setBusy(true);
              try {
                await onSubmit({ product, quantity: n, reasonCode: reason, note: note.trim() || null });
              } finally {
                setBusy(false);
              }
            }}
          >
            {busy && <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />}
            Registrar retiro
          </Button>
        </div>
      </div>
    </div>
  );
}

function CountPanel({
  product,
  stock,
  onCancel,
  onSubmit,
}: {
  product: InventoryProduct;
  stock: number;
  onCancel: () => void;
  onSubmit: (input: SupplyCountInput) => Promise<void>;
}) {
  const [counted, setCounted] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const n = Number(counted);
  const valid = counted !== "" && Number.isFinite(n) && n >= 0;
  const diff = valid ? n - stock : 0;

  return (
    <div className="mt-3 rounded-xl border border-border bg-muted/30 p-3">
      <div className="grid gap-3 sm:grid-cols-[160px_1fr]">
        <div>
          <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Contado en el estante
          </label>
          <Input type="number" min="0" step="1" inputMode="decimal" value={counted} onChange={(e) => setCounted(e.target.value)} autoFocus placeholder={fmtQty(stock)} className="tabular-nums" />
        </div>
        <div>
          <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Nota (opcional)
          </label>
          <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Ej. conteo de fin de semana" maxLength={200} />
        </div>
      </div>
      <div className="mt-3 flex items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">
          El sistema tiene {fmtQty(stock)} {unitLabel(product)}.
          {valid && diff !== 0 && (
            <span className={`ml-1 font-semibold ${diff < 0 ? "text-red-600" : "text-emerald-600"}`}>
              Se ajustará {diff > 0 ? "+" : ""}
              {fmtQty(diff)}.
            </span>
          )}
          {valid && diff === 0 && <span className="ml-1 font-semibold text-emerald-600">Cuadra exacto.</span>}
        </p>
        <div className="flex gap-2">
          <Button variant="ghost" size="sm" onClick={onCancel} disabled={busy}>
            Cancelar
          </Button>
          <Button
            size="sm"
            disabled={!valid || busy}
            onClick={async () => {
              setBusy(true);
              try {
                await onSubmit({ product, counted: n, note: note.trim() || null });
              } finally {
                setBusy(false);
              }
            }}
          >
            {busy && <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />}
            Guardar conteo
          </Button>
        </div>
      </div>
    </div>
  );
}
