import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { z } from 'zod';
import { badRequest } from './errors.js';

/** Wrap an async route so rejections reach the error handler. */
export const asyncHandler =
  (fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>): RequestHandler =>
  (req, res, next) => {
    fn(req, res, next).catch(next);
  };

export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

export type Pagination = z.infer<typeof paginationSchema>;

export function parsePagination(query: unknown): Pagination & { skip: number } {
  const result = paginationSchema.safeParse(query);
  if (!result.success) throw badRequest('Invalid pagination parameters', result.error.flatten());
  const { page, limit } = result.data;
  return { page, limit, skip: (page - 1) * limit };
}

export function paginated<T>(data: T[], total: number, p: Pagination) {
  return {
    data,
    pagination: {
      page: p.page,
      limit: p.limit,
      total,
      totalPages: Math.max(1, Math.ceil(total / p.limit)),
    },
  };
}

/** Validate and return `req.body` against a zod schema, throwing a 400 on failure. */
export function parseBody<T extends z.ZodTypeAny>(schema: T, body: unknown): z.infer<T> {
  const result = schema.safeParse(body);
  if (!result.success) {
    throw badRequest('Validation failed', result.error.flatten());
  }
  return result.data;
}

export function parseQuery<T extends z.ZodTypeAny>(schema: T, query: unknown): z.infer<T> {
  const result = schema.safeParse(query);
  if (!result.success) {
    throw badRequest('Invalid query parameters', result.error.flatten());
  }
  return result.data;
}
