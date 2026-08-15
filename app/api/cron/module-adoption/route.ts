import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { SupabaseClient } from "@supabase/supabase-js";
import { startCronRun, finishCronRun } from "@/lib/cron-runs";
import {
  formatDateEsPE,
  notifyFounderAdoptionDigest,
  sendModuleAdoptionEmail,
  type AdoptionDigestRow,
  type AdoptionState,
} from "@/lib/module-lifecycle-emails";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * GET /api/cron/module-adoption
 *
 * Vercel Cron — martes 13:00 UTC (08:00 Lima). Un módulo de pago que se
 * activa y no se usa es una baja que todavía no se ha escrito: la clínica
 * paga, no recibe nada a cambio y un día lo nota. Este barrido busca esas
 * tres formas de no-uso y manda el consejo que corresponde a cada una,
 * más UN SOLO reporte agregado al founder con el MRR en riesgo.
 *
 *   sin_configurar (D+2, solo Caja)
 *       El addon está activo pero no existe fila en cash_settings. Esa
 *       fila ES el interruptor del módulo (mig 214): sin ella el trigger
 *       sale en la primera consulta y no se vincula NADA. Es el fallo más
 *       silencioso del producto — se ve todo instalado y no hace nada.
 *
 *   sin_estrenar (D+7 / D+14 farmacia)
 *       Configurado pero sin un solo uso desde que se activó.
 *
 *   abandonado (14 días)
 *       Hubo actividad y luego se paró. Es el más rescatable de los tres:
 *       ya saben usarlo, se rompió la rutina.
 *
 * ── Trampas verificadas en el código, que este cron evita ────────────
 *  1. `activated_by IS NOT NULL` SIEMPRE. Los grants beta de las migs
 *     209/214 se insertaron por SQL sin ese campo: sin el filtro, cada
 *     org beta aparecería como abandono falso desde el primer barrido.
 *  2. Farmacia NO tiene addon propio (viaja en 'almacen'), así que su
 *     señal es débil: NO genera correo al owner, solo entra en el
 *     reporte al founder.
 *  3. Almacén se mide por `created_at` y NUNCA por `movement_date`: la
 *     fecha del movimiento es retroactiva y diría que hay actividad de
 *     hoy cuando lo que hubo fue una regularización de la semana pasada.
 *  4. Máximo 2 correos de adopción por módulo en toda la vida de la org
 *     (el tope lo aplica sendModuleAdoptionEmail contra ops_notice_log).
 *     Un tercero deja de ser ayuda y se vuelve acoso.
 *
 * Captación queda FUERA del barrido a propósito: su única señal de vida
 * (conversaciones con origen en un anuncio) depende de que haya campañas
 * corriendo, y una clínica que pausó la pauta no está abandonando el
 * módulo. Su acompañamiento es el correo de bienvenida.
 *
 * Auth: CRON_SECRET en Bearer, igual que billing-status.
 */

const DAY_MS = 86_400_000;

/** Módulos con addon propio que este barrido vigila. */
const SWEPT_ADDONS = ["caja", "almacen"] as const;

interface OrgAddonRow {
  organization_id: string;
  addon_key: string;
  activated_at: string | null;
}

interface Finding {
  orgId: string;
  orgName: string;
  /** Clave del addon para el correo y el dedupe. */
  addonKey: string;
  /** Módulo del que se habla (farmacia se reporta bajo su propio nombre). */
  reportKey: string;
  state: AdoptionState;
  detail: string;
  idleDays?: number;
  /** false = señal débil: entra en el reporte pero no se le escribe. */
  emailable: boolean;
}

/** ¿Cuántas filas y cuál es la última fecha? Una sola consulta. */
async function activity(
  admin: SupabaseClient,
  table: string,
  orgId: string,
  dateColumn: string,
  since: string | null,
  /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
  extra?: (q: any) => any,
): Promise<{ count: number; lastAt: string | null }> {
  /* eslint-disable @typescript-eslint/no-explicit-any */
  let query: any = (admin as any)
    .from(table)
    .select(dateColumn, { count: "exact" })
    .eq("organization_id", orgId);
  if (since) query = query.gte(dateColumn, since);
  if (extra) query = extra(query);

  const { data, count } = await query
    .order(dateColumn, { ascending: false, nullsFirst: false })
    .limit(1);

  const row = (data ?? [])[0] as Record<string, string> | undefined;
  return { count: count ?? 0, lastAt: row?.[dateColumn] ?? null };
  /* eslint-enable @typescript-eslint/no-explicit-any */
}

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (
    !cronSecret ||
    cronSecret.length < 32 ||
    authHeader !== `Bearer ${cronSecret}`
  ) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();
  const runId = await startCronRun(admin, "module-adoption");
  const now = new Date();
  const nowIso = now.toISOString();
  const twoDaysAgo = new Date(now.getTime() - 2 * DAY_MS).toISOString();
  // Las ventanas de dentro del bucle se comparan en MILISEGUNDOS y no como
  // cadenas: PostgREST devuelve "…+00:00" y toISOString() produce "…Z", y
  // comparar esos dos formatos con < es correcto por casualidad, no por
  // diseño. El filtro que va al servidor sí viaja como ISO.
  const sevenDaysAgoMs = now.getTime() - 7 * DAY_MS;
  const fourteenDaysAgoMs = now.getTime() - 14 * DAY_MS;

  const idleDaysSince = (iso: string): number =>
    Math.floor((now.getTime() - Date.parse(iso)) / DAY_MS);

  try {
    // Precio del catálogo, para sumar el MRR en riesgo del reporte.
    const { data: catalog } = await admin
      .from("addons")
      .select("key, monthly_price")
      .in("key", ["caja", "almacen", "captacion"]);

    const priceByKey = new Map<string, number | null>(
      ((catalog ?? []) as { key: string; monthly_price: number | string | null }[]).map(
        (a) => [
          a.key,
          a.monthly_price === null || a.monthly_price === undefined
            ? null
            : Number(a.monthly_price),
        ],
      ),
    );
    // Farmacia no tiene fila propia en el catálogo: su MRR es el de
    // Almacén, que es lo que la clínica está pagando por tenerla.
    priceByKey.set("farmacia", priceByKey.get("almacen") ?? null);

    // Grants vivos. `activated_by IS NOT NULL` deja fuera los inserts por
    // SQL de las betas (trampa 1) y `activated_at` acota a los que ya
    // cumplieron la ventana más corta (D+2).
    const { data: grants } = await admin
      .from("organization_addons")
      .select("organization_id, addon_key, activated_at")
      .eq("enabled", true)
      .not("activated_by", "is", null)
      .not("activated_at", "is", null)
      .lte("activated_at", twoDaysAgo)
      .in("addon_key", SWEPT_ADDONS as unknown as string[]);

    const rows = (grants ?? []) as OrgAddonRow[];

    // Nombres de clínica en bloque: el reporte al founder los necesita
    // todos y no vale una consulta por fila.
    const orgIds = [...new Set(rows.map((r) => r.organization_id))];
    const nameById = new Map<string, string>();
    if (orgIds.length > 0) {
      const { data: orgs } = await admin
        .from("organizations")
        .select("id, name")
        .in("id", orgIds);
      for (const o of (orgs ?? []) as { id: string; name: string | null }[]) {
        nameById.set(o.id, (o.name || "").trim() || "clínica sin nombre");
      }
    }

    const findings: Finding[] = [];

    for (const row of rows) {
      const orgId = row.organization_id;
      const orgName = nameById.get(orgId) ?? "clínica sin nombre";
      const activatedAt = row.activated_at as string;
      const activatedMs = Date.parse(activatedAt);
      const activatedDaysAgo = idleDaysSince(activatedAt);

      if (row.addon_key === "caja") {
        // ── sin_configurar: la fila de cash_settings es el interruptor.
        const { data: settings } = await admin
          .from("cash_settings")
          .select("organization_id")
          .eq("organization_id", orgId)
          .maybeSingle();

        if (!settings) {
          findings.push({
            orgId,
            orgName,
            addonKey: "caja",
            reportKey: "caja",
            state: "sin_configurar",
            detail: `activado hace ${activatedDaysAgo} días y sin configurar — el módulo no vincula nada`,
            emailable: true,
          });
          continue;
        }

        const shifts = await activity(admin, "cash_shifts", orgId, "opened_at", activatedAt);

        if (shifts.count === 0) {
          if (activatedMs <= sevenDaysAgoMs) {
            findings.push({
              orgId,
              orgName,
              addonKey: "caja",
              reportKey: "caja",
              state: "sin_estrenar",
              detail: `configurado hace ${activatedDaysAgo} días, ni un solo turno abierto`,
              emailable: true,
            });
          }
          continue;
        }

        if (shifts.lastAt && Date.parse(shifts.lastAt) <= fourteenDaysAgoMs) {
          const idleDays = idleDaysSince(shifts.lastAt);
          findings.push({
            orgId,
            orgName,
            addonKey: "caja",
            reportKey: "caja",
            state: "abandonado",
            detail: `${shifts.count} turnos y luego ${idleDays} días en silencio (último el ${formatDateEsPE(shifts.lastAt)})`,
            idleDays,
            emailable: true,
          });
        }
        continue;
      }

      if (row.addon_key === "almacen") {
        // created_at y NO movement_date (trampa 3).
        const movements = await activity(
          admin,
          "inventory_movements",
          orgId,
          "created_at",
          activatedAt,
        );

        if (movements.count === 0) {
          if (activatedMs <= sevenDaysAgoMs) {
            findings.push({
              orgId,
              orgName,
              addonKey: "almacen",
              reportKey: "almacen",
              state: "sin_estrenar",
              detail: `activado hace ${activatedDaysAgo} días, sin un solo movimiento`,
              emailable: true,
            });
          }
        } else if (
          movements.lastAt &&
          Date.parse(movements.lastAt) <= fourteenDaysAgoMs
        ) {
          const idleDays = idleDaysSince(movements.lastAt);
          findings.push({
            orgId,
            orgName,
            addonKey: "almacen",
            reportKey: "almacen",
            state: "abandonado",
            detail: `${movements.count} movimientos y luego ${idleDays} días en silencio (último el ${formatDateEsPE(movements.lastAt)})`,
            idleDays,
            emailable: true,
          });
        }

        // ── Farmacia: ventana de 14 días y SOLO borradores no cuentan.
        //    Señal débil (no tiene addon propio): nunca genera correo.
        if (activatedMs <= fourteenDaysAgoMs) {
          const sales = await activity(
            admin,
            "pharmacy_sales",
            orgId,
            "confirmed_at",
            activatedAt,
            (q) => q.eq("status", "confirmada"),
          );

          if (sales.count === 0) {
            findings.push({
              orgId,
              orgName,
              addonKey: "almacen",
              reportKey: "farmacia",
              state: "sin_estrenar",
              detail: `${activatedDaysAgo} días sin una sola venta confirmada`,
              emailable: false,
            });
          } else if (sales.lastAt && Date.parse(sales.lastAt) <= fourteenDaysAgoMs) {
            const idleDays = idleDaysSince(sales.lastAt);
            findings.push({
              orgId,
              orgName,
              addonKey: "almacen",
              reportKey: "farmacia",
              state: "abandonado",
              detail: `${sales.count} ventas y luego ${idleDays} días sin vender (última el ${formatDateEsPE(sales.lastAt)})`,
              idleDays,
              emailable: false,
            });
          }
        }
      }
    }

    // ── Correos de consejo + acumulación para el reporte ─────────────
    const sinConfigurar: AdoptionDigestRow[] = [];
    const sinEstrenar: AdoptionDigestRow[] = [];
    const abandonados: AdoptionDigestRow[] = [];
    let emailsSent = 0;
    let capped = 0;
    let alreadySent = 0;

    for (const f of findings) {
      let emailed = false;

      if (f.emailable) {
        const result = await sendModuleAdoptionEmail({
          admin,
          organizationId: f.orgId,
          addonKey: f.addonKey,
          state: f.state,
          idleDays: f.idleDays,
        });

        if (result.sent) {
          emailed = true;
          emailsSent++;
        } else if (result.reason === "cap_reached") {
          capped++;
        } else if (result.reason === "already_sent") {
          alreadySent++;
        }
      }

      const digestRow: AdoptionDigestRow = {
        orgName: f.orgName,
        addonKey: f.reportKey,
        monthlyPrice: priceByKey.get(f.reportKey) ?? null,
        detail: f.detail,
        emailed,
      };

      if (f.state === "sin_configurar") sinConfigurar.push(digestRow);
      else if (f.state === "sin_estrenar") sinEstrenar.push(digestRow);
      else abandonados.push(digestRow);
    }

    // UN solo correo al founder por barrido, no uno por clínica.
    await notifyFounderAdoptionDigest({
      admin,
      sinConfigurar,
      sinEstrenar,
      abandonados,
      emailsSent,
      capped,
    });

    const summary = {
      grants_scanned: rows.length,
      sin_configurar: sinConfigurar.length,
      sin_estrenar: sinEstrenar.length,
      abandonados: abandonados.length,
      emails_sent: emailsSent,
      capped,
      already_sent: alreadySent,
    };
    await finishCronRun(admin, runId, true, summary);

    return NextResponse.json({ ok: true, timestamp: nowIso, ...summary });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[cron/module-adoption] falló:", message);
    await finishCronRun(admin, runId, false, { error: message });
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
