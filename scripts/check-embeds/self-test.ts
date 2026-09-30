/**
 * Auto-test del chequeo (corre SIEMPRE antes de escanear el repo, en
 * memoria, < 100 ms). Si el parser se degrada y deja de detectar el
 * incidente del 30-sep-2026, el chequeo falla con código 2 en vez de dar un
 * falso verde.
 */
import * as path from "path";
import { analyze, Finding } from "./analyze";
import { makeObjectName, buildSchemaGraphFromSources, SqlSource } from "./sql-graph";
import { TsScanner } from "./ts-scan";

const BASE_SQL = `
-- Comentario con FOREIGN KEY (x) REFERENCES appointments(id): no cuenta.
CREATE TABLE IF NOT EXISTS patients (id uuid PRIMARY KEY DEFAULT gen_random_uuid());
CREATE TABLE IF NOT EXISTS appointments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id uuid REFERENCES patients(id) ON DELETE SET NULL,
  created_by uuid REFERENCES auth.users(id),
  note text DEFAULT 'REFERENCES patients(id)'
);
CREATE TABLE cash_shifts (id uuid PRIMARY KEY);
CREATE TABLE IF NOT EXISTS patient_payments (
  id uuid PRIMARY KEY,
  appointment_id uuid REFERENCES appointments(id) ON DELETE SET NULL,
  patient_id uuid REFERENCES public.patients(id),
  cash_shift_id uuid,
  amount numeric(10,2) NOT NULL CHECK (amount > 0)
);
/* bloque: ALTER TABLE patient_payments ADD FOREIGN KEY (id) REFERENCES appointments(id); */
CREATE OR REPLACE FUNCTION trg() RETURNS trigger AS $$
BEGIN
  ALTER TABLE patient_payments ADD CONSTRAINT bogus FOREIGN KEY (id) REFERENCES appointments(id);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
DO $$ BEGIN
  ALTER TABLE patient_payments
    ADD CONSTRAINT patient_payments_shift_fk
    FOREIGN KEY (cash_shift_id) REFERENCES cash_shifts(id) ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
CREATE TABLE doctors (id uuid PRIMARY KEY);
CREATE TABLE services (id uuid PRIMARY KEY);
CREATE TABLE doctor_services (
  doctor_id uuid REFERENCES doctors(id),
  service_id uuid REFERENCES services(id),
  PRIMARY KEY (doctor_id, service_id)
);
CREATE OR REPLACE FUNCTION payments_in_scope() RETURNS SETOF patient_payments LANGUAGE sql AS $$ SELECT * FROM patient_payments $$;
`;

// Réplica de la mig 273 ORIGINAL (con la FK que rompió la agenda).
const INCIDENT_SQL = `
ALTER TABLE patient_payments
  ADD COLUMN IF NOT EXISTS transferred_from_appointment_id uuid REFERENCES appointments(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS amount numeric REFERENCES appointments(id);
ALTER TABLE appointments
  ADD COLUMN IF NOT EXISTS rescheduled_from_id uuid REFERENCES appointments(id) ON DELETE SET NULL;
`;

// El arreglo aplicado en prod (PR #383).
const FIX_SQL = `
ALTER TABLE patient_payments
  DROP CONSTRAINT IF EXISTS patient_payments_transferred_from_appointment_id_fkey;
`;

const CODE = `
import { createClient } from "@/lib/supabase/client";
const supabase = createClient();
const apptColumns = ({ presc }: { presc: boolean }): string =>
  \`id, doctor_id, patient_payments(amount)\${presc ? ", prescriptions(id)" : ""}\`;
export async function load(presc: boolean) {
  const q = supabase.from("appointments").select(apptColumns({ presc }));
  const ok = await supabase
    .from("appointments")
    .select("id, patient_payments!patient_payments_appointment_id_fkey(amount), total:amount.sum(), count(), data->>x, n:id::text");
  const inner = await supabase.from("patient_payments").select("id, appointments!inner(id)");
  const badHint = await supabase.from("patient_payments").select("id, appointments!no_existe_fkey(id)");
  const self = await supabase.from("appointments").select("id, appointments(id)");
  const fine = await supabase.from("patient_payments").select(\`id,
    patients ( id )\`);
  const m2m = await supabase.from("doctors").select("id, services(id)");
  const rpc = await (supabase.rpc("payments_in_scope") as any).select("id, appointments(id)");
  return [q, ok, inner, badHint, self, fine, m2m, rpc];
}
`;

function run(sql: SqlSource[]): Finding[] {
  const root = path.resolve("/__check_embeds_selftest__");
  const file = path.join(root, "app", "x.tsx");
  const scanner = new TsScanner(root, new Map([[file, CODE]]));
  const g = buildSchemaGraphFromSources(sql);
  const sites = scanner.scanFile(file);
  return analyze(g, sites, (loc) => {
    const sf = scanner.getSourceFile(path.join(root, loc.file));
    return sf ? sf.getLineAndCharacterOfPosition(loc.pos).line + 1 : 0;
  }).findings;
}

export function runSelfTest(): string[] {
  const errors: string[] = [];
  const expect = (cond: boolean, msg: string) => {
    if (!cond) errors.push(msg);
  };
  const has = (fs: Finding[], code: Finding["code"], embed: string, parent?: string) =>
    fs.some((f) => f.code === code && f.embed === embed && (!parent || f.parent === parent));

  // 1. Con la mig 273 original: la agenda DEBE marcarse como riesgo alto.
  const withIncident = run([
    { name: "001_base.sql", sql: BASE_SQL },
    { name: "273_incident.sql", sql: INCIDENT_SQL },
  ]);
  const agenda = withIncident.find((f) => f.code === "ambiguo" && f.embed === "patient_payments" && f.parent === "appointments");
  expect(!!agenda, "no detecta el embed ambiguo patient_payments(amount) del incidente (mig 273 original)");
  expect(!!agenda && agenda.line === 5, `línea del embed del incidente mal calculada (${agenda ? agenda.line : "-"}, esperada 5)`);
  expect(
    !!agenda && !!agenda.suggestion && agenda.suggestion.includes("patient_payments!patient_payments_appointment_id_fkey"),
    "la sugerencia para el incidente no es patient_payments_appointment_id_fkey",
  );
  expect(!!agenda && agenda.relationships.length === 2, "el incidente debería listar exactamente 2 FKs (ADD COLUMN IF NOT EXISTS sobre columna existente no crea FK)");
  expect(has(withIncident, "ambiguo", "appointments!inner", "patient_payments"), "`!inner` se trató como hint (debe ser modificador)");
  expect(has(withIncident, "ambiguo", "appointments", "patient_payments"), "no resuelve la tabla padre de .rpc() RETURNS SETOF");
  expect(has(withIncident, "hint-inexistente", "appointments!no_existe_fkey"), "no detecta un hint inexistente (PGRST200)");
  expect(has(withIncident, "autorreferencia", "appointments", "appointments"), "no detecta el embed autorreferente");
  expect(has(withIncident, "destino-desconocido", "prescriptions"), "no expande el `${cond ? \", prescriptions(id)\" : \"\"}` del template");
  expect(
    !withIncident.some((f) => f.severity === "alto" && (f.embed === "patients" || f.embed === "services" || f.embed.startsWith("patient_payments!"))),
    "falso positivo: embeds sin ambigüedad (patients, M2M services, hint válido) marcados como riesgo",
  );
  expect(!withIncident.some((f) => /count|sum|amount|data/.test(f.embed)), "agregados/casts/JSON tratados como embeds");

  // 2. Con el arreglo (DROP CONSTRAINT): la agenda vuelve a estar limpia.
  const fixed = run([
    { name: "001_base.sql", sql: BASE_SQL },
    { name: "273_incident.sql", sql: INCIDENT_SQL },
    { name: "274_fix.sql", sql: FIX_SQL },
  ]);
  expect(
    !fixed.some((f) => f.code === "ambiguo" && f.embed === "patient_payments" && f.parent === "appointments"),
    "tras DROP CONSTRAINT la agenda sigue marcada (no procesa las bajas)",
  );

  // 3. Nombres por defecto de Postgres (63 bytes).
  const long = makeObjectName("organization_insurance_carrier_services_long", "organization_insurance_carrier_id", "fkey");
  expect(long.length <= 63, `nombre por defecto excede 63 caracteres: ${long}`);
  expect(makeObjectName("patient_payments", "appointment_id", "fkey") === "patient_payments_appointment_id_fkey", "makeObjectName simple incorrecto");
  // 36 + 37 caracteres, disponibles 57: se recorta alternando el más largo → 29 + 28.
  expect(
    makeObjectName("clinical_followup_attribution_events", "clinical_followup_attribution_rule_id", "fkey") ===
      "clinical_followup_attribution_clinical_followup_attributio_fkey",
    "truncado de makeObjectName no replica a Postgres",
  );
  return errors;
}

