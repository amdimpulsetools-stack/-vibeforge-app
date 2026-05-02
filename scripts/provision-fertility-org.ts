/**
 * Provision Fertility Test Organization
 * ──────────────────────────────────────────────────────────
 * Crea de cero una org lista para probar el addon `fertility_basic`:
 *
 *   1. Usuario auth (auto-confirma email)
 *   2. user_profile con terms+privacy aceptados (evita el gate)
 *   3. Organización con primary_specialty_id = medicina-reproductiva
 *   4. organization_member como owner
 *   5. Default office + doctor vinculado al user
 *   6. Activación del addon `fertility_basic` (clona reglas globales per-org
 *      + siembra plantillas WhatsApp Meta-ready en estado PENDING)
 *
 * El script es idempotente: si algo ya existe, lo reusa y continúa.
 *
 * USO:
 *   npx tsx scripts/provision-fertility-org.ts
 *
 * Variables de entorno (usa defaults si no las defines):
 *   PROV_EMAIL    — default: oscarfiverr+fertilidad@gmail.com
 *   PROV_PASSWORD — default: Nicholas3-
 *   PROV_NAME     — default: Centro Fertilidad QA
 *   PROV_FULLNAME — default: Dr. Oscar Duran
 *
 * Requisitos en .env.local:
 *   NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *
 * NOTA DE SEGURIDAD: este script usa el service role key (bypassea RLS).
 * Solo correrlo en entornos de desarrollo / staging. NUNCA en CI público.
 */

import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";

config({ path: ".env.local" });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local");
  process.exit(1);
}

const EMAIL = process.env.PROV_EMAIL ?? "oscarfiverr+fertilidad@gmail.com";
const PASSWORD = process.env.PROV_PASSWORD ?? "Nicholas3-";
const ORG_NAME = process.env.PROV_NAME ?? "Centro Fertilidad QA";
const FULL_NAME = process.env.PROV_FULLNAME ?? "Dr. Oscar Duran";
const SPECIALTY_SLUG = "medicina-reproductiva";
const ADDON_KEY = "fertility_basic";
const TERMS_VERSION = "2026-04-29";

const admin = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

function step(n: number, label: string) {
  console.log(`\n[${n}] ${label}`);
}

function ok(msg: string) {
  console.log(`    ✓ ${msg}`);
}

function warn(msg: string) {
  console.log(`    ! ${msg}`);
}

function fail(msg: string): never {
  console.error(`    ✗ ${msg}`);
  process.exit(1);
}

// ──────────────────────────────────────────────────────────
// 1) Crear (o reusar) usuario en auth
// ──────────────────────────────────────────────────────────
async function provisionUser(): Promise<string> {
  step(1, `Creando usuario auth: ${EMAIL}`);

  const { data: existing } = await admin.auth.admin.listUsers();
  const users = (existing?.users ?? []) as Array<{ id: string; email?: string | null }>;
  const found = users.find((u) => u.email === EMAIL);
  if (found) {
    ok(`Usuario ya existe (id=${found.id})`);
    // Asegurar password actual
    await admin.auth.admin.updateUserById(found.id, {
      password: PASSWORD,
      email_confirm: true,
      user_metadata: { full_name: FULL_NAME },
    });
    ok("Password sincronizado al PROV_PASSWORD");
    return found.id;
  }

  const { data, error } = await admin.auth.admin.createUser({
    email: EMAIL,
    password: PASSWORD,
    email_confirm: true,
    user_metadata: { full_name: FULL_NAME },
  });
  if (error || !data.user) fail(error?.message ?? "Sin user data");
  ok(`Usuario creado (id=${data.user.id})`);
  return data.user.id;
}

// ──────────────────────────────────────────────────────────
// 2) user_profile con terms aceptados
// ──────────────────────────────────────────────────────────
async function provisionProfile(userId: string): Promise<void> {
  step(2, "Asegurando user_profile + terms gate aceptado");

  const now = new Date().toISOString();
  const { error } = await admin.from("user_profiles").upsert(
    {
      id: userId,
      full_name: FULL_NAME,
      accepted_terms_at: now,
      accepted_terms_version: TERMS_VERSION,
      accepted_privacy_at: now,
      accepted_privacy_version: TERMS_VERSION,
    },
    { onConflict: "id" }
  );
  if (error) fail(error.message);
  ok(`user_profile listo (terms ${TERMS_VERSION} aceptados)`);
}

// ──────────────────────────────────────────────────────────
// 3) Organización con specialty fertility
// ──────────────────────────────────────────────────────────
async function provisionOrg(ownerId: string): Promise<string> {
  step(3, `Creando organización "${ORG_NAME}" (specialty=${SPECIALTY_SLUG})`);

  // Resolver el id del specialty
  const { data: spec, error: specErr } = await admin
    .from("specialties")
    .select("id")
    .eq("slug", SPECIALTY_SLUG)
    .single();
  if (specErr || !spec) fail(`Specialty "${SPECIALTY_SLUG}" no encontrada: ${specErr?.message}`);

  const { data: existing } = await admin
    .from("organizations")
    .select("id")
    .eq("name", ORG_NAME)
    .maybeSingle();
  if (existing) {
    ok(`Org ya existe (id=${existing.id})`);
    await admin
      .from("organizations")
      .update({ primary_specialty_id: spec.id, owner_id: ownerId })
      .eq("id", existing.id);
    ok("primary_specialty_id sincronizado a medicina-reproductiva");
    return existing.id;
  }

  const slug = ORG_NAME.toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "");

  const { data: org, error } = await admin
    .from("organizations")
    .insert({
      name: ORG_NAME,
      slug,
      owner_id: ownerId,
      organization_type: "centro-medico",
      primary_specialty_id: spec.id,
      is_active: true,
    })
    .select("id")
    .single();
  if (error || !org) fail(error?.message ?? "Sin org");
  ok(`Org creada (id=${org.id})`);
  return org.id;
}

// ──────────────────────────────────────────────────────────
// 4) Membership owner
// ──────────────────────────────────────────────────────────
async function provisionMembership(userId: string, orgId: string): Promise<void> {
  step(4, "Asegurando organization_members (role=owner)");

  const { data: existing } = await admin
    .from("organization_members")
    .select("id, role")
    .eq("user_id", userId)
    .eq("organization_id", orgId)
    .maybeSingle();
  if (existing) {
    if (existing.role !== "owner") {
      await admin
        .from("organization_members")
        .update({ role: "owner", is_active: true })
        .eq("id", existing.id);
      ok("role actualizado a owner");
    } else {
      ok("Membership owner ya existe");
    }
    return;
  }
  const { error } = await admin.from("organization_members").insert({
    user_id: userId,
    organization_id: orgId,
    role: "owner",
    is_active: true,
  });
  if (error) fail(error.message);
  ok("Membership creada");
}

// ──────────────────────────────────────────────────────────
// 5) Default office + doctor del owner
// ──────────────────────────────────────────────────────────
async function provisionDefaults(userId: string, orgId: string): Promise<string> {
  step(5, "Sembrando default office + doctor");

  const { data: office } = await admin
    .from("offices")
    .select("id")
    .eq("organization_id", orgId)
    .limit(1)
    .maybeSingle();
  if (!office) {
    await admin.from("offices").insert({
      organization_id: orgId,
      name: "Consultorio 1",
      code: "C1",
      is_active: true,
    });
    ok("Office C1 creada");
  } else {
    ok("Office ya existe");
  }

  const { data: doc } = await admin
    .from("doctors")
    .select("id")
    .eq("user_id", userId)
    .eq("organization_id", orgId)
    .maybeSingle();
  if (doc) {
    ok(`Doctor ya existe (id=${doc.id})`);
    return doc.id;
  }
  const { data: newDoc, error } = await admin
    .from("doctors")
    .insert({
      organization_id: orgId,
      user_id: userId,
      full_name: FULL_NAME,
      specialty: "Medicina Reproductiva",
      is_active: true,
    })
    .select("id")
    .single();
  if (error || !newDoc) fail(error?.message ?? "Sin doctor");
  ok(`Doctor creado (id=${newDoc.id})`);
  return newDoc.id;
}

// ──────────────────────────────────────────────────────────
// 6) Activar addon fertility_basic + clonar reglas + sembrar plantillas
// ──────────────────────────────────────────────────────────
async function provisionAddon(orgId: string): Promise<void> {
  step(6, `Activando addon ${ADDON_KEY}`);

  const { data: addon, error: addonErr } = await admin
    .from("addons")
    .select("id, key, tier_group")
    .eq("key", ADDON_KEY)
    .single();
  if (addonErr || !addon) fail(`Addon ${ADDON_KEY} no encontrado en seed: ${addonErr?.message}`);

  const { data: existingActivation } = await admin
    .from("organization_addons")
    .select("id, enabled")
    .eq("organization_id", orgId)
    .eq("addon_id", addon.id)
    .maybeSingle();
  if (existingActivation) {
    if (!existingActivation.enabled) {
      await admin
        .from("organization_addons")
        .update({ enabled: true })
        .eq("id", existingActivation.id);
      ok("Addon ya existía deshabilitado, ahora enabled=true");
    } else {
      ok("Addon ya activo");
    }
  } else {
    const { error } = await admin.from("organization_addons").insert({
      organization_id: orgId,
      addon_id: addon.id,
      enabled: true,
    });
    if (error) fail(error.message);
    ok("Addon activado");
  }

  // ─── Clonar reglas globales del addon a la org (si aún no están) ───
  const { data: globalRules } = await admin
    .from("followup_rules")
    .select("*")
    .is("organization_id", null)
    .eq("addon_key", "fertility");

  if (globalRules?.length) {
    for (const rule of globalRules) {
      const { data: existing } = await admin
        .from("followup_rules")
        .select("id")
        .eq("organization_id", orgId)
        .eq("rule_key", rule.rule_key)
        .maybeSingle();
      if (existing) continue;

      const { id: _omit, organization_id: _omit2, ...payload } = rule;
      void _omit;
      void _omit2;
      await admin.from("followup_rules").insert({
        ...payload,
        organization_id: orgId,
        is_system: true,
        is_active: true,
      });
    }
    ok(`${globalRules.length} reglas globales clonadas a la org`);
  }

  // ─── Sembrar plantillas WhatsApp Meta-ready per-org ───
  try {
    const wa = await import("../lib/fertility/whatsapp-templates");
    const templates: any[] =
      (wa as any).FERTILITY_WHATSAPP_TEMPLATE_SEEDS ??
      (wa as any).FERTILITY_WHATSAPP_TEMPLATES ??
      [];
    if (!templates.length) {
      warn("FERTILITY_WHATSAPP_TEMPLATES vacío (omitiendo seed de plantillas WA)");
    } else {
      let created = 0;
      for (const t of templates) {
        const { data: exists } = await admin
          .from("whatsapp_templates")
          .select("id")
          .eq("organization_id", orgId)
          .eq("name", t.name)
          .maybeSingle();
        if (exists) continue;
        const { error } = await admin.from("whatsapp_templates").insert({
          organization_id: orgId,
          name: t.name,
          category: t.category,
          language: t.language,
          status: t.status,
          body_text: t.body_text,
          components: t.components ?? null,
        });
        if (!error) created++;
      }
      ok(`${created} plantillas WhatsApp sembradas (status=PENDING — submitirlas a Meta antes de poder enviarse)`);
    }
  } catch (e) {
    warn(`No se pudieron sembrar plantillas WA: ${(e as Error).message}`);
  }
}

// ──────────────────────────────────────────────────────────
// MAIN
// ──────────────────────────────────────────────────────────
async function main() {
  console.log("\n══════════════════════════════════════════════════════");
  console.log("  Yenda — Provisión de org de prueba para Fertilidad");
  console.log("══════════════════════════════════════════════════════");
  console.log(`  Email:      ${EMAIL}`);
  console.log(`  Password:   ${PASSWORD}`);
  console.log(`  Org:        ${ORG_NAME}`);
  console.log(`  Addon:      ${ADDON_KEY}`);
  console.log("══════════════════════════════════════════════════════");

  const userId = await provisionUser();
  await provisionProfile(userId);
  const orgId = await provisionOrg(userId);
  await provisionMembership(userId, orgId);
  await provisionDefaults(userId, orgId);
  await provisionAddon(orgId);

  console.log("\n══════════════════════════════════════════════════════");
  console.log("  ✅ Provisión completada");
  console.log("══════════════════════════════════════════════════════");
  console.log(`\n  Login:    ${EMAIL} / ${PASSWORD}`);
  console.log(`  Org id:   ${orgId}`);
  console.log(`  User id:  ${userId}`);
  console.log("\n  Próximos pasos manuales en la app:");
  console.log("    1. Login.");
  console.log("    2. Settings → Servicios — crear servicios fertility (1ra consulta, 2da consulta, decisión tratamiento).");
  console.log("    3. /admin/addon-config/fertility/canonical-mapping — mapear cada servicio a su categoría.");
  console.log("    4. /admin/addon-config/fertility/settings — opcional, ajustar delays.");
  console.log("    5. (Opcional) Settings → WhatsApp Templates — submitir las 6 plantillas pendientes a Meta.");
  console.log("    6. Crear cita de prueba con servicio mapeado a 'fertility.first_consultation'.");
  console.log("    7. Marcarla como 'completed' en el sidebar.");
  console.log("    8. /scheduler/follow-ups — debería aparecer un seguimiento automático con badge violeta.\n");
}

main().catch((err) => {
  console.error("\n[FATAL]", err);
  process.exit(1);
});
