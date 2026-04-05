import { prisma } from "@repo/database";
import { jobParamsSchema } from "@repo/validation";
import { createAppError } from "../middleware/error-handler.js";
import type { Request, Response, NextFunction } from "express";
import ApiResponse from "../lib/apiResponse.js";
import AsyncHandler from "../lib/asyncHandler.js";

/**
 * @description Get job by ID and return job details
 * @param req Request object
 * @param res Response object
 * @param next Next function
 */

export const getJobById = AsyncHandler(async (req: Request, res: Response, next: NextFunction) => {
  const { success, error, data } = jobParamsSchema.safeParse(req.params);

  if (!success) {
    throw createAppError(error.message, 400, "INVALID_JOB_ID");
  }

  const { jobId } = data;

  const job = await prisma.job.findUnique({
    where: { id: jobId },
    include: {
      extraction: {
        include: {
          fields: true,
          validity: true,
          medical: true,
          flags: true,
        },
      },
    },
  });

  if (!job) {
    throw createAppError(`Job ${jobId} does not exist`, 404, "JOB_NOT_FOUND");
  }

  // QUEUED
  if (job.status === "QUEUED") {
    // Count how many jobs are ahead in the queue
    const queuePosition = await prisma.job.count({
      where: {
        status: "QUEUED",
        queuedAt: { lt: job.queuedAt },
      },
    });

    res.status(200).json(
      new ApiResponse({
        message: "Job details retrieved successfully.",
        statusCode: 200,
        data: {
          jobId: job.id,
          status: "QUEUED",
          queuePosition: queuePosition + 1,
          estimatedCompleteMs: (queuePosition + 1) * 6000,
        },
      })
    );
    return;
  }

  // PROCESSING (IN_PROGRESS)
  if (job.status === "IN_PROGRESS") {
    res.status(200).json(
      new ApiResponse({
        message: "Job details retrieved successfully.",
        statusCode: 200,
        data: {
          jobId: job.id,
          status: "PROCESSING",
          queuePosition: 0,
          startedAt: job.startedAt,
          estimatedCompleteMs: 5000,
        },
      })
    );
    return;
  }

  // COMPLETED
  if (job.status === "COMPLETED") {
    const extraction = job.extraction;

    const result = extraction
      ? {
          id: extraction.id,
          sessionId: extraction.sessionId,
          fileName: extraction.fileName,
          promptVersion: extraction.promptVersion,
          documentType: extraction.documentType,
          documentName: extraction.documentName,
          applicableRole: extraction.applicableRole,
          category: extraction.category,
          confidence: extraction.confidence,
          holderName: extraction.holderName,
          summary: extraction.summary,
          isExpired: extraction.isExpired,
          processingTimeMs: extraction.processingTimeMs,
          createdAt: extraction.createdAt,
        }
      : null;

    res.status(200).json(
      new ApiResponse({
        message: "Job completed successfully.",
        statusCode: 200,
        data: {
          jobId: job.id,
          status: "COMPLETE",
          extractionId: job.extractionId,
          result,
        },
      })
    );
    return;
  }

  // FAILED
  if (job.status === "FAILED") {
    res.status(200).json(
      new ApiResponse({
        message: "Job failed.",
        statusCode: 200,
        data: {
          jobId: job.id,
          status: "FAILED",
          error: job.errorCode || "INTERNAL_ERROR",
          message: job.errorMessage || "Job failed",
          failedAt: job.completedAt,
          retryable: job.retryable,
        },
      })
    );
    return;
  }

  // Fallback
  res.status(200).json(
    new ApiResponse({
      message: "Job status not recognized.",
      statusCode: 200,
      data: {
        jobId: job.id,
        status: job.status,
      },
    })
  );
});
