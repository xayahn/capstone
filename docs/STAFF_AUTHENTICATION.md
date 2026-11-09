# Internal Portal Authentication (Staff, Clergy, System Administrator)

**Introduced:** 9 November 2026 · **Replaces:** the hosted "Sign in with ChatGPT" identity bridge (`app/chatgpt-auth.ts` and `@openai/sites-vite-plugin`), which only worked on OpenAI's hosting platform and always signed in one fixed administrator locally.

## How it works

| Item | Implementation |
|---|---|
| Sign-in | Email + password at `/` (admin web portal). Parishioners keep using the mobile app; their mobile password **cannot** open the portal. |
| Password storage | PBKDF2-SHA-256, 210,000 iterations, per-user random salt (`staff_credentials`). Same policy as parishioners: 12–128 characters with uppercase, lowercase and a number. |
| Session | Random 256-bit token in an `HttpOnly`, `SameSite=Strict` cookie (`__Host-` prefixed and `Secure` in production). Only the token's SHA-256 hash is stored (`staff_sessions`). Sessions last 12 hours; at most 5 per person. |
| Brute-force protection | 5 wrong passwords lock the account for 15 minutes; 30 sign-in attempts per IP per 15 minutes. Wrong email and wrong password return the same generic message. |
| CSRF protection | Every sign-in/sign-out/password request must carry the portal's own `Origin`. |
| New accounts / forgotten passwords | The **system administrator** provisions the person, then presses **Temporary password** in the internal access register. The 16-character password is shown once. The person must choose their own password at first sign-in before any portal data is available. Issuing a temporary password ends all of that person's sessions. |
| Deactivation | Deactivating an account ends all of its open sessions immediately. |
| Audit | `staff.sign_in` (success/denied), `staff.sign_out`, `staff.password.change`, `staff.password.temporary` are written to `audit_logs`. |
| Role authority | Unchanged: the server still enforces role and parish scope on every request (see [RBAC.md](RBAC.md)). |

### Endpoints

| Method & path | Purpose |
|---|---|
| `POST /api/admin/auth/sign-in` | `{ email, password }` → sets the session cookie; returns `{ ok, mustChangePassword }` |
| `POST /api/admin/auth/sign-out` | Revokes the current session and clears the cookie |
| `POST /api/admin/auth/change-password` | `{ currentPassword, newPassword, confirmPassword }`; ends other sessions |
| `POST /api/admin/auth/temporary-password` | System administrator only: `{ userId }` → `{ email, temporaryPassword }` |

### Code map

- `backend/auth/staff-auth.ts`: hashing, sessions, lockout, temporary passwords
- `backend/auth/staff-session.ts`: resolves the signed-in person for server pages and admin API routes
- `backend/routes/admin/auth/*`: the four endpoints above
- `frontend/components/sign-in-landing.tsx`, `change-password-panel.tsx`: sign-in and password screens
- `drizzle/0006_staff_auth.sql`: `staff_credentials`, `staff_sessions`
- `tests/staff-auth.test.ts`: 11 tests (policy, cookie parsing, lockout, deactivation, expiry, sign-out, temporary password and forced change, parishioner exclusion)

## Local demonstration accounts

Seeded only in local development, together with the synthetic demonstration data. The full list of staff, clergy and parishioner demo accounts (password `ParishLink2026!`) is in [DEMO_DATA.md](DEMO_DATA.md). The local sign-in page lists them under "Local demonstration accounts".

> These accounts and this password must never be used with real personal data or in a production deployment.

## Verification (9 November 2026, local)

- Admin unit tests: 268/268 passed (includes 11 new staff-auth tests); TypeScript and ESLint clean.
- Security regression: 97/97 passed. Migration validator: 7 files, 29 tables, 49 indexes.
- Live HTTP check against the running local server: anonymous access → 401; forged legacy ChatGPT identity headers → 401; wrong password → 401 generic; missing Origin → 403; staff/clergy/admin sign-in → correct role and parish scope; temporary password → portal blocked (403) until password changed → 200; parish staff cannot issue temporary passwords (403); sign-out → 401 afterwards; parishioner email on staff sign-in → 401.

## Production note

There is no hosted deployment. If the system is deployed later, the first system administrator must be created with a one-time, out-of-band setup step (not the demo seed), and the hosting platform must serve the portal over HTTPS so the `__Host-` cookie is accepted.
