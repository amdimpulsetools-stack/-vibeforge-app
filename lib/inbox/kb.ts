import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Base de conocimientos de Yendy IA (mig 275) — dos capas:
 *
 *  A. AUTOMÁTICA (nunca se redacta a mano): sale en vivo de las tablas
 *     del sistema — servicios con su precio TEXTUAL, duración e
 *     indicaciones previas; doctores; sedes; horario de la agenda; datos
 *     de contacto. Regla de oro: un precio se cita tal cual del catálogo
 *     o no se cita.
 *  B. EDITABLE por la clínica (wa_kb_entries): preguntas frecuentes,
 *     políticas, fichas por servicio, preparación.
 *
 * Formato: fichas cortas con id estable (`svc:…`, `kb:…`) para que la
 * IA declare qué fuentes usó y el validador pueda comprobar precios.
 */

export interface KbSnapshot {
  text: string;
  /** Precios válidos tal como se muestran ("S/ 150.00"), para el validador. */
  priceStrings: string[];
  entryCount: number;
}

const IGV_LABEL: Record<number, string> = {
  1: "incluye IGV",
  8: "exonerado de IGV",
  9: "inafecto al IGV",
};

export function formatSoles(n: number): string {
  return `S/ ${Number(n).toFixed(2)}`;
}

export async function buildKbSnapshot(admin: SupabaseClient, orgId: string): Promise<KbSnapshot> {
  const [orgRes, svcRes, docRes, offRes, schedRes, kbRes] = await Promise.all([
    admin.from("organizations").select("*").eq("id", orgId).maybeSingle(),
    admin
      .from("services")
      // "*" a propósito: si una columna opcional no existe en algún
      // entorno, la ficha simplemente no la muestra (nunca rompe la IA).
      .select("*")
      .eq("organization_id", orgId)
      .eq("is_active", true)
      .order("name")
      .limit(200),
    admin.from("doctors").select("*").eq("organization_id", orgId).limit(100),
    admin.from("offices").select("*").eq("organization_id", orgId).limit(50),
    admin
      .from("scheduler_settings")
      .select("start_hour, end_hour, disabled_weekdays")
      .eq("organization_id", orgId)
      .maybeSingle(),
    admin
      .from("wa_kb_entries")
      .select("id, kind, title, content")
      .eq("organization_id", orgId)
      .eq("is_active", true)
      .order("kind")
      .limit(300),
  ]);

  const org = (orgRes.data ?? {}) as Record<string, unknown>;
  const lines: string[] = [];
  const priceStrings: string[] = [];

  lines.push("## Clínica");
  lines.push(`- Nombre: ${String(org.name ?? "")}`);
  if (org.address) lines.push(`- Dirección: ${String(org.address)}`);
  if (org.phone) lines.push(`- Teléfono: ${String(org.phone)}`);
  if (org.google_maps_url) lines.push(`- Mapa: ${String(org.google_maps_url)}`);

  const sched = schedRes.data as { start_hour?: number; end_hour?: number; disabled_weekdays?: number[] } | null;
  if (sched?.start_hour != null && sched?.end_hour != null) {
    const days = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
    const closed = (Array.isArray(sched.disabled_weekdays) ? sched.disabled_weekdays : [])
      .map((d) => days[d])
      .filter(Boolean);
    lines.push(
      `- Horario de atención de la agenda: ${String(sched.start_hour).padStart(2, "0")}:00 a ${String(sched.end_hour).padStart(2, "0")}:00` +
        (closed.length ? ` (no se atiende: ${closed.join(", ")})` : ""),
    );
  }

  const services = (svcRes.data ?? []) as Array<{
    id: string;
    name: string;
    base_price: number | string | null;
    duration_minutes: number | null;
    igv_affectation: number | null;
    pre_appointment_instructions: string | null;
  }>;
  lines.push("", "## Servicios y precios (catálogo oficial; citar el precio EXACTAMENTE así)");
  if (services.length === 0) lines.push("- (sin servicios cargados)");
  for (const s of services) {
    const price = Number(s.base_price ?? 0);
    const priceText = price > 0 ? `${formatSoles(price)} (${IGV_LABEL[s.igv_affectation ?? 1] ?? "incluye IGV"})` : "precio a consultar";
    if (price > 0) priceStrings.push(formatSoles(price));
    lines.push(`- [svc:${s.id.slice(0, 8)}] ${s.name} — ${priceText}${s.duration_minutes ? ` — duración ${s.duration_minutes} min` : ""}`);
    if (s.pre_appointment_instructions?.trim()) {
      lines.push(`  · Indicaciones previas: ${s.pre_appointment_instructions.trim().slice(0, 600)}`);
    }
  }

  const doctors = ((docRes.data ?? []) as Array<{ full_name: string; is_active?: boolean | null }>).filter(
    (d) => d.is_active !== false,
  );
  if (doctors.length) {
    lines.push("", "## Profesionales");
    for (const d of doctors) lines.push(`- ${d.full_name}`);
  }
  const offices = ((offRes.data ?? []) as Array<{ name: string; description: string | null; is_active?: boolean | null }>).filter(
    (o) => o.is_active !== false,
  );
  if (offices.length) {
    lines.push("", "## Sedes / consultorios");
    for (const o of offices) lines.push(`- ${o.name}${o.description ? ` — ${o.description}` : ""}`);
  }

  const entries = (kbRes.data ?? []) as Array<{ id: string; kind: string; title: string; content: string }>;
  const kindLabel: Record<string, string> = {
    faq: "Pregunta frecuente",
    policy: "Política",
    service_info: "Ficha de servicio",
    preparation: "Preparación",
    general: "Información",
  };
  lines.push("", "## Información de la clínica (escrita por el equipo)");
  if (entries.length === 0) lines.push("- (todavía no hay fichas cargadas)");
  for (const e of entries) {
    lines.push(`- [kb:${e.id.slice(0, 8)}] ${kindLabel[e.kind] ?? "Información"} — ${e.title}: ${e.content.trim()}`);
  }

  return { text: lines.join("\n"), priceStrings, entryCount: entries.length };
}
