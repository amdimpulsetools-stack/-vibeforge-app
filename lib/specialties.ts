// Canonical list of medical specialties used across the app.
// Mirrors the seed in supabase/migrations/076_specialties.sql.
// The DB table `specialties` is the source of truth for ids; this
// module exposes the names/slugs in code so we can render them in
// pickers, validate against onboarding, and tag doctors without
// always round-tripping to the DB.

export interface SpecialtyOption {
  /** Slug — stable identifier matching the DB seed. */
  slug: string;
  /** Display name (es-PE). */
  name: string;
  /** Optional one-liner. */
  description?: string;
}

export const SPECIALTIES: ReadonlyArray<SpecialtyOption> = [
  { slug: "medicina-general", name: "Medicina General", description: "Atención médica primaria y preventiva" },
  { slug: "odontologia", name: "Odontología", description: "Salud bucal y dental" },
  { slug: "ginecologia-obstetricia", name: "Ginecología y Obstetricia", description: "Salud femenina, embarazo y parto" },
  { slug: "pediatria", name: "Pediatría", description: "Atención médica infantil" },
  { slug: "dermatologia", name: "Dermatología", description: "Piel, cabello y uñas" },
  { slug: "oftalmologia", name: "Oftalmología", description: "Salud visual y ocular" },
  { slug: "cardiologia", name: "Cardiología", description: "Corazón y sistema cardiovascular" },
  { slug: "endocrinologia", name: "Endocrinología", description: "Hormonas y metabolismo" },
  { slug: "endocrinologia-pediatrica", name: "Endocrinología Pediátrica", description: "Crecimiento y desarrollo hormonal infantil" },
  { slug: "medicina-reproductiva", name: "Medicina Reproductiva", description: "Fertilidad y reproducción asistida" },
  { slug: "nutricion", name: "Nutrición", description: "Alimentación y dietética" },
  { slug: "psicologia", name: "Psicología", description: "Salud mental y bienestar emocional" },
  { slug: "psiquiatria", name: "Psiquiatría", description: "Trastornos mentales y tratamiento farmacológico" },
  { slug: "traumatologia-ortopedia", name: "Traumatología y Ortopedia", description: "Huesos, articulaciones y sistema musculoesquelético" },
  { slug: "otorrinolaringologia", name: "Otorrinolaringología", description: "Oído, nariz y garganta" },
  { slug: "urologia", name: "Urología", description: "Sistema urinario y reproductor masculino" },
  { slug: "neurologia", name: "Neurología", description: "Sistema nervioso" },
  { slug: "gastroenterologia", name: "Gastroenterología", description: "Sistema digestivo" },
  { slug: "neumologia", name: "Neumología", description: "Sistema respiratorio" },
  { slug: "fisioterapia", name: "Fisioterapia", description: "Rehabilitación física" },
  { slug: "cirugia-general", name: "Cirugía General", description: "Procedimientos quirúrgicos" },
  { slug: "cirugia-plastica", name: "Cirugía Plástica", description: "Cirugía reconstructiva y estética" },
  { slug: "medicina-estetica", name: "Medicina Estética", description: "Tratamientos estéticos no quirúrgicos" },
  { slug: "oncologia", name: "Oncología", description: "Diagnóstico y tratamiento del cáncer" },
  { slug: "nefrologia", name: "Nefrología", description: "Riñones y sistema renal" },
  { slug: "reumatologia", name: "Reumatología", description: "Enfermedades autoinmunes y articulares" },
  { slug: "medicina-interna", name: "Medicina Interna", description: "Enfermedades de órganos internos" },
  { slug: "otra", name: "Otra especialidad", description: "Especialidad no listada" },
] as const;

export function findSpecialtyBySlug(slug: string | null | undefined): SpecialtyOption | undefined {
  if (!slug) return undefined;
  return SPECIALTIES.find((s) => s.slug === slug);
}

export function findSpecialtyByName(name: string | null | undefined): SpecialtyOption | undefined {
  if (!name) return undefined;
  return SPECIALTIES.find((s) => s.name.toLowerCase() === name.toLowerCase());
}
