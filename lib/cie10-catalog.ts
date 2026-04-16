export interface CIE10Entry {
  code: string;
  label: string;
  /** Flag rendered in the picker when the code comes from the org catalog. */
  custom?: boolean;
}

export const CIE10_CATALOG: CIE10Entry[] = [
  // ── Enfermedades infecciosas comunes ──────────────────────────────
  { code: "A09", label: "Diarrea y gastroenteritis de presunto origen infeccioso" },
  { code: "A15", label: "Tuberculosis respiratoria" },
  { code: "A16", label: "Tuberculosis respiratoria, sin confirmación bacteriológica o histológica" },
  { code: "A37", label: "Tos ferina (tos convulsiva)" },
  { code: "A90", label: "Dengue" },
  { code: "A91", label: "Dengue hemorrágico" },
  { code: "B01", label: "Varicela" },
  { code: "B02", label: "Herpes zóster" },
  { code: "B34", label: "Infección viral, no especificada" },
  { code: "B35", label: "Dermatofitosis (tiña)" },
  { code: "B37", label: "Candidiasis" },
  { code: "B82", label: "Parasitosis intestinal, sin otra especificación" },

  // ── Neoplasias ────────────────────────────────────────────────────
  { code: "C53", label: "Tumor maligno del cuello del útero" },
  { code: "D25", label: "Leiomioma del útero (mioma uterino)" },

  // ── Sangre y sistema inmunológico ─────────────────────────────────
  { code: "D50", label: "Anemia por deficiencia de hierro" },
  { code: "D64", label: "Otras anemias" },

  // ── Enfermedades endocrinas y metabólicas ─────────────────────────
  { code: "E03", label: "Hipotiroidismo" },
  { code: "E05", label: "Hipertiroidismo (tirotoxicosis)" },
  { code: "E10", label: "Diabetes mellitus tipo 1" },
  { code: "E11", label: "Diabetes mellitus tipo 2" },
  { code: "E14", label: "Diabetes mellitus, no especificada" },
  { code: "E44", label: "Desnutrición proteicocalórica de grado moderado y leve" },
  { code: "E46", label: "Desnutrición proteicocalórica, no especificada" },
  { code: "E66", label: "Obesidad" },
  { code: "E78", label: "Dislipidemia (trastornos del metabolismo de lipoproteínas)" },

  // ── Trastornos mentales y del comportamiento ──────────────────────
  { code: "F10", label: "Trastornos mentales y del comportamiento por uso de alcohol" },
  { code: "F32", label: "Episodio depresivo" },
  { code: "F33", label: "Trastorno depresivo recurrente" },
  { code: "F41", label: "Otros trastornos de ansiedad" },
  { code: "F41.0", label: "Trastorno de pánico" },
  { code: "F41.1", label: "Trastorno de ansiedad generalizada" },
  { code: "F43", label: "Reacciones al estrés grave y trastornos de adaptación" },
  { code: "F51", label: "Trastornos no orgánicos del sueño (insomnio)" },

  // ── Enfermedades del sistema nervioso ─────────────────────────────
  { code: "G40", label: "Epilepsia" },
  { code: "G43", label: "Migraña" },
  { code: "G44", label: "Otros síndromes de cefalea" },
  { code: "G47", label: "Trastornos del sueño" },

  // ── Enfermedades del ojo ──────────────────────────────────────────
  { code: "H10", label: "Conjuntivitis" },
  { code: "H52", label: "Trastornos de la refracción y de la acomodación" },
  { code: "H66", label: "Otitis media supurativa y la no especificada" },

  // ── Enfermedades del oído ─────────────────────────────────────────
  { code: "H65", label: "Otitis media no supurativa" },
  { code: "H81", label: "Trastornos de la función vestibular (vértigo)" },

  // ── Enfermedades del sistema circulatorio ─────────────────────────
  { code: "I10", label: "Hipertensión esencial (primaria)" },
  { code: "I11", label: "Enfermedad cardíaca hipertensiva" },
  { code: "I20", label: "Angina de pecho" },
  { code: "I25", label: "Enfermedad isquémica crónica del corazón" },
  { code: "I50", label: "Insuficiencia cardíaca" },
  { code: "I63", label: "Infarto cerebral (accidente cerebrovascular isquémico)" },
  { code: "I83", label: "Venas varicosas de los miembros inferiores" },

  // ── Enfermedades del sistema respiratorio ─────────────────────────
  { code: "J00", label: "Rinofaringitis aguda (resfriado común)" },
  { code: "J02", label: "Faringitis aguda" },
  { code: "J03", label: "Amigdalitis aguda" },
  { code: "J04", label: "Laringitis y traqueítis agudas" },
  { code: "J06", label: "Infección aguda de las vías respiratorias superiores" },
  { code: "J10", label: "Influenza (gripe) por virus identificado" },
  { code: "J11", label: "Influenza (gripe) por virus no identificado" },
  { code: "J15", label: "Neumonía bacteriana, no clasificada en otra parte" },
  { code: "J18", label: "Neumonía, organismo no especificado" },
  { code: "J20", label: "Bronquitis aguda" },
  { code: "J30", label: "Rinitis alérgica y vasomotora" },
  { code: "J40", label: "Bronquitis, no especificada como aguda o crónica" },
  { code: "J44", label: "Otras enfermedades pulmonares obstructivas crónicas (EPOC)" },
  { code: "J45", label: "Asma" },

  // ── Enfermedades del sistema digestivo ────────────────────────────
  { code: "K02", label: "Caries dental" },
  { code: "K04", label: "Enfermedades de la pulpa y tejidos periapicales" },
  { code: "K05", label: "Gingivitis y enfermedad periodontal" },
  { code: "K21", label: "Enfermedad por reflujo gastroesofágico" },
  { code: "K25", label: "Úlcera gástrica" },
  { code: "K29", label: "Gastritis y duodenitis" },
  { code: "K30", label: "Dispepsia funcional" },
  { code: "K35", label: "Apendicitis aguda" },
  { code: "K40", label: "Hernia inguinal" },
  { code: "K59", label: "Otros trastornos funcionales del intestino (estreñimiento)" },
  { code: "K76", label: "Hígado graso (esteatosis hepática)" },
  { code: "K80", label: "Colelitiasis (cálculos biliares)" },

  // ── Enfermedades de la piel ───────────────────────────────────────
  { code: "L02", label: "Absceso cutáneo, furúnculo y carbunco" },
  { code: "L20", label: "Dermatitis atópica" },
  { code: "L23", label: "Dermatitis alérgica de contacto" },
  { code: "L30", label: "Otras dermatitis" },
  { code: "L50", label: "Urticaria" },
  { code: "L70", label: "Acné" },

  // ── Enfermedades del sistema musculoesquelético ───────────────────
  { code: "M13", label: "Otras artritis" },
  { code: "M15", label: "Poliartrosis" },
  { code: "M17", label: "Gonartrosis (artrosis de rodilla)" },
  { code: "M19", label: "Otras artrosis" },
  { code: "M25", label: "Otros trastornos articulares" },
  { code: "M54", label: "Dorsalgia (dolor de espalda)" },
  { code: "M54.2", label: "Cervicalgia (dolor cervical)" },
  { code: "M54.5", label: "Lumbago (lumbalgia)" },
  { code: "M79", label: "Otros trastornos de tejidos blandos (mialgia, fibromialgia)" },

  // ── Enfermedades del sistema genitourinario ───────────────────────
  { code: "N10", label: "Nefritis tubulointersticial aguda (pielonefritis)" },
  { code: "N20", label: "Cálculo del riñón y del uréter (litiasis renal)" },
  { code: "N30", label: "Cistitis (infección urinaria baja)" },
  { code: "N39", label: "Infección de vías urinarias, sitio no especificado" },
  { code: "N40", label: "Hiperplasia de la próstata" },
  { code: "N76", label: "Otras inflamaciones de la vagina y de la vulva (vaginitis)" },
  { code: "N92", label: "Menstruación excesiva, frecuente e irregular" },
  { code: "N94", label: "Dolor y otras afecciones relacionadas con órganos genitales femeninos (dismenorrea)" },

  // ── Embarazo, parto y puerperio ───────────────────────────────────
  { code: "O80", label: "Parto único espontáneo" },
  { code: "Z34", label: "Supervisión de embarazo normal" },

  // ── Traumatismos y causas externas ────────────────────────────────
  { code: "R51", label: "Cefalea (dolor de cabeza)" },
  { code: "S93", label: "Luxación, esguince y torcedura de articulaciones y ligamentos del tobillo" },
  { code: "T14", label: "Traumatismo de región del cuerpo no especificada" },
  { code: "T78.4", label: "Alergia no especificada" },

  // ── Síntomas y signos generales ───────────────────────────────────
  { code: "R05", label: "Tos" },
  { code: "R10", label: "Dolor abdominal y pélvico" },
  { code: "R11", label: "Náusea y vómito" },
  { code: "R42", label: "Mareo y desvanecimiento" },
  { code: "R50", label: "Fiebre de origen desconocido" },
  { code: "R53", label: "Malestar y fatiga" },

  // ── Códigos de control y factores de salud ────────────────────────
  { code: "Z00", label: "Examen general e investigación de personas sin quejas o diagnóstico" },
  { code: "Z01", label: "Otros exámenes especiales e investigaciones" },
  { code: "Z23", label: "Necesidad de inmunización contra una sola enfermedad (vacunación)" },
  { code: "Z30", label: "Atención para anticoncepción (planificación familiar)" },
  { code: "Z71", label: "Personas en contacto con servicios de salud para consejería" },
  { code: "Z76", label: "Personas en contacto con servicios de salud por otras circunstancias" },
];

function normalize(s: string): string {
  return s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

/**
 * Searches the CIE-10 catalog by code or label (case-insensitive).
 * Returns up to 10 matching results.
 */
export function searchCIE10(query: string): CIE10Entry[] {
  return searchCIE10WithCustom(query, []);
}

/**
 * Same as searchCIE10 but also searches the org's custom codes.
 * Custom codes matching the query are prepended (max 5) so they're
 * discoverable even when the global catalog returns many hits.
 */
export function searchCIE10WithCustom(
  query: string,
  customCodes: CIE10Entry[]
): CIE10Entry[] {
  if (!query || query.trim().length === 0) {
    return [];
  }

  const normalizedQuery = normalize(query);

  const matches = (entry: CIE10Entry) => {
    const code = entry.code.toLowerCase();
    const label = normalize(entry.label);
    return code.includes(normalizedQuery) || label.includes(normalizedQuery);
  };

  const custom = customCodes
    .filter(matches)
    .map((c) => ({ ...c, custom: true as const }))
    .slice(0, 5);

  const customCodeSet = new Set(custom.map((c) => c.code.toUpperCase()));
  const global = CIE10_CATALOG.filter(
    (entry) => matches(entry) && !customCodeSet.has(entry.code.toUpperCase())
  ).slice(0, 10 - custom.length);

  return [...custom, ...global];
}
