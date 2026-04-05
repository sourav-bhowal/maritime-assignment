import { prisma } from "@repo/database";
import { validateFile, extractQuerySchema, extractBodySchema, formatExtractionResponse, mapNAEnum, parseDate } from "@repo/validation";
import { createLLM, EXTRACTION_PROMPT_VERSION, type ExtractionResult } from "@repo/llm";
import { enqueueExtraction, getEstimatedWaitMs } from "@repo/queue";
import { createAppError } from "../middleware/error-handler.js";
import { Request, Response } from "express";
import crypto from "crypto";
import ApiResponse from "../lib/apiResponse.js";
import AsyncHandler from "../lib/asyncHandler.js";

const llm = createLLM();

/**
 * @description Extract document and return extraction result
 * @param req Request object
 * @param res Response object
 * @param next Next function
 */

export const extractController = AsyncHandler(async (req: Request, res: Response) => {
  const file = req.file;
  if (!file) {
    throw createAppError("No file uploaded", 400, "UNSUPPORTED_FORMAT");
  }

  // Validate file type and size
  const fileCheck = validateFile({
    mimetype: file.mimetype,
    size: file.size,
  });

  if (!fileCheck.valid) {
    const statusCode = fileCheck.code === "FILE_TOO_LARGE" ? 413 : 400;
    throw createAppError(fileCheck.message, statusCode, fileCheck.code);
  }

  // Claude will not accept pdf files, so throw error
  if (file.mimetype === "application/pdf" && process.env.LLM_PROVIDER === "claude") {
    throw createAppError("PDF files are not supported with Claude", 400, "UNSUPPORTED_FILE_TYPE");
  }

  // Parse query params
  const query = extractQuerySchema.parse(req.query);
  const mode = query.mode;

  // Session — use provided or create new
  let sessionId = extractBodySchema.parse(req.body).sessionId;

  if (!sessionId) {
    const session = await prisma.session.create({ data: {} });
    sessionId = session.id;
  } else {
    const session = await prisma.session.findUnique({
      where: { id: sessionId },
    });
    if (!session) {
      throw createAppError(`Session ${sessionId} does not exist`, 404, "SESSION_NOT_FOUND");
    }
  }

  // Deduplication — SHA-256 hash of file contents
  const fileHash = crypto.createHash("sha256").update(file.buffer).digest("hex");

  const existing = await prisma.extraction.findUnique({
    where: {
      sessionId_fileHash: { sessionId, fileHash },
    },
    include: {
      fields: true,
      compliance: true,
      validity: true,
      medical: true,
      flags: true,
    },
  });

  if (existing) {
    res.set("X-Deduplicated", "true");
    res.status(200).json(formatExtractionResponse(existing));
    return;
  }

  // ─── ASYNC MODE ────────────────────────────────────────────
  if (mode === "async") {
    // Create extraction record as placeholder
    const extraction = await prisma.extraction.create({
      data: {
        sessionId,
        fileName: file.originalname,
        fileHash,
        mimeType: file.mimetype,
        promptVersion: EXTRACTION_PROMPT_VERSION,
        status: "FAILED", // will be updated on completion
      },
    });

    // Create job record
    const job = await prisma.job.create({
      data: {
        sessionId,
        extractionId: extraction.id,
        status: "QUEUED",
      },
    });

    // Enqueue in BullMQ
    await enqueueExtraction({
      extractionId: extraction.id,
      sessionId,
      fileBuffer: file.buffer.toString("base64"),
      mimeType: file.mimetype,
      fileName: file.originalname,
    });

    const estimatedWaitMs = await getEstimatedWaitMs();

    res.status(202).json(
      new ApiResponse({
        message: "Extraction is being processed asynchronously. Check back later for results.",
        statusCode: 202,
        data: {
          sessionId,
          status: "QUEUED",
          pollUrl: `/api/jobs/${job.id}`,
          estimatedWaitMs,
        },
      })
    );
    return;
  }

  // ─── SYNC MODE ─────────────────────────────────────────────
  const startTime = Date.now();

  let result: ExtractionResult;

  try {
    result = await llm.extract(file.buffer, file.mimetype, file.originalname);
  } catch (llmError: unknown) {
    const errorMessage = llmError instanceof Error ? llmError.message : "Unknown LLM error";

    // Store failed extraction — never discard
    const failedExtraction = await prisma.extraction.create({
      data: {
        sessionId,
        fileName: file.originalname,
        fileHash,
        mimeType: file.mimetype,
        status: "FAILED",
        rawLlmResponse: errorMessage,
        processingTimeMs: Date.now() - startTime,
      },
    });

    if (errorMessage === "LLM_TIMEOUT") {
      throw createAppError("LLM request timed out after 30 seconds", 500, "INTERNAL_ERROR", { extractionId: failedExtraction.id });
    }

    throw createAppError("Document extraction failed after retry. The raw response has been stored for review.", 422, "LLM_JSON_PARSE_FAIL", {
      extractionId: failedExtraction.id,
    });
  }

  const processingTimeMs = Date.now() - startTime;

  console.log("Result from LLM:", result);

  // Store the extraction result
  const extraction = await prisma.extraction.create({
    data: {
      sessionId,
      fileName: file.originalname,
      fileHash,
      mimeType: file.mimetype,
      promptVersion: EXTRACTION_PROMPT_VERSION,
      documentType: result.detection.documentType,
      documentName: result.detection.documentName,
      category: result.detection.category,
      applicableRole: mapNAEnum(result.detection.applicableRole),
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
      rawLlmResponse: result.rawResponse ? JSON.stringify(result.rawResponse) : null,
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
          revalidationRequired: result.validity.isExpired ? true : false,
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
    include: {
      fields: true,
      compliance: true,
      validity: true,
      medical: true,
      flags: true,
    },
  });

  res.status(200).json(
    new ApiResponse({
      message: "Extraction completed successfully.",
      statusCode: 200,
      data: formatExtractionResponse(extraction),
    })
  );
});
