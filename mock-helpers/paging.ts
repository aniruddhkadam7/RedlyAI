import type { Request } from 'express';

type Pagination = {
  limit: number;
  offset: number;
};

type Paginated<T> = {
  data: T[];
  pagination: {
    total: number;
    limit: number;
    offset: number;
  };
};

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

export const parsePagination = (
  req: Request,
  options?: { defaultLimit?: number; maxLimit?: number },
): Pagination => {
  const defaultLimit = options?.defaultLimit ?? 200;
  const maxLimit = options?.maxLimit ?? 2000;
  const rawLimit = Number((req.query as any)?.limit ?? defaultLimit);
  const rawOffset = Number((req.query as any)?.offset ?? 0);

  const limit = Number.isFinite(rawLimit) ? clamp(rawLimit, 1, maxLimit) : defaultLimit;
  const offset = Number.isFinite(rawOffset) ? Math.max(0, Math.floor(rawOffset)) : 0;
  return { limit, offset };
};

export const paginate = <T>(
  items: T[],
  req: Request,
  options?: { defaultLimit?: number; maxLimit?: number },
): Paginated<T> => {
  const { limit, offset } = parsePagination(req, options);
  const data = items.slice(offset, offset + limit);
  return {
    data,
    pagination: {
      total: items.length,
      limit,
      offset,
    },
  };
};
