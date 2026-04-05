import { z } from "zod";

// ─── Accepted MIME Types ─────────────────────────────────────────────

export const ACCEPTED_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "application/pdf",
] as const;

export const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

// ─── POST /api/extract — Request Validation ─────────────────────────

export const extractQuerySchema = z.object({
  mode: z.enum(["sync", "async"]).default("sync"),
});

export const extractBodySchema = z.object({
  sessionId: z.uuid().optional(),
});

/**
 * Validate the uploaded file's MIME type and size.
 */
export function validateFile(file: {
  mimetype: string;
  size: number;
}): { valid: true } | { valid: false; code: string; message: string } {
  if (
    !ACCEPTED_MIME_TYPES.includes(
      file.mimetype as (typeof ACCEPTED_MIME_TYPES)[number],
    )
  ) {
    return {
      valid: false,
      code: "UNSUPPORTED_FORMAT",
      message: `Unsupported file type: ${file.mimetype}. Accepted: ${ACCEPTED_MIME_TYPES.join(", ")}`,
    };
  }

  if (file.size > MAX_FILE_SIZE) {
    return {
      valid: false,
      code: "FILE_TOO_LARGE",
      message: `File exceeds maximum size of 10MB (received ${(file.size / 1024 / 1024).toFixed(1)}MB)`,
    };
  }

  return { valid: true };
}

// ─── GET /api/jobs/:jobId — Params ──────────────────────────────────

export const jobParamsSchema = z.object({
  jobId: z.uuid(),
});

// ─── GET /api/sessions/:sessionId — Params ──────────────────────────

export const sessionParamsSchema = z.object({
  sessionId: z.uuid(),
});

// ─── Type Exports ────────────────────────────────────────────────────

export type ExtractQuery = z.infer<typeof extractQuerySchema>;
export type ExtractBody = z.infer<typeof extractBodySchema>;
export type JobParams = z.infer<typeof jobParamsSchema>;
export type SessionParams = z.infer<typeof sessionParamsSchema>;
export * from "./utils.js";
