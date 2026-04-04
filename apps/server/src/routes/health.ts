import { Router } from "express";

import { healthController } from "../controllers/health.controllers.js";

export const healthRouter = Router();

/**
 * GET /api/health
 * Health check endpoint with dependency status.
 */
healthRouter.get("/health", healthController);
