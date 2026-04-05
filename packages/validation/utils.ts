import { Prisma } from "@repo/database";

// ─── Helpers ─────────────────────────────────────────────────────────

/**
 * Parse date strings in various formats (DD/MM/YYYY, YYYY-MM-DD, etc.)
 */
export function parseDate(dateStr: string): Date | null {
  if (!dateStr) return null;

  // Try DD/MM/YYYY
  const ddmmyyyy = dateStr.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (ddmmyyyy) {
    return new Date(`${ddmmyyyy[3]}-${ddmmyyyy[2]}-${ddmmyyyy[1]}`);
  }

  // Try ISO / other formats
  const d = new Date(dateStr);
  return isNaN(d.getTime()) ? null : d;
}

type Extraction = Prisma.ExtractionGetPayload<{
  include: {
    fields: true;
    compliance: true;
    validity: true;
    medical: true;
    flags: true;
  };
}>;

/**
 * Format a Prisma extraction record into the API response shape.
 */
export function formatExtractionResponse(extraction: Extraction) {
  return {
    id: extraction.id,
    sessionId: extraction.sessionId,
    fileName: extraction.fileName,
    promptVersion: extraction.promptVersion,
    documentType: extraction.documentType,
    documentName: extraction.documentName,
    applicableRole: extraction.applicableRole === "NA" ? "N/A" : extraction.applicableRole,
    category: extraction.category,
    isRequired: extraction.isRequired,
    detectionReason: extraction.detectionReason,
    confidence: extraction.confidence,
    holderName: extraction.holderName,
    dateOfBirth: extraction.dateOfBirth ? formatDateString(extraction.dateOfBirth) : null,
    sirbNumber: extraction.sirbNumber,
    passportNumber: extraction.passportNumber,
    fields: (extraction.fields || []).map((f) => ({
      key: f.key,
      label: f.label,
      value: f.value,
      importance: f.importance,
      status: f.status,
    })),
    validity: extraction.validity
      ? {
          dateOfIssue: extraction.validity.dateOfIssue ? formatDateString(extraction.validity.dateOfIssue) : null,
          dateOfExpiry: extraction.validity.dateOfExpiry ? formatDateString(extraction.validity.dateOfExpiry) : null,
          isExpired: extraction.validity.isExpired,
          daysUntilExpiry: extraction.validity.daysUntilExpiry,
          revalidationRequired: extraction.validity.revalidationRequired,
        }
      : null,
    compliance: extraction.compliance
      ? {
          issuingAuthority: extraction.compliance.issuingAuthority,
          regulationReference: extraction.compliance.regulationReference,
          imoModelCourse: extraction.compliance.imoModelCourse,
          recognizedAuthority: extraction.compliance.recognizedAuthority,
          limitations: extraction.compliance.limitations,
        }
      : null,
    medicalData: extraction.medical
      ? {
          fitnessResult: extraction.medical.fitnessResult === "NA" ? "N/A" : extraction.medical.fitnessResult,
          drugTestResult: extraction.medical.drugTestResult === "NA" ? "N/A" : extraction.medical.drugTestResult,
          restrictions: extraction.medical.restrictions,
          specialNotes: extraction.medical.specialNotes,
          expiryDate: extraction.medical.expiryDate ? formatDateString(extraction.medical.expiryDate) : null,
        }
      : null,
    flags: (extraction.flags || []).map((f) => ({
      severity: f.severity,
      message: f.message,
    })),
    isExpired: extraction.isExpired,
    processingTimeMs: extraction.processingTimeMs,
    summary: extraction.summary,
    createdAt: extraction.createdAt,
  };
}

/**
 * Format a Date object to DD/MM/YYYY string.
 */
export function formatDateString(date: Date | string): string {
  const d = date instanceof Date ? date : new Date(date);
  if (isNaN(d.getTime())) return String(date);
  const day = String(d.getDate()).padStart(2, "0");
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const year = d.getFullYear();
  return `${day}/${month}/${year}`;
}

// ─── Helper Functions ────────────────────────────────────────────────

/**
 * Derive overall health: OK | WARN | CRITICAL
 */
export function deriveOverallHealth(
  extractions: Array<{
    isExpired: boolean;
    flags: Array<{ severity: string }>;
    validity?: { daysUntilExpiry: number | null } | null;
  }>
): "OK" | "WARN" | "CRITICAL" {
  const hasCriticalFlags = extractions.some((e) => e.flags.some((f) => f.severity === "CRITICAL"));
  const hasExpiredDocs = extractions.some((e) => e.isExpired);

  if (hasCriticalFlags || hasExpiredDocs) return "CRITICAL";

  const hasWarningFlags = extractions.some((e) => e.flags.some((f) => f.severity === "MEDIUM" || f.severity === "HIGH"));
  const hasExpiringSoon = extractions.some(
    (e) => e.validity?.daysUntilExpiry !== null && e.validity?.daysUntilExpiry !== undefined && e.validity.daysUntilExpiry <= 90
  );

  if (hasWarningFlags || hasExpiringSoon) return "WARN";

  return "OK";
}

/**
 * Detect the dominant role from extraction records.
 */
export function detectRole(extractions: Array<{ applicableRole: string | null }>): string {
  const roles = extractions.map((e) => e.applicableRole).filter((r) => r && r !== "NA" && r !== "N/A" && r !== "BOTH");

  if (roles.length === 0) return "N/A";

  const deckCount = roles.filter((r) => r === "DECK").length;
  const engineCount = roles.filter((r) => r === "ENGINE").length;

  if (deckCount > 0 && engineCount > 0) return "BOTH";
  if (deckCount > 0) return "DECK";
  if (engineCount > 0) return "ENGINE";
  return "N/A";
}

/**
 * Format Date to DD/MM/YYYY string.
 */
export function formatDate(date: Date | string): string {
  const d = date instanceof Date ? date : new Date(date);
  if (isNaN(d.getTime())) return String(date);
  const day = String(d.getDate()).padStart(2, "0");
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const year = d.getFullYear();
  return `${day}/${month}/${year}`;
}

export function mapNAEnum(value: string): any {
  if (value === "N/A") {
    return "NA";
  }
  return value;
}
