import { z } from "zod";

// All branding/legal/contact fields are optional. Empty strings are allowed
// because react-hook-form sets them on initial render of empty inputs; we
// normalize "" → null at submit time in the page.
const optionalString = (max: number, msg?: string) =>
  z
    .string()
    .max(max, msg ?? `Máx ${max} caracteres`)
    .optional()
    .or(z.literal(""));

const optionalUrl = (max: number) =>
  z
    .string()
    .max(max, `Máx ${max} caracteres`)
    .url("Debe ser una URL válida")
    .optional()
    .or(z.literal(""));

export const organizationSchema = z.object({
  // Identity
  name: z
    .string()
    .min(2, "El nombre debe tener al menos 2 caracteres")
    .max(100, "El nombre no puede superar 100 caracteres"),
  slug: z
    .string()
    .min(2, "El slug debe tener al menos 2 caracteres")
    .max(50, "El slug no puede superar 50 caracteres")
    .regex(
      /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
      "Solo letras minúsculas, números y guiones"
    ),
  tagline: optionalString(100),

  // Legal (matches DB CHECK on RUC: 11 digits or null)
  ruc: z
    .string()
    .regex(/^[0-9]{11}$/, "RUC debe tener exactamente 11 dígitos numéricos")
    .optional()
    .or(z.literal("")),
  legal_name: optionalString(150),

  // Location
  address: optionalString(250, "La dirección no puede superar 250 caracteres"),
  district: optionalString(80),
  google_maps_url: optionalUrl(500),

  // Contact
  phone: optionalString(40),
  phone_secondary: optionalString(40),
  email_public: z
    .string()
    .email("Email inválido")
    .max(120)
    .optional()
    .or(z.literal("")),
  website: optionalUrl(150),

  // Social (all URLs except whatsapp which is a phone-like string)
  social_facebook: optionalUrl(200),
  social_instagram: optionalUrl(200),
  social_tiktok: optionalUrl(200),
  social_linkedin: optionalUrl(200),
  social_youtube: optionalUrl(200),
  social_whatsapp: optionalString(40), // can be a phone number or a wa.me URL

  // Branding
  print_color_primary: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/, "Color hexadecimal inválido (ej: #10b981)")
    .optional()
    .or(z.literal("")),
});

export type OrganizationFormData = z.infer<typeof organizationSchema>;
