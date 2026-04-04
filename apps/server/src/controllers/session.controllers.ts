import { prisma } from "@repo/database";
import { createAppError } from "../middleware/error-handler.js";
import { sessionParamsSchema } from "@repo/validation";
import { deriveOverallHealth, detectRole, formatDate } from "../lib/utils.js";
import type { Request, Response, NextFunction } from "express";
import { createLLM } from "@repo/llm";

const llm = createLLM();

/**
 * @description Get session by ID and return session details
 * @param req Request object
 * @param res Response object
 * @param next Next function
 */

export const getSessionById = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const { sessionId } = sessionParamsSchema.parse(req.params);

    const session = await prisma.session.findUnique({
      where: { id: sessionId },
      include: {
        extractions: {
          include: { flags: true },
          orderBy: { createdAt: "asc" },
        },
        jobs: {
          where: { status: { in: ["QUEUED", "IN_PROGRESS"] } },
        },
      },
    });

    if (!session) {
      throw createAppError(
        `Session ${sessionId} does not exist`,
        404,
        "SESSION_NOT_FOUND",
      );
    }

    // Derive overall health
    const overallHealth = deriveOverallHealth(session.extractions);

    // Detect the dominant role from documents
    const detectedRole = detectRole(session.extractions);

    res.status(200).json({
      sessionId: session.id,
      documentCount: session.extractions.length,
      detectedRole,
      overallHealth,
      documents: session.extractions.map((e) => ({
        id: e.id,
        fileName: e.fileName,
        documentType: e.documentType,
        applicableRole: e.applicableRole === "NA" ? "N/A" : e.applicableRole,
        holderName: e.holderName,
        confidence: e.confidence,
        isExpired: e.isExpired,
        flagCount: e.flags.length,
        criticalFlagCount: e.flags.filter((f) => f.severity === "CRITICAL")
          .length,
        createdAt: e.createdAt,
      })),
      pendingJobs: session.jobs.map((j) => ({
        jobId: j.id,
        status: j.status === "IN_PROGRESS" ? "PROCESSING" : "QUEUED",
      })),
    });
  } catch (err) {
    next(err);
  }
};

/**
 * @description Validate session and return validation results
 * @param req Request object
 * @param res Response object
 * @param next Next function
 */

export const validateSession = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const { sessionId } = sessionParamsSchema.parse(req.params);

    const session = await prisma.session.findUnique({
      where: { id: sessionId },
      include: {
        extractions: {
          where: { status: "COMPLETE" },
          include: {
            fields: true,
            validity: true,
            medical: true,
            flags: true,
          },
        },
      },
    });

    if (!session) {
      throw createAppError(
        `Session ${sessionId} does not exist`,
        404,
        "SESSION_NOT_FOUND",
      );
    }

    if (session.extractions.length < 2) {
      throw createAppError(
        "At least 2 documents are required for cross-document validation",
        400,
        "INSUFFICIENT_DOCUMENTS",
      );
    }

    // Build extraction data for LLM
    const extractionData = session.extractions.map((e) => ({
      detection: {
        documentType: e.documentType || "OTHER",
        documentName: e.documentName || e.fileName,
        applicableRole:
          e.applicableRole === "NA" ? "N/A" : e.applicableRole || "N/A",
        category: e.category || "OTHER",
      },
      holder: {
        fullName: e.holderName,
        dateOfBirth: e.dateOfBirth ? formatDate(e.dateOfBirth) : null,
        nationality: e.nationality,
        passportNumber: e.passportNumber,
        sirbNumber: e.sirbNumber,
      },
      validity: {
        dateOfIssue: e.validity?.dateOfIssue
          ? formatDate(e.validity.dateOfIssue)
          : null,
        dateOfExpiry: e.validity?.dateOfExpiry
          ? formatDate(e.validity.dateOfExpiry)
          : null,
        isExpired: e.validity?.isExpired ?? e.isExpired,
        daysUntilExpiry: e.validity?.daysUntilExpiry ?? null,
      },
      medicalData: {
        fitnessResult:
          e.medical?.fitnessResult === "NA"
            ? "N/A"
            : e.medical?.fitnessResult || "N/A",
        drugTestResult:
          e.medical?.drugTestResult === "NA"
            ? "N/A"
            : e.medical?.drugTestResult || "N/A",
        restrictions: e.medical?.restrictions || null,
        specialNotes: e.medical?.specialNotes || null,
        expiryDate: e.medical?.expiryDate
          ? formatDate(e.medical.expiryDate)
          : null,
      },
      flags: e.flags.map((f) => ({
        severity: f.severity,
        message: f.message,
      })),
      summary: e.summary || "",
    }));

    // Call LLM for cross-document validation
    const validationResult = await llm.validate(extractionData as any);

    // Store validation result
    const validation = await prisma.validation.create({
      data: {
        sessionId,
        overallStatus: validationResult.overallStatus as any,
        overallScore: validationResult.overallScore,
        summary: validationResult.summary,
        resultJson: validationResult as any,
      },
    });

    res.status(200).json({
      sessionId,
      holderProfile: validationResult.holderProfile,
      consistencyChecks: validationResult.consistencyChecks,
      missingDocuments: validationResult.missingDocuments,
      expiringDocuments: validationResult.expiringDocuments,
      medicalFlags: validationResult.medicalFlags,
      overallStatus: validationResult.overallStatus,
      overallScore: validationResult.overallScore,
      summary: validationResult.summary,
      recommendations: validationResult.recommendations,
      validatedAt: validation.createdAt,
    });
  } catch (err) {
    next(err);
  }
};

/**
 * @description Get session report and return session report
 * @param req Request object
 * @param res Response object
 * @param next Next function
 */

export const getSessionReport = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const { sessionId } = sessionParamsSchema.parse(req.params);

    const session = await prisma.session.findUnique({
      where: { id: sessionId },
      include: {
        extractions: {
          where: { status: "COMPLETE" },
          include: {
            fields: true,
            validity: true,
            medical: true,
            flags: true,
          },
          orderBy: { createdAt: "asc" },
        },
        validations: {
          orderBy: { createdAt: "desc" },
          take: 1,
        },
      },
    });

    if (!session) {
      throw createAppError(
        `Session ${sessionId} does not exist`,
        404,
        "SESSION_NOT_FOUND",
      );
    }

    const extractions = session.extractions;
    const latestValidation = session.validations[0] || null;

    // ─── Holder Profile ────────────────────────────────────────
    const holderNames = [
      ...new Set(extractions.map((e) => e.holderName).filter(Boolean)),
    ];

    const holderProfile = {
      name: holderNames[0] || "Unknown",
      alternateNames: holderNames.length > 1 ? holderNames.slice(1) : undefined,
      dateOfBirth: extractions.find((e) => e.dateOfBirth)?.dateOfBirth || null,
      nationality: extractions.find((e) => e.nationality)?.nationality || null,
      passportNumber:
        extractions.find((e) => e.passportNumber)?.passportNumber || null,
      sirbNumber: extractions.find((e) => e.sirbNumber)?.sirbNumber || null,
      detectedRole: detectRole(extractions),
    };

    // ─── Document Inventory ────────────────────────────────────
    const documentInventory = extractions.map((e) => ({
      id: e.id,
      type: e.documentType,
      name: e.documentName || e.fileName,
      category: e.category,
      confidence: e.confidence,
      isExpired: e.isExpired,
      validity: e.validity
        ? {
            issued: e.validity.dateOfIssue
              ? formatDate(e.validity.dateOfIssue)
              : null,
            expires: e.validity.dateOfExpiry
              ? formatDate(e.validity.dateOfExpiry)
              : "No Expiry",
            daysUntilExpiry: e.validity.daysUntilExpiry,
          }
        : null,
      flagCount: e.flags.length,
      criticalFlags: e.flags
        .filter((f) => f.severity === "CRITICAL")
        .map((f) => f.message),
    }));

    // ─── Expiring / Expired Documents ──────────────────────────
    const expiringDocuments = extractions
      .filter(
        (e) =>
          e.validity?.daysUntilExpiry !== null &&
          e.validity?.daysUntilExpiry !== undefined &&
          e.validity.daysUntilExpiry <= 180,
      )
      .sort(
        (a, b) =>
          (a.validity?.daysUntilExpiry ?? 999) -
          (b.validity?.daysUntilExpiry ?? 999),
      )
      .map((e) => ({
        type: e.documentType,
        name: e.documentName || e.fileName,
        expiryDate: e.validity?.dateOfExpiry
          ? formatDate(e.validity.dateOfExpiry)
          : null,
        daysUntilExpiry: e.validity?.daysUntilExpiry,
        isExpired: e.isExpired,
      }));

    // ─── Medical Summary ───────────────────────────────────────
    const medicalExtractions = extractions.filter((e) => e.medical);
    const medicalSummary =
      medicalExtractions.length > 0
        ? {
            fitnessResult:
              medicalExtractions[0]!.medical!.fitnessResult === "NA"
                ? "N/A"
                : medicalExtractions[0]!.medical!.fitnessResult,
            drugTestResult:
              medicalExtractions[0]!.medical!.drugTestResult === "NA"
                ? "N/A"
                : medicalExtractions[0]!.medical!.drugTestResult,
            restrictions: medicalExtractions[0]!.medical!.restrictions,
            specialNotes: medicalExtractions[0]!.medical!.specialNotes,
            medicalExpiryDate: medicalExtractions[0]!.medical!.expiryDate
              ? formatDate(medicalExtractions[0]!.medical!.expiryDate)
              : null,
          }
        : null;

    // ─── All Flags ─────────────────────────────────────────────
    const allFlags = extractions.flatMap((e) =>
      e.flags.map((f) => ({
        documentType: e.documentType,
        documentName: e.documentName || e.fileName,
        severity: f.severity,
        message: f.message,
      })),
    );

    // Sort: CRITICAL first, then HIGH, MEDIUM, LOW
    const severityOrder = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };
    allFlags.sort(
      (a, b) =>
        (severityOrder[a.severity] ?? 4) - (severityOrder[b.severity] ?? 4),
    );

    // ─── Compliance Decision ───────────────────────────────────
    const overallHealth = deriveOverallHealth(extractions);
    const validationSummary = latestValidation
      ? {
          status: latestValidation.overallStatus,
          score: latestValidation.overallScore,
          summary: latestValidation.summary,
          validatedAt: latestValidation.createdAt,
        }
      : null;

    // ─── Final Report ──────────────────────────────────────────
    res.status(200).json({
      sessionId,
      generatedAt: new Date().toISOString(),
      holderProfile,
      overallHealth,
      documentCount: extractions.length,
      documentInventory,
      expiringDocuments,
      medicalSummary,
      flags: {
        total: allFlags.length,
        critical: allFlags.filter((f) => f.severity === "CRITICAL").length,
        high: allFlags.filter((f) => f.severity === "HIGH").length,
        details: allFlags,
      },
      validationSummary,
      recommendation:
        overallHealth === "OK"
          ? "Seafarer is deployable. All documents are current and valid."
          : overallHealth === "WARN"
            ? "Seafarer may be deployable with conditions. Review flagged items before proceeding."
            : "Seafarer is NOT deployable. Critical issues must be resolved.",
    });
  } catch (err) {
    next(err);
  }
};
