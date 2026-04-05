import { Queue, Worker, Job, QueueEvents } from "bullmq";

// ─── Types ───────────────────────────────────────────────────────────

/**
 * Data payload for an extraction job.
 */
export interface ExtractionJobData {
  extractionId: string;
  sessionId: string;
  fileBuffer: string; // base64-encoded
  mimeType: string;
  fileName: string;
}

/**
 * Result payload returned from a completed extraction job.
 */
export interface ExtractionJobResult {
  extractionId: string;
  sessionId: string;
  success: boolean;
  error?: string;
}

/**
 * Job status types matching the assignment spec.
 */
export type JobStatusType = "QUEUED" | "PROCESSING" | "COMPLETE" | "FAILED";

// ─── Redis Connection ────────────────────────────────────────────────

/**
 * Redis connection config from environment variables.
 * Supports REDIS_URL (e.g. rediss://default:token@host:6379) or individual vars.
 */
function getRedisConnection() {
  const redisUrl = process.env.REDIS_URL;

  if (redisUrl) {
    const url = new URL(redisUrl);
    return {
      host: url.hostname,
      port: parseInt(url.port || "6379", 10),
      password: url.password || undefined,
      username: url.username || "default",
      tls: url.protocol === "rediss:" ? {} : undefined, // TLS for rediss://
      maxRetriesPerRequest: null, // required by BullMQ
      enableReadyCheck: false, // required for Upstash
    };
  }

  return {
    host: process.env.REDIS_HOST || "localhost",
    port: parseInt(process.env.REDIS_PORT || "6379", 10),
    password: process.env.REDIS_PASSWORD || undefined,
    maxRetriesPerRequest: null,
  };
}

// ─── Queue Name ──────────────────────────────────────────────────────

const EXTRACTION_QUEUE = "extraction";

// ─── Queue ───────────────────────────────────────────────────────────

let extractionQueue: Queue<ExtractionJobData, ExtractionJobResult> | null = null;
let extractionQueueEvents: QueueEvents | null = null;

/**
 * Get or create the extraction queue singleton.
 */
export function getExtractionQueue(): Queue<ExtractionJobData, ExtractionJobResult> {
  if (!extractionQueue) {
    extractionQueue = new Queue<ExtractionJobData, ExtractionJobResult>(EXTRACTION_QUEUE, {
      connection: getRedisConnection(),
      defaultJobOptions: {
        attempts: 2,
        backoff: { type: "exponential", delay: 3000 },
        removeOnComplete: { age: 86400, count: 1000 }, // keep 24h or 1k jobs
        removeOnFail: { age: 604800, count: 5000 }, // keep 7d or 5k failed
      },
    });
  }
  return extractionQueue;
}

/**
 * Get or create queue events listener (for waiting on job completion).
 */
export function getExtractionQueueEvents(): QueueEvents {
  if (!extractionQueueEvents) {
    extractionQueueEvents = new QueueEvents(EXTRACTION_QUEUE, {
      connection: getRedisConnection(),
    });
  }
  return extractionQueueEvents;
}

// ─── Enqueue ─────────────────────────────────────────────────────────

/**
 * Add an extraction job to the queue.
 * @param data - The extraction job data.
 * @returns The BullMQ job instance.
 */
export async function enqueueExtraction(data: ExtractionJobData): Promise<Job<ExtractionJobData, ExtractionJobResult>> {
  const queue = getExtractionQueue();
  const job = await queue.add("extract", data, {
    jobId: data.extractionId, // use extractionId as the BullMQ job ID for easy lookup
  });
  return job;
}

// ─── Worker ──────────────────────────────────────────────────────────

/**
 * Create an extraction worker that processes jobs from the queue.
 *
 * @param processor - The function that processes each extraction job.
 *   Receives the job data and must return an ExtractionJobResult.
 * @param concurrency - Number of concurrent jobs to process (default: 3).
 * @returns The BullMQ Worker instance.
 */
export function createExtractionWorker(
  processor: (job: Job<ExtractionJobData, ExtractionJobResult>) => Promise<ExtractionJobResult>,
  concurrency: number = 3
): Worker<ExtractionJobData, ExtractionJobResult> {
  const worker = new Worker<ExtractionJobData, ExtractionJobResult>(EXTRACTION_QUEUE, processor, {
    connection: getRedisConnection(),
    concurrency,
    limiter: {
      max: 10, // max 10 jobs
      duration: 60_000, // per 60 seconds — matches LLM rate limiting
    },
  });

  worker.on("completed", (job) => {
    console.log(`[Queue] Job ${job.id} completed for extraction ${job.data.extractionId}`);
  });

  worker.on("failed", (job, err) => {
    console.error(`[Queue] Job ${job?.id} failed for extraction ${job?.data.extractionId}: ${err.message}`);
  });

  worker.on("error", (err) => {
    console.error(`[Queue] Worker error: ${err.message}`);
  });

  return worker;
}

// ─── Utilities ───────────────────────────────────────────────────────

/**
 * Get the current status of a job by its BullMQ job ID.
 * @param jobId - The BullMQ job ID (same as extractionId).
 * @returns Object with status, queue position, and timestamps.
 */
export async function getJobStatus(jobId: string): Promise<{
  status: JobStatusType;
  queuePosition: number | null;
  startedAt: number | null;
  completedAt: number | null;
  result: ExtractionJobResult | undefined;
  error: string | undefined;
  retryable: boolean;
}> {
  const queue = getExtractionQueue();
  const job = await queue.getJob(jobId);

  if (!job) {
    throw new Error("JOB_NOT_FOUND");
  }

  const state = await job.getState();
  const waitingCount = await queue.getWaitingCount();

  let status: JobStatusType;
  switch (state) {
    case "waiting":
    case "delayed":
    case "prioritized":
      status = "QUEUED";
      break;
    case "active":
      status = "PROCESSING";
      break;
    case "completed":
      status = "COMPLETE";
      break;
    case "failed":
      status = "FAILED";
      break;
    default:
      status = "QUEUED";
  }

  return {
    status,
    queuePosition: status === "QUEUED" ? waitingCount : null,
    startedAt: job.processedOn ?? null,
    completedAt: job.finishedOn ?? null,
    result: job.returnvalue,
    error: job.failedReason,
    retryable: state === "failed" && (job.opts.attempts ?? 0) > job.attemptsMade,
  };
}

/**
 * Get the estimated wait time for a new job in milliseconds.
 */
export async function getEstimatedWaitMs(): Promise<number> {
  const queue = getExtractionQueue();
  const waitingCount = await queue.getWaitingCount();
  // Estimate ~6 seconds per extraction
  return (waitingCount + 1) * 6000;
}

/**
 * Gracefully close the queue, queue events, and any active workers.
 */
export async function closeQueue(): Promise<void> {
  if (extractionQueue) {
    await extractionQueue.close();
    extractionQueue = null;
  }
  if (extractionQueueEvents) {
    await extractionQueueEvents.close();
    extractionQueueEvents = null;
  }
}

/**
 * Check if the queue connection (Redis) is healthy.
 */
export async function isQueueHealthy(): Promise<boolean> {
  try {
    const queue = getExtractionQueue();
    await queue.getWaitingCount();
    return true;
  } catch {
    return false;
  }
}
