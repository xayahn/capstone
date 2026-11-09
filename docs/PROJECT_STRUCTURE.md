# ParishLink Project Structure

ParishLink separates user interfaces, server implementation, shared domain rules, and platform entrypoints without introducing a second backend deployment.

## Repository map

```text
ParishLink/
├── apps/
│   ├── mobile/                         Parishioner frontend for iOS and Android
│   │   ├── src/api/                    Mobile HTTP client and secure session storage
│   │   ├── src/screens/                Mobile screens
│   │   ├── src/repositories/           Mobile workflow orchestration
│   │   ├── src/components/             Reusable mobile UI
│   │   └── src/types/                  Mobile-facing contracts
│   └── admin/                          One deployable admin web and API project
│       ├── app/                        Framework-discovered entrypoints only
│       │   ├── api/                    Thin URL-to-backend route adapters
│       │   ├── page.tsx                Admin page entrypoint
│       │   ├── layout.tsx              Web document and metadata entrypoint
│       ├── frontend/
│       │   ├── components/             Admin UI and sign-in presentation
│       │   └── styles/                 Admin design system and global styles
│       ├── backend/
│       │   ├── auth/                   Parishioner authentication and sessions
│       │   ├── config/                 Validated runtime configuration
│       │   ├── http/                   API response, CORS, and body handling
│       │   ├── observability/          Safe server error correlation
│       │   ├── routes/                 Admin, mobile, and health controllers
│       │   ├── security/               Rate limiting and idempotency helpers
│       │   └── services/               Admin and mobile business operations
│       ├── shared/                     Framework-independent domain types and rules
│       ├── db/                         D1 runtime adapter and Drizzle schema
│       ├── drizzle/                    Versioned database migrations
│       ├── tests/                      Backend/shared automated tests
│       └── scripts/                    Release, migration, and smoke checks
└── docs/                               Capstone, architecture, security, test, and handoff docs
```

## Dependency direction

```text
mobile frontend ──HTTPS──> app/api adapters ──> backend ──> db/storage
admin frontend ─────────> app/page adapter ───> backend ──> db/storage
       frontend ──────────────────────────────> shared domain rules
       backend  ──────────────────────────────> shared domain rules
```

The boundary rules are checked by ESLint:

- Admin frontend code cannot import backend or database modules.
- Backend code cannot import admin frontend modules.
- Shared rules cannot import framework, frontend, backend, or database modules.
- Mobile code talks to the backend through the documented HTTP API and never imports server source.

## Why `app/` and `db/` still exist

The web framework discovers pages and API URLs only from `app/`, so those files remain as very small adapters. The implementation they call is in `backend/routes/`, `backend/services/`, and the other backend folders.

The Sites/D1 toolchain expects the database schema at `db/schema.ts`; keeping it there preserves migration and hosting compatibility. It is part of the backend data layer even though it stays at the project root.

Keeping the admin frontend and API in one deployable project also preserves same-origin authentication, D1/R2 runtime bindings, and the existing mobile API contract. Splitting them into separately deployed servers would add CORS, cookie, environment, and release complexity without improving source-code navigation.

## Where to start debugging

| Problem | First folder or file |
|---|---|
| Mobile screen, layout, or interaction | `apps/mobile/src/screens/`, `apps/mobile/src/components/`, then `apps/mobile/App.tsx` |
| Mobile request or session problem | `apps/mobile/src/api/` and `apps/mobile/src/repositories/` |
| Admin visual or interaction problem | `apps/admin/frontend/` |
| API URL or HTTP method wiring | Matching file under `apps/admin/app/api/` |
| API behavior or validation | Matching controller under `apps/admin/backend/routes/` |
| Sign-up, sign-in, password, or session issue | `apps/admin/backend/auth/` |
| Scheduling, queue, assistant, or admin workflow | `apps/admin/backend/services/` |
| CORS, request parsing, or response format | `apps/admin/backend/http/` |
| Rate limit or retry/idempotency issue | `apps/admin/backend/security/` |
| Environment/readiness problem | `apps/admin/backend/config/` and `apps/admin/backend/routes/system/` |
| Database query, binding, or schema issue | `apps/admin/db/` and `apps/admin/drizzle/` |
| Status transition or shared domain type | `apps/admin/shared/` |
| Safe production failure correlation | `apps/admin/backend/observability/` |

## Adding code without mixing layers

1. Put presentation components and styles in `frontend/`.
2. Keep URL entry files in `app/` small; place request handling in `backend/routes/`.
3. Put reusable server operations in `backend/services/`.
4. Put database access behind `db/runtime.ts` and schema changes in `db/schema.ts` with a migration.
5. Put only pure, reusable types and rules in `shared/`.
6. Add or update tests and run the release checks before handoff.

This is a source-structure separation, not a deployment. No production resource or external service is changed by this layout.

