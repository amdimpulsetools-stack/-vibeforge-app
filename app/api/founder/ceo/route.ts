import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireFounder } from "@/lib/require-founder";

export const runtime = "nodejs";

/**
 * GET /api/founder/ceo — agregador único del Panel CEO (Fase 1).
 *
 * Devuelve en un solo payload las 3 capas de la vista principal:
 *   · pulse   — MRR real (payment_history, NO el GMV de las clínicas),
 *               cobrado del mes, trials con días restantes, problemas de pago
 *   · orgs    — una fila por organización con señales de adopción reales
 *               (última actividad vía auth_sessions, citas, features
 *               conectadas) + clasificación activa/vacía/sospechosa-de-bot
 *   · alerts  — lista corta de acciones para HOY, generada por reglas
 *
 * Guard: requireFounder (3 capas, incluida cookie 2FA) + admin client
 * server-side — la RLS no se toca. Con ~100 orgs, el fan-out de queries en
 * paralelo + joins en memoria es suficiente (mismo patrón que stats/owners).
 */

const DAY_MS = 24 * 60 * 60 * 1000;

// Nombre generado por bot: una sola "palabra" larga de letras mezcladas sin
// espacios (los ~80 signups del 13-20 jun 2026: "RFRZknfsVxPOrowwCn"...).
// Heurística de UI para filtrar, no una sentencia — por eso se llama
// "sospechosa" y no "spam".
const BOT_NAME = /^[A-Za-z]{14,}$/;

export async function GET() {
  const ctx = await requireFounder();
  if ("error" in ctx) return ctx.error;

  const admin = createAdminClient();
  const now = Date.now();
  const nowIso = new Date(now).toISOString();
  const d7 = new Date(now - 7 * DAY_MS).toISOString();
  const d30 = new Date(now - 30 * DAY_MS).toISOString();
  const in7d = new Date(now + 7 * DAY_MS).toISOString();
  const monthStart = new Date(new Date(now).getFullYear(), new Date(now).getMonth(), 1).toISOString();
  const h24 = new Date(now - 24 * 3600 * 1000).toISOString();
  const h48 = new Date(now - 48 * 3600 * 1000).toISOString();

  const [
    orgsRes,
    membersRes,
    subsRes,
    apptsCreated7dRes,
    apptsNext7dRes,
    patients30dRes,
    patientsAllRes,
    sessionsRes,
    waConfigRes,
    einvConfigRes,
    followups30dRes,
    pluginsRes,
    yendaPaymentsMonthRes,
    yendaPaymentsAllRes,
    einvRejected7dRes,
    waFailed24hRes,
    ticketsOpenRes,
  ] = await Promise.all([
    admin
      .from("organizations")
      .select("id, name, slug, is_active, owner_id, created_at")
      .order("created_at", { ascending: false }),
    admin.from("organization_members").select("organization_id, user_id, role, is_active"),
    admin
      .from("organization_subscriptions")
      .select(
        "organization_id, status, billing_cycle, trial_ends_at, current_period_end, grace_period_until, past_due_since, created_at, plans(name, slug, price_monthly, price_semiannual, price_yearly)"
      )
      .order("created_at", { ascending: false }),
    admin.from("appointments").select("organization_id").gte("created_at", d7),
    admin
      .from("appointments")
      .select("organization_id")
      .gte("appointment_date", nowIso.slice(0, 10))
      .lte("appointment_date", in7d.slice(0, 10))
      .neq("status", "cancelled"),
    admin.from("patients").select("organization_id").gte("created_at", d30),
    admin.from("patients").select("organization_id"),
    admin.from("auth_sessions").select("user_id, last_seen_at"),
    admin.from("whatsapp_config").select("organization_id, is_active"),
    admin.from("einvoice_configs").select("organization_id, is_active, last_error_at, last_success_at"),
    admin.from("clinical_followups").select("organization_id").gte("created_at", d30),
    admin.from("org_plugins").select("organization_id, plugin_key, enabled"),
    // INGRESO YENDA — payment_history (lo que las clínicas nos pagan), no
    // patient_payments (lo que los pacientes pagan a las clínicas).
    admin
      .from("payment_history")
      .select("organization_id, amount, status, created_at")
      .gte("created_at", monthStart),
    admin
      .from("payment_history")
      .select("organization_id, amount, status"),
    admin
      .from("einvoices")
      .select("organization_id, status")
      .in("status", ["rejected", "error"])
      .gte("issued_at", d7),
    admin
      .from("whatsapp_message_logs")
      .select("organization_id")
      .eq("status", "failed")
      .gte("sent_at", h24),
    admin
      .from("support_tickets")
      .select("organization_id, subject, created_at, status")
      .in("status", ["open", "waiting"]),
  ]);

  const orgs = orgsRes.data ?? [];
  const members = membersRes.data ?? [];
  const subs = subsRes.data ?? [];

  // Owner emails para distinguir orgs propias del founder en la UI.
  const ownerIds = [...new Set(orgs.map((o) => o.owner_id).filter(Boolean))] as string[];
  const { data: ownerProfiles } =
    ownerIds.length > 0
      ? await admin.from("user_profiles").select("id, email, full_name").in("id", ownerIds)
      : { data: [] as { id: string; email: string | null; full_name: string | null }[] };
  const ownerById = new Map((ownerProfiles ?? []).map((p) => [p.id, p]));

  // ── Índices en memoria ────────────────────────────────────────────────
  const countBy = (rows: { organization_id: string }[] | null | undefined) => {
    const m = new Map<string, number>();
    for (const r of rows ?? []) m.set(r.organization_id, (m.get(r.organization_id) ?? 0) + 1);
    return m;
  };
  const apptsCreated7d = countBy(apptsCreated7dRes.data);
  const apptsNext7d = countBy(apptsNext7dRes.data);
  const patients30d = countBy(patients30dRes.data);
  const patientsAll = countBy(patientsAllRes.data);
  const followups30d = countBy(followups30dRes.data);
  const einvRejected7d = countBy(einvRejected7dRes.data);
  const waFailed24h = countBy(waFailed24hRes.data);

  const lastSeenByUser = new Map<string, string>();
  for (const s of sessionsRes.data ?? []) {
    const prev = lastSeenByUser.get(s.user_id);
    if (!prev || s.last_seen_at > prev) lastSeenByUser.set(s.user_id, s.last_seen_at);
  }
  const membersByOrg = new Map<string, { user_id: string; is_active: boolean | null }[]>();
  for (const m of members) {
    const arr = membersByOrg.get(m.organization_id) ?? [];
    arr.push({ user_id: m.user_id, is_active: m.is_active });
    membersByOrg.set(m.organization_id, arr);
  }

  const subByOrg = new Map<string, (typeof subs)[number]>();
  for (const s of subs) {
    // subs viene ordenado desc por created_at → la primera por org es la vigente.
    if (!subByOrg.has(s.organization_id)) subByOrg.set(s.organization_id, s);
  }

  const waByOrg = new Map((waConfigRes.data ?? []).map((w) => [w.organization_id, w]));
  const einvByOrg = new Map((einvConfigRes.data ?? []).map((e) => [e.organization_id, e]));
  const pluginsByOrg = new Map<string, string[]>();
  for (const p of pluginsRes.data ?? []) {
    if (!p.enabled) continue;
    const arr = pluginsByOrg.get(p.organization_id) ?? [];
    arr.push(p.plugin_key);
    pluginsByOrg.set(p.organization_id, arr);
  }

  // ── Filas por org ─────────────────────────────────────────────────────
  const planPriceForCycle = (sub: (typeof subs)[number] | undefined): number => {
    if (!sub) return 0;
    const plan = sub.plans as unknown as {
      price_monthly?: number;
      price_semiannual?: number | null;
      price_yearly?: number | null;
    } | null;
    if (!plan) return 0;
    // Normalizado a MENSUAL para el MRR.
    if (sub.billing_cycle === "yearly" && plan.price_yearly) return Number(plan.price_yearly) / 12;
    if (sub.billing_cycle === "semiannual" && plan.price_semiannual)
      return Number(plan.price_semiannual) / 6;
    return Number(plan.price_monthly ?? 0);
  };

  const orgRows = orgs.map((o) => {
    const sub = subByOrg.get(o.id);
    const orgMembers = membersByOrg.get(o.id) ?? [];
    const owner = o.owner_id ? ownerById.get(o.owner_id) : undefined;

    let lastSeen: string | null = null;
    for (const m of orgMembers) {
      const seen = lastSeenByUser.get(m.user_id);
      if (seen && (!lastSeen || seen > lastSeen)) lastSeen = seen;
    }
    const daysSinceSeen = lastSeen ? Math.floor((now - Date.parse(lastSeen)) / DAY_MS) : null;

    const patients = patientsAll.get(o.id) ?? 0;
    const citas7d = apptsCreated7d.get(o.id) ?? 0;
    const citasNext7d = apptsNext7d.get(o.id) ?? 0;
    const subStatus = sub?.status ?? null;

    const trialDaysLeft =
      subStatus === "trialing" && sub?.trial_ends_at
        ? Math.ceil((Date.parse(sub.trial_ends_at) - now) / DAY_MS)
        : null;

    // Clasificación
    const hasActivity =
      patients > 0 || citas7d > 0 || orgMembers.length > 1 ||
      (subStatus !== null && subStatus !== "cancelled");
    const looksBot = !hasActivity && BOT_NAME.test(o.name ?? "");
    const category: "activa" | "vacia" | "bot" = hasActivity ? "activa" : looksBot ? "bot" : "vacia";

    // Semáforo (solo significativo para las activas)
    let health: "verde" | "ambar" | "rojo" = "verde";
    if (subStatus === "grace" || subStatus === "past_due") health = "rojo";
    else if (trialDaysLeft !== null && trialDaysLeft <= 7 && (daysSinceSeen === null || daysSinceSeen >= 5))
      health = "rojo";
    else if (trialDaysLeft !== null && trialDaysLeft <= 7) health = "ambar";
    else if (subStatus === "active" && daysSinceSeen !== null && daysSinceSeen > 7) health = "ambar";

    return {
      id: o.id,
      name: o.name,
      created_at: o.created_at,
      owner_email: owner?.email ?? null,
      owner_name: owner?.full_name ?? null,
      members: orgMembers.length,
      patients,
      patients_30d: patients30d.get(o.id) ?? 0,
      citas_creadas_7d: citas7d,
      citas_proximas_7d: citasNext7d,
      last_seen: lastSeen,
      days_since_seen: daysSinceSeen,
      sub_status: subStatus,
      plan_name: (sub?.plans as unknown as { name?: string } | null)?.name ?? null,
      billing_cycle: sub?.billing_cycle ?? null,
      mrr: subStatus === "active" ? planPriceForCycle(sub) : 0,
      trial_days_left: trialDaysLeft,
      features: {
        whatsapp: waByOrg.get(o.id)?.is_active ?? false,
        facturacion: einvByOrg.get(o.id)?.is_active ?? false,
        seguimientos_30d: followups30d.get(o.id) ?? 0,
        plugins: pluginsByOrg.get(o.id) ?? [],
      },
      category,
      health,
    };
  });

  // ── Pulse ─────────────────────────────────────────────────────────────
  const activeRows = orgRows.filter((r) => r.sub_status === "active");
  const trialRows = orgRows.filter((r) => r.sub_status === "trialing");
  const problemRows = orgRows.filter(
    (r) => r.sub_status === "grace" || r.sub_status === "past_due"
  );

  const paidMonth = (yendaPaymentsMonthRes.data ?? [])
    .filter((p) => p.status === "approved")
    .reduce((s, p) => s + Number(p.amount), 0);
  const refundedMonth = (yendaPaymentsMonthRes.data ?? [])
    .filter((p) => p.status === "refunded")
    .reduce((s, p) => s + Number(p.amount), 0);
  const paidTotal = (yendaPaymentsAllRes.data ?? [])
    .filter((p) => p.status === "approved")
    .reduce((s, p) => s + Number(p.amount), 0);

  const pulse = {
    mrr: activeRows.reduce((s, r) => s + r.mrr, 0),
    mrr_proyectado_si_trials_convierten:
      activeRows.reduce((s, r) => s + r.mrr, 0) +
      trialRows.reduce((s, r) => s + planPriceForCycle(subByOrg.get(r.id)), 0),
    cobrado_mes: paidMonth - refundedMonth,
    cobrado_historico: paidTotal,
    trials: trialRows.map((r) => ({
      org: r.name,
      org_id: r.id,
      dias_restantes: r.trial_days_left,
      ultima_actividad_dias: r.days_since_seen,
    })),
    en_problemas: problemRows
      .filter((r) => r.category === "activa")
      .map((r) => ({ org: r.name, org_id: r.id, status: r.sub_status })),
    conteos: {
      total_orgs: orgRows.length,
      activas: orgRows.filter((r) => r.category === "activa").length,
      vacias: orgRows.filter((r) => r.category === "vacia").length,
      sospechosas_bot: orgRows.filter((r) => r.category === "bot").length,
    },
  };

  // ── Alertas accionables ───────────────────────────────────────────────
  type Alert = {
    severity: "rojo" | "ambar";
    title: string;
    detail: string;
    org_id?: string;
    /** Link a la pantalla donde se resuelve la alerta. */
    href?: string;
  };
  const alerts: Alert[] = [];

  for (const r of trialRows) {
    if (r.trial_days_left !== null && r.trial_days_left <= 7) {
      const frio = r.days_since_seen === null || r.days_since_seen >= 5;
      alerts.push({
        severity: frio ? "rojo" : "ambar",
        title: `${r.name}: trial vence en ${r.trial_days_left} día${r.trial_days_left === 1 ? "" : "s"}`,
        detail: frio
          ? `Nadie de la clínica entra hace ${r.days_since_seen ?? "∞"} días — llámalos antes de que venza.`
          : "La clínica está activa — buen momento para conversar el plan.",
        org_id: r.id,
      });
    }
  }
  for (const r of problemRows) {
    if (r.category !== "activa") continue;
    alerts.push({
      severity: "rojo",
      title: `${r.name}: pago en problemas (${r.sub_status})`,
      detail: "Revisa el método de pago con el cliente o su período de gracia.",
      org_id: r.id,
    });
  }
  for (const [orgId, count] of einvRejected7d) {
    const org = orgRows.find((r) => r.id === orgId);
    alerts.push({
      severity: "ambar",
      title: `${org?.name ?? orgId}: ${count} comprobante(s) SUNAT rechazado(s) esta semana`,
      detail: "Revisar en el dashboard de facturación de la org.",
      org_id: orgId,
    });
  }
  for (const [orgId, count] of waFailed24h) {
    if (count < 3) continue;
    const org = orgRows.find((r) => r.id === orgId);
    alerts.push({
      severity: "ambar",
      title: `${org?.name ?? orgId}: ${count} WhatsApps fallidos en 24h`,
      detail: "Posible token vencido o número bloqueado — revisar conexión WA.",
      org_id: orgId,
    });
  }
  for (const t of ticketsOpenRes.data ?? []) {
    if (t.created_at > h48) continue;
    const org = orgRows.find((r) => r.id === t.organization_id);
    alerts.push({
      severity: "ambar",
      title: `Ticket abierto hace más de 48h${org ? ` — ${org.name}` : ""}`,
      detail: t.subject || "Sin asunto",
      org_id: t.organization_id,
      href: "/founder-dashboard/support",
    });
  }
  alerts.sort((a, b) => (a.severity === b.severity ? 0 : a.severity === "rojo" ? -1 : 1));

  return NextResponse.json({ pulse, orgs: orgRows, alerts, generated_at: nowIso });
}
