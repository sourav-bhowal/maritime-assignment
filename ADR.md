# Architecture Decision Record — Smart Maritime Document Extractor (SMDE)

---

## Question 1 — Sync vs Async

**Decision:** In production, **async should be the default.**

Maritime PDFs and scans often need **5–15 seconds** of vision LLM work. Long HTTP requests invite client timeouts, load balancer idle cuts, and **connection-pool exhaustion** under concurrent users. Async returns **202** with a `jobId` quickly; the client polls and can show progress — a better fit when a Manning Agent uploads many documents.

**Force async even if `mode=sync`:** **file size > 2MB**; **more than five sync extractions already in flight** (avoid starving the server); **PDF uploads** (heavier pipeline). **Sync** stays for dev, automated tests, and small single-image calls that want a simple request–response.

---

## Question 2 — Queue Choice

**Choice:** **BullMQ (Redis-backed queue)** with a dedicated worker process.

**Why:** It gives durable job delivery, explicit retry/backoff behavior, and clean async state transitions (`QUEUED -> IN_PROGRESS -> COMPLETED/FAILED`) while keeping API latency low. It also cleanly separates request handling from LLM execution, which is important because extraction calls can take multiple seconds.

**Current behavior:** The API enqueues extraction jobs; the worker consumes them with configured concurrency; job state and error metadata are persisted in the database for polling (`GET /api/jobs/:jobId`). BullMQ is used as the execution transport, while PostgreSQL is the source of truth for business/job records returned by the API.

**If load reached ~500 extractions/minute:** I would **migrate from single-node Redis to a managed Redis Cluster** (keeping BullMQ), then scale workers horizontally, split queues by priority/document class, add dead-letter queues, and instrument queue lag plus worker saturation with autoscaling on waiting-job depth.

**Failure modes today:** Redis outage blocks enqueue/consume; queue backlog can grow during provider slowdowns; duplicate processing is possible around crash/retry boundaries if handlers are not fully idempotent; retry storms can happen without guardrails when provider errors are systemic.

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
5. **Automated provider benchmarking** — no recurring benchmark harness yet (accuracy/latency/cost across providers over a fixed fixture set). Deferred to keep scope focused on core API reliability and data correctness.

---

## Bonus — Prompt Versioning

Implemented: each extraction now stores **`promptVersion`** (e.g., `extract-v1`) in the `extractions` table and returns it in extraction responses.

Why this matters: prompt changes are effectively model-behavior releases. Persisting `promptVersion` enables regression analysis, incident triage (“which prompt produced this malformed output?”), and apples-to-apples quality comparisons across deployments.

## Bonus — Expiring Documents Endpoint

Implemented: `GET /api/sessions/:sessionId/expiring?withinDays=90`.

Design choice: this endpoint is backed by a **database query** (not in-memory filtering), using `status = COMPLETE` and expiry predicates (`isExpired = true` OR `validity.daysUntilExpiry <= withinDays`). Results are sorted by urgency (`CRITICAL`, `HIGH`, `MEDIUM`, `LOW`) and then nearest expiry.

Why this matters: this keeps response time predictable as sessions grow and aligns with the assignment’s requirement that expiry alerting must be query-driven.

---
