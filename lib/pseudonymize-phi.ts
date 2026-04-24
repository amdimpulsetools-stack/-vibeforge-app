// ============================================================
// PHI pseudonymization for LLM-bound payloads
// ============================================================
// Before sending query results to Anthropic's API, this helper walks the
// payload and redacts fields that likely contain Protected Health
// Information (Peru: Ley 29733 + NTS 139). Data shape and aggregatable
// dimensions survive so the LLM can still produce useful summaries
// ("how many patients saw Dr. X this month") without seeing raw
// identifiers (DNIs, phones, email, clinical notes).
//
// Strategy: denylist of key names + consistent placeholder pseudonyms
// per run (so "Juan Pérez" in 3 rows becomes "Paciente #1" in all 3,
// letting the LLM correlate without knowing who it is).
//
// Doctor names / service names / office names / dates / prices / counts
// are NOT redacted — they're operational and typically public.

// Keys that contain direct patient identifiers — always REDACTED.
const REDACT_KEYS = new Set<string>([
  // Identity documents
  "dni",
  "document_number",
  "doc_number",
  "document_id",
  "id_number",

  // Contact
  "email",
  "patient_email",
  "portal_email",
  "phone",
  "patient_phone",
  "portal_phone",
  "mobile",
  "telefono",
  "celular",
  "whatsapp",

  // Addresses (partial info, but conservative)
  "address",
  "direccion",
  "street",
  "calle",

  // Clinical free-text
  "notes",
  "patient_notes",
  "internal_notes",
  "notas",
  "custom_field_1",
  "custom_field_2",
  "subjective",
  "objective",
  "assessment",
  "plan",
  "diagnosis_code",
  "diagnosis_label",
  "consent_notes",
  "reason",
  "symptoms",

  // Prescriptions / exam orders (can contain patient-identifying context)
  "prescription_text",
  "indications",
  "instructions",
]);

// Keys whose values should be replaced by a consistent pseudonym
// (Paciente #1, Paciente #2, ...). Same raw value → same pseudonym.
const PSEUDONYM_KEYS = new Set<string>([
  "first_name",
  "last_name",
  "patient_name",
  "full_name",
  "nombre",
  "apellido",
  "name", // only when likely a patient (ambiguous — doctor/service also have "name")
]);

// Keys that are fine to keep as-is (explicit allowlist guard against
// accidentally pseudonymizing a doctor's name etc.). When a key appears
// in both PSEUDONYM_KEYS and in a nested object whose outer key signals
// a non-patient entity, we leave it alone.
const NON_PATIENT_ENTITY_HINTS = [
  "doctors",
  "services",
  "offices",
  "organizations",
  "clinic",
  "doctor",
  "service",
  "office",
  "users",
  "members",
];

function redactBirthDate(value: unknown): unknown {
  if (typeof value !== "string") return value;
  // Extract year only
  const match = value.match(/^(\d{4})-/);
  if (match) return `${match[1]}-XX-XX`;
  return "REDACTED_DATE";
}

/**
 * Recursively pseudonymize a value for LLM consumption.
 * - Primitive identifiers → placeholder or redacted string
 * - Patient names → consistent Paciente #N mapping
 * - UUIDs, dates, numbers (not birth_date), statuses → kept
 */
export function pseudonymizePHI<T>(input: T): T {
  const nameMap = new Map<string, string>();
  let nextPatientId = 0;

  function nextPseudonym(raw: string): string {
    const existing = nameMap.get(raw);
    if (existing) return existing;
    nextPatientId += 1;
    const placeholder = `Paciente #${nextPatientId}`;
    nameMap.set(raw, placeholder);
    return placeholder;
  }

  function visit(value: unknown, parentKey?: string): unknown {
    if (value == null) return value;

    if (Array.isArray(value)) {
      return value.map((v) => visit(v, parentKey));
    }

    if (typeof value === "object") {
      const obj = value as Record<string, unknown>;
      const out: Record<string, unknown> = {};
      for (const [key, val] of Object.entries(obj)) {
        const keyLower = key.toLowerCase();

        // Birth date — keep year only
        if (keyLower === "birth_date" || keyLower === "fecha_nacimiento") {
          out[key] = redactBirthDate(val);
          continue;
        }

        // Hard redact
        if (REDACT_KEYS.has(keyLower)) {
          out[key] = val == null || val === "" ? val : "[redacted]";
          continue;
        }

        // Pseudonymize (only when not inside a non-patient entity)
        if (
          PSEUDONYM_KEYS.has(keyLower) &&
          !NON_PATIENT_ENTITY_HINTS.includes(parentKey ?? "")
        ) {
          if (typeof val === "string" && val.length > 0) {
            out[key] = nextPseudonym(val);
            continue;
          }
        }

        // Recurse
        out[key] = visit(val, key);
      }
      return out;
    }

    return value;
  }

  return visit(input) as T;
}
