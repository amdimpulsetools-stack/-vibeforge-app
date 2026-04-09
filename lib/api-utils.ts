import { NextResponse } from "next/server";
import { ZodSchema, ZodError } from "zod";

/**
 * Parse and validate a JSON request body against a Zod schema.
 * Returns the parsed data or a NextResponse with 400 status on failure.
 */
export async function parseBody<T>(
  request: Request,
  schema: ZodSchema<T>
): Promise<{ data: T; error?: never } | { data?: never; error: NextResponse }> {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return {
      error: NextResponse.json(
        { error: "Cuerpo de solicitud inválido" },
        { status: 400 }
      ),
    };
  }

  try {
    const data = schema.parse(raw);
    return { data };
  } catch (err) {
    if (err instanceof ZodError) {
      const messages = err.errors.map((e) => e.message);
      return {
        error: NextResponse.json(
          { error: "Datos inválidos", details: messages },
          { status: 400 }
        ),
      };
    }
    return {
      error: NextResponse.json(
        { error: "Error de validación" },
        { status: 400 }
      ),
    };
  }
}
