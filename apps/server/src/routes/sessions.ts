import { Router } from "express";
import {
  getExpiringDocuments,
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
 * GET /api/sessions/:sessionId/expiring?withinDays=90
 * Returns documents in the session that are expired or expiring within the given window.
 */
sessionsRouter.get("/sessions/:sessionId/expiring", getExpiringDocuments);

/**
 * GET /api/sessions/:sessionId/report
 * Returns a structured compliance report for the session.
 */
sessionsRouter.get("/sessions/:sessionId/report", getSessionReport);
