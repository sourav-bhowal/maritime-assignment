import { Router } from "express";
import { getJobById } from "../controllers/job.controllers.js";

export const jobsRouter = Router();

/**
 * GET /api/jobs/:jobId
 * Poll the status of an async extraction job.
 */
jobsRouter.get("/jobs/:jobId", getJobById);
