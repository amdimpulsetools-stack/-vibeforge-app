// POST /api/patient-imports/start
//
// Server-side replacement for the in-browser bulk patient import flow.
// Day 4 of pre-launch blockers (see docs/launch-prep/bulk-import-audit.md).
//
// Receives a multipart/form-data body with:
//   - file:   the original CSV (kept verbatim in Storage for audit).
//   - mapping (optional, JSON string): the column → field mapping the
//             admin confirmed in the UI. If absent we auto-map headers.
//
// Steps (all synchronous; the route runs within Vercel's request
// timeout — for >1k row imports the founder is warned in the UI):
//   1. Auth + admin role check.
//   2. Create the `patient_imports` audit row (status='uploading').
//   3. Upload the original CSV to `patient-imports/{org}/{id}.csv`.
//   4. Parse + validate rows; dedupe within CSV and against existing
//      patients via the new `dedup_key` (mig 143).
//   5. Insert in chunks of 100 with `onConflict=dedup_key`. Errors on
//      a chunk do NOT abort — they fall back to per-row inserts so we
//      can report exactly which rows failed.
//   6. Finalise the audit row (status='completed' or 'failed') + return.

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { NextRequest, NextResponse } from "next/server";
import { generalLimiter } from "@/lib/rate-limit";
import {
  parseCSV,
  autoMapColumns,
  mapRow,
  validateRow,
  computeDedupKey,
  type MappedPatient,
  type RowValidation,
} from "@/lib/patient-imports/csv";

export const runtime = "nodejs";
export const maxDuration = 60;

const CHUNK_SIZE = 100;
const MAX_FILE_BYTES = 10 * 1024 * 1024; // 10 MB
const MAX_ROWS = 5000;
const MAX_ERROR_SUMMARY = 200;

type ErrorEntry = {
  row: number;
  dni?: string | null;
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

  // Admin role check — only owner/admin can mass-import patients.
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
      { error: "Solo admins/owners pueden importar pacientes" },
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
  const mappingRaw = formData.get("mapping");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Archivo requerido" }, { status: 400 });
  }
  if (file.size === 0) {
    return NextResponse.json({ error: "Archivo vacío" }, { status: 400 });
  }
  if (file.size > MAX_FILE_BYTES) {
    return NextResponse.json(
      { error: "El archivo no puede superar 10MB" },
      { status: 400 }
    );
  }

  let userMapping: Record<string, string> | null = null;
  if (typeof mappingRaw === "string" && mappingRaw.length > 0) {
    try {
      const parsed: unknown = JSON.parse(mappingRaw);
      if (parsed && typeof parsed === "object") {
        userMapping = parsed as Record<string, string>;
      }
    } catch {
      return NextResponse.json({ error: "Mapping inválido" }, { status: 400 });
    }
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

  // Build the column mapping. If the UI sent one we trust it (after
  // narrowing the values). Otherwise auto-map.
  const ALLOWED_FIELDS: ReadonlySet<keyof MappedPatient> = new Set([
    "first_name",
    "last_name",
    "dni",
    "document_type",
    "phone",
    "email",
    "birth_date",
    "departamento",
    "distrito",
    "is_foreigner",
    "nationality",
    "notes",
    "origin",
    "referral_source",
    "custom_field_1",
    "custom_field_2",
  ]);
  const columnMapping: Record<string, keyof MappedPatient | ""> = {};
  if (userMapping) {
    for (const h of headers) {
      const raw = userMapping[h];
      if (typeof raw === "string" && (ALLOWED_FIELDS as Set<string>).has(raw)) {
        columnMapping[h] = raw as keyof MappedPatient;
      } else {
        columnMapping[h] = "";
      }
    }
  } else {
    Object.assign(columnMapping, autoMapColumns(headers));
  }

  // Quick mapping sanity check.
  const mappedFields = Object.values(columnMapping).filter(Boolean);
  if (
    !mappedFields.includes("first_name") ||
    !mappedFields.includes("last_name")
  ) {
    return NextResponse.json(
      { error: "El mapeo debe incluir Nombre y Apellido" },
      { status: 400 }
    );
  }

  // ─── Create the audit row (admin client, bypasses RLS) ───────
  // We use the service-role client because the API does all writes;
  // RLS still protects direct PostgREST traffic.
  const admin = createAdminClient();

  const { data: importRow, error: insertImportErr } = await admin
    .from("patient_imports")
    .insert({
      organization_id: organizationId,
      imported_by_user_id: user.id,
      csv_filename: file.name,
      total_rows: rows.length,
      status: "uploading",
    })
    .select("id")
    .single();

  if (insertImportErr || !importRow) {
    return NextResponse.json(
      { error: "No se pudo crear el registro de importación" },
      { status: 500 }
    );
  }
  const importId = importRow.id as string;
  const storagePath = `${organizationId}/${importId}.csv`;

  // Upload the original CSV (best-effort; on failure we mark status and
  // still proceed with the import — losing the backup is bad but not
  // worse than losing the data).
  const csvBuffer = new Blob([csvText], { type: "text/csv" });
  const { error: uploadErr } = await admin.storage
    .from("patient-imports")
    .upload(storagePath, csvBuffer, { contentType: "text/csv", upsert: false });

  if (uploadErr) {
    // Continue but note in error_summary.
    await admin
      .from("patient_imports")
      .update({
        status: "processing",
        error_summary: [
          { row: 0, reason: `csv_backup_failed: ${uploadErr.message}` },
        ],
      })
      .eq("id", importId);
  } else {
    await admin
      .from("patient_imports")
      .update({ status: "processing", csv_storage_path: storagePath })
      .eq("id", importId);
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
      dni: v.data.dni ?? null,
      reason: v.errors.join("; "),
      code: "validation",
    }));

  // ─── Intra-CSV dedup ─────────────────────────────────────────
  const seen = new Set<string>();
  const intraDuplicates: ErrorEntry[] = [];
  const uniqueValid: RowValidation[] = [];
  for (const v of validRows) {
    const key = computeDedupKey(v.data);
    if (seen.has(key)) {
      intraDuplicates.push({
        row: v.row,
        dni: v.data.dni ?? null,
        reason: "Duplicado dentro del CSV",
        code: "intra_duplicate",
      });
    } else {
      seen.add(key);
      uniqueValid.push(v);
    }
  }

  // ─── DB-side dedup pre-check ─────────────────────────────────
  // Pull existing dedup_keys for this org limited to the candidates,
  // so we can flag duplicates without depending on the 23505 retry path.
  const candidateKeys = uniqueValid.map((v) => computeDedupKey(v.data));
  let existingKeys = new Set<string>();
  if (candidateKeys.length > 0) {
    // Postgres has a parameter limit; chunk the IN clause.
    for (let i = 0; i < candidateKeys.length; i += 500) {
      const slice = candidateKeys.slice(i, i + 500);
      const { data: existing } = await admin
        .from("patients")
        .select("dedup_key")
        .eq("organization_id", organizationId)
        .in("dedup_key", slice);
      for (const e of existing ?? []) {
        if (e.dedup_key) existingKeys.add(e.dedup_key);
      }
    }
  }

  const dbDuplicates: ErrorEntry[] = [];
  const toInsert: RowValidation[] = [];
  for (const v of uniqueValid) {
    const key = computeDedupKey(v.data);
    if (existingKeys.has(key)) {
      dbDuplicates.push({
        row: v.row,
        dni: v.data.dni ?? null,
        reason: "Ya existe un paciente con el mismo identificador",
        code: "db_duplicate",
      });
    } else {
      toInsert.push(v);
    }
  }

  // ─── Chunked insert ──────────────────────────────────────────
  let inserted = 0;
  const failedEntries: ErrorEntry[] = [];

  for (let i = 0; i < toInsert.length; i += CHUNK_SIZE) {
    const chunk = toInsert.slice(i, i + CHUNK_SIZE);
    const records = chunk.map((v) => recordFor(v, organizationId, user.id));

    const { data: ok, error: chunkErr } = await admin
      .from("patients")
      .insert(records)
      .select("id");

    if (chunkErr) {
      // Fall back to per-row to identify exactly which rows failed.
      for (let j = 0; j < chunk.length; j++) {
        const v = chunk[j];
        const single = recordFor(v, organizationId, user.id);
        const { error: singleErr } = await admin
          .from("patients")
          .insert(single)
          .select("id")
          .single();
        if (singleErr) {
          if (singleErr.code === "23505") {
            // Race: someone inserted between our pre-check and now.
            dbDuplicates.push({
              row: v.row,
              dni: v.data.dni ?? null,
              reason: "Duplicado detectado por la BD",
              code: "23505",
            });
          } else {
            failedEntries.push({
              row: v.row,
              dni: v.data.dni ?? null,
              reason: singleErr.message,
              code: singleErr.code ?? null,
            });
          }
        } else {
          inserted++;
          existingKeys.add(computeDedupKey(v.data));
        }
      }
    } else {
      inserted += ok?.length ?? records.length;
      for (const v of chunk) existingKeys.add(computeDedupKey(v.data));
    }
  }

  // ─── Finalise audit row ──────────────────────────────────────
  const allErrors: ErrorEntry[] = [
    ...errorEntries,
    ...intraDuplicates,
    ...dbDuplicates,
    ...failedEntries,
  ];
  const errorSummary = allErrors.slice(0, MAX_ERROR_SUMMARY);
  const totalDuplicates = intraDuplicates.length + dbDuplicates.length;
  const totalFailed = errorEntries.length + failedEntries.length;

  await admin
    .from("patient_imports")
    .update({
      finished_at: new Date().toISOString(),
      status: "completed",
      inserted_rows: inserted,
      skipped_duplicates: totalDuplicates,
      failed_rows: totalFailed,
      error_summary: errorSummary,
    })
    .eq("id", importId);

  return NextResponse.json({
    import_id: importId,
    status: "completed",
    total_rows: rows.length,
    inserted_rows: inserted,
    skipped_duplicates: totalDuplicates,
    failed_rows: totalFailed,
  });
}

// Build an Insert record from a validated row. Truncates over-long
// optional fields the same way the legacy modal did so we stay
// behaviour-compatible.
function recordFor(
  v: RowValidation,
  organizationId: string,
  userId: string
) {
  const p = v.data;
  const email = p.email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(p.email) ? p.email : null;
  return {
    organization_id: organizationId,
    first_name: p.first_name,
    last_name: p.last_name,
    dni: p.dni && p.dni.length <= 20 ? p.dni : null,
    document_type:
      p.document_type && ["DNI", "CE", "Pasaporte"].includes(p.document_type)
        ? p.document_type
        : ("DNI" as const),
    phone: p.phone ? p.phone.substring(0, 20) : null,
    email,
    birth_date: p.birth_date ?? null,
    departamento: p.departamento ?? null,
    distrito: p.distrito ?? null,
    is_foreigner: p.is_foreigner ?? false,
    nationality: p.nationality ?? null,
    notes: p.notes ? p.notes.substring(0, 500) : null,
    origin: p.origin ?? null,
    referral_source: p.referral_source ? p.referral_source.substring(0, 200) : null,
    custom_field_1: p.custom_field_1 ? p.custom_field_1.substring(0, 200) : null,
    custom_field_2: p.custom_field_2 ? p.custom_field_2.substring(0, 200) : null,
    status: "active" as const,
    created_by: userId,
  };
}
