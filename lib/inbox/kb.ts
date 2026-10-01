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
 *     políticas y, desde la 276, FICHAS POR SERVICIO (qué incluye, para
 *     quién, beneficios, preparación, después, objeción) que se imprimen
 *     debajo del servicio en el catálogo.
 *  C. CASOS REALES (wa_kb_cases, mig 276): "la paciente escribió X → la
 *     clínica respondió Y → luego Z". Son los ejemplos de tono y de
 *     encauce; la guía de conversación va en el system prompt (ai.ts).
 *
 * Formato: fichas cortas con id estable (`svc:…`, `kb:…`) para que la
 * IA declare qué fuentes usó y el validador pueda comprobar precios.
 */

export interface KbSnapshot {
  text: string;
  /** Precios válidos tal como se muestran ("S/ 150.00"), para el validador. */
  priceStrings: string[];
  entryCount: number;
  caseCount: number;
}

const IGV_LABEL: Record<number, string> = {
  1: "incluye IGV",
  8: "exonerado de IGV",
  9: "inafecto al IGV",
};

export function formatSoles(n: number): string {
  return `S/ ${Number(n).toFixed(2)}`;
}

export async function buildKbSnapshot(
  admin: SupabaseClient,
  orgId: string,
  opts: { hiddenServiceIds?: string[] } = {},
): Promise<KbSnapshot> {
  const hidden = new Set(opts.hiddenServiceIds ?? []);
  const [orgRes, svcRes, docRes, offRes, schedRes, kbRes, caseRes] = await Promise.all([
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
      .select("id, kind, title, content, service_id")
      .eq("organization_id", orgId)
      .eq("is_active", true)
      .order("kind")
      .limit(400),
    // Casos reales: los más recientes primero; tope fijo para que el bloque
    // en caché no crezca sin límite (≈ 60 casos ≈ 6-8 k tokens).
    admin
      .from("wa_kb_cases")
      .select("id, intent, title, patient_message, ideal_reply, guidance, service_id")
      .eq("organization_id", orgId)
      .eq("is_active", true)
      .order("updated_at", { ascending: false })
      .limit(60),
  ]);
  if (kbRes.error) throw new Error(`Base de conocimientos: ${kbRes.error.message}`);
  // La tabla de casos llega con la 276: si aún no existe, la base sigue
  // funcionando sin casos (nunca tragamos otros errores).
  if (caseRes.error && !/relation .* does not exist|42P01/.test(`${caseRes.error.code} ${caseRes.error.message}`)) {
    throw new Error(`Casos: ${caseRes.error.message}`);
  }

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
  const entries = (kbRes.data ?? []) as Array<{ id: string; kind: string; title: string; content: string; service_id: string | null }>;
  const activeServiceIds = new Set(services.map((s) => s.id));
  const byService = new Map<string, typeof entries>();
  const generalEntries: typeof entries = [];
  for (const e of entries) {
    // Ficha de un servicio que ya no está activo → se lee como general,
    // con su título, para no perder lo escrito.
    if (e.service_id && activeServiceIds.has(e.service_id)) {
      const arr = byService.get(e.service_id) ?? [];
      arr.push(e);
      byService.set(e.service_id, arr);
    } else {
      generalEntries.push(e);
    }
  }
  const serviceKindLabel: Record<string, string> = {
    includes: "Qué incluye",
    for_whom: "Para quién es",
    benefits: "Beneficio esperado",
    preparation: "Preparación",
    aftercare: "Después del procedimiento",
    faq: "Pregunta frecuente",
    objection: "Si la paciente objeta",
    service_info: "Detalle",
    policy: "Política",
    general: "Información",
  };
  const serviceKindOrder = ["includes", "for_whom", "benefits", "preparation", "aftercare", "faq", "objection", "service_info", "policy", "general"];

  // Servicios que la clínica no quiere ofrecer por chat: sin precio ni
  // detalle; si los piden, la IA deriva a una persona (needs_human).
  const offHidden = services.filter((s) => hidden.has(s.id));
  const offered = services.filter((s) => !hidden.has(s.id));
  lines.push("", "## Servicios y precios (catálogo oficial; citar el precio EXACTAMENTE así)");
  if (offered.length === 0) lines.push("- (sin servicios cargados)");
  for (const s of offered) {
    const price = Number(s.base_price ?? 0);
    const priceText = price > 0 ? `${formatSoles(price)} (${IGV_LABEL[s.igv_affectation ?? 1] ?? "incluye IGV"})` : "precio a consultar";
    if (price > 0) priceStrings.push(formatSoles(price), `S/ ${Number(price).toFixed(2)}`);
    lines.push(`- [svc:${s.id.slice(0, 8)}] ${s.name} — ${priceText}${s.duration_minutes ? ` — duración ${s.duration_minutes} min` : ""}`);
    if (s.pre_appointment_instructions?.trim()) {
      lines.push(`  · Indicaciones previas: ${s.pre_appointment_instructions.trim().slice(0, 600)}`);
    }
    // Fichas escritas por el equipo para ESTE servicio (mig 276).
    const cards = (byService.get(s.id) ?? []).sort(
      (a, b) => serviceKindOrder.indexOf(a.kind) - serviceKindOrder.indexOf(b.kind),
    );
    for (const c of cards) {
      lines.push(`  · [kb:${c.id.slice(0, 8)}] ${serviceKindLabel[c.kind] ?? "Información"} — ${c.title}: ${c.content.trim()}`);
    }
  }
  if (offHidden.length) {
    lines.push(
      "",
      "## Servicios que NO se cotizan ni ofrecen por WhatsApp",
      "No los ofrezcas por iniciativa propia ni des precio o detalle. Si la paciente pregunta por uno: dile con calidez que una persona del equipo le escribe para orientarla; needs_human=true; gap_question=null.",
    );
    for (const s of offHidden) lines.push(`- ${s.name}`);
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

  const kindLabel: Record<string, string> = {
    faq: "Pregunta frecuente",
    policy: "Política",
    service_info: "Ficha de servicio",
    preparation: "Preparación",
    general: "Información",
    includes: "Qué incluye",
    for_whom: "Para quién es",
    benefits: "Beneficio esperado",
    aftercare: "Después del procedimiento",
    objection: "Si la paciente objeta",
  };
  lines.push("", "## Información de la clínica (escrita por el equipo)");
  if (generalEntries.length === 0) lines.push("- (todavía no hay fichas generales)");
  for (const e of generalEntries) {
    lines.push(`- [kb:${e.id.slice(0, 8)}] ${kindLabel[e.kind] ?? "Información"} — ${e.title}: ${e.content.trim()}`);
  }

  // Casos reales: ejemplos de tono y de encauce, no verdades nuevas. Los
  // de servicios ocultos no se muestran (podrían filtrar precio/detalle).
  const serviceName = new Map(services.map((s) => [s.id, s.name]));
  const cases = ((caseRes.data ?? []) as Array<{
    id: string;
    intent: string;
    title: string;
    patient_message: string;
    ideal_reply: string;
    guidance: string | null;
    service_id: string | null;
  }>).filter((c) => !(c.service_id && hidden.has(c.service_id)));
  if (cases.length) {
    lines.push(
      "",
      "## Casos reales resueltos por el equipo (referencia de TONO y de hacia dónde encauzar)",
      "Úsalos como ejemplo de cómo responde esta clínica. Adapta al caso actual: no copies literal si no calza, y los precios siempre del catálogo de arriba.",
    );
    for (const c of cases) {
      const svc = c.service_id ? serviceName.get(c.service_id) : null;
      lines.push(
        `- [caso:${c.id.slice(0, 8)}] (${c.intent}${svc ? ` · ${svc}` : ""}) Paciente: "${c.patient_message.trim().slice(0, 500)}" → Clínica: "${c.ideal_reply.trim().slice(0, 900)}"` +
          (c.guidance?.trim() ? ` → Luego: ${c.guidance.trim().slice(0, 300)}` : ""),
      );
    }
  }

  return { text: lines.join("\n"), priceStrings, entryCount: entries.length, caseCount: cases.length };
}
