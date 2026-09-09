# ParishLink Admin and API

This is one full-stack deployment with explicit source boundaries:

- `frontend/` — admin UI components and styles
- `backend/` — route controllers, services, authentication, HTTP, security, configuration, and observability
- `shared/` — pure domain types and workflow rules
- `db/` — D1 runtime and Drizzle schema
- `app/` — thin framework entrypoints required for pages and API URLs

For the complete map and debugging guide, see [`../../docs/PROJECT_STRUCTURE.md`](../../docs/PROJECT_STRUCTURE.md).

No deployment command is part of the restructuring workflow.

