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

## API Documentation

Complete route-level documentation (request formats, response shapes, and error codes) is available at:

- [/API_DOCS.md](./API_DOCS.md)
