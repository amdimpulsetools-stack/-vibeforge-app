/**
 * Catálogo de medicamentos por organización (mig 248).
 *
 * Solo tipos y constantes: lo comparten la página de administración
 * (`app/(dashboard)/admin/medication-catalog/page.tsx`) y el modal de
 * Receta, que autocompleta desde aquí.
 *
 * La tabla `medication_catalog` todavía no está en `types/database.ts`,
 * así que las consultas la leen sin tipar y castean al tipo de abajo.
 */

export interface MedicationCatalogItem {
  id: string;
  organization_id: string;
  name: string;
  concentration: string | null;
  pharmaceutical_form: string | null;
  route: string | null;
  frequency: string | null;
  duration: string | null;
  dose_per_take: string | null;
  default_instructions: string | null;
  /** Vínculo opcional al producto de Farmacia (Almacén). */
  inventory_product_id: string | null;
  is_active: boolean;
  display_order: number;
}

export const MEDICATION_CATALOG_COLUMNS =
  "id, organization_id, name, concentration, pharmaceutical_form, route, frequency, duration, dose_per_take, default_instructions, inventory_product_id, is_active, display_order";

/**
 * Etiqueta legible de un medicamento: "Amoxicilina 500 mg · Cápsula".
 * Omite las partes vacías.
 */
export function medicationLabel(
  item: Pick<MedicationCatalogItem, "name" | "concentration" | "pharmaceutical_form">
): string {
  const head = [item.name?.trim(), item.concentration?.trim()]
    .filter((part): part is string => !!part)
    .join(" ");
  const form = item.pharmaceutical_form?.trim();
  return [head, form].filter((part) => !!part).join(" · ");
}

/** Mismas opciones que el modal de Receta. */
export const MEDICATION_FORMS = [
  "Tableta",
  "Cápsula",
  "Jarabe",
  "Suspensión",
  "Gotas",
  "Ampolla",
  "Crema",
  "Gel",
  "Óvulo",
  "Supositorio",
  "Inhalador",
  "Parche",
  "Sobre",
  "Otro",
] as const;

export const MEDICATION_ROUTES = [
  "Oral",
  "Sublingual",
  "Tópica",
  "Intramuscular",
  "Intravenosa",
  "Subcutánea",
  "Vaginal",
  "Rectal",
  "Oftálmica",
  "Ótica",
  "Nasal",
  "Inhalatoria",
] as const;

export const MEDICATION_FREQUENCIES = [
  "Cada 4 horas",
  "Cada 6 horas",
  "Cada 8 horas",
  "Cada 12 horas",
  "Una vez al día",
  "Dos veces al día",
  "Tres veces al día",
  "Según necesidad",
] as const;

export const MEDICATION_DURATIONS = [
  "3 días",
  "5 días",
  "7 días",
  "10 días",
  "14 días",
  "21 días",
  "1 mes",
  "3 meses",
  "6 meses",
  "Tratamiento continuo",
] as const;
