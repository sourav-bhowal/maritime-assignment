import { Router } from "express";
import { upload } from "../middleware/upload.js";
import { rateLimiter } from "../middleware/rate-limiter.js";
import { extractController } from "../controllers/extract.controllers.js";

export const extractRouter = Router();

/**
 * POST /api/extract
 * Accepts a document, extracts structured data via LLM.
 * Supports ?mode=sync (default) and ?mode=async.
 */
extractRouter.post(
  "/extract",
  rateLimiter,
  upload.single("document"),
  extractController,
);
