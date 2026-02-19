export type { Database } from "./database";

// Tipos de respuesta genéricos
export interface ApiResponse<T = unknown> {
  data: T | null;
  error: string | null;
}

// Paginación
export interface PaginatedResponse<T> {
  data: T[];
  count: number;
  page: number;
  pageSize: number;
  totalPages: number;
}
