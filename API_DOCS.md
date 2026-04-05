# API Documentation

Base path: `/api`

## Common Error Response

All handled errors use this JSON shape:

```json
{
  "error": "ERROR_CODE",
  "message": "Human-readable description",
  "extractionId": null,
  "retryAfterMs": null
}
```

- `error`: machine-readable code.
- `message`: error message.
- `extractionId`: present for extraction-related failures when available.
- `retryAfterMs`: present for throttling/rate-limit errors.

---

## 1) Health

### `GET /health`

Returns service and dependency health.

#### Request
- Body: none
- Query: none

#### Success Response
- `200 OK` when overall status is healthy.
- `503 Service Unavailable` when overall status is degraded.

```json
{
  "status": "OK",
  "version": "1.0.0",
  "uptime": 0,
  "dependencies": {
    "database": "OK",
    "llmProvider": "OK",
    "queue": "OK"
  },
  "timestamp": "2026-04-05T12:00:00.000Z"
}
```

`status` can be `OK` or `DEGRADED`.

#### Errors
- No custom app error codes in this route; unexpected failures may surface as `500 INTERNAL_ERROR`.

---

## 2) Extract Document

### `POST /extract`

Accepts one document and performs extraction in `sync` (default) or `async` mode.

#### Request
- Content-Type: `multipart/form-data`
- File field: `document` (required)
- Accepted MIME types:
  - `image/jpeg`
  - `image/png`
  - `application/pdf`
- Max size: `10MB`
- Query params:
  - `mode`: `sync | async` (default: `sync`)
- Form fields:
  - `sessionId` (optional UUID)

#### Rate Limit
- Route is limited to **10 requests/minute/IP**.
- On limit exceeded:
  - HTTP `429`
  - `Retry-After` header (seconds)
  - error code: `RATE_LIMITED`

#### Success Responses

##### A) `sync` mode (default)
- `200 OK`
- Returns a normalized extraction record.

```json
{
  "id": "uuid",
  "sessionId": "uuid",
  "fileName": "passport.pdf",
  "promptVersion": "extract-v1",
  "documentType": "PASSPORT",
  "documentName": "Passport",
  "applicableRole": "N/A",
  "category": "IDENTITY",
  "confidence": 0.98,
  "holderName": "John Doe",
  "dateOfBirth": "12/01/1990",
  "sirbNumber": null,
  "passportNumber": "A1234567",
  "fields": [
    {
      "key": "passport_number",
      "label": "Passport Number",
      "value": "A1234567",
      "importance": "HIGH",
      "status": "VALID"
    }
  ],
  "validity": {
    "dateOfIssue": "10/05/2020",
    "dateOfExpiry": "10/05/2030",
    "isExpired": false,
    "daysUntilExpiry": 1300,
    "revalidationRequired": false
  },
  "compliance": null,
  "medicalData": null,
  "flags": [
    {
      "severity": "LOW",
      "message": "Example flag"
    }
  ],
  "isExpired": false,
  "processingTimeMs": 1450,
  "summary": "Document parsed successfully",
  "createdAt": "2026-04-05T12:00:00.000Z"
}
```

If duplicate document in same session (dedup by file hash), response is `200` and includes header:
- `X-Deduplicated: true`

##### B) `async` mode
- `202 Accepted`

```json
{
  "jobId": "uuid",
  "sessionId": "uuid",
  "status": "QUEUED",
  "pollUrl": "http://.../api/jobs/{jobId}",
  "estimatedWaitMs": 12000
}
```

#### Errors
- `400 UNSUPPORTED_FORMAT`
  - no file uploaded, or unsupported MIME type.
- `400 UNSUPPORTED_FILE_TYPE`
  - PDF upload with `LLM_PROVIDER=claude`.
- `404 SESSION_NOT_FOUND`
  - provided `sessionId` does not exist.
- `413 FILE_TOO_LARGE`
  - file exceeds 10MB (controller-level validation path).
- `422 LLM_JSON_PARSE_FAIL`
  - extraction failed after retries / parse failure.
  - includes `extractionId`.
- `429 RATE_LIMITED`
  - request quota exceeded for client IP.
  - includes `retryAfterMs`.
- `500 INTERNAL_ERROR`
  - timeout path (`LLM_TIMEOUT`) and unexpected server failures.
  - timeout path includes `extractionId`.

---

## 3) Get Async Job Status

### `GET /jobs/:jobId`

Poll status/result of async extraction.

#### Request
- Path params:
  - `jobId` (required UUID)
- Body: none

#### Success Responses (`200 OK`)

##### A) Queued

```json
{
  "jobId": "uuid",
  "status": "QUEUED",
  "queuePosition": 2,
  "estimatedCompleteMs": 12000
}
```

##### B) Processing

```json
{
  "jobId": "uuid",
  "status": "PROCESSING",
  "queuePosition": 0,
  "startedAt": "2026-04-05T12:00:00.000Z",
  "estimatedCompleteMs": 5000
}
```

##### C) Completed

```json
{
  "jobId": "uuid",
  "status": "COMPLETE",
  "extractionId": "uuid",
  "result": {
    "id": "uuid",
    "sessionId": "uuid",
    "fileName": "passport.pdf",
    "promptVersion": "extract-v1",
    "documentType": "PASSPORT",
    "documentName": "Passport",
    "applicableRole": "N/A",
    "category": "IDENTITY",
    "confidence": 0.98,
    "holderName": "John Doe",
    "summary": "...",
    "isExpired": false,
    "processingTimeMs": 1400,
    "createdAt": "2026-04-05T12:00:00.000Z"
  },
  "completedAt": "2026-04-05T12:00:08.000Z"
}
```

##### D) Failed

```json
{
  "jobId": "uuid",
  "status": "FAILED",
  "error": "INTERNAL_ERROR",
  "message": "Job failed",
  "failedAt": "2026-04-05T12:00:05.000Z",
  "retryable": true
}
```

#### Errors
- `400 INVALID_JOB_ID`
  - `jobId` is not a valid UUID.
- `404 JOB_NOT_FOUND`
  - no job exists for given ID.

---

## 4) Get Session Summary

### `GET /sessions/:sessionId`

Returns aggregate view of session documents and pending jobs.

#### Request
- Path params:
  - `sessionId` (required UUID)
- Body: none

#### Success Response
- `200 OK`

```json
{
  "sessionId": "uuid",
  "documentCount": 3,
  "detectedRole": "DECK",
  "overallHealth": "WARN",
  "documents": [
    {
      "id": "uuid",
      "fileName": "passport.pdf",
      "documentType": "PASSPORT",
      "applicableRole": "N/A",
      "holderName": "John Doe",
      "confidence": 0.98,
      "isExpired": false,
      "flagCount": 1,
      "criticalFlagCount": 0,
      "createdAt": "2026-04-05T12:00:00.000Z"
    }
  ],
  "pendingJobs": [
    {
      "jobId": "uuid",
      "status": "QUEUED"
    }
  ]
}
```

`overallHealth` values: `OK | WARN | CRITICAL`.

#### Errors
- `404 SESSION_NOT_FOUND`
- `500 INTERNAL_ERROR` for unexpected failures (including malformed `sessionId` currently bubbling from parser).

---

## 5) Cross-Document Validation

### `POST /sessions/:sessionId/validate`

Runs LLM-based consistency/compliance validation across completed extractions in a session.

#### Request
- Path params:
  - `sessionId` (required UUID)
- Body: none

#### Success Response
- `200 OK`

```json
{
  "sessionId": "uuid",
  "holderProfile": {},
  "consistencyChecks": [],
  "missingDocuments": [],
  "expiringDocuments": [],
  "medicalFlags": [],
  "overallStatus": "PASS",
  "overallScore": 92,
  "summary": "Most checks pass",
  "recommendations": [],
  "validatedAt": "2026-04-05T12:00:00.000Z"
}
```

#### Errors
- `400 INSUFFICIENT_DOCUMENTS`
  - fewer than 2 completed documents in session.
- `404 SESSION_NOT_FOUND`
- `500 INTERNAL_ERROR`
  - malformed `sessionId` parser error path and unexpected LLM/server failures.

---

## 6) Expiring Documents (Bonus)

### `GET /sessions/:sessionId/expiring?withinDays=90`

Returns documents in a session that are expired or expiring within the given window.

#### Request
- Path params:
  - `sessionId` (required UUID)
- Query params:
  - `withinDays` (optional integer, default `90`, min `1`, max `3650`)

#### Success Response
- `200 OK`

```json
{
  "sessionId": "uuid",
  "withinDays": 90,
  "count": 2,
  "documents": [
    {
      "extractionId": "uuid",
      "documentType": "COC",
      "documentName": "Certificate of Competency",
      "fileName": "coc.jpg",
      "expiryDate": "10/04/2026",
      "daysUntilExpiry": 5,
      "isExpired": false,
      "urgency": "HIGH"
    }
  ]
}
```

Sorted by urgency (`CRITICAL`, `HIGH`, `MEDIUM`, `LOW`) then nearest expiry.

#### Errors
- `404 SESSION_NOT_FOUND`
- `500 INTERNAL_ERROR` for unexpected failures.

---

## 7) Session Compliance Report

### `GET /sessions/:sessionId/report`

Returns a consolidated deployability/compliance report.

#### Request
- Path params:
  - `sessionId` (required UUID)
- Body: none

#### Success Response
- `200 OK`

```json
{
  "sessionId": "uuid",
  "generatedAt": "2026-04-05T12:00:00.000Z",
  "holderProfile": {
    "name": "John Doe",
    "alternateNames": [],
    "dateOfBirth": "1990-01-12T00:00:00.000Z",
    "nationality": "IN",
    "passportNumber": "A1234567",
    "sirbNumber": null,
    "detectedRole": "DECK"
  },
  "overallHealth": "WARN",
  "documentCount": 3,
  "documentInventory": [],
  "expiringDocuments": [],
  "medicalSummary": null,
  "flags": {
    "total": 2,
    "critical": 0,
    "high": 1,
    "details": []
  },
  "validationSummary": {
    "status": "PASS",
    "score": 92,
    "summary": "Most checks pass",
    "validatedAt": "2026-04-05T12:00:00.000Z"
  },
  "recommendation": "Seafarer may be deployable with conditions. Review flagged items before proceeding."
}
```

#### Errors
- `404 SESSION_NOT_FOUND`
- `500 INTERNAL_ERROR`
  - malformed `sessionId` parser error path and unexpected failures.

---

## Notes on Validation and Error Behavior

- `jobId` validation uses `safeParse`, so invalid UUID returns `400 INVALID_JOB_ID`.
- `sessionId` validation routes currently use direct `parse`; invalid UUIDs can bubble as non-app errors and are currently shaped by the global handler as `500 INTERNAL_ERROR`.
- Unexpected unhandled errors always fall back to status `500` and code `INTERNAL_ERROR` via global error middleware.