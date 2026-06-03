// POST /api/service-imports/start
//
// Synchronous bulk import for the SERVICES catalog. Mirrors the patient
// import (app/api/patient-imports/start) but DELIBERATELY simpler:
//
//   - NO job-tracking table. The patient flow uses `patient_imports`
//     for audit rows, CSV storage backup and a DB `dedup_key`. Services
//     catalogs are tiny (typically < 100 rows) so we parse → validate →
//     resolve categories → insert all in a single request and return
//     { created, skipped, errors }. No polling, no Storage, no audit
//     table — there's nothing to mirror there for this volume.
//
// Flow:
//   1. Auth + resolve organization_id server-side via organization_members
//      (NEVER trust an org id from the client) + owner/admin role check.
//   2. Parse + validate rows (lib/service-imports/csv.ts).
//   3. Resolve categories by NAME for the org; auto-create any missing
//      categories (case-insensitive match against existing ones).
//   4. Dedup against existing services by (category_id, lower(name)) and
//      within the CSV itself.
//   5. Insert the rest via the service-role client.

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { NextRequest, NextResponse } from "next/server";
import { generalLimiter } from "@/lib/rate-limit";
import {
  parseCSV,
  autoMapColumns,
  mapRow,
  validateRow,
  normalizeForInsert,
  computeDedupKey,
  type RowValidation,
} from "@/lib/service-imports/csv";

export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_FILE_BYTES = 5 * 1024 * 1024; // 5 MB — service catalogs are small
const MAX_ROWS = 2000;
const MAX_ERROR_SUMMARY = 200;

type ErrorEntry = {
  row: number;
  name?: string | null;
  reason: string;
  code?: string | null;
};

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rl = generalLimiter(user.id);
  if (!rl.success) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  // ─── Resolve org + role server-side (same pattern as patient-imports) ──
  const { data: membership } = await supabase
    .from("organization_members")
    .select("organization_id, role")
    .eq("user_id", user.id)
    .limit(1)
    .single();

  if (!membership) {
    return NextResponse.json({ error: "no_organization" }, { status: 403 });
  }
  if (membership.role !== "owner" && membership.role !== "admin") {
    return NextResponse.json(
      { error: "Solo admins/owners pueden importar servicios" },
      { status: 403 }
    );
  }

  const organizationId = membership.organization_id;

  // ─── Parse multipart body ────────────────────────────────────
  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ error: "Body inválido" }, { status: 400 });
  }

  const file = formData.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Archivo requerido" }, { status: 400 });
  }
  if (file.size === 0) {
    return NextResponse.json({ error: "Archivo vacío" }, { status: 400 });
  }
  if (file.size > MAX_FILE_BYTES) {
    return NextResponse.json(
      { error: "El archivo no puede superar 5MB" },
      { status: 400 }
    );
  }

  const csvText = await file.text();
  const { headers, rows } = parseCSV(csvText);
  if (headers.length === 0 || rows.length === 0) {
    return NextResponse.json(
      { error: "El archivo está vacío o no tiene formato CSV válido" },
      { status: 400 }
    );
  }
  if (rows.length > MAX_ROWS) {
    return NextResponse.json(
      { error: `Máximo ${MAX_ROWS} filas por importación` },
      { status: 400 }
    );
  }

  const columnMapping = autoMapColumns(headers);
  const mappedFields = Object.values(columnMapping).filter(Boolean);
  if (!mappedFields.includes("name") || !mappedFields.includes("category")) {
    return NextResponse.json(
      {
        error:
          "El archivo debe incluir al menos las columnas Servicio (nombre) y Categoría",
      },
      { status: 400 }
    );
  }

  // ─── Validate rows ───────────────────────────────────────────
  const validations: RowValidation[] = rows.map((raw, idx) => {
    const data = mapRow(raw, columnMapping);
    return validateRow(data, idx, raw);
  });

  const validRows = validations.filter((v) => v.errors.length === 0);
  const errorEntries: ErrorEntry[] = validations
    .filter((v) => v.errors.length > 0)
    .map((v) => ({
      row: v.row,
      name: v.data.name || null,
      reason: v.errors.join("; "),
      code: "validation",
    }));

  // ─── Intra-CSV dedup (category|name) ─────────────────────────
  const seen = new Set<string>();
  const intraDuplicates: ErrorEntry[] = [];
  const uniqueValid: RowValidation[] = [];
  for (const v of validRows) {
    const key = computeDedupKey(v.data);
    if (seen.has(key)) {
      intraDuplicates.push({
        row: v.row,
        name: v.data.name || null,
        reason: "Servicio duplicado dentro del CSV",
        code: "intra_duplicate",
      });
    } else {
      seen.add(key);
      uniqueValid.push(v);
    }
  }

  // All writes go through the service-role client. RLS still protects
  // direct PostgREST traffic; we enforced org + role above.
  const admin = createAdminClient();

  // ─── Resolve / auto-create categories by name ─────────────────
  // Build a case-insensitive map of existing category name → id for the org.
  const { data: existingCats, error: catsErr } = await admin
    .from("service_categories")
    .select("id, name")
    .eq("organization_id", organizationId);

  if (catsErr) {
    return NextResponse.json(
      { error: "No se pudieron leer las categorías" },
      { status: 500 }
    );
  }

  const categoryIdByName = new Map<string, string>();
  for (const c of existingCats ?? []) {
    categoryIdByName.set((c.name ?? "").trim().toLowerCase(), c.id as string);
  }

  // Determine which category names are referenced by valid rows but missing.
  const neededCategories = new Map<string, string>(); // lower → display name
  for (const v of uniqueValid) {
    const display = (v.data.category ?? "").trim();
    const key = display.toLowerCase();
    if (key && !categoryIdByName.has(key) && !neededCategories.has(key)) {
      neededCategories.set(key, display);
    }
  }

  const createdCategories: string[] = [];
  for (const [key, display] of neededCategories) {
    const { data: newCat, error: createErr } = await admin
      .from("service_categories")
      .insert({ organization_id: organizationId, name: display })
      .select("id")
      .single();
    if (createErr || !newCat) {
      // Could be a race (unique violation) — re-fetch the existing one.
      const { data: refetched } = await admin
        .from("service_categories")
        .select("id")
        .eq("organization_id", organizationId)
        .ilike("name", display)
        .limit(1)
        .single();
      if (refetched) {
        categoryIdByName.set(key, refetched.id as string);
      }
      // If still missing, rows referencing this category will fall to failed.
    } else {
      categoryIdByName.set(key, newCat.id as string);
      createdCategories.push(display);
    }
  }

  // ─── DB-side dedup against existing services ─────────────────
  // Pull existing (category_id, name) pairs for the org so we can flag
  // services that already exist.
  const { data: existingServices } = await admin
    .from("services")
    .select("name, category_id")
    .eq("organization_id", organizationId);

  const existingServiceKeys = new Set<string>();
  for (const s of existingServices ?? []) {
    if (s.category_id && s.name) {
      existingServiceKeys.add(`${s.category_id}|${(s.name as string).trim().toLowerCase()}`);
    }
  }

  // ─── Build insert records ────────────────────────────────────
  const dbDuplicates: ErrorEntry[] = [];
  const failedEntries: ErrorEntry[] = [];
  type ServiceInsertRecord = {
    organization_id: string;
    name: string;
    base_price: number;
    duration_minutes: number;
    category_id: string;
    is_active: boolean;
  };
  const toInsert: { record: ServiceInsertRecord; row: number; name: string }[] = [];

  for (const v of uniqueValid) {
    const norm = normalizeForInsert(v.data);
    const catId = categoryIdByName.get(norm.category.toLowerCase());
    if (!catId) {
      failedEntries.push({
        row: v.row,
        name: norm.name,
        reason: `No se pudo crear/resolver la categoría "${norm.category}"`,
        code: "category_resolve_failed",
      });
      continue;
    }
    const dedupKey = `${catId}|${norm.name.toLowerCase()}`;
    if (existingServiceKeys.has(dedupKey)) {
      dbDuplicates.push({
        row: v.row,
        name: norm.name,
        reason: "Ya existe un servicio con el mismo nombre en esa categoría",
        code: "db_duplicate",
      });
      continue;
    }
    existingServiceKeys.add(dedupKey);
    toInsert.push({
      record: {
        organization_id: organizationId,
        name: norm.name,
        base_price: norm.base_price,
        duration_minutes: norm.duration_minutes,
        category_id: catId,
        is_active: norm.is_active,
      },
      row: v.row,
      name: norm.name,
    });
  }

  // ─── Chunked insert ──────────────────────────────────────────
  let inserted = 0;
  const CHUNK_SIZE = 100;
  for (let i = 0; i < toInsert.length; i += CHUNK_SIZE) {
    const chunk = toInsert.slice(i, i + CHUNK_SIZE);
    const { data: ok, error: chunkErr } = await admin
      .from("services")
      .insert(chunk.map((c) => c.record))
      .select("id");

    if (chunkErr) {
      // Fall back to per-row inserts to identify which rows failed.
      for (const c of chunk) {
        const { error: singleErr } = await admin
          .from("services")
          .insert(c.record)
          .select("id")
          .single();
        if (singleErr) {
          failedEntries.push({
            row: c.row,
            name: c.name,
            reason: singleErr.message,
            code: singleErr.code ?? null,
          });
        } else {
          inserted++;
        }
      }
    } else {
      inserted += ok?.length ?? chunk.length;
    }
  }

  // ─── Summary ─────────────────────────────────────────────────
  const allErrors: ErrorEntry[] = [
    ...errorEntries,
    ...intraDuplicates,
    ...dbDuplicates,
    ...failedEntries,
  ];
  const skipped = intraDuplicates.length + dbDuplicates.length;
  const failed = errorEntries.length + failedEntries.length;

  return NextResponse.json({
    total_rows: rows.length,
    created: inserted,
    skipped,
    failed,
    created_categories: createdCategories,
    errors: allErrors.slice(0, MAX_ERROR_SUMMARY),
  });
}
