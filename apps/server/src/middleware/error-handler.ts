import type { Request, Response, NextFunction } from "express";

/**
 * Standardized error response shape matching the assignment spec.
 */
interface AppError extends Error {
  statusCode?: number;
  code?: string;
  extractionId?: string;
  retryAfterMs?: number | null;
}

/**
 * Global error handler middleware.
 */
export function errorHandler(
  err: AppError,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void {
  const statusCode = err.statusCode || 500;
  const code = err.code || "INTERNAL_ERROR";

  console.error(`[Error] ${code}: ${err.message}`, err.stack);

  res.status(statusCode).json({
    error: code,
    message: err.message || "An unexpected error occurred.",
    extractionId: err.extractionId || null,
    retryAfterMs: err.retryAfterMs ?? null,
  });
}

/**
 * Create an AppError with status code and error code.
 */
export function createAppError(
  message: string,
  statusCode: number,
  code: string,
  extras?: { extractionId?: string; retryAfterMs?: number | null },
): AppError {
  const err = new Error(message) as AppError;
  err.statusCode = statusCode;
  err.code = code;
  if (extras?.extractionId) err.extractionId = extras.extractionId;
  if (extras?.retryAfterMs !== undefined) err.retryAfterMs = extras.retryAfterMs;
  return err;
}
