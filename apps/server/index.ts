import express from "express";
import { extractRouter } from "./src/routes/extract.js";
import { jobsRouter } from "./src/routes/jobs.js";
import { sessionsRouter } from "./src/routes/sessions.js";
import { healthRouter } from "./src/routes/health.js";
import { errorHandler } from "./src/middleware/error-handler.js";

const app = express();
const PORT = parseInt(process.env.PORT || "8000", 10);

// ─── Global Middleware ───────────────────────────────────────────────

app.use(express.json());

// ─── Routes ──────────────────────────────────────────────────────────

app.use("/api", extractRouter);
app.use("/api", jobsRouter);
app.use("/api", sessionsRouter);
app.use("/api", healthRouter);

// ─── Error Handler ───────────────────────────────────────────────────

app.use(errorHandler);

// ─── Start ───────────────────────────────────────────────────────────

app.listen(PORT, () => {
  console.log(`[Server] SMDE API running on http://localhost:${PORT}`);
  console.log(`[Server] LLM Provider: ${process.env.LLM_PROVIDER || "not set"}`);
});

export default app;