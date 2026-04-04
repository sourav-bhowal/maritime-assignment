# Architecture Decision Record — Smart Maritime Document Extractor (SMDE)

---

## Question 1 — Sync vs Async

**Decision:** In production, **async should be the default mode.**

Maritime documents — especially multi-page PDFs of medical exams and certificates — can take 5–15 seconds to process through a vision LLM. Holding an HTTP connection open for that long is risky: clients may time out, load balancers may kill the connection, and in a multi-user scenario, you quickly exhaust your server's connection pool.

Async mode returns a `202 Accepted` with a `jobId` in under 100ms, letting the client display a progress indicator and poll at its own pace. This is a better UX for the Manning Agent uploading a stack of 8+ documents.

**When to force async regardless of the `mode` param:**

- **File size > 2MB** — larger files take longer for both base64 encoding and LLM vision processing.
- **Concurrent in-flight extractions > 5** — if the server already has 5 sync extractions running, any additional request should be automatically routed to async to prevent thread pool starvation.
- **PDF files** — PDFs often require additional processing time and should default to async.

Sync mode is still useful for development, testing, and lightweight single-image uploads where the caller wants a simple request-response cycle.

---

## Question 2 — Queue Choice

**Choice:** An in-process queue backed by a database polling table (the `jobs` table in PostgreSQL).

**Why this approach:**

1. **Zero infrastructure overhead** — no Redis, no RabbitMQ, no separate process. The service starts with `bun run dev` and works immediately.
2. **Durable by default** — job state is in PostgreSQL, so it survives server restarts. No jobs are lost on crash. This is the primary advantage over a pure in-memory queue.
3. **Queryable** — the `GET /api/jobs/:jobId` endpoint is a simple database read. No need to maintain a separate state store.

The worker process polls the `jobs` table on a configurable interval (default: 1 second), picks up `QUEUED` jobs with a `SELECT ... FOR UPDATE SKIP LOCKED` pattern to prevent double-processing, and runs them through the LLM pipeline.

**Migration to 500 concurrent extractions/minute:**

I would migrate to **BullMQ with Redis**. BullMQ provides:

- Named queues with configurable concurrency limits
- Built-in retry with exponential backoff
- Rate limiting per queue (critical for LLM API rate limits)
- Dashboard (Bull Board) for ops visibility

The `LLMProvider` interface and job state machine would stay the same — only the queue transport layer changes.

**Failure modes of current approach:**

- **Polling latency** — a 1-second poll interval adds up to 1 second of unnecessary delay. Acceptable for < 50 jobs/minute, not for high throughput.
- **No backpressure** — if the LLM provider is slow or rate-limited, there is no built-in mechanism to slow down the queue. The worker will keep picking up jobs.
- **Single-node** — the polling pattern works on a single server. Scaling to multiple workers requires the `SKIP LOCKED` pattern or a proper distributed queue.

---

## Question 3 — LLM Provider Abstraction

**Decision:** I built a provider interface that makes swapping LLMs trivial.

The `LLMProvider` interface has two methods:

```typescript
interface LLMProvider {
  extract(fileBuffer: Buffer, mimeType: string, fileName: string): Promise<ExtractionResult>;
  validate(extractions: ExtractionResult[]): Promise<ValidationResult>;
}
```

Each provider (Claude, Gemini, OpenAI) implements this interface and extends `BaseLLMProvider`, which provides shared utilities:

- `withTimeout(promise)` — races any LLM call against a 30-second deadline
- `safeParse(raw, repairFn)` — attempts `extractJson()`, and on failure calls the provider-specific `repairFn` to ask the LLM to fix its own malformed output

The active provider is selected at startup by `LLM_PROVIDER` env var. The `createLLM()` factory function returns the concrete instance. No code changes required to swap providers.

**Justification:** The assignment explicitly requires provider swapping via environment variables. Beyond that, this abstraction has real production value — we test against Claude in dev but may deploy with Gemini for cost reasons, or fall back to a local Ollama instance when the cloud API is down.

---

## Question 4 — Schema Design

The schema normalizes dynamic fields instead of dumping them into JSONB columns.

**Key design choices:**

- `ExtractionField` is a separate table with `key`, `label`, `value`, `importance`, `status` — one row per extracted field. This enables direct SQL queries like "find all sessions where any document has an expired COC."
- `ExtractionValidity` and `ExtractionMedical` are 1:1 relation tables on `Extraction`, avoiding JSONB while keeping the data structured.
- `ExtractionFlag` is a separate table indexed on `severity`, enabling queries like "all CRITICAL flags across all sessions."
- The `Validation` model uses a single `resultJson` (JSON column) because validation results are read-heavy, write-once, and consumed as a unit. Unlike extracted fields, there is no query pattern that would benefit from normalization.

**Risks of JSONB/TEXT at scale:**

- **No indexing** — you cannot index individual keys inside a JSONB column without GIN indexes, which are expensive to maintain and have poor selectivity on heterogeneous data.
- **Schema drift** — when the LLM prompt evolves, old JSONB records have a different shape than new ones. Without a schema migration, application code must handle every historical variant.
- **Full-text search** — searching inside JSONB requires `jsonb_to_tsvector` or casting to text, both of which are slow without materialized views.

**If we needed full-text search across extracted fields:** I would add a `search_text` tsvector column on `ExtractionField`, populated by a trigger on INSERT/UPDATE. Combined with a GIN index, this enables fast `ts_query` searches across all field values.

**For "all sessions where any document has an expired COC":**

```sql
SELECT DISTINCT e.session_id
FROM extractions e
WHERE e.document_type = 'COC' AND e.is_expired = true;
```

This is a simple indexed query — no JSONB scanning required.

---

## Question 5 — What I Skipped

1. **Authentication and authorization** — the API has no auth layer. In production, the Manning Agent would authenticate via JWT or API key, and each session would be scoped to a tenant. I skipped this because the assignment focuses on the LLM pipeline, not identity management.

2. **File storage** — uploaded documents are processed in-memory and not persisted to disk or object storage. In production, files should go to S3/GCS with signed URLs, and only the hash should be stored in the database. I skipped this to avoid infrastructure dependencies.

3. **Structured logging and observability** — the service uses `console.log`. In production, I would add structured JSON logging (pino), request tracing (OpenTelemetry), and metrics (Prometheus) — especially on LLM call latency, parse failure rates, and retry counts.

4. **Webhook delivery** — the async job mode only supports polling. In production, I would add an optional `webhookUrl` field and deliver results via HTTP POST with HMAC signature verification.

5. **Prompt versioning** — the extraction prompt is a hardcoded constant. In production, prompts should be versioned (e.g., `v1`, `v2`), stored alongside each extraction record, and compared across versions to measure accuracy regressions.

---
