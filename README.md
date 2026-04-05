# Maritime Assignment

This repository contains the backend evaluation assignment for maritime document extraction and compliance workflows.

## How to Run

1. Clone the repository and navigate to the root directory.

2. Run the docker compose command to set up postgres and redis:

```bash
docker compose up -d
```

3. Put envs in the following directory:
   - packages/database
   - apps/server
   - apps/worker

4. Install dependencies:

```bash
bun install
```

5. Start the server:

```bash
bun run start:server
```

6. Start the worker:

```bash
bun run start:worker
```

## Project Explanation

This project is a production-style backend for document extraction, validation, and compliance checks.
It supports both **sync** processing (instant response) and **async** processing (queued background jobs), so clients can choose between low-latency results and high-throughput reliability.


## System Architecture Diagram

```
+------------------------+
| Client / API Consumer  |
+-----------+------------+
            |
            v
+------------------------+
| Server API             |
| apps/server            |
+-----------+------------+
            |
   +--------+--------+
   |                 |
   v                 v
(Sync Mode)     (Async Mode)
   |                 |
   v                 v
+----------------+   +------------------------+
| LLM Package    |   | Queue (Redis / BullMQ) |
| packages/llm   |   | packages/queue         |
+----------------+   +-----------+------------+
                                |
                                v
                      +------------------------+
                      | Worker                 |
                      | apps/worker            |
                      +-----------+------------+
                                  |
                                  v
                          +----------------+
                          | LLM Package    |
                          | packages/llm   |
                          +----------------+

        <---------------------------------------->
        |                                        |
        v                                        v
+------------------------+        +------------------------+
| PostgreSQL             |        | PostgreSQL             |
| Prisma / packages/db   |        | Prisma / packages/db   |
+------------------------+        +------------------------+
```

### Request Flow (high level)

- `POST /api/extract` (sync): API receives file, extracts immediately, stores result, returns response.
- `POST /api/extract` (async): API validates input, enqueues job, returns job/session reference.
- Worker consumes queued jobs, performs extraction via provider layer, persists output to DB.
- `POST /api/sessions/:sessionId/validate`: runs validation/compliance checks on extracted session data.

This separation keeps the API responsive under load while allowing workers to scale independently for heavy processing.


## API Documentation

Complete route-level documentation (request formats, response shapes, and error codes) is available at:

- [/API_DOCS.md](./API_DOCS.md)
