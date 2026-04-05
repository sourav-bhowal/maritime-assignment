import { prisma } from "@repo/database";
import { isQueueHealthy } from "@repo/queue";
import { Request, Response } from "express";
import ApiResponse from "../lib/apiResponse.js";
import AsyncHandler from "../lib/asyncHandler.js";

/**
 * @description Health check controller
 * @param req Request object
 * @param res Response object
 */

export const healthController = AsyncHandler(async (_req: Request, res: Response) => {
  const startedAt = Date.now();

  const uptimeSeconds = Math.floor((Date.now() - startedAt) / 1000);

  // Check database
  let dbStatus: "OK" | "DOWN" = "DOWN";
  try {
    await prisma.$queryRaw`SELECT 1`;
    dbStatus = "OK";
  } catch {
    dbStatus = "DOWN";
  }

  // Check LLM provider (just verify env vars are set)
  const llmProviderStatus = process.env.LLM_PROVIDER && process.env.LLM_API_KEY ? "OK" : "DOWN";

  // Check queue (Redis)
  let queueStatus: "OK" | "DOWN" = "DOWN";
  try {
    queueStatus = (await isQueueHealthy()) ? "OK" : "DOWN";
  } catch {
    queueStatus = "DOWN";
  }

  const overallStatus = dbStatus === "OK" && llmProviderStatus === "OK" ? "OK" : "DEGRADED";

  res.status(overallStatus === "OK" ? 200 : 503).json(
    new ApiResponse({
      message: "Health check completed.",
      statusCode: overallStatus === "OK" ? 200 : 503,
      data: {
        status: overallStatus,
        version: "1.0.0",
        uptime: uptimeSeconds,
        dependencies: {
          database: dbStatus,
          llmProvider: llmProviderStatus,
          queue: queueStatus,
        },
        timestamp: new Date().toISOString(),
      },
    })
  );
});
