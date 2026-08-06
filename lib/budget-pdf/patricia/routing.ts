/**
 * Routing de plantillas del plugin `budget_pdf_patricia`.
 *
 * ── Por qué NO basta `treatment_type` ────────────────────────────
 * Vitra tiene 1 plantilla por tipo de tratamiento, así que su router
 * (`render-html.ts:TEMPLATE_ROUTES`) es un `Record<treatmentType, …>`.
 * Patricia tiene 12 presupuestos sobre 7 tipos: tres FIV (propio /
 * con semen donado / mixto), tres ovodonaciones (estándar / donante
 * conocida / + semen donado) y dos inseminaciones (estándar / con
 * semen donado). El tipo por sí solo no distingue cuál imprimir, así
 * que enrutamos por el NOMBRE DEL SERVICIO y usamos el tipo solo como
 * red de seguridad.
 *
 * ── Cómo funciona ───────────────────────────────────────────────
 * 1. Se normaliza el nombre del servicio (mayúsculas, sin tildes,
 *    espacios colapsados) para que "Ovodonación", "OVODONACION" y
 *    "FIV con óvulos donados" se comparen igual.
 * 2. Se recorre `NAME_RULES` EN ORDEN y gana la primera que casa. El
 *    orden va de más específico a más genérico: las variantes con
 *    "SEMEN DONADO" y "DONANTE CONOCIDA" se evalúan antes que su
 *    familia, y las familias de óvulos donados antes que FIV a secas
 *    (si no, "FIV CON OVULOS DONADOS Y SEMEN DONADO" caería en la
 *    regla de FIV y se imprimirían precios de otro tratamiento).
 * 3. Si ninguna regla casa, se cae al `TYPE_FALLBACK` del
 *    `treatment_type` — la plantilla canónica de esa familia. Cubre a
 *    la clínica renombrando un servicio en Ajustes.
 * 4. Si tampoco hay fallback, se devuelve `null` y el render lanza un
 *    error explícito. Preferimos un 500 legible a imprimir el precio
 *    equivocado en un documento que la paciente firma.
 *
 * ── HUECO PENDIENTE: Banking de Ovocitos ────────────────────────
 * "PRESUPUESTO DE BANKING DE OVOCITOS ^M FIV.docx" NO está
 * implementado. El documento trae DOS bloques con su propio "TOTAL:"
 * (banking de 3 estimulaciones = S/ 39,700 · descongelación + FIV +
 * transferencia = S/ 9,350) y no está resuelto si es un presupuesto
 * de S/ 49,050 o dos presupuestos separados que la clínica emite por
 * etapas. El founder lo confirma y entonces se añade:
 *
 *   · 1 (o 2) data file(s) en `data/` con los desgloses — ojo, hay
 *     que verificar su aritmética: la 3.ª estimulación suma
 *     5,700+4,000+2,000 = 11,700 ✓ pero el bloque de transferencia
 *     dice 120 + 3,050 = 4,250 cuando los ítems suman 3,170 (errata);
 *   · la(s) plantilla(s) `templates/patricia/BANKING*.hbs`;
 *   · la(s) entrada(s) en `PATRICIA_ROUTES` de abajo;
 *   · una regla en `NAME_RULES` ANTES de la de CRIO y la de FIV.
 *
 * Mientras tanto, la regla `BANKING_PARKED` intercepta el nombre y
 * devuelve `null` a propósito: sin ella, "BANKING DE OVOCITOS + FIV"
 * casaría con la regla de FIV y se emitiría un presupuesto de
 * S/ 21,000 por un tratamiento de ~S/ 49,000.
 */

import type { BudgetTreatmentType } from "@/lib/plugins/types";

/** Claves estables de plantilla. Una por presupuesto del .docx. */
export type PatriciaRouteKey =
  | "FIV"
  | "FIV_SEMEN_DONADO"
  | "FIV_MIXTO"
  | "OVODON"
  | "OVODON_DONANTE_CONOCIDA"
  | "OVODON_SEMEN_DONADO"
  | "DUOSTIM"
  | "CRIO"
  | "TED"
  | "IIU"
  | "IIU_SEMEN_DONADO"
  | "ROPA";

export interface PatriciaRoute {
  key: PatriciaRouteKey;
  /** Archivo bajo `lib/budget-pdf/templates/patricia/`. */
  templateFile: string;
  /** Título del documento (h1 + <title> + cabecera de continuación). */
  title: string;
  /** `.docx` del que salieron los precios — trazabilidad para revisores. */
  source: string;
}

export const PATRICIA_ROUTES: Record<PatriciaRouteKey, PatriciaRoute> = {
  FIV: {
    key: "FIV",
    templateFile: "FIV.hbs",
    title: "Fecundación in Vitro (FIV)",
    source: "PRESUPUESTO FIV.docx",
  },
  FIV_SEMEN_DONADO: {
    key: "FIV_SEMEN_DONADO",
    templateFile: "FIV-SEMEN-DONADO.hbs",
    title: "Fecundación in Vitro con semen donado",
    source: "PRESUPUESTO DE FIV CON SEMEN DONADO.docx",
  },
  FIV_MIXTO: {
    key: "FIV_MIXTO",
    templateFile: "FIV-MIXTO.hbs",
    title: "FIV mixta · óvulos propios + óvulos donados",
    source: "presupuesto FIV mixto.docx",
  },
  OVODON: {
    key: "OVODON",
    templateFile: "OVODON.hbs",
    title: "Fecundación in Vitro con óvulos donados",
    source: "Presupuesto fiv ovulos donados ( ovodon).docx",
  },
  OVODON_DONANTE_CONOCIDA: {
    key: "OVODON_DONANTE_CONOCIDA",
    templateFile: "OVODON-DONANTE-CONOCIDA.hbs",
    title: "FIV con óvulos donados · donante conocida",
    source: "Presupuesto FIV ovulos donados donante conocida.docx",
  },
  OVODON_SEMEN_DONADO: {
    key: "OVODON_SEMEN_DONADO",
    templateFile: "OVODON-SEMEN-DONADO.hbs",
    title: "FIV con óvulos donados y semen donado",
    source: "PRESUPUESTO FIV CON OVULOS DONADOS Y SEMEN DONADO.docx",
  },
  DUOSTIM: {
    key: "DUOSTIM",
    templateFile: "DUOSTIM.hbs",
    title: "DUO STIM · doble estimulación ovárica",
    source: "PRESUPUESTO DUOSTIM.docx",
  },
  CRIO: {
    key: "CRIO",
    templateFile: "CRIO.hbs",
    title: "Criopreservación de ovocitos",
    source: "PRESUPUESTO DE CRIO DE OVOCITOS.docx",
  },
  TED: {
    key: "TED",
    templateFile: "TED.hbs",
    title: "Transferencia embrionaria",
    source: "TRANSFERENCIA EMBRIONARIA.docx",
  },
  IIU: {
    key: "IIU",
    templateFile: "IIU.hbs",
    title: "Inseminación intrauterina",
    source: "PRESUPUESTO INSEMINACION INTRAUTERINA.docx",
  },
  IIU_SEMEN_DONADO: {
    key: "IIU_SEMEN_DONADO",
    templateFile: "IIU-SEMEN-DONADO.hbs",
    title: "Inseminación intrauterina con semen donado",
    source: "PRESUPUESTO DE INSEMINACION CON SEMEN DONADO.docx",
  },
  ROPA: {
    key: "ROPA",
    templateFile: "ROPA.hbs",
    title: "Método ROPA",
    source: "PRESUPUESTO ROPA.docx",
  },
};

/** Tipos de tratamiento que el plugin declara en el registry. */
export const PATRICIA_TREATMENT_TYPES: BudgetTreatmentType[] = [
  "FIV",
  "OVODONACION",
  "DUOSTIM",
  "CRIO",
  "TED",
  "IIU",
  "ROPA",
];

/**
 * "Fecundación in Vitro (ovodonación)" → "FECUNDACION IN VITRO (OVODONACION)".
 * NFD + strip de diacríticos: la clínica escribe los nombres a mano en
 * Ajustes y las tildes son inconsistentes entre servicios.
 */
export function normalizeServiceName(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/\s+/g, " ")
    .trim();
}

const has = (n: string, ...needles: string[]) =>
  needles.some((x) => n.includes(x));

/** Marcador interno: nombre reconocido pero deliberadamente sin plantilla. */
const PARKED = "__PARKED__" as const;

interface NameRule {
  /** Solo documentación — aparece en el mensaje de error del render. */
  label: string;
  when: (name: string) => boolean;
  route: PatriciaRouteKey | typeof PARKED;
}

/**
 * Reglas EN ORDEN DE PRIORIDAD. La primera que casa gana.
 * No reordenar sin releer los comentarios de la cabecera.
 */
const NAME_RULES: NameRule[] = [
  // ── 0. Parqueado (ver cabecera). Debe ir ANTES de CRIO y de FIV. ──
  {
    label: "Banking de ovocitos (parqueado)",
    when: (n) => has(n, "BANKING"),
    route: PARKED,
  },

  // ── 1. Familia de óvulos donados — antes que FIV a secas ─────────
  {
    label: "FIV mixta (óvulos propios + donados)",
    when: (n) =>
      has(n, "MIXT") ||
      (has(n, "OVULOS PROPIOS") && has(n, "OVULOS DONADOS", "DONADOS")),
    route: "FIV_MIXTO",
  },
  {
    label: "Ovodonación + semen donado",
    when: (n) =>
      has(n, "OVULOS DONADOS", "OVULO DONADO", "OVODON", "OVODONACION") &&
      has(n, "SEMEN DONADO", "SEMEN DE DONANTE"),
    route: "OVODON_SEMEN_DONADO",
  },
  {
    label: "Ovodonación con donante conocida",
    when: (n) =>
      has(n, "OVULOS DONADOS", "OVULO DONADO", "OVODON", "OVODONACION") &&
      has(n, "CONOCID"),
    route: "OVODON_DONANTE_CONOCIDA",
  },
  {
    label: "Ovodonación",
    when: (n) => has(n, "OVULOS DONADOS", "OVULO DONADO", "OVODON", "OVODONACION"),
    route: "OVODON",
  },

  // ── 2. Tratamientos con nombre inequívoco ────────────────────────
  { label: "Método ROPA", when: (n) => has(n, "ROPA"), route: "ROPA" },
  {
    label: "DUO STIM",
    when: (n) => has(n, "DUO STIM", "DUOSTIM", "DOBLE ESTIMULACION"),
    route: "DUOSTIM",
  },

  // ── 3. Inseminación — antes que FIV (no comparten tokens, pero el
  //       orden deja la intención explícita) ────────────────────────
  {
    label: "Inseminación intrauterina con semen donado",
    when: (n) =>
      has(n, "INSEMINAC", "IIU", "IUI") &&
      has(n, "SEMEN DONADO", "SEMEN DE DONANTE"),
    route: "IIU_SEMEN_DONADO",
  },
  {
    label: "Inseminación intrauterina",
    when: (n) => has(n, "INSEMINAC", "IIU", "IUI"),
    route: "IIU",
  },

  // ── 4. Criopreservación y transferencia diferida ─────────────────
  {
    label: "Criopreservación de ovocitos",
    when: (n) =>
      has(n, "CRIO", "VITRIFICAC", "CONGELAC") &&
      has(n, "OVOCITO", "OVULO", "OVOCITOS", "OVULOS"),
    route: "CRIO",
  },
  {
    label: "Transferencia embrionaria",
    when: (n) => has(n, "TRANSFERENCIA EMBRIONARIA", "TED"),
    route: "TED",
  },

  // ── 5. FIV con óvulos propios — la familia más genérica, al final ─
  {
    label: "FIV con semen donado",
    when: (n) =>
      has(n, "FIV", "IN VITRO", "ICSI") &&
      has(n, "SEMEN DONADO", "SEMEN DE DONANTE"),
    route: "FIV_SEMEN_DONADO",
  },
  {
    label: "FIV",
    when: (n) => has(n, "FIV", "IN VITRO", "ICSI"),
    route: "FIV",
  },
];

/**
 * Última red: si el nombre del servicio no dice nada reconocible, se
 * imprime la plantilla canónica del `treatment_type`. Nótese que no
 * hay entrada para tipos sin plantilla — devolver `null` es correcto.
 */
const TYPE_FALLBACK: Partial<Record<BudgetTreatmentType, PatriciaRouteKey>> = {
  FIV: "FIV",
  OVODONACION: "OVODON",
  DUOSTIM: "DUOSTIM",
  CRIO: "CRIO",
  TED: "TED",
  IIU: "IIU",
  ROPA: "ROPA",
};

/**
 * Resuelve la plantilla para (tipo de tratamiento, nombre de servicio).
 * `null` = sin plantilla → el render lanza un error explícito y la
 * petición devuelve 500 con el motivo, en lugar de imprimir precios
 * de otro tratamiento.
 */
export function resolvePatriciaRoute(
  treatmentType: string,
  serviceName: string,
): PatriciaRoute | null {
  const normalized = normalizeServiceName(serviceName ?? "");

  for (const rule of NAME_RULES) {
    if (!rule.when(normalized)) continue;
    if (rule.route === PARKED) return null;
    return PATRICIA_ROUTES[rule.route];
  }

  const fallback = TYPE_FALLBACK[treatmentType as BudgetTreatmentType];
  return fallback ? PATRICIA_ROUTES[fallback] : null;
}
