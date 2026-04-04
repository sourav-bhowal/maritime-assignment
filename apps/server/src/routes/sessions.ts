import { Router } from "express";
import {
  getSessionById,
  getSessionReport,
  validateSession,
} from "../controllers/session.controllers.js";

export const sessionsRouter = Router();

/**
 * GET /api/sessions/:sessionId
 * Returns a summary of all documents in the session.
 */
sessionsRouter.get("/sessions/:sessionId", getSessionById);

/**
 * POST /api/sessions/:sessionId/validate
 * Cross-document compliance validation via LLM.
 */
sessionsRouter.post("/sessions/:sessionId/validate", validateSession);

/**
 * GET /api/sessions/:sessionId/report
 * Returns a structured compliance report for the session.
 */
sessionsRouter.get("/sessions/:sessionId/report", getSessionReport);
