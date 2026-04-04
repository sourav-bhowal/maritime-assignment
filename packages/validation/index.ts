import { z } from "zod";

// ─── Shared Enums ────────────────────────────────────────────────────

export const DocumentTypeEnum = z.enum([
  "COC",
  "COP_BT",
  "COP_PSCRB",
  "COP_AFF",
  "COP_MEFA",
  "COP_MECA",
  "COP_SSO",
  "COP_SDSD",
  "ECDIS_GENERIC",
  "ECDIS_TYPE",
  "SIRB",
  "PASSPORT",
  "PEME",
  "DRUG_TEST",
  "YELLOW_FEVER",
  "ERM",
  "MARPOL",
  "SULPHUR_CAP",
  "BALLAST_WATER",
  "HATCH_COVER",
  "BRM_SSBT",
  "TRAIN_TRAINER",
  "HAZMAT",
  "FLAG_STATE",
  "OTHER",
]);

export const ApplicableRoleEnum = z.enum(["DECK", "ENGINE", "BOTH", "N/A"]);
export const ConfidenceEnum = z.enum(["HIGH", "MEDIUM", "LOW"]);
export const SeverityEnum = z.enum(["CRITICAL", "HIGH", "MEDIUM", "LOW"]);
export const FieldStatusEnum = z.enum([
  "OK",
  "EXPIRED",
  "WARNING",
  "MISSING",
  "N/A",
]);
export const CategoryEnum = z.enum([
  "IDENTITY",
  "CERTIFICATION",
  "STCW_ENDORSEMENT",
  "MEDICAL",
  "TRAINING",
  "FLAG_STATE",
  "OTHER",
]);

export const JobStatusEnum = z.enum([
  "QUEUED",
  "PROCESSING",
  "COMPLETE",
  "FAILED",
]);

export const ValidationStatusEnum = z.enum([
  "APPROVED",
  "CONDITIONAL",
  "REJECTED",
]);

export const OverallHealthEnum = z.enum(["OK", "WARN", "CRITICAL"]);

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
    !ACCEPTED_MIME_TYPES.includes(file.mimetype as (typeof ACCEPTED_MIME_TYPES)[number])
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
  jobId: z.string().uuid(),
});

// ─── GET /api/sessions/:sessionId — Params ──────────────────────────

export const sessionParamsSchema = z.object({
  sessionId: z.string().uuid(),
});

// ─── POST /api/sessions/:sessionId/validate — No body needed ────────
// (uses sessionParamsSchema for params)

// ─── LLM Extraction Result Validation ───────────────────────────────

export const detectionSchema = z.object({
  documentType: z.string(),
  documentName: z.string(),
  category: CategoryEnum,
  applicableRole: ApplicableRoleEnum,
  isRequired: z.boolean(),
  confidence: ConfidenceEnum,
  detectionReason: z.string(),
});

export const holderSchema = z.object({
  fullName: z.string().nullable(),
  dateOfBirth: z.string().nullable(),
  nationality: z.string().nullable(),
  passportNumber: z.string().nullable(),
  sirbNumber: z.string().nullable(),
  rank: z.string().nullable(),
  photo: z.enum(["PRESENT", "ABSENT"]),
});

export const extractedFieldSchema = z.object({
  key: z.string(),
  label: z.string(),
  value: z.string(),
  importance: SeverityEnum,
  status: FieldStatusEnum,
});

export const validitySchema = z.object({
  dateOfIssue: z.string().nullable(),
  dateOfExpiry: z.string().nullable(),
  isExpired: z.boolean(),
  daysUntilExpiry: z.number().nullable(),
  revalidationRequired: z.boolean().nullable(),
});

export const complianceSchema = z.object({
  issuingAuthority: z.string(),
  regulationReference: z.string().nullable(),
  imoModelCourse: z.string().nullable(),
  recognizedAuthority: z.boolean(),
  limitations: z.string().nullable(),
});

export const medicalDataSchema = z.object({
  fitnessResult: z.enum(["FIT", "UNFIT", "N/A"]),
  drugTestResult: z.enum(["NEGATIVE", "POSITIVE", "N/A"]),
  restrictions: z.string().nullable(),
  specialNotes: z.string().nullable(),
  expiryDate: z.string().nullable(),
});

export const flagSchema = z.object({
  severity: SeverityEnum,
  message: z.string(),
});

/**
 * Full schema for validating LLM extraction output.
 */
export const extractionResultSchema = z.object({
  detection: detectionSchema,
  holder: holderSchema,
  fields: z.array(extractedFieldSchema),
  validity: validitySchema,
  compliance: complianceSchema,
  medicalData: medicalDataSchema,
  flags: z.array(flagSchema),
  summary: z.string(),
});

// ─── LLM Validation Result Schema ───────────────────────────────────

export const consistencyCheckSchema = z.object({
  field: z.string(),
  status: z.enum(["CONSISTENT", "MISMATCH", "PARTIAL"]),
  details: z.string(),
  documents: z.array(z.string()),
});

export const missingDocumentSchema = z.object({
  documentType: z.string(),
  documentName: z.string(),
  requirement: z.string(),
  severity: SeverityEnum,
});

export const expiringDocumentSchema = z.object({
  documentType: z.string(),
  documentName: z.string(),
  holderName: z.string().nullable(),
  expiryDate: z.string(),
  daysUntilExpiry: z.number(),
  isExpired: z.boolean(),
  urgency: SeverityEnum,
});

export const medicalFlagSchema = z.object({
  issue: z.string(),
  severity: SeverityEnum,
  recommendation: z.string(),
});

export const holderProfileSchema = z.object({
  fullName: z.string().nullable(),
  dateOfBirth: z.string().nullable(),
  nationality: z.string().nullable(),
  passportNumber: z.string().nullable(),
  sirbNumber: z.string().nullable(),
  detectedRole: ApplicableRoleEnum,
});

export const validationResultSchema = z.object({
  holderProfile: holderProfileSchema,
  consistencyChecks: z.array(consistencyCheckSchema),
  missingDocuments: z.array(missingDocumentSchema),
  expiringDocuments: z.array(expiringDocumentSchema),
  medicalFlags: z.array(medicalFlagSchema),
  overallStatus: ValidationStatusEnum,
  overallScore: z.number().min(0).max(100),
  summary: z.string(),
  recommendations: z.array(z.string()),
});

// ─── Error Response Schema ───────────────────────────────────────────

export const ErrorCodeEnum = z.enum([
  "UNSUPPORTED_FORMAT",
  "INSUFFICIENT_DOCUMENTS",
  "FILE_TOO_LARGE",
  "SESSION_NOT_FOUND",
  "JOB_NOT_FOUND",
  "LLM_JSON_PARSE_FAIL",
  "RATE_LIMITED",
  "INTERNAL_ERROR",
]);

export const errorResponseSchema = z.object({
  error: ErrorCodeEnum,
  message: z.string(),
  extractionId: z.string().uuid().nullable().optional(),
  retryAfterMs: z.number().nullable().optional(),
});

// ─── Type Exports ────────────────────────────────────────────────────

export type ExtractQuery = z.infer<typeof extractQuerySchema>;
export type ExtractBody = z.infer<typeof extractBodySchema>;
export type JobParams = z.infer<typeof jobParamsSchema>;
export type SessionParams = z.infer<typeof sessionParamsSchema>;
export type ExtractionResultParsed = z.infer<typeof extractionResultSchema>;
export type ValidationResultParsed = z.infer<typeof validationResultSchema>;
export type ErrorResponse = z.infer<typeof errorResponseSchema>;
export type ErrorCode = z.infer<typeof ErrorCodeEnum>;
