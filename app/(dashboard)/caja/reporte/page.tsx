import { ShiftReport } from "./shift-report";

/**
 * Reporte de caja imprimible (Ctrl+P / "Guardar como PDF").
 *   /caja/reporte?turnos=<id>[,<id>…]
 * Un turno = el reporte del cierre. Varios = el Historial filtrado: resumen
 * de todos + el detalle de cada uno. Quién ve qué lo decide la base (RLS de
 * cash_shifts / cash_movements y el RPC de resumen): recepción solo sus
 * turnos, administración todos.
 */
const MAX_REPORT_SHIFTS = 60;

export default async function CajaReportePage({
  searchParams,
}: {
  searchParams: Promise<{ turnos?: string | string[] }>;
}) {
  const sp = await searchParams;
  const raw = Array.isArray(sp.turnos) ? sp.turnos.join(",") : sp.turnos ?? "";
  const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const ids = [...new Set(raw.split(",").map((s) => s.trim()).filter((s) => UUID.test(s)))];
  return <ShiftReport ids={ids.slice(0, MAX_REPORT_SHIFTS)} truncated={ids.length > MAX_REPORT_SHIFTS} />;
}
