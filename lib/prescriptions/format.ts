/**
 * Redacción legible de una prescripción (una sola frase, en castellano).
 *
 * ¿Por qué existe este archivo?
 * Porque la receta se lee en DOS sitios (hoy el PDF de
 * `lib/pdf/html/templates/prescription.hbs`, mañana la vista previa en
 * pantalla) y el paciente debe leer EXACTAMENTE el mismo texto en ambos.
 * Una sola redacción, importada, jamás reescrita: si la frase cambia,
 * cambia aquí y cambia en todas partes.
 *
 * Es una función PURA (sin Supabase, sin fechas, sin I/O) y no inventa
 * nada: es una receta médica, así que el texto solo reordena y conecta lo
 * que el médico escribió. No abrevia, no traduce, no corrige unidades.
 *
 * Premisa de diseño: TODOS los campos son opcionales. La frase se arma
 * por trozos, se filtran los vacíos y se unen, de modo que nunca salen
 * comas sueltas, preposiciones huérfanas ni la palabra "undefined".
 */

/** Campos de una fila de `prescriptions` que participan en la redacción. */
export interface PrescriptionTextFields {
  medication?: string | null;
  /** Concentración del producto: "500 mg". */
  dosage?: string | null;
  /** "Tableta", "Jarabe", "Óvulo"… */
  pharmaceutical_form?: string | null;
  /** Cuánto toma por vez: "1 tableta", "5 ml". */
  dose_per_take?: string | null;
  /** "Oral", "Vaginal", "Intramuscular (IM)"… */
  route?: string | null;
  /** "Cada 8 horas", "Una vez al día", "Dosis única", "Según necesidad"… */
  frequency?: string | null;
  /** "5 días", "1 mes", "Tratamiento continuo"… */
  duration?: string | null;
  /** Cuánto se despacha: "15 tabletas", "1 frasco". */
  quantity?: string | null;
}

/** Texto ya redactado, listo para imprimir tal cual. */
export interface PrescriptionText {
  /** "Paracetamol 500 mg" (va en negrita). Vacío si no hay medicamento. */
  name_text: string;
  /** "Tableta por vía oral, 1 tableta cada 8 horas por 5 días." */
  line_text: string;
  /** "Presentación: 15 tabletas." Vacío si no hay cantidad. */
  quantity_text: string;
}

/** Etiqueta de la línea de cantidad despachada. */
const QUANTITY_LABEL = "Presentación";

function clean(value: string | null | undefined): string {
  return typeof value === "string" ? value.trim().replace(/\s+/g, " ") : "";
}

/** Sin tildes y en minúsculas: solo para COMPARAR, nunca para imprimir. */
function fold(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

/**
 * Minúscula inicial para encadenar el trozo dentro de la frase, salvo que
 * la primera palabra sea una sigla ("PRN (según necesidad)", "IM"): esas
 * se respetan tal cual las escribió el médico.
 */
function lowerFirst(value: string): string {
  const first = value.split(" ")[0] ?? "";
  const isAcronym = first.length > 1 && first === first.toUpperCase() && /\p{Lu}/u.test(first);
  return isAcronym ? value : value.charAt(0).toLowerCase() + value.slice(1);
}

function upperFirst(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

/** Punto final sin duplicar el que ya hubiera puesto el médico. */
function endSentence(value: string): string {
  return /[.!?…]$/.test(value) ? value : `${value}.`;
}

/**
 * "Oral" → "por vía oral". Si el médico ya escribió la preposición o la
 * palabra "vía", no se duplica.
 */
export function routePhrase(route: string | null | undefined): string {
  const r = clean(route);
  if (!r) return "";
  const f = fold(r);
  if (f.startsWith("por via ") || f === "por via") return lowerFirst(r);
  if (f.startsWith("via ") || f === "via") return `por ${lowerFirst(r)}`;
  return `por vía ${lowerFirst(r)}`;
}

/**
 * "Cada 8 horas" → "cada 8 horas"; "Dosis única" → "en dosis única".
 * El resto ("Según necesidad", "En ayunas", "Antes de dormir", "PRN…")
 * encaja solo, en minúscula inicial.
 */
export function frequencyPhrase(frequency: string | null | undefined): string {
  const f = clean(frequency);
  if (!f) return "";
  if (fold(f) === "dosis unica") return `en ${lowerFirst(f)}`;
  return lowerFirst(f);
}

/**
 * "5 días" → "por 5 días"; "1 mes" → "por 1 mes";
 * "Tratamiento continuo" → "de tratamiento continuo".
 * Un texto libre que no encaje en ningún patrón se deja tal cual, sin
 * inventarle preposición (mejor escueto que agramatical).
 */
export function durationPhrase(duration: string | null | undefined): string {
  const d = clean(duration);
  if (!d) return "";
  const f = fold(d);
  if (/^(por|durante|hasta|de|en)\s/.test(f)) return lowerFirst(d); // ya trae preposición
  if (/^tratamiento\b/.test(f)) return `de ${lowerFirst(d)}`;
  if (/^\d/.test(f)) return `por ${d}`;
  return lowerFirst(d);
}

/**
 * Arma la redacción de un medicamento a partir de los campos crudos.
 *
 * La frase tiene dos trozos unidos por coma:
 *   1) qué es y por dónde va   → "Tableta por vía oral"
 *   2) cuánto, cada cuánto y por cuánto tiempo → "1 tableta cada 8 horas por 5 días"
 * Cualquiera de los dos puede faltar entero; si faltan los dos, `line_text`
 * sale vacío y quien lo imprime simplemente no pinta la línea.
 */
export function formatPrescriptionText(fields: PrescriptionTextFields): PrescriptionText {
  const medication = clean(fields.medication);
  const dosage = clean(fields.dosage);
  const form = clean(fields.pharmaceutical_form);
  const dosePerTake = clean(fields.dose_per_take);
  const quantity = clean(fields.quantity);

  const head = [form, routePhrase(fields.route)].filter(Boolean).join(" ");
  const posology = [
    dosePerTake,
    frequencyPhrase(fields.frequency),
    durationPhrase(fields.duration),
  ]
    .filter(Boolean)
    .join(" ");

  const sentence = [head, posology].filter(Boolean).join(", ");

  return {
    name_text: [medication, dosage].filter(Boolean).join(" "),
    line_text: sentence ? endSentence(upperFirst(sentence)) : "",
    quantity_text: quantity ? `${QUANTITY_LABEL}: ${endSentence(quantity)}` : "",
  };
}
