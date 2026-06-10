// FILE: backend/src/utils/pagination.ts
// Utilidad común para paginar listados con Prisma (skip/take + count).
// Evita cargar tablas completas en memoria en endpoints de listado.

export interface PaginacionQuery {
  page?: string;
  limit?: string;
}

export interface PaginacionParams {
  skip: number;
  take: number;
  page: number;
  limit: number;
}

export interface PaginatedResult<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
}

const LIMIT_DEFAULT = 20;
const LIMIT_MAX = 100;

export function paginar(query: PaginacionQuery): PaginacionParams {
  let page = parseInt(query.page ?? '1', 10);
  let limit = parseInt(query.limit ?? String(LIMIT_DEFAULT), 10);

  if (!Number.isFinite(page) || page < 1) page = 1;
  if (!Number.isFinite(limit) || limit < 1) limit = LIMIT_DEFAULT;
  if (limit > LIMIT_MAX) limit = LIMIT_MAX;

  return { skip: (page - 1) * limit, take: limit, page, limit };
}
