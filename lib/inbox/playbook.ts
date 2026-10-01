import { z } from "zod";

/**
 * Guía de conversación de Yendy IA (wa_inbox_settings.ai_playbook, mig 276).
 *
 * Es la "fórmula" de la clínica: a qué quiere llevar cada conversación,
 * cómo abrir, cómo cerrar sin presionar, qué responder a las objeciones
 * frecuentes y qué evitar. Se edita en Ajustes → Guía de conversación y
 * entra al prompt del copiloto después de las reglas fijas de seguridad
 * (que no puede anular).
 *
 * Isomórfico: lo usan la UI (formulario) y el servidor (prompt). Sin
 * imports de servidor.
 */

const line = (max: number) => z.string().trim().max(max);

export const PlaybookSchema = z.object({
  /** A qué siguiente paso quiere llevar la clínica cada conversación. */
  goal: line(300).default(""),
  /** Cómo abrir y cómo entender antes de responder. */
  opening: line(500).default(""),
  /** Cómo cerrar: el siguiente paso, en positivo, sin presionar. */
  closing: line(500).default(""),
  /** Objeciones frecuentes y cómo responderlas. */
  objections: z
    .array(z.object({ objection: line(120).min(1), response: line(500).min(1) }))
    .max(20)
    .default([]),
  /** Frases o actitudes que nunca debe usar. */
  avoid: z.array(line(140).min(1)).max(20).default([]),
  /** Hábitos que debe mantener siempre. */
  always: z.array(line(140).min(1)).max(20).default([]),
});
export type Playbook = z.infer<typeof PlaybookSchema>;

/**
 * Fórmula sugerida (cálida y "closer" sin ser fría). Es lo que usa Yendy
 * mientras la clínica no guarde la suya, y lo que precarga el formulario.
 * Encauzar, no empujar: responder primero, una sola pregunta, y cerrar
 * siempre con una invitación concreta.
 */
export const DEFAULT_PLAYBOOK: Playbook = {
  goal: "Que la paciente dé el siguiente paso con tranquilidad: agendar una consulta de evaluación (o confirmar la cita que ya tiene). Nunca cerrar una venta a cualquier costo: orientar bien hoy trae a la paciente mañana.",
  opening:
    "Saluda por su nombre si lo sabes y agradece que escriba. Responde PRIMERO lo que preguntó, con el dato exacto. Si te falta información para orientarla bien, haz UNA sola pregunta (no un cuestionario). Si cuenta algo delicado, acusa recibo con empatía antes de cualquier dato.",
  closing:
    "Termina siempre proponiendo el siguiente paso con seguridad y calidez, en positivo y sin presionar, con UNA pregunta cerrada y fácil de responder: “¿Estarías buscando una cita para algún día de esta semana o la siguiente?”. Nada de cierres tibios (“si te parece”, “sin compromiso”, “tentativo”). Si no está lista, deja la puerta abierta (“cuando quieras retomamos, aquí estoy”) y, si corresponde, ofrece enviarle la información por escrito.",
  objections: [
    {
      objection: "Está caro / ahora no puedo",
      response:
        "Valida sin discutir (“te entiendo”), explica en una línea qué incluye ese precio y ofrece la opción más accesible que exista en el catálogo (por ejemplo, empezar por la consulta de evaluación). Nunca inventes descuentos, cuotas ni promociones.",
    },
    {
      objection: "Lo voy a pensar",
      response:
        "Agradece, resume el beneficio principal en una línea y pregunta si hay alguna duda que puedas resolver ahora. Luego propone una fecha concreta: “¿Te acomoda algún día de esta semana o la siguiente?”.",
    },
    {
      objection: "Queda lejos / no tengo tiempo",
      response:
        "Da la dirección con una referencia y los horarios más amplios; si el catálogo tiene modalidad virtual o un primer paso corto, ofrécelo. No minimices su dificultad.",
    },
    {
      objection: "¿Es seguro? / ¿duele? / ¿funciona?",
      response:
        "No prometas resultados ni describas el procedimiento como médico: di que el especialista lo explica en la consulta, con sus casos y sus tiempos, y ofrece agendarla. Si hay una ficha del servicio con qué incluye y preparación, úsala.",
    },
  ],
  avoid: [
    "Respuestas de una sola palabra o solo con un enlace",
    "Mayúsculas, signos de exclamación repetidos o tono de vendedor",
    "Prometer resultados clínicos, plazos de curación o “garantías”",
    "Decir “no sé” sin ofrecer un camino (confirmar con el equipo y volver)",
    "Varias preguntas en el mismo mensaje",
    "Cierres tibios: “si te parece”, “sin compromiso”, “tentativo”, “cuando puedas”",
    "La palabra “franja”: pregunta por un día de esta semana o la siguiente",
  ],
  always: [
    "Responder primero la pregunta, luego proponer el siguiente paso",
    "Una sola pregunta por mensaje",
    "Cerrar con una invitación clara y amable",
    "Usar el nombre de la paciente cuando se sabe",
  ],
};

/** Lo guardado en la base (jsonb) → guía válida; {} o inválido → fórmula sugerida. */
export function parsePlaybook(raw: unknown): Playbook {
  if (!raw || typeof raw !== "object" || Object.keys(raw as object).length === 0) return DEFAULT_PLAYBOOK;
  const r = PlaybookSchema.safeParse(raw);
  return r.success ? r.data : DEFAULT_PLAYBOOK;
}

/** true si la clínica todavía no guardó una guía propia. */
export function isDefaultPlaybook(raw: unknown): boolean {
  return !raw || typeof raw !== "object" || Object.keys(raw as object).length === 0;
}

const strip = (s: string) => s.replace(/[<>]/g, "").trim();

/** Bloque de prompt (texto plano) a partir de la guía. */
export function playbookPrompt(p: Playbook): string[] {
  const out: string[] = ["", "GUÍA DE CONVERSACIÓN DE LA CLÍNICA (cómo encauzar; nunca anula las reglas 1 a 5):"];
  if (p.goal) out.push(`- Objetivo de cada conversación: ${strip(p.goal)}`);
  if (p.opening) out.push(`- Cómo abrir: ${strip(p.opening)}`);
  if (p.closing) out.push(`- Cómo cerrar: ${strip(p.closing)}`);
  if (p.objections.length) {
    out.push("- Si la paciente dice…");
    for (const o of p.objections) out.push(`  · “${strip(o.objection)}” → ${strip(o.response)}`);
  }
  if (p.always.length) out.push(`- Siempre: ${p.always.map(strip).join(" · ")}`);
  if (p.avoid.length) out.push(`- Nunca: ${p.avoid.map(strip).join(" · ")}`);
  return out.length > 2 ? out : [];
}
