# Architecture Decision Record — Smart Maritime Document Extractor (SMDE)

---

## Question 1 — Sync vs Async

**Decision:** In production, **async should be the default.**

Maritime PDFs and scans often need **5–15 seconds** of vision LLM work. Long HTTP requests invite client timeouts, load balancer idle cuts, and **connection-pool exhaustion** under concurrent users. Async returns **202** with a `jobId` quickly; the client polls and can show progress — a better fit when a Manning Agent uploads many documents.

**Force async even if `mode=sync`:** **file size > 2MB**; **more than five sync extractions already in flight** (avoid starving the server); **PDF uploads** (heavier pipeline). **Sync** stays for dev, automated tests, and small single-image calls that want a simple request–response.

---

## Question 2 — Queue Choice

**Choice:** Worker polls PostgreSQL **`jobs`** using **`SELECT … FOR UPDATE SKIP LOCKED`** (configurable interval, default ~1s).

**Why:** No Redis or message broker for this assignment footprint; state is **durable** across restarts (unlike a pure in-memory queue); **`GET /api/jobs/:jobId`** is a normal read — no second state store.

**If load reached ~500 extractions/minute:** **BullMQ on Redis** for named queues, concurrency caps, retries with backoff, **per-queue rate limits** aligned to LLM provider quotas, and **Bull Board** for ops. The **job state machine** and **`LLMProvider`** boundary stay; only the transport changes.

**Failure modes today:** **Polling delay** (up to one interval before pickup); **no built-in backpressure** when the model is slow; **multi-instance** workers need `SKIP LOCKED` (or a distributed queue) to avoid duplicate work.

---

## Rate limiting

**Decision:** **`POST /api/extract` only** — in-memory **token bucket**, **10 requests per minute per client IP** over a rolling **60s** window, per the spec. When exhausted, respond with **429**, body code **`RATE_LIMITED`**, **`retryAfterMs`**, and HTTP **`Retry-After`** (seconds). Buckets for quiet IPs are **pruned on a timer** so the `Map` does not grow without bound.

**Tradeoff:** Limits are **per server process**. Several replicas each enforce their own cap; users behind **NAT** share one bucket; reverse proxies can make **`req.ip`** misleading unless **`X-Forwarded-For`** is configured carefully. Production would move limits to **Redis**, an **API gateway**, or both.

---

## Question 3 — LLM Provider Abstraction

**Decision:** A small **provider interface** so swapping models/vendors is an env change, not a refactor.

**Surface:** `extract(fileBuffer, mimeType, fileName)` and `validate(extractions)` returning typed results. Concrete providers extend **`BaseLLMProvider`**: **`withTimeout`** (30s ceiling) and **`safeParse`** (outermost JSON boundary, then a **repair** LLM call on failure). **`LLM_PROVIDER`** (plus model/key env vars) selects the implementation via **`createLLM()`**.

**Why:** Matches the assignment’s **env-configurable** requirement and mirrors how we would run **different providers per environment** or shift for cost, latency, or outage fallback.

---

## Question 4 — Schema Design

**Approach:** **Normalize** volatile extraction output instead of stuffing dynamic fields into JSONB. **`ExtractionField`** rows (`key`, `label`, `value`, `importance`, `status`) support **indexed filters** without GIN-on-JSON gymnastics. **`ExtractionValidity`** and **`ExtractionMedical`** are **1:1** with **`Extraction`**; **`ExtractionFlag`** is keyed by **`severity`** for “all CRITICAL flags” style queries. **`Validation`** keeps a single **`resultJson`** — written once, read as a whole; no strong case to explode it into tables.

**JSONB/TEXT risks at scale:** expensive or low-selectivity **GIN** indexes on heterogeneous keys; **shape drift** when prompts change; **full-text** and ad hoc search are painful without extra columns or materialization.

**Full-text across field values:** add **`search_text`** `tsvector` on **`ExtractionField`**, maintain with an **INSERT/UPDATE trigger**, and index with **GIN** for `tsquery`.

**Example — sessions with an expired COC:** filter **`extractions`** on **`document_type = 'COC'`** and **`is_expired`** (indexed) — no JSON scan.

---

## Question 5 — What I Skipped

1. **Authentication / tenancy** — no JWT or API keys; production would scope sessions to a tenant. Deferred to keep focus on the extraction pipeline.
2. **Object storage for uploads** — files are processed **in memory**, not S3/GCS; prod would store bytes off-box and keep **hash + metadata** in DB.
3. **Structured logging and metrics** — **`console.log`** today; prod would use **JSON logs**, **traces**, and **LLM latency / parse-failure** metrics.
4. **Async webhooks** — only **polling** for job completion; optional **`webhookUrl` + HMAC** would be next.
5. **Prompt versioning** — extraction prompt is fixed in code; prod would **version** and persist **`promptVersion`** per row for regression analysis.

---
