/**
 * Extraction prompt — exact text from the assignment specification.
 * Do NOT modify this prompt.
 */
export const EXTRACTION_PROMPT = `You are an expert maritime document analyst with deep knowledge of STCW, MARINA, IMO, and international seafarer certification standards.

A document has been provided. Perform the following in a single pass:
1. IDENTIFY the document type from the taxonomy below
2. DETERMINE if this belongs to a DECK officer, ENGINE officer, BOTH, or is role-agnostic (N/A)
3. EXTRACT all fields that are meaningful for this specific document type
4. FLAG any compliance issues, anomalies, or concerns

Document type taxonomy (use these exact codes):
COC | COP_BT | COP_PSCRB | COP_AFF | COP_MEFA | COP_MECA | COP_SSO | COP_SDSD |
ECDIS_GENERIC | ECDIS_TYPE | SIRB | PASSPORT | PEME | DRUG_TEST | YELLOW_FEVER |
ERM | MARPOL | SULPHUR_CAP | BALLAST_WATER | HATCH_COVER | BRM_SSBT |
TRAIN_TRAINER | HAZMAT | FLAG_STATE | OTHER

Return ONLY a valid JSON object. No markdown. No code fences. No preamble.

{
  "detection": {
    "documentType": "SHORT_CODE",
    "documentName": "Full human-readable document name",
    "category": "IDENTITY | CERTIFICATION | STCW_ENDORSEMENT | MEDICAL | TRAINING | FLAG_STATE | OTHER",
    "applicableRole": "DECK | ENGINE | BOTH | N/A",
    "isRequired": true,
    "confidence": "HIGH | MEDIUM | LOW",
    "detectionReason": "One sentence explaining how you identified this document"
  },
  "holder": {
    "fullName": "string or null",
    "dateOfBirth": "DD/MM/YYYY or null",
    "nationality": "string or null",
    "passportNumber": "string or null",
    "sirbNumber": "string or null",
    "rank": "string or null",
    "photo": "PRESENT | ABSENT"
  },
  "fields": [
    {
      "key": "snake_case_key",
      "label": "Human-readable label",
      "value": "extracted value as string",
      "importance": "CRITICAL | HIGH | MEDIUM | LOW",
      "status": "OK | EXPIRED | WARNING | MISSING | N/A"
    }
  ],
  "validity": {
    "dateOfIssue": "string or null",
    "dateOfExpiry": "string | 'No Expiry' | 'Lifetime' | null",
    "isExpired": false,
    "daysUntilExpiry": null,
    "revalidationRequired": null
  },
  "compliance": {
    "issuingAuthority": "string",
    "regulationReference": "e.g. STCW Reg VI/1 or null",
    "imoModelCourse": "e.g. IMO 1.22 or null",
    "recognizedAuthority": true,
    "limitations": "string or null"
  },
  "medicalData": {
    "fitnessResult": "FIT | UNFIT | N/A",
    "drugTestResult": "NEGATIVE | POSITIVE | N/A",
    "restrictions": "string or null",
    "specialNotes": "string or null",
    "expiryDate": "string or null"
  },
  "flags": [
    {
      "severity": "CRITICAL | HIGH | MEDIUM | LOW",
      "message": "Description of issue or concern"
    }
  ],
  "summary": "Two-sentence plain English summary of what this document confirms about the holder."
}`;

/**
 * Build a production-quality cross-document compliance validation prompt.
 * This prompt is designed to produce structured, hallucination-resistant output.
 */
export function buildValidationPrompt(
  extractions: Array<{
    detection: { documentType: string; documentName: string; applicableRole: string; category: string };
    holder: { fullName: string | null; dateOfBirth: string | null; nationality: string | null; passportNumber: string | null; sirbNumber: string | null };
    validity: { dateOfIssue: string | null; dateOfExpiry: string | null; isExpired: boolean; daysUntilExpiry: number | null };
    medicalData: { fitnessResult: string; drugTestResult: string; restrictions: string | null; specialNotes: string | null; expiryDate: string | null };
    flags: Array<{ severity: string; message: string }>;
    summary: string;
  }>,
): string {
  const documentSummaries = extractions
    .map(
      (e, i) =>
        `Document ${i + 1}: ${e.detection.documentType} — ${e.detection.documentName}
  Holder: ${e.holder.fullName ?? "Unknown"}
  DOB: ${e.holder.dateOfBirth ?? "Unknown"}
  Nationality: ${e.holder.nationality ?? "Unknown"}
  Passport: ${e.holder.passportNumber ?? "N/A"}
  SIRB: ${e.holder.sirbNumber ?? "N/A"}
  Role: ${e.detection.applicableRole}
  Category: ${e.detection.category}
  Issued: ${e.validity.dateOfIssue ?? "Unknown"} | Expires: ${e.validity.dateOfExpiry ?? "Unknown"}
  Expired: ${e.validity.isExpired} | Days until expiry: ${e.validity.daysUntilExpiry ?? "N/A"}
  Medical fitness: ${e.medicalData.fitnessResult} | Drug test: ${e.medicalData.drugTestResult}
  Restrictions: ${e.medicalData.restrictions ?? "None"}
  Special notes: ${e.medicalData.specialNotes ?? "None"}
  Flags: ${e.flags.length > 0 ? e.flags.map((f) => `[${f.severity}] ${f.message}`).join("; ") : "None"}
  Summary: ${e.summary}`,
    )
    .join("\n\n");

  return `You are a senior maritime compliance officer specializing in STCW, MARINA, IMO, and international seafarer certification standards. You are reviewing a seafarer's complete document portfolio for pre-employment compliance.

Today's date is ${new Date().toISOString().split("T")[0]}.

Below are the extracted records for all documents uploaded in this session. Your task is to perform a CROSS-DOCUMENT compliance assessment.

=== DOCUMENTS ===
${documentSummaries}
=== END DOCUMENTS ===

Perform the following checks in order:

1. HOLDER PROFILE — Aggregate the holder's identity from all documents. If names, DOBs, passport numbers, or SIRB numbers conflict across documents, flag each mismatch.

2. CONSISTENCY CHECKS — For every identity field (full name, DOB, nationality, passport number, SIRB number), compare across ALL documents. Report each field as CONSISTENT, MISMATCH, or PARTIAL (only some documents include it).

3. MISSING DOCUMENTS — Based on the detected role (DECK or ENGINE), identify any REQUIRED documents that are absent from this session. Use STCW and MARINA requirements as your reference. Required documents typically include: COC, SIRB, PASSPORT, PEME, DRUG_TEST, basic safety training (COP_BT, COP_PSCRB, COP_AFF, COP_MEFA), and role-specific endorsements.

4. EXPIRING DOCUMENTS — List every document that is already expired or expires within 180 days. Sort by urgency (expired first, then soonest expiry).

5. MEDICAL FLAGS — Identify any medical concerns: UNFIT results, POSITIVE drug tests, restrictions that may limit deployment, or medical certificates expiring within 90 days.

6. OVERALL STATUS — Assign one of:
   - APPROVED: All required documents present, none expired, no critical flags, identity consistent.
   - CONDITIONAL: Minor issues (documents expiring soon, low-severity flags, missing non-critical certs). Seafarer can deploy with conditions.
   - REJECTED: Critical issues (expired required certs, UNFIT medical, POSITIVE drug test, identity mismatches across documents, missing critical required documents).

7. OVERALL SCORE — Assign an integer 0–100 representing compliance health. 90+ = strong, 70–89 = acceptable with caveats, 50–69 = significant issues, below 50 = not deployable.

8. RECOMMENDATIONS — Provide 2–5 actionable recommendations for the Manning Agent.

Return ONLY a valid JSON object. No markdown. No code fences. No explanation outside the JSON.

{
  "holderProfile": {
    "fullName": "string or null",
    "dateOfBirth": "string or null",
    "nationality": "string or null",
    "passportNumber": "string or null",
    "sirbNumber": "string or null",
    "detectedRole": "DECK | ENGINE | BOTH | N/A"
  },
  "consistencyChecks": [
    {
      "field": "field_name",
      "status": "CONSISTENT | MISMATCH | PARTIAL",
      "details": "Explanation of finding",
      "documents": ["DOC_TYPE_1", "DOC_TYPE_2"]
    }
  ],
  "missingDocuments": [
    {
      "documentType": "SHORT_CODE",
      "documentName": "Full name",
      "requirement": "Why this is required (e.g. STCW Reg reference)",
      "severity": "CRITICAL | HIGH | MEDIUM | LOW"
    }
  ],
  "expiringDocuments": [
    {
      "documentType": "SHORT_CODE",
      "documentName": "Full name",
      "holderName": "string or null",
      "expiryDate": "string",
      "daysUntilExpiry": 0,
      "isExpired": true,
      "urgency": "CRITICAL | HIGH | MEDIUM | LOW"
    }
  ],
  "medicalFlags": [
    {
      "issue": "Description of medical concern",
      "severity": "CRITICAL | HIGH | MEDIUM | LOW",
      "recommendation": "Suggested action"
    }
  ],
  "overallStatus": "APPROVED | CONDITIONAL | REJECTED",
  "overallScore": 74,
  "summary": "Two-to-three sentence summary of the seafarer's compliance posture.",
  "recommendations": ["Actionable recommendation 1", "Actionable recommendation 2"]
}`;
}

/**
 * Prompt for repairing malformed JSON from an LLM response.
 */
export function buildRepairPrompt(malformedResponse: string): string {
  return `The following text was supposed to be a valid JSON object but it is malformed. Extract the JSON object, fix any syntax errors, and return ONLY the corrected valid JSON. No explanation. No markdown. No code fences.

${malformedResponse}`;
}
