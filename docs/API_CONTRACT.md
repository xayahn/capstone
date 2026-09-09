# ParishLink API Contract

## 1. Status and conventions

This document defines the target shared contract for the parishioner mobile app and internal admin web portal. It is an implementation specification derived from the project requirements, not a claim that every endpoint is already deployed. A generated machine-readable schema should be produced from or checked against this contract before release.

### Implemented local route set

The current client/server integration uses `/api/mobile` and returns the domain objects expected by the Expo repository. It is implemented and locally exercised, but it has not been deployed:

| Method | Path | Authentication |
|---|---|---|
| `GET` | `/health` | Public minimal liveness |
| `GET` | `/ready` | Operational readiness; no secret values |
| `GET` | `/api/mobile/catalog` | Public catalog |
| `POST` | `/api/mobile/auth/sign-up` | Public, IP-throttled |
| `POST` | `/api/mobile/auth/sign-in` | Public, IP-throttled plus account lockout |
| `GET` | `/api/mobile/auth/session` | Mobile bearer token |
| `POST` | `/api/mobile/auth/sign-out` | Mobile bearer token |
| `POST` | `/api/mobile/auth/change-password` | Mobile bearer token |
| `GET` | `/api/mobile/snapshot` | Mobile bearer token |
| `POST` | `/api/mobile/availability` | Mobile bearer token, user-throttled |
| `POST` | `/api/mobile/appointments` | Mobile bearer token, user-throttled, `Idempotency-Key` |
| `POST` | `/api/mobile/appointments/{id}/documents/{documentId}` | Mobile bearer token, appointment ownership |
| `POST` | `/api/mobile/notifications/{id}/read` | Mobile bearer token, notification ownership |
| `POST` | `/api/mobile/queue/tickets` | Mobile bearer token, user-throttled, `Idempotency-Key` |
| `DELETE` | `/api/mobile/queue/tickets/active` | Mobile bearer token |
| `POST` | `/api/mobile/assistant` | Mobile bearer token, user-throttled |
| `PUT` | `/api/mobile/profile` | Mobile bearer token |

The internal portal uses `GET/POST /api/admin/state` for role-scoped reads and command-style writes, plus private document upload/download routes under `/api/admin/documents`. Admin writes use the protected internal session, same-origin validation, server role/parish checks, bounded JSON input, optimistic versions where applicable, and an `Idempotency-Key` per logical command.

Browser-origin mobile calls receive CORS headers only for an exact configured origin. Development defaults cover `localhost:8081` and `127.0.0.1:8081`; production accepts only exact HTTPS origins in `MOBILE_ALLOWED_ORIGINS`. Native clients normally send no browser `Origin` header. Wildcard credentialed CORS is not used.

The `/api/v1` material below remains the forward contract for a future explicitly versioned public API. A pre-release decision must either adopt it and migrate the clients or record `/api/mobile` as version 1; clients and server must not silently diverge.

### Base and representation

- Target versioned base path: `/api/v1` (current implementation: `/api/mobile`)
- HTTPS only in production.
- JSON uses UTF-8, `camelCase` fields, opaque string IDs, and ISO 8601 UTC instants such as `2026-09-15T02:00:00Z`.
- Local display uses `Asia/Manila`; a date-only archival event uses `YYYY-MM-DD` and is not converted as an instant.
- Unknown request fields are rejected on sensitive writes; response additions are backward-compatible within v1.
- Pagination uses opaque `cursor` and bounded `limit` (default/maximum documented in the generated schema).

### Authentication and authorization

Clients send the selected platform's secure session credential. The backend derives `userId`, role, memberships, and session security state; clients cannot assign them. Every protected resource applies [`RBAC.md`](RBAC.md). Mobile parishioner endpoints enforce ownership. Admin endpoints enforce internal role, parish/resource scope, and workflow permission.

### Common headers

| Header | Use |
|---|---|
| `Authorization` or secure session cookie | Authentication, according to selected identity architecture |
| `Idempotency-Key` | Required on retryable create/consequential POST operations; random per logical action |
| `If-Match` | Required for versioned transitions/updates, using the current entity version/ETag |
| `X-Request-Id` | Optional client correlation; server returns a safe authoritative request ID |
| `Content-Type: application/json` | JSON request bodies |

### Success and error shapes

Single-resource success:

```json
{
  "data": { "id": "apt_opaque" },
  "meta": { "requestId": "req_opaque", "generatedAt": "2026-09-01T01:00:00Z" }
}
```

Collection success:

```json
{
  "data": [],
  "meta": { "requestId": "req_opaque", "nextCursor": null }
}
```

Error:

```json
{
  "error": {
    "code": "SCHEDULE_CONFLICT",
    "message": "That time is no longer available.",
    "fieldErrors": {},
    "retryable": false
  },
  "meta": { "requestId": "req_opaque" }
}
```

Do not expose stack traces, SQL, storage keys, provider secrets, existence of unauthorized resources, or sensitive values in errors.

| HTTP | Typical meaning |
|---:|---|
| `200/201/204` | Successful read/create/no-content action |
| `400` | Malformed input |
| `401` | Authentication required/expired |
| `403` | Authenticated but not authorized |
| `404` | Not found or intentionally concealed out-of-scope resource |
| `409` | Schedule/state/idempotency/version conflict |
| `413/415/422` | Payload too large, unsupported type, semantic validation failure |
| `429` | Rate limit/quota guard |
| `503` | Temporarily unavailable dependency; safe fallback may apply |

Stable error codes include `VALIDATION_FAILED`, `AUTH_REQUIRED`, `FORBIDDEN`, `NOT_FOUND`, `VERSION_CONFLICT`, `INVALID_TRANSITION`, `SCHEDULE_CONFLICT`, `DOCUMENTS_INCOMPLETE`, `UPLOAD_NOT_READY`, `QUEUE_CLOSED`, `QUEUE_ALREADY_ACTIVE`, `RATE_LIMITED`, `AI_UNAVAILABLE`, and `SERVICE_UNAVAILABLE`.

## 2. Canonical resources

### Appointment

```json
{
  "id": "apt_opaque",
  "reference": "PL-2026-000123",
  "parishioner": { "id": "usr_opaque", "displayName": "Juan D." },
  "service": { "id": "svc_baptism", "name": "Baptism" },
  "parish": { "id": "par_opaque", "name": "San Guillermo Parish" },
  "clergy": { "id": "clg_opaque", "displayName": "Rev. Example" },
  "venue": { "id": "ven_opaque", "name": "Main Church" },
  "startsAt": "2026-09-15T02:00:00Z",
  "endsAt": "2026-09-15T03:00:00Z",
  "displayTimeZone": "Asia/Manila",
  "status": "under_review",
  "checklistVersionId": "chk_opaque",
  "reviewNote": null,
  "version": 3,
  "createdAt": "2026-09-01T01:00:00Z",
  "updatedAt": "2026-09-02T04:00:00Z"
}
```

Canonical appointment statuses are `submitted`, `documents_pending`, `under_review`, `needs_changes`, `ready_to_approve`, `approved`, `rejected`, `completed`, `cancelled`, and `no_show`.

### Document submission

```json
{
  "id": "doc_opaque",
  "appointmentId": "apt_opaque",
  "requirement": { "id": "req_opaque", "name": "Approved requirement label", "required": true },
  "fileName": "document.pdf",
  "status": "submitted",
  "reviewNote": null,
  "submittedAt": "2026-09-01T02:00:00Z",
  "reviewedAt": null,
  "version": 1
}
```

Canonical document statuses are `not_submitted`, `submitted`, `under_review`, `verified`, `needs_replacement`, and `not_required`. Storage keys, hashes, scanner details, and private URLs are omitted unless a narrowly authorized endpoint needs them.

## 3. Public and session endpoints

| Method/path | Access | Purpose |
|---|---|---|
| `GET /health` | Public, minimal | Service/release health; no dependency secret/detail |
| `GET /catalog/parishes` | Public | Eight active parishes and approved public information |
| `GET /catalog/services?parishId=` | Public | Five active baseline services and approved/versioned guidance |
| `GET /catalog/services/{serviceId}/requirements?parishId=` | Public | Current approved checklist summary |
| `GET /me` | Authenticated | Current account, role/client eligibility, preferences, memberships where appropriate |
| `PATCH /me/preferences` | Authenticated, `If-Match` | Locale/notification preferences; no role/scope mutation |
| `POST /sessions/logout` | Authenticated/idempotent | Revoke current session |

Catalog endpoints never expose internal notes, private schedules, staff identity beyond approved public content, or unapproved prototype rules.

## 4. Parishioner mobile endpoints

### Availability

`POST /availability/search`

```json
{
  "serviceId": "svc_baptism",
  "parishId": "par_opaque",
  "dateFrom": "2026-09-01",
  "dateTo": "2026-09-30",
  "clergyId": null
}
```

Returns available candidate intervals with parish/service/clergy/venue display data. A returned candidate is not a guarantee; the create endpoint rechecks all constraints atomically. Search range/rate is bounded.

The currently implemented equivalent is `POST /api/mobile/availability`:

```json
{
  "serviceId": "baptism",
  "parishId": "san-guillermo",
  "clergyId": "clergy-manalo",
  "venueId": "venue-sg-main",
  "date": "2026-09-15"
}
```

It returns the six configured candidate times with an `available` boolean after checking global active appointments, availability blocks, confirmed assignments, authoritative service duration, and before/after buffers. Appointment creation repeats the same constraints inside its atomic commit boundary.

### Appointments

| Method/path | Access/conditions | Purpose |
|---|---|---|
| `GET /appointments` | Parishioner own | Paginated own appointments |
| `POST /appointments` | Parishioner; `Idempotency-Key` | Submit request after atomic availability recheck |
| `GET /appointments/{id}` | Owner | Detail, checklist summary, version |
| `GET /appointments/{id}/events` | Owner | Safe status history; internal-only detail redacted |
| `POST /appointments/{id}/cancel` | Owner; idempotency + `If-Match`; policy | Cancel with allowed reason category/note |
| `POST /appointments/{id}/reschedule` | Owner; idempotency + `If-Match`; policy | Atomically move to newly validated interval and event |

Create request:

```json
{
  "serviceId": "svc_baptism",
  "parishId": "par_opaque",
  "clergyId": "clg_opaque",
  "venueId": "ven_opaque",
  "startsAt": "2026-09-15T02:00:00Z",
  "participants": [
    { "type": "candidate", "fullName": "Juan Dela Cruz", "dateOfBirth": "2020-01-01" }
  ],
  "acknowledgedChecklistVersionId": "chk_opaque"
}
```

Successful creation is `201`; a stale/conflicting slot is `409 SCHEDULE_CONFLICT` and creates no partial appointment. The client must not infer approval from `201`.

### Documents

| Method/path | Access/conditions | Purpose |
|---|---|---|
| `GET /appointments/{id}/documents` | Owner | Checklist items and current statuses |
| `POST /appointments/{id}/documents/{requirementId}/upload-authorizations` | Owner; rate/size/type limits | Short-lived private quarantine upload authorization |
| `POST /appointments/{id}/documents/{requirementId}/complete-upload` | Owner; idempotency | Confirm object receipt/checksum and enter safe processing |
| `DELETE /appointments/{id}/documents/{documentId}` | Owner; policy/state | Remove/replace before review where permitted |

Upload authorization response contains a short-lived URL/token, allowed headers, maximum bytes, expiry, and opaque object receipt ID. It never contains permanent/public access. Completion does not produce `verified`.

### Notifications

| Method/path | Access | Purpose |
|---|---|---|
| `GET /notifications` | Own | In-app notifications with cursor/read filter |
| `POST /notifications/{id}/read` | Own/idempotent | Mark one read |
| `POST /notifications/read-all` | Own/idempotent | Mark currently visible eligible items read |
| `PUT /devices/{deviceId}/push-registration` | Own | Register/refresh consented provider token securely |
| `DELETE /devices/{deviceId}/push-registration` | Own | Revoke device token/consent |

### Walk-in queue

| Method/path | Access/conditions | Purpose |
|---|---|---|
| `GET /queue/parishes/{parishId}/status` | Authenticated/public-safe | Open state and safe queue estimate metadata |
| `POST /queue/tickets` | Parishioner; idempotency; parish policy | Request one active account-linked ticket |
| `GET /queue/tickets/active` | Own | Active ticket and last-updated state |
| `POST /queue/tickets/{id}/cancel` | Owner; allowed state | Cancel active own ticket |

### Assistant v2 guidance

The implemented local route is `POST /api/mobile/assistant`; `/api/v1/assistant/messages` remains a possible name for the future versioned contract. The implemented route is authenticated, user-throttled, and accepts a question of at most 500 characters. The current mobile client sends only `prompt`; the server also accepts an optional opaque `appointmentId`, but any lookup remains scoped to the authenticated actor.

```json
{
  "prompt": "What documents do I need for Baptism?",
  "appointmentId": "apt_optional_owned"
}
```

The response always contains the message identity and text. Structured guidance fields are omitted when they do not apply; the following is an illustrative superset, not a claim that actions and clarification are always returned together.

```json
{
  "id": "msg_opaque",
  "from": "assistant",
  "title": "Baptism document checklist",
  "text": "These are the current requirements published in ParishLink.",
  "createdAt": "2026-09-01T01:00:00Z",
  "bullets": ["Approved requirement label"],
  "sources": [
    {
      "label": "ParishLink Baptism requirements",
      "kind": "service_requirements",
      "updatedAt": "2026-09-01T00:00:00Z"
    }
  ],
  "actions": [
    {
      "id": "book-baptism",
      "label": "Start a request",
      "kind": "service",
      "serviceId": "baptism"
    }
  ],
  "followUpPrompts": ["How do I start a Baptism request?"],
  "clarification": {
    "question": "Which service are you preparing for?",
    "options": [
      {
        "id": "baptism",
        "label": "Baptism",
        "prompt": "What documents do I need for Baptism?",
        "serviceId": "baptism"
      }
    ]
  },
  "escalation": false
}
```

- Source kinds are `service_requirements`, `appointment`, `queue`, and `parish_directory`.
- Action kinds are `service`, `appointment`, `documents`, `queue`, `home`, and `contact_parish`; `serviceId` and `appointmentId` are present only when needed for a typed client action.
- Service information and requirements come deterministically from the active database catalogue. Appointment and document summaries are queried with `parishioner_user_id = authenticatedActor.id`; a supplied appointment ID cannot cross that ownership boundary. Queue guidance reads only the authenticated actor's active ticket, and parish-directory guidance uses the actor's home parish.
- The assistant receives no uploaded file bytes or private document contents and has no mutation, approval, verification, scheduling, queue, or record tools.
- Prompts are redacted before storage or any optional provider call. Known service, requirement, appointment, queue, directory, safety, and product-workflow answers remain deterministic.
- Gemini is an optional server-only phrasing dependency for otherwise-unmatched general product questions only. It receives the redacted general prompt without actor-owned database context, may replace only the response `text`, has an eight-second timeout, and falls back to deterministic guidance when no key is configured or the provider fails. The local evidence does not include a real Gemini provider-key run.

## 5. Internal portal endpoints

Prefix internal operational routes with `/admin`. All require an internal role and scoped server authorization.

### Dashboard and appointments

| Method/path | Roles | Purpose |
|---|---|---|
| `GET /admin/dashboard?parishId=` | Staff/clergy/admin, scoped | Current operational summary |
| `GET /admin/appointments` | Scoped | Filtered/paginated work list |
| `GET /admin/appointments/{id}` | Scoped/assigned | Full authorized detail |
| `POST /admin/appointments/{id}/transitions` | Permission + `If-Match` + idempotency | Controlled state transition |

Transition request:

```json
{
  "toStatus": "needs_changes",
  "reasonCode": "DOCUMENT_REPLACEMENT_REQUIRED",
  "note": "Please upload a clearer copy of the requested page."
}
```

Approval performs a fresh conflict and required-document check. Missing documents return `409 DOCUMENTS_INCOMPLETE`; stale resource returns `409 VERSION_CONFLICT`; invalid role/state returns safe denial.

### Document review

| Method/path | Roles | Purpose |
|---|---|---|
| `GET /admin/documents` | Authorized scoped reviewer | Review queue without public URLs |
| `POST /admin/documents/{id}/view-authorizations` | Need-to-know scoped reviewer | Short-lived private read authorization; audited |
| `POST /admin/documents/{id}/reviews` | Reviewer; `If-Match` + idempotency | Decide `verified` or `needs_replacement` with required note rules |

The API does not allow AI/scanner/system-admin technical support to silently verify documents.

### Queue

| Method/path | Roles | Purpose |
|---|---|---|
| `GET /admin/queue?parishId=` | Scoped operations | Waiting/serving tickets |
| `POST /admin/queue/tickets` | Scoped staff; idempotency | Issue ticket without requiring an account |
| `POST /admin/queue/call-next` | Scoped staff; idempotency | Atomically claim next eligible ticket for a counter |
| `POST /admin/queue/tickets/{id}/serve` | Scoped staff; `If-Match` | Mark served |
| `POST /admin/queue/tickets/{id}/cancel` | Scoped staff; reason | Cancel |
| `POST /admin/queue/tickets/{id}/priority` | Explicit permission; reason + `If-Match` | Audited policy exception |

### Configuration and schedules

| Method/path | Roles | Purpose |
|---|---|---|
| `GET/POST/PATCH /admin/venues` | Scoped/config roles | Venue lifecycle |
| `GET/POST/PATCH /admin/availability-blocks` | Scoped/config roles | Availability/closure management |
| `GET/POST/PATCH /admin/clergy-assignments` | Assigned/config roles | Cross-parish assignment lifecycle with conflict checks |
| `GET/POST/PATCH /admin/service-configurations` | Approved config roles | Versioned duration/buffer/guidance/checklist publication |

Publishing service/checklist configuration records its business approver and effective date. Technical system administration alone is not canonical approval.

### Records and certificates

| Method/path | Roles | Purpose |
|---|---|---|
| `GET /admin/records` | Need-to-know scoped | Search working/index records; audited |
| `POST /admin/records` | Authorized scoped | Create working copy with provenance |
| `PATCH /admin/records/{id}` | Authorized scoped; `If-Match` | Correct via event/history |
| `POST /admin/records/{id}/verify-against-archive` | Designated custodian; idempotency | Record archive verification |
| `POST /admin/records/{id}/certificate` | Disabled until DEC-006; explicit permission | Controlled official output, otherwise only non-official working-copy export |

### Announcements, reports, evaluation, audit

| Method/path | Roles | Purpose |
|---|---|---|
| `GET/POST/PATCH /admin/announcements` | Scoped publisher | Draft/update with safe text |
| `POST /admin/announcements/{id}/publish` | Scoped publisher; idempotency | Publish/schedule approved audience |
| `GET /admin/reports/operations` | Scoped report role | Appointment/document/queue/schedule aggregates |
| `GET /admin/reports/evaluation` | Approved aggregate role | Actual validated response calculations or no-results state |
| `GET /admin/audit` | Security-authorized role | Filtered safe audit; no private payload |

Evaluation response collection/import endpoints remain disabled until the instrument, consent, sample, ethics, and governance are approved. Valid records use an allowed item code, one of eight characteristics, integer score 1–4, respondent group, instrument version, and consent evidence.

## 6. Concurrency and idempotency

- Idempotency keys are scoped to authenticated actor, route/action, and normalized request fingerprint; a changed payload under the same key returns `409`.
- The server retains outcomes for the approved retry window and returns the original safe response on identical replay.
- `If-Match` compares a version/ETag; mismatch returns the latest safe version metadata without applying the write.
- Scheduling, queue claim, approval, document review, and notification event creation are protected against partial commit.
- A client timeout does not mean failure; clients query/replay with the same idempotency key before starting a new action.

## 7. Validation and limits

Generated schemas must define required fields, max lengths, allowed enum values, date/time order, list bounds, upload media/bytes, search window, pagination maximum, and note/content limits. The server normalizes identifiers and rejects client-supplied role, reviewer, decision actor, audit fields, storage keys, verification state, calculated duration/end, or official-certificate flags.

## 8. Notifications and asynchronous state

Business success does not wait for push or Gemini. A durable outbox/equivalent associates event ID with notification ID and provider attempt. API responses distinguish committed business state from `notificationDelivery: pending|delivered|failed`. Polling/realtime updates carry resource version and never replace authorization checks.

## 9. Versioning and deprecation

Compatible response fields may be added within v1. Renames/removals, changed enum semantics, required-field changes, or altered workflow require a new version or a documented compatibility phase. Mobile minimum/supported versions are observable and communicated before rejecting old clients. Schema/API/client compatibility is rehearsed in staging and recorded in the deployment package.

## 10. Contract verification

Release evidence includes generated schema validation, client/server type compatibility, positive and negative authorization cases, every status transition, error-code semantics, idempotent replay, optimistic conflict, concurrent scheduling/queue claim, private upload/view, pagination/limits, time-zone boundaries, redacted logging, and backward-compatibility tests.
