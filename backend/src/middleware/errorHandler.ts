import type { ErrorRequestHandler, RequestHandler } from 'express';
import { Prisma } from '@prisma/client';
import { ZodError } from 'zod';
import { HttpError } from '../lib/errors.js';
import { logger } from '../lib/logger.js';
import { isProd } from '../config/env.js';

export const notFoundHandler: RequestHandler = (req, res) => {
  res.status(404).json({
    error: { code: 'NOT_FOUND', message: `Route ${req.method} ${req.path} not found` },
    message: `Route ${req.method} ${req.path} not found`,
  });
};

export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  if (err instanceof HttpError) {
    res.status(err.status).json({
      error: { code: err.code, message: err.message, details: err.details },
      message: err.message,
    });
    return;
  }

  if (err instanceof ZodError) {
    res.status(400).json({
      error: { code: 'BAD_REQUEST', message: 'Validation failed', details: err.flatten() },
      message: 'Validation failed',
    });
    return;
  }

  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === 'P2002') {
      const target = (err.meta?.target as string[] | undefined)?.join(', ') ?? 'field';
      res.status(409).json({
        error: { code: 'CONFLICT', message: `A record with this ${target} already exists` },
        message: `A record with this ${target} already exists`,
      });
      return;
    }
    if (err.code === 'P2025') {
      res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Record not found' }, message: 'Record not found' });
      return;
    }
  }

  // body-parser errors
  if (typeof err === 'object' && err && 'type' in err && (err as { type: string }).type === 'entity.too.large') {
    res.status(413).json({ error: { code: 'PAYLOAD_TOO_LARGE', message: 'Request body too large' }, message: 'Request body too large' });
    return;
  }
  if (typeof err === 'object' && err && 'type' in err && (err as { type: string }).type === 'entity.parse.failed') {
    res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'Malformed JSON body' }, message: 'Malformed JSON body' });
    return;
  }

  logger.error({ err }, 'Unhandled error');
  res.status(500).json({
    error: {
      code: 'INTERNAL_ERROR',
      message: isProd ? 'Something went wrong' : (err as Error)?.message ?? 'Something went wrong',
    },
    message: isProd ? 'Something went wrong' : (err as Error)?.message ?? 'Something went wrong',
  });
};
