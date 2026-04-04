# Code Review — "feat: add document extraction endpoint"

## Overall Assessment

Hey! Great work getting the extraction endpoint up and running end-to-end — having a working prototype this early is valuable and shows you understand the core flow. That said, there are several issues here that would block this from merging into main, ranging from a **critical security issue** to architectural decisions that would hurt us in production. I've organized my comments from most critical to least.

None of this is about style — these are things that would either break in production or create real problems for the team. Let's walk through them.

---

## 🔴 Critical — Must Fix Before Merge

### Line 13: Hardcoded API key

```ts
const client = new Anthropic({ apiKey: 'sk-ant-REDACTED' });
```

This is the most urgent issue. **API keys must never be committed to source control**, even if "redacted" in the PR description. If this was ever pushed with the real key, it has already been logged in Git history and needs to be rotated immediately.

**Fix:** Read from an environment variable:

```ts
const client = new Anthropic({ apiKey: process.env.LLM_API_KEY });
```

Add the key to `.env` (which should be in `.gitignore`) and document it in `.env.example`.

**Why this matters:** Even a single leaked API key can result in thousands of dollars of unauthorized charges, and once it's in Git history, it's effectively public forever. This is one of the most common production incidents in our industry.

---

### Lines 559–560: Global state for storage

```ts
global.extractions = global.extractions || [];
global.extractions.push(result);
```

Using `global` as a database means:

- All data is lost on server restart
- Memory grows without bound — eventually the process crashes
- No way to query, filter, or associate extractions with sessions
- Multiple server instances would each have their own isolated copy

**Fix:** Store results in the database. We have a PostgreSQL instance and a Prisma schema already set up. Use the `Extraction` model.

---

### Line 549: Overly broad prompt

```ts
text: 'Extract all information from this maritime document and return as JSON.',
```

This prompt will produce wildly inconsistent results across different documents and different runs. The LLM has no guidance on:

- What fields to extract
- What format to use
- What document types exist
- What "information" means in this context

**Fix:** Use the standardized extraction prompt we've defined in the project spec. It provides a document taxonomy, a specific JSON schema, and instructions that produce consistent, comparable output.

---

## 🟡 Important — Should Fix

### Line 533: No model configuration

```ts
model: 'claude-opus-4-6',
```

Two issues here:

1. **Opus is the most expensive model** (~15x the cost of Haiku). For document extraction, Haiku or Sonnet produce equivalent results at a fraction of the cost. At scale, this could cost us $50+ per batch of documents instead of $3.
2. **The model is hardcoded.** If we need to switch providers or models (e.g., for cost, speed, or rate limits), we'd have to change code and redeploy.

**Fix:** Read from `process.env.LLM_MODEL` with a sensible default like `claude-haiku-4-5-20251001`.

---

### Line 556: No error handling for JSON parsing

```ts
const result = JSON.parse(response.content[0].text);
```

LLMs frequently return invalid JSON — they add markdown code fences, include explanatory text before the JSON, or produce syntax errors. A raw `JSON.parse` will throw an unhandled exception.

**Fix:** Use a defensive JSON extractor that finds the outermost `{...}` boundaries, and if that still fails, send a repair prompt asking the LLM to fix its own output. The `extractJson()` utility and `safeParse()` method in our LLM base provider handle this.

---

### Line 529: Saving files to disk with original filename

```ts
const savedPath = path.join('./uploads', file.originalname);
```

Several problems:

1. **Path traversal attack** — `file.originalname` could contain `../../etc/passwd`. Always sanitize filenames or use generated UUIDs.
2. **PII risk** — maritime documents contain personal information (passport numbers, medical records). Saving them to an unencrypted local directory with no access controls creates a compliance liability.
3. **Filename collision** — two files with the same name will silently overwrite each other.

**Fix:** For now, process files in-memory only (the `fileBuffer` is sufficient). If we need persistence, use cloud storage (S3/GCS) with UUID-based keys.

---

### Lines 515–566: No timeout on LLM call

```ts
const response = await client.messages.create({ ... });
```

If the LLM API hangs or is slow, this request will wait indefinitely, holding the connection open and eventually causing upstream timeouts. With enough concurrent requests, this can take down the entire server.

**Fix:** Wrap the call in a `Promise.race` with a 30-second timeout. Our `BaseLLMProvider.withTimeout()` method does exactly this.

---

## 💡 Teaching Moment

### Why we need structured error responses

Look at your error handler:

```ts
} catch (error) {
  console.log('Error:', error);
  res.status(500).json({ error: 'Something went wrong' });
}
```

From the caller's perspective, this response is useless. They can't tell if the file was corrupt, the LLM was down, or the server ran out of memory. They can't decide whether to retry. And importantly, `console.log` (not `console.error`) means this won't show up in error log streams in many production logging setups.

In a production API, every error response should include:

- A **machine-readable error code** (`LLM_JSON_PARSE_FAIL`, `UNSUPPORTED_FORMAT`, etc.)
- A **human-readable message** explaining what happened
- Enough context for the caller to decide **what to do next** (retry? fix the input? contact support?)

This isn't just about making the API "nice" — it directly reduces the support burden on the team. Every time a Manning Agent sees "Something went wrong" and emails us, that's engineering time spent debugging something the error message could have told them.

---

## Summary

The core logic works, which is a solid foundation. The three must-fix items are:

1. Remove the hardcoded API key and read from env
2. Replace global state with database storage
3. Use the standardized extraction prompt

Once those are addressed, I'd do a second pass on the timeout, error handling, and file storage concerns. Happy to pair on any of these if you'd like to walk through the implementation together.
