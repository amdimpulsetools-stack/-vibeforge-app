// Google Sheets mirror — org-level, one-way (Yenda → Google Sheets).
//
// A nightly backup of the clinic's appointments into a spreadsheet that lives
// in the CLIENT's own Google Drive. Single source of truth stays Yenda: the
// sheet is a read-only mirror (anything typed into it is overwritten on the
// next run and never travels back). Same spirit as lib/google-calendar.ts.
//
// Design notes:
//   - Raw fetch, no `googleapis` SDK (mirrors google-calendar.ts).
//   - Reuses the calendar integration ROW and its token lifecycle
//     (getValidAccessToken / markSyncError / markSyncSuccess exported from
//     google-calendar.ts) — one Google account, two products.
//   - Scope: drive.file only (NOT the broad `spreadsheets` scope). We can
//     only touch the file we created. Orgs missing drive.file are skipped;
//     the UI prompts them to reconnect.
//   - Privacy (Ley 29733): ONLY operational fields reach the sheet. No notes,
//     DNI, email or birth date — the file leaves Yenda's boundary.
//
// The whole per-org orchestration lives in `runSheetsMirrorForOrg` so the
// nightly cron and the "Actualizar hoja ahora" button share one code path.

import { createAdminClient } from "@/lib/supabase/admin";
import {
  getIntegration,
  getValidAccessToken,
  hasDriveScope,
  markSyncError,
  markSyncSuccess,
  type GCalIntegration,
} from "@/lib/google-calendar";
import {
  SHEET_EXPORT_COLUMNS,
  formatCreatedLima,
  formatDateEs,
  mapStatusEs,
} from "@/lib/sheets-columns";

// ── Constants ────────────────────────────────────────────────────────────────

const SHEETS_API = "https://sheets.googleapis.com/v4/spreadsheets";
const LIMA_OFFSET_MS = 5 * 60 * 60 * 1000; // Peru is a stable UTC-5 (no DST).

// Window mirrored into the sheet: 30 days back, 90 days forward.
const WINDOW_DAYS_BACK = 30;
const WINDOW_DAYS_FORWARD = 90;

// Tab titles. "📅 Hoy" is forced to index 0 so it's the first thing they see.
const TAB_HOY = "📅 Hoy";
const TAB_CITAS = "Citas";
const TAB_LEEME = "Léeme";

// Exact column order for the two data tabs (Hoy + Citas). Defined in the
// client-safe lib/sheets-columns.ts so the CSV export matches 1:1.
const COLUMNS = SHEET_EXPORT_COLUMNS;
const COL_COUNT = COLUMNS.length; // 14 (A..N)

// 0-based column indices that need special number formats / handling.
const COL_FECHA = 0;
const COL_TELEFONO = 4;
const COL_ESTADO = 8;
const COL_PRECIO = 10;
const COL_CREADA = 12;

// ── Types ────────────────────────────────────────────────────────────────────

/** The calendar integration row plus the Sheets columns added in mig 179. */
type SheetsIntegration = GCalIntegration & {
  sheets_enabled?: boolean | null;
  sheets_spreadsheet_id?: string | null;
};

interface AppointmentRow {
  id: string;
  patient_name: string | null;
  patient_phone: string | null;
  appointment_date: string; // YYYY-MM-DD
  start_time: string; // HH:MM:SS
  end_time: string; // HH:MM:SS
  status: string;
  origin: string | null;
  payment_method: string | null;
  price_snapshot: number | null;
  created_at: string; // timestamptz (UTC)
  doctors: { full_name: string } | null;
  offices: { name: string } | null;
  services: { name: string } | null;
}

interface SheetMeta {
  sheetId: number;
  title: string;
  index: number;
  conditionalFormatCount: number;
}

export interface MirrorResult {
  ok: boolean;
  status: "ok" | "skipped" | "error";
  reason?: string;
  spreadsheetId?: string;
  rows?: number;
  todayRows?: number;
}

// ── Time helpers (Lima wall clock, no TZ library) ────────────────────────────

function toLima(dateUtc: Date): Date {
  // Shift the UTC instant back 5h, then read UTC fields → Lima wall clock.
  return new Date(dateUtc.getTime() - LIMA_OFFSET_MS);
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

/** Today's date in Lima as YYYY-MM-DD (matches appointments.appointment_date). */
function todayLimaISO(): string {
  const l = toLima(new Date());
  return `${l.getUTCFullYear()}-${pad(l.getUTCMonth() + 1)}-${pad(l.getUTCDate())}`;
}

/** "Última actualización" stamp shown in the Léeme tab (formatCreatedLima is
 *  imported from the shared column module). */
function nowStampLima(): string {
  return formatCreatedLima(new Date().toISOString());
}

// ── Low-level Sheets API (raw fetch) ─────────────────────────────────────────

async function sheetsFetch(
  token: string,
  path: string,
  init?: RequestInit,
  attempt = 0
): Promise<Response> {
  const res = await fetch(`${SHEETS_API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  // Simple backoff on rate limiting.
  if (res.status === 429 && attempt < 3) {
    const waitMs = 1000 * Math.pow(2, attempt);
    await new Promise((r) => setTimeout(r, waitMs));
    return sheetsFetch(token, path, init, attempt + 1);
  }
  return res;
}

/** Creates the spreadsheet with the 3 tabs already in the right order. */
async function createSpreadsheet(
  token: string,
  title: string
): Promise<{ spreadsheetId: string; sheets: Record<string, number> }> {
  const res = await sheetsFetch(token, "", {
    method: "POST",
    body: JSON.stringify({
      // es_PE no está entre los locales que acepta la Sheets API (rechaza con
      // 400 "Unsupported locale"). es_MX comparte las convenciones de Perú
      // (punto decimal, dd/mm/aaaa), así que la hoja se comporta igual.
      properties: { title, locale: "es_MX", timeZone: "America/Lima" },
      sheets: [
        { properties: { title: TAB_HOY, index: 0 } },
        { properties: { title: TAB_CITAS, index: 1 } },
        { properties: { title: TAB_LEEME, index: 2 } },
      ],
    }),
  });
  if (!res.ok) {
    throw new Error(`Sheets create failed (${res.status}): ${await res.text()}`);
  }
  const json = (await res.json()) as {
    spreadsheetId: string;
    sheets: { properties: { sheetId: number; title: string } }[];
  };
  const map: Record<string, number> = {};
  for (const s of json.sheets) map[s.properties.title] = s.properties.sheetId;
  return { spreadsheetId: json.spreadsheetId, sheets: map };
}

/**
 * Reads sheet metadata. Returns null on 404 (file deleted by the client) so
 * the caller can recreate it. Throws on any other error.
 */
async function getSpreadsheetMeta(
  token: string,
  spreadsheetId: string
): Promise<SheetMeta[] | null> {
  const res = await sheetsFetch(
    token,
    `/${spreadsheetId}?fields=sheets(properties(sheetId,title,index),conditionalFormats)`
  );
  if (res.status === 404) return null;
  if (!res.ok) {
    throw new Error(`Sheets get failed (${res.status}): ${await res.text()}`);
  }
  const json = (await res.json()) as {
    sheets: {
      properties: { sheetId: number; title: string; index: number };
      conditionalFormats?: unknown[];
    }[];
  };
  return json.sheets.map((s) => ({
    sheetId: s.properties.sheetId,
    title: s.properties.title,
    index: s.properties.index,
    conditionalFormatCount: s.conditionalFormats?.length ?? 0,
  }));
}

async function batchUpdate(
  token: string,
  spreadsheetId: string,
  requests: unknown[]
): Promise<void> {
  if (requests.length === 0) return;
  const res = await sheetsFetch(token, `/${spreadsheetId}:batchUpdate`, {
    method: "POST",
    body: JSON.stringify({ requests }),
  });
  if (!res.ok) {
    throw new Error(`Sheets batchUpdate failed (${res.status}): ${await res.text()}`);
  }
}

async function valuesUpdate(
  token: string,
  spreadsheetId: string,
  range: string,
  values: (string | number)[][]
): Promise<void> {
  const res = await sheetsFetch(
    token,
    `/${spreadsheetId}/values/${encodeURIComponent(range)}?valueInputOption=USER_ENTERED`,
    { method: "PUT", body: JSON.stringify({ values }) }
  );
  if (!res.ok) {
    throw new Error(`Sheets values.update failed (${res.status}): ${await res.text()}`);
  }
}

async function valuesClear(
  token: string,
  spreadsheetId: string,
  range: string
): Promise<void> {
  const res = await sheetsFetch(
    token,
    `/${spreadsheetId}/values/${encodeURIComponent(range)}:clear`,
    { method: "POST", body: JSON.stringify({}) }
  );
  if (!res.ok) {
    throw new Error(`Sheets values.clear failed (${res.status}): ${await res.text()}`);
  }
}

// ── Row building ─────────────────────────────────────────────────────────────

/**
 * Turns an appointment into a spreadsheet row (USER_ENTERED values):
 *   - Fecha cita as dd/mm/aaaa (es_PE locale parses it to a real date; the
 *     column carries a DATE number format).
 *   - Teléfono forced to text with a leading apostrophe so "+51" survives.
 *   - Creada el as dd/mm/aaaa HH:MM in Lima time.
 *   - Precio as a raw number (currency format on the column).
 */
function buildRow(a: AppointmentRow): (string | number)[] {
  const phone = a.patient_phone ? `'${a.patient_phone}` : "";
  return [
    formatDateEs(a.appointment_date), // Fecha cita
    a.start_time?.slice(0, 5) ?? "", // Hora
    a.end_time?.slice(0, 5) ?? "", // Hasta
    a.patient_name ?? "", // Paciente
    phone, // Teléfono (forced text)
    a.doctors?.full_name ?? "", // Doctor
    a.services?.name ?? "", // Servicio
    a.offices?.name ?? "", // Sede
    mapStatusEs(a.status), // Estado
    a.origin ?? "", // Origen
    a.price_snapshot != null ? Number(a.price_snapshot) : "", // Precio S/
    a.payment_method ?? "", // Pago
    formatCreatedLima(a.created_at), // Creada el
    a.id, // ID Yenda
  ];
}

// ── Formatting requests for a data tab ───────────────────────────────────────

function columnFormatRequests(sheetId: number, rowCount: number): unknown[] {
  const dataEndRow = rowCount + 1; // header + data
  const reqs: unknown[] = [
    // Header: bold + light background.
    {
      repeatCell: {
        range: { sheetId, startRowIndex: 0, endRowIndex: 1 },
        cell: {
          userEnteredFormat: {
            textFormat: { bold: true },
            backgroundColor: { red: 0.9, green: 0.95, blue: 0.92 },
          },
        },
        fields: "userEnteredFormat(textFormat,backgroundColor)",
      },
    },
    // Freeze the header row.
    {
      updateSheetProperties: {
        properties: { sheetId, gridProperties: { frozenRowCount: 1 } },
        fields: "gridProperties.frozenRowCount",
      },
    },
    // Fecha cita → DATE dd/mm/yyyy.
    {
      repeatCell: {
        range: { sheetId, startRowIndex: 1, startColumnIndex: COL_FECHA, endColumnIndex: COL_FECHA + 1 },
        cell: { userEnteredFormat: { numberFormat: { type: "DATE", pattern: "dd/mm/yyyy" } } },
        fields: "userEnteredFormat.numberFormat",
      },
    },
    // Teléfono → plain text (belt-and-suspenders with the leading apostrophe).
    {
      repeatCell: {
        range: { sheetId, startRowIndex: 1, startColumnIndex: COL_TELEFONO, endColumnIndex: COL_TELEFONO + 1 },
        cell: { userEnteredFormat: { numberFormat: { type: "TEXT" } } },
        fields: "userEnteredFormat.numberFormat",
      },
    },
    // Precio S/ → currency.
    {
      repeatCell: {
        range: { sheetId, startRowIndex: 1, startColumnIndex: COL_PRECIO, endColumnIndex: COL_PRECIO + 1 },
        cell: { userEnteredFormat: { numberFormat: { type: "CURRENCY", pattern: "\"S/\" #,##0.00" } } },
        fields: "userEnteredFormat.numberFormat",
      },
    },
    // Creada el → DATE_TIME dd/mm/yyyy hh:mm.
    {
      repeatCell: {
        range: { sheetId, startRowIndex: 1, startColumnIndex: COL_CREADA, endColumnIndex: COL_CREADA + 1 },
        cell: { userEnteredFormat: { numberFormat: { type: "DATE_TIME", pattern: "dd/mm/yyyy hh:mm" } } },
        fields: "userEnteredFormat.numberFormat",
      },
    },
    // Basic filter over the whole grid (replaces any existing one — 1 per sheet).
    {
      setBasicFilter: {
        filter: {
          range: { sheetId, startRowIndex: 0, endRowIndex: dataEndRow, startColumnIndex: 0, endColumnIndex: COL_COUNT },
        },
      },
    },
  ];

  // Conditional formatting on the Estado column: green Atendida, red
  // Cancelada / No asistió. Inserted at index 0/1/2.
  const estadoRange = {
    sheetId,
    startRowIndex: 1,
    endRowIndex: dataEndRow,
    startColumnIndex: COL_ESTADO,
    endColumnIndex: COL_ESTADO + 1,
  };
  const green = { red: 0.85, green: 0.95, blue: 0.85 };
  const greenText = { red: 0.11, green: 0.45, blue: 0.18 };
  const red = { red: 0.99, green: 0.87, blue: 0.87 };
  const redText = { red: 0.7, green: 0.11, blue: 0.11 };
  const rule = (index: number, value: string, bg: object, fg: object) => ({
    addConditionalFormatRule: {
      index,
      rule: {
        ranges: [estadoRange],
        booleanRule: {
          condition: { type: "TEXT_EQ", values: [{ userEnteredValue: value }] },
          format: { backgroundColor: bg, textFormat: { foregroundColor: fg } },
        },
      },
    },
  });
  reqs.push(rule(0, "Atendida", green, greenText));
  reqs.push(rule(1, "Cancelada", red, redText));
  reqs.push(rule(2, "No asistió", red, redText));

  return reqs;
}

// ── Tab writers ──────────────────────────────────────────────────────────────

async function writeDataTab(
  token: string,
  spreadsheetId: string,
  meta: SheetMeta,
  rows: AppointmentRow[]
): Promise<void> {
  // 1. Clear stale content so a shrinking dataset leaves no orphan rows.
  await valuesClear(token, spreadsheetId, meta.title);

  // 2. Write header + data.
  const values: (string | number)[][] = [[...COLUMNS], ...rows.map(buildRow)];
  await valuesUpdate(token, spreadsheetId, `${meta.title}!A1`, values);

  // 3. Drop existing conditional format rules (they accumulate otherwise),
  //    then (re)apply all formatting.
  const deletes: unknown[] = [];
  for (let i = meta.conditionalFormatCount - 1; i >= 0; i--) {
    deletes.push({ deleteConditionalFormatRule: { sheetId: meta.sheetId, index: i } });
  }
  await batchUpdate(token, spreadsheetId, [
    ...deletes,
    ...columnFormatRequests(meta.sheetId, rows.length),
  ]);
}

async function writeLeemeTab(
  token: string,
  spreadsheetId: string,
  meta: SheetMeta
): Promise<void> {
  await valuesClear(token, spreadsheetId, meta.title);
  await valuesUpdate(token, spreadsheetId, `${meta.title}!A1`, [
    [
      "Esta hoja la genera Yenda automáticamente cada noche. Cualquier cambio que hagas aquí se sobrescribe y NO llega a Yenda — la agenda se edita en yenda.app. Ventana: citas desde hace 30 días hasta 90 días adelante.",
    ],
    [""],
    [`Última actualización: ${nowStampLima()}`],
  ]);
  await batchUpdate(token, spreadsheetId, [
    {
      repeatCell: {
        range: { sheetId: meta.sheetId, startRowIndex: 0, endRowIndex: 1 },
        cell: { userEnteredFormat: { textFormat: { bold: true }, wrapStrategy: "WRAP" } },
        fields: "userEnteredFormat(textFormat,wrapStrategy)",
      },
    },
  ]);
}

/**
 * Ensures the 3 tabs exist in the right order (Hoy=0, Citas=1, Léeme=2).
 * Adds any missing tab and fixes the ordering. Returns fresh metadata.
 */
async function ensureTabs(
  token: string,
  spreadsheetId: string,
  meta: SheetMeta[]
): Promise<SheetMeta[]> {
  const byTitle = new Map(meta.map((m) => [m.title, m]));
  const wanted = [TAB_HOY, TAB_CITAS, TAB_LEEME];
  const reqs: unknown[] = [];

  for (let i = 0; i < wanted.length; i++) {
    const title = wanted[i];
    const existing = byTitle.get(title);
    if (!existing) {
      reqs.push({ addSheet: { properties: { title, index: i } } });
    } else if (existing.index !== i) {
      reqs.push({
        updateSheetProperties: { properties: { sheetId: existing.sheetId, index: i }, fields: "index" },
      });
    }
  }

  if (reqs.length > 0) {
    await batchUpdate(token, spreadsheetId, reqs);
    const refreshed = await getSpreadsheetMeta(token, spreadsheetId);
    if (refreshed) return refreshed;
  }
  return meta;
}

// ── Public orchestrator (shared by cron + manual refresh) ────────────────────

/**
 * Mirrors one org's appointments into its Google Sheet. Idempotent and
 * self-recovering: creates the spreadsheet if missing or if the client
 * deleted it (404). Marks sync success/error on the integration row.
 *
 * Never throws — always returns a MirrorResult so callers can keep iterating.
 */
export async function runSheetsMirrorForOrg(
  organizationId: string,
  orgName?: string
): Promise<MirrorResult> {
  const integration = (await getIntegration(organizationId)) as SheetsIntegration | null;
  if (!integration) {
    return { ok: false, status: "skipped", reason: "no_integration" };
  }
  if (!integration.sheets_enabled) {
    return { ok: false, status: "skipped", reason: "sheets_disabled" };
  }
  if (!hasDriveScope(integration.scope)) {
    return { ok: false, status: "skipped", reason: "missing_drive_scope" };
  }

  const admin = createAdminClient();

  try {
    const token = await getValidAccessToken(integration);

    // Resolve org name for the spreadsheet title.
    let title = orgName;
    if (!title) {
      const { data: org } = await admin
        .from("organizations")
        .select("name")
        .eq("id", organizationId)
        .maybeSingle();
      title = (org as { name?: string } | null)?.name ?? "Clínica";
    }
    const spreadsheetTitle = `Yenda — Citas — ${title}`;

    // Fetch the appointment window (-30 / +90 days, Lima).
    const today = todayLimaISO();
    const dateFrom = new Date(Date.parse(`${today}T00:00:00Z`) - WINDOW_DAYS_BACK * 86400000)
      .toISOString()
      .slice(0, 10);
    const dateTo = new Date(Date.parse(`${today}T00:00:00Z`) + WINDOW_DAYS_FORWARD * 86400000)
      .toISOString()
      .slice(0, 10);

    const { data: apptData, error: apptErr } = await admin
      .from("appointments")
      .select(
        `id, patient_name, patient_phone, appointment_date, start_time, end_time,
         status, origin, payment_method, price_snapshot, created_at,
         doctors:doctor_id ( full_name ),
         offices:office_id ( name ),
         services:service_id ( name )`
      )
      .eq("organization_id", organizationId)
      .gte("appointment_date", dateFrom)
      .lte("appointment_date", dateTo)
      .order("appointment_date", { ascending: true })
      .order("start_time", { ascending: true });

    if (apptErr) throw new Error(`Appointments query failed: ${apptErr.message}`);
    const appointments = (apptData ?? []) as unknown as AppointmentRow[];
    const todayRows = appointments.filter((a) => a.appointment_date === today);

    // Ensure the spreadsheet exists (create if missing or deleted → 404).
    let spreadsheetId = integration.sheets_spreadsheet_id ?? null;
    let meta: SheetMeta[] | null = null;

    if (spreadsheetId) {
      meta = await getSpreadsheetMeta(token, spreadsheetId);
      if (meta === null) spreadsheetId = null; // 404 — client deleted it.
    }

    if (!spreadsheetId) {
      const created = await createSpreadsheet(token, spreadsheetTitle);
      spreadsheetId = created.spreadsheetId;
      await admin
        .from("google_calendar_integrations")
        .update({ sheets_spreadsheet_id: spreadsheetId })
        .eq("id", integration.id);
      meta = await getSpreadsheetMeta(token, spreadsheetId);
    }

    if (!meta) throw new Error("Could not resolve spreadsheet metadata");
    meta = await ensureTabs(token, spreadsheetId, meta);

    const tab = (title: string) => {
      const m = meta!.find((x) => x.title === title);
      if (!m) throw new Error(`Missing tab: ${title}`);
      return m;
    };

    // Write in the order they should appear.
    await writeDataTab(token, spreadsheetId, tab(TAB_HOY), todayRows);
    await writeDataTab(token, spreadsheetId, tab(TAB_CITAS), appointments);
    await writeLeemeTab(token, spreadsheetId, tab(TAB_LEEME));

    await markSyncSuccess(integration.id);
    return {
      ok: true,
      status: "ok",
      spreadsheetId,
      rows: appointments.length,
      todayRows: todayRows.length,
    };
  } catch (err) {
    const isAuthError =
      err instanceof Error && /401|invalid_grant|invalid_token/.test(err.message);
    await markSyncError(integration.id, err, isAuthError);
    return {
      ok: false,
      status: "error",
      reason: err instanceof Error ? err.message.slice(0, 200) : String(err),
    };
  }
}
