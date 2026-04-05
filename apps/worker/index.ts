import { prisma } from "@repo/database";
import { createLLM, EXTRACTION_PROMPT_VERSION } from "@repo/llm";
import type { ExtractionResult } from "@repo/llm";
import { createExtractionWorker, type ExtractionJobData, type ExtractionJobResult } from "@repo/queue";
import type { Job } from "bullmq";
import { mapNAEnum, parseDate } from "@repo/validation";

const llm = createLLM();

console.log("[Worker] Starting extraction worker...");
console.log(`[Worker] LLM Provider: ${process.env.LLM_PROVIDER || "not set"}`);

/**
 * Process a single extraction job.
 * 1. Mark job as IN_PROGRESS
 * 2. Run LLM extraction
 * 3. Store result in database
 * 4. Mark job as COMPLETED or FAILED
 */
async function processExtractionJob(job: Job<ExtractionJobData, ExtractionJobResult>): Promise<ExtractionJobResult> {
  const { extractionId, sessionId, fileBuffer, mimeType, fileName } = job.data;

  console.log(`[Worker] Processing job ${job.id} — extraction ${extractionId}`);

  // Mark job as IN_PROGRESS
  await prisma.job.update({
    where: { extractionId },
    data: { status: "IN_PROGRESS", startedAt: new Date() },
  });

  const startTime = Date.now();

  try {
    // Decode the base64 file buffer
    const buffer = Buffer.from(fileBuffer, "base64");

    // Run LLM extraction
    const result: ExtractionResult = await llm.extract(buffer, mimeType, fileName);

    const processingTimeMs = Date.now() - startTime;

    // Store the extraction result in the database
    await prisma.extraction.update({
      where: { id: extractionId },
      data: {
        documentType: result.detection.documentType,
        documentName: result.detection.documentName,
        category: result.detection.category,
        applicableRole: mapNAEnum(result.detection.applicableRole),
        promptVersion: EXTRACTION_PROMPT_VERSION,
        isRequired: result.detection.isRequired,
        detectionReason: result.detection.detectionReason,
        confidence: result.detection.confidence,
        holderName: result.holder.fullName,
        dateOfBirth: result.holder.dateOfBirth ? parseDate(result.holder.dateOfBirth) : null,
        nationality: result.holder.nationality,
        passportNumber: result.holder.passportNumber,
        sirbNumber: result.holder.sirbNumber,
        summary: result.summary,
        isExpired: result.validity.isExpired,
        processingTimeMs,
        status: "COMPLETE",
        rawLlmResponse: JSON.stringify(result),
        compliance: {
          create: {
            issuingAuthority: result.compliance.issuingAuthority,
            regulationReference: result.compliance.regulationReference,
            imoModelCourse: result.compliance.imoModelCourse,
            recognizedAuthority: result.compliance.recognizedAuthority,
            limitations: result.compliance.limitations,
          },
        },
        fields: {
          create: result.fields.map((f) => ({
            key: f.key,
            label: f.label,
            value: f.value,
            importance: f.importance,
            status: f.status,
          })),
        },
        validity: {
          create: {
            dateOfIssue: result.validity.dateOfIssue ? parseDate(result.validity.dateOfIssue) : null,
            dateOfExpiry:
              result.validity.dateOfExpiry && result.validity.dateOfExpiry !== "No Expiry" && result.validity.dateOfExpiry !== "Lifetime"
                ? parseDate(result.validity.dateOfExpiry)
                : null,
            isExpired: result.validity.isExpired,
            daysUntilExpiry: result.validity.daysUntilExpiry,
            revalidationRequired: result.validity.revalidationRequired,
          },
        },
        medical: {
          create: {
            fitnessResult: mapNAEnum(result.medicalData.fitnessResult),
            drugTestResult: mapNAEnum(result.medicalData.drugTestResult),
            restrictions: result.medicalData.restrictions,
            specialNotes: result.medicalData.specialNotes,
            expiryDate: result.medicalData.expiryDate ? parseDate(result.medicalData.expiryDate) : null,
          },
        },
        flags: {
          create: result.flags.map((f) => ({
            severity: f.severity,
            message: f.message,
          })),
        },
      },
    });

    // Mark job as COMPLETED
    await prisma.job.updateMany({
      where: { extractionId },
      data: { status: "COMPLETED", completedAt: new Date() },
    });

    console.log(`[Worker] Job ${job.id} completed — ${result.detection.documentType} (${result.detection.confidence}) in ${processingTimeMs}ms`);

    return {
      extractionId,
      sessionId,
      success: true,
    };
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    const isTimeout = errorMessage === "LLM_TIMEOUT";
    const errorCode = isTimeout ? "LLM_TIMEOUT" : "LLM_JSON_PARSE_FAIL";

    console.error(`[Worker] Job ${job.id} failed — ${errorCode}: ${errorMessage}`);

    // Store the failure in extraction
    await prisma.extraction.update({
      where: { id: extractionId },
      data: {
        status: "FAILED",
        rawLlmResponse: errorMessage,
        processingTimeMs: Date.now() - startTime,
      },
    });

    // Mark job as FAILED
    await prisma.job.update({
      where: { extractionId },
      data: {
        status: "FAILED",
        errorCode,
        errorMessage,
        retryable: isTimeout,
        completedAt: new Date(),
      },
    });

    return {
      extractionId,
      sessionId,
      success: false,
      error: errorMessage,
    };
  }
}

// ─── Start the worker ────────────────────────────────────────────────

const worker = createExtractionWorker(processExtractionJob, 3);

console.log("[Worker] Extraction worker started (concurrency: 3)");

// ─── Graceful Shutdown ───────────────────────────────────────────────

process.on("SIGINT", async () => {
  console.log("[Worker] Shutting down...");
  await worker.close();
  process.exit(0);
});

process.on("SIGTERM", async () => {
  console.log("[Worker] Shutting down...");
  await worker.close();
  process.exit(0);
});
