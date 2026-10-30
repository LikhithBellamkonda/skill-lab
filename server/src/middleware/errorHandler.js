/**
 * Centralised error handler (NFR-09, NFR-14).
 *
 * Guarantees:
 *   * one JSON error shape for every failure;
 *   * MongoDB constraint violations are translated to meaningful HTTP
 *     statuses instead of leaking SQL;
 *   * stack traces and internal details are only logged, never returned.
 */
import { ZodError } from 'zod';
import { HttpError } from '../utils/httpError.js';
import { sendError } from '../utils/respond.js';
import config from '../config/env.js';

function translateMongoError(error) {
  if (error.code === 11000) {
    return new HttpError(409, 'CONFLICT', 'That record already exists.');
  }
  if (error.name === 'CastError') {
    return new HttpError(
      400,
      'BAD_REQUEST',
      'A supplied identifier or value has an invalid format.'
    );
  }
  if (error.name === 'ValidationError') {
    return new HttpError(
      422,
      'VALIDATION_ERROR',
      'The request contains invalid or missing fields.',
      Object.values(error.errors).map((issue) => ({
        field: issue.path,
        message: issue.message,
      }))
    );
  }
  return null;
}

export function errorHandler(error, req, res, _next) {
  let httpError;

  if (error instanceof HttpError) {
    httpError = error;
  } else if (error instanceof ZodError) {
    httpError = new HttpError(
      422,
      'VALIDATION_ERROR',
      'The request contains invalid or missing fields.',
      error.issues.map((issue) => ({
        field: issue.path.join('.') || '(body)',
        message: issue.message,
      }))
    );
  } else if (error.type === 'entity.parse.failed') {
    httpError = new HttpError(400, 'MALFORMED_JSON', 'The request body is not valid JSON.');
  } else if (error.type === 'entity.too.large') {
    httpError = new HttpError(413, 'PAYLOAD_TOO_LARGE', 'The request body is too large.');
  } else if (error.code === 'LIMIT_FILE_SIZE') {
    httpError = new HttpError(
      413,
      'FILE_TOO_LARGE',
      `Uploads are limited to ${config.maxUploadMb} MB.`
    );
  } else if (error.code === 'LIMIT_UNEXPECTED_FILE') {
    httpError = new HttpError(400, 'UNEXPECTED_FILE', 'Unexpected file field in the upload.');
  } else if (
    error.name === 'CastError' ||
    error.name === 'ValidationError' ||
    error.code === 11000
  ) {
    httpError = translateMongoError(error);
  }

  if (!httpError) {
    httpError = new HttpError(500, 'INTERNAL_ERROR', 'An unexpected error occurred.');
  }

  // Log server-side problems with context, but never log secrets or bodies.
  if (httpError.status >= 500) {
    console.error(`[error] ${req.method} ${req.originalUrl} ->`, error.message);
    if (!config.isTest) console.error(error.stack);
  } else if (!config.isTest) {
    console.warn(
      `[warn ] ${req.method} ${req.originalUrl} -> ${httpError.status} ${httpError.code}: ${httpError.message}`
    );
  }

  return sendError(res, httpError.status, httpError.code, httpError.message, httpError.details);
}

export default errorHandler;
