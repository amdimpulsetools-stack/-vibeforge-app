/**
 * Seed Test Users Script
 *
 * Creates test users with different roles for QA testing.
 * Uses Gmail aliases so all emails arrive to your inbox.
 *
 * Usage:
 *   npx tsx scripts/seed-test-users.ts
 *
 * Prerequisites:
 *   - .env.local with NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY
 *   - Disable "Confirm email" in Supabase Auth settings for instant creation
 */

import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
config({ path: ".env.local" });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!supabaseUrl || !serviceRoleKey) {
  console.error("❌ Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local");
  process.exit(1);
}

const admin = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// ─── CONFIG ─────────────────────────────────────────────
// Change this to YOUR Gmail address
const BASE_EMAIL = "oscarfiverr@gmail.com";
const PASSWORD = "Test123456!";

interface TestUser {
  alias: string; // Gmail alias suffix
  fullName: string;
  role: "owner" | "admin" | "doctor" | "receptionist";
  orgName?: string; // Only for owners (creates new org)
  joinOrg?: string; // Org name to join (for non-owners)
}

const TEST_USERS: TestUser[] = [
  // ─── Org 1: Clínica Santa Rosa (full team) ───
  { alias: "owner1", fullName: "Dr. Carlos Mendoza", role: "owner", orgName: "Clínica Santa Rosa" },
  { alias: "admin1", fullName: "Ana García López", role: "admin", joinOrg: "Clínica Santa Rosa" },
  { alias: "doc1", fullName: "Dr. Roberto Sánchez", role: "doctor", joinOrg: "Clínica Santa Rosa" },
  { alias: "doc2", fullName: "Dra. María Flores", role: "doctor", joinOrg: "Clínica Santa Rosa" },
  { alias: "recep1", fullName: "Lucía Ramírez", role: "receptionist", joinOrg: "Clínica Santa Rosa" },

  // ─── Org 2: Consultorio Dr. Pérez (solo) ───
  { alias: "owner2", fullName: "Dr. Jorge Pérez", role: "owner", orgName: "Consultorio Dr. Pérez" },

  // ─── Org 3: Centro Médico Lima (medium team) ───
  { alias: "owner3", fullName: "Dra. Patricia Vargas", role: "owner", orgName: "Centro Médico Lima" },
  { alias: "doc3", fullName: "Dr. Fernando Torres", role: "doctor", joinOrg: "Centro Médico Lima" },
  { alias: "recep2", fullName: "Carmen Quispe", role: "receptionist", joinOrg: "Centro Médico Lima" },
];

// ─── HELPERS ────────────────────────────────────────────

function makeEmail(alias: string): string {
  const [user, domain] = BASE_EMAIL.split("@");
  return `${user}+${alias}@${domain}`;
}

async function createUser(email: string, fullName: string): Promise<string | null> {
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: PASSWORD,
    email_confirm: true, // Auto-confirm, no email needed
    user_metadata: { full_name: fullName },
  });

  if (error) {
    if (error.message.includes("already been registered")) {
      console.log(`  ⚠️  ${email} already exists, skipping`);
      // Get existing user ID
      const { data: users } = await admin.auth.admin.listUsers();
      const existing = users?.users?.find((u) => u.email === email);
      return existing?.id ?? null;
    }
    console.error(`  ❌ Error creating ${email}:`, error.message);
    return null;
  }

  console.log(`  ✅ Created user: ${email} (${fullName})`);
  return data.user.id;
}

async function createOrg(name: string, ownerId: string): Promise<string | null> {
  // Check if org already exists
  const { data: existing } = await admin
    .from("organizations")
    .select("id")
    .eq("name", name)
    .single();

  if (existing) {
    console.log(`  ⚠️  Org "${name}" already exists`);
    return existing.id;
  }

  const slug = name.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");
  const { data: org, error } = await admin
    .from("organizations")
    .insert({
      name,
      slug,
      owner_id: ownerId,
      organization_type: "independiente",
      is_active: true,
    })
    .select("id")
    .single();

  if (error) {
    console.error(`  ❌ Error creating org "${name}":`, error.message);
    return null;
  }

  console.log(`  ✅ Created org: ${name}`);
  return org.id;
}

async function addMember(userId: string, orgId: string, role: string): Promise<void> {
  // Check if membership exists
  const { data: existing } = await admin
    .from("organization_members")
    .select("id")
    .eq("user_id", userId)
    .eq("organization_id", orgId)
    .single();

  if (existing) {
    console.log(`  ⚠️  Membership already exists`);
    return;
  }

  const { error } = await admin.from("organization_members").insert({
    user_id: userId,
    organization_id: orgId,
    role,
    is_active: true,
  });

  if (error) {
    console.error(`  ❌ Error adding member:`, error.message);
  } else {
    console.log(`  ✅ Added as ${role}`);
  }
}

async function createDoctor(userId: string, orgId: string, fullName: string): Promise<void> {
  const { data: existing } = await admin
    .from("doctors")
    .select("id")
    .eq("user_id", userId)
    .single();

  if (existing) return;

  await admin.from("doctors").insert({
    organization_id: orgId,
    user_id: userId,
    full_name: fullName,
    specialty: "Medicina General",
    is_active: true,
  });
}

async function seedDefaultOffice(orgId: string): Promise<void> {
  const { data: existing } = await admin
    .from("offices")
    .select("id")
    .eq("organization_id", orgId)
    .limit(1)
    .single();

  if (existing) return;

  await admin.from("offices").insert({
    organization_id: orgId,
    name: "Consultorio 1",
    code: "C1",
    is_active: true,
  });
}

// ─── MAIN ───────────────────────────────────────────────

async function main() {
  console.log("\n🚀 Seeding test users...\n");
  console.log(`📧 Base email: ${BASE_EMAIL}`);
  console.log(`🔑 Password for all: ${PASSWORD}\n`);

  const orgMap = new Map<string, string>(); // orgName -> orgId

  // Pass 1: Create owners + their orgs
  for (const u of TEST_USERS.filter((u) => u.role === "owner")) {
    const email = makeEmail(u.alias);
    console.log(`\n👤 ${u.fullName} (${email}) — ${u.role}`);

    const userId = await createUser(email, u.fullName);
    if (!userId || !u.orgName) continue;

    const orgId = await createOrg(u.orgName, userId);
    if (!orgId) continue;

    orgMap.set(u.orgName, orgId);
    await addMember(userId, orgId, "owner");
    await seedDefaultOffice(orgId);
  }

  // Pass 2: Create non-owner members
  for (const u of TEST_USERS.filter((u) => u.role !== "owner")) {
    const email = makeEmail(u.alias);
    console.log(`\n👤 ${u.fullName} (${email}) — ${u.role}`);

    const userId = await createUser(email, u.fullName);
    if (!userId || !u.joinOrg) continue;

    const orgId = orgMap.get(u.joinOrg);
    if (!orgId) {
      // Try to find org in DB
      const { data } = await admin.from("organizations").select("id").eq("name", u.joinOrg).single();
      if (data) orgMap.set(u.joinOrg, data.id);
    }

    const finalOrgId = orgMap.get(u.joinOrg);
    if (!finalOrgId) {
      console.error(`  ❌ Org "${u.joinOrg}" not found`);
      continue;
    }

    await addMember(userId, finalOrgId, u.role);
    if (u.role === "doctor") {
      await createDoctor(userId, finalOrgId, u.fullName);
    }
  }

  // Summary
  console.log("\n\n📋 Test Accounts Summary:\n");
  console.log("┌─────────────────────────────────────────────────────────────────┐");
  console.log("│ Email                              │ Role         │ Password    │");
  console.log("├─────────────────────────────────────────────────────────────────┤");
  for (const u of TEST_USERS) {
    const email = makeEmail(u.alias).padEnd(35);
    const role = u.role.padEnd(13);
    console.log(`│ ${email}│ ${role}│ ${PASSWORD} │`);
  }
  console.log("└─────────────────────────────────────────────────────────────────┘");
  console.log(`\n✅ Done! All emails arrive to: ${BASE_EMAIL}\n`);
}

main().catch(console.error);
