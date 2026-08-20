// Supabase/GoTrue devuelve los errores de auth en inglés técnico y sin
// contexto ("Password is known to be weak…"). Este mapa los convierte en
// mensajes accionables en español. El fallback conserva el texto original
// para no enmascarar errores nuevos que aún no estén mapeados.

type AuthErrorLike = {
  code?: string;
  message: string;
};

const BY_CODE: Record<string, string> = {
  invalid_credentials:
    "Email o contraseña incorrectos. Si aún no tienes cuenta, regístrate primero.",
  email_not_confirmed:
    "Tu correo aún no está confirmado. Revisa tu bandeja (y spam) o reenvía el enlace.",
  user_already_exists:
    "Ya existe una cuenta con este correo. Inicia sesión o usa “¿Olvidaste tu contraseña?”.",
  email_exists:
    "Ya existe una cuenta con este correo. Inicia sesión o usa “¿Olvidaste tu contraseña?”.",
  over_email_send_rate_limit:
    "Enviamos varios correos a esta dirección hace poco. Espera unos minutos e intenta de nuevo.",
  over_request_rate_limit:
    "Demasiados intentos seguidos. Espera un minuto e intenta de nuevo.",
  captcha_failed:
    "No pudimos completar la verificación anti-bots. Recarga la página e intenta de nuevo.",
  signup_disabled:
    "El registro de nuevas cuentas está deshabilitado por el momento.",
  same_password:
    "La nueva contraseña debe ser distinta a la actual.",
  email_address_invalid:
    "Ese correo no parece válido. Revisa que esté bien escrito.",
  session_expired:
    "Tu sesión expiró. Vuelve a iniciar sesión.",
};

// GoTrue usa el código weak_password tanto para contraseñas cortas como para
// las que aparecen en filtraciones (HaveIBeenPwned); el mensaje distingue.
export const LEAKED_PASSWORD_MESSAGE =
  "Esta contraseña aparece en filtraciones de datos conocidas, aunque parezca fuerte. Elige una distinta (evita palabras comunes o secuencias).";

const BY_SUBSTRING: Array<[RegExp, string]> = [
  [/known to be weak|easy to guess|pwned/i, LEAKED_PASSWORD_MESSAGE],
  [
    /password should be at least|weak_password|password is too short/i,
    "La contraseña es muy corta. Usa al menos 8 caracteres con mayúsculas y números.",
  ],
  [/invalid login credentials/i, BY_CODE.invalid_credentials],
  [/email not confirmed/i, BY_CODE.email_not_confirmed],
  [/user already registered/i, BY_CODE.user_already_exists],
  [/captcha/i, BY_CODE.captcha_failed],
  [
    /for security purposes, you can only request this after (\d+) second/i,
    "Por seguridad, espera unos segundos antes de volver a intentarlo.",
  ],
  [/rate limit/i, BY_CODE.over_request_rate_limit],
  [/unable to validate email|invalid format/i, BY_CODE.email_address_invalid],
  [
    /new password should be different/i,
    BY_CODE.same_password,
  ],
  [
    /fetch failed|network|load failed/i,
    "Sin conexión. Revisa tu internet e intenta otra vez.",
  ],
];

export function translateAuthError(error: AuthErrorLike): string {
  // El código es más estable que el mensaje entre versiones de Supabase,
  // salvo weak_password, cuyo mensaje distingue corta vs. filtrada.
  if (error.code && error.code !== "weak_password" && BY_CODE[error.code]) {
    return BY_CODE[error.code];
  }
  for (const [pattern, message] of BY_SUBSTRING) {
    if (pattern.test(error.message)) return message;
  }
  return error.message;
}

// Para resaltar el error junto al campo de contraseña (no solo en un toast).
export function isPasswordAuthError(error: AuthErrorLike): boolean {
  return (
    error.code === "weak_password" ||
    /password/i.test(error.message)
  );
}
