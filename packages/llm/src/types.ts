import {
  ApplicableRole,
  Confidence,
  DocumentCategory,
  DocumentType,
  FitnessResult,
  DrugTestResult,
} from "@repo/database";

/** * Detection metadata from LLM document analysis.
 */
export interface Detection {
  documentType: DocumentType;
  documentName: string;
  category: DocumentCategory;
  applicableRole: ApplicableRole;
  isRequired: boolean;
  confidence: Confidence;
  detectionReason: string;
}

/**
 * Holder information extracted from the document.
 */
export interface Holder {
  fullName: string | null;
  dateOfBirth: string | null;
  nationality: string | null;
  passportNumber: string | null;
  sirbNumber: string | null;
  rank: string | null;
  photo: "PRESENT" | "ABSENT";
}

/**
 * A single extracted field from the document.
 */
export interface ExtractedField {
  key: string;
  label: string;
  value: string;
  importance: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";
  status: "OK" | "EXPIRED" | "WARNING" | "MISSING";
}

/**
 * Validity information for the document.
 */
export interface Validity {
  dateOfIssue: string | null;
  dateOfExpiry: string | "No Expiry" | "Lifetime" | null;
  isExpired: boolean;
  daysUntilExpiry: number | null;
  revalidationRequired: boolean | null;
}

/**
 * Compliance and regulatory information.
 */
export interface Compliance {
  issuingAuthority: string;
  regulationReference: string | null;
  imoModelCourse: string | null;
  recognizedAuthority: boolean;
  limitations: string | null;
}

/**
 * Medical data extracted from the document.
 */
export interface MedicalData {
  fitnessResult: FitnessResultEnum;
  drugTestResult: DrugTestResultEnum;
  restrictions: string | null;
  specialNotes: string | null;
  expiryDate: string | null;
}

export type FitnessResultEnum = FitnessResult;

export type DrugTestResultEnum = DrugTestResult;

/**
 * A flag raised during extraction.
 */
export interface ExtractionFlag {
  severity: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";
  message: string;
}

/**
 * Full extraction result from LLM document analysis.
 */
export interface ExtractionResult {
  detection: Detection;
  holder: Holder;
  fields: ExtractedField[];
  validity: Validity;
  compliance: Compliance;
  medicalData: MedicalData;
  flags: ExtractionFlag[];
  summary: string;
  rawResponse?: string;
}

// ─── Validation Types ───────────────────────────────────────────────

/**
 * Cross-document consistency check result.
 */
export interface ConsistencyCheck {
  field: string;
  status: "CONSISTENT" | "MISMATCH" | "PARTIAL";
  details: string;
  documents: string[];
}

/**
 * A missing required document for the seafarer's role.
 */
export interface MissingDocument {
  documentType: string;
  documentName: string;
  requirement: string;
  severity: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";
}

/**
 * A document that is expiring or already expired.
 */
export interface ExpiringDocument {
  documentType: string;
  documentName: string;
  holderName: string | null;
  expiryDate: string;
  daysUntilExpiry: number;
  isExpired: boolean;
  urgency: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";
}

/**
 * A medical flag from the validation analysis.
 */
export interface MedicalFlag {
  issue: string;
  severity: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";
  recommendation: string;
}

/**
 * Holder profile aggregated from all session documents.
 */
export interface HolderProfile {
  fullName: string | null;
  dateOfBirth: string | null;
  nationality: string | null;
  passportNumber: string | null;
  sirbNumber: string | null;
  detectedRole: "DECK" | "ENGINE" | "BOTH" | "N/A";
}

/**
 * Full cross-document validation result from LLM.
 */
export interface ValidationResult {
  holderProfile: HolderProfile;
  consistencyChecks: ConsistencyCheck[];
  missingDocuments: MissingDocument[];
  expiringDocuments: ExpiringDocument[];
  medicalFlags: MedicalFlag[];
  overallStatus: "APPROVED" | "CONDITIONAL" | "REJECTED";
  overallScore: number;
  summary: string;
  recommendations: string[];
}

/**
 * LLM provider interface for document extraction and validation.
 */
export interface LLMProvider {
  extract(fileBuffer: Buffer, mimeType: string, fileName: string): Promise<ExtractionResult>;

  validate(extractions: ExtractionResult[]): Promise<ValidationResult>;
}
