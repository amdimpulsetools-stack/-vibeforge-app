/**
 * Claves de React Query compartidas entre hooks/providers.
 *
 * Vive en un módulo SIN dependencias (ni supabase, ni react) a propósito:
 * componentes que no deben importar supabase-js estáticamente (p. ej.
 * theme-provider, que va en el bundle público) pueden reutilizar la clave
 * sin arrastrar el chunk de supabase al First Load de landing/login/blog.
 */
export const AUTH_USER_QUERY_KEY = ["auth", "user"] as const;
