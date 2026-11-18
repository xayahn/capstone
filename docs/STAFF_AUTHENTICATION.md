# Internal Portal Authentication (Staff, Clergy, System Administrator)

**Introduced:** 9 November 2026 · **Replaces:** an earlier externally hosted identity bridge, which only worked on that hosting platform and always signed in one fixed administrator locally.

## How it works

| Item | Implementation |
|---|---|
| Sign-in | Email + password at `/` (admin web portal). Parishioners keep using the mobile app; their mobile password **cannot** open the portal. |
| Password storage | PBKDF2-SHA-256, 210,000 iterations, per-user random salt (`staff_credentials`). Same policy as parishioners: 12–128 characters with uppercase, lowercase and a number. A server marked `DEMO_DEPLOYMENT=true` (online demonstration, fictional data only) uses 100,000 iterations for new hashes because Cloudflare Workers allows no more; each hash keeps its own stored count. |
| Session | Random 256-bit token in an `HttpOnly`, `SameSite=Strict` cookie (`__Host-` prefixed and `Secure` in production). Only the token's SHA-256 hash is stored (`staff_sessions`). Sessions last 12 hours from sign-in (there is no idle timeout); at most 5 per person. |
| Brute-force protection | 5 wrong passwords lock the account for 15 minutes; 30 sign-in attempts per client address per 15 minutes (fixed window). Wrong email and wrong password return the same generic message. Changing a password and issuing a temporary password have no separate rate limit: a change always needs the current password and an active session, and only a system administrator can issue a temporary password. |
| Password change | Needs the current password and an active session. In one database transaction the new password is stored only if the stored password is still the one that was checked **and** the session is still active; only then are all of that person's other sessions ended and `staff.password.change` audited. If two changes race, exactly one succeeds and the other changes nothing (HTTP 409 when the same session double-submits; HTTP 401 when the winning change has already ended the other session). A change from a signed-out or expired session gets HTTP 401 and changes nothing. |
| CSRF protection | Every sign-in/sign-out/password request must carry the portal's own `Origin`. |
| New accounts / forgotten passwords | The **system administrator** provisions the person, then presses **Temporary password** in the internal access register. The 16-character password is shown once. The person must choose their own password at first sign-in before any portal data is available. Issuing a temporary password ends all of that person's sessions. |
| Deactivation | Deactivating an account ends all of its open sessions immediately. |
| Audit | `staff.sign_in` (success/denied), `staff.sign_out`, `staff.password.change`, `staff.password.temporary` and `user.set_active` are written to `audit_logs`, which cannot be edited or deleted (`drizzle/0008_audit_append_only.sql`). Failed sign-ins for unknown emails, and attempts while an account is locked, are not logged. |
| Role authority | Unchanged: the server still enforces role and parish scope on every request (see [RBAC.md](RBAC.md)). |

### Endpoints

| Method & path | Purpose |
|---|---|
| `POST /api/admin/auth/sign-in` | `{ email, password }` → sets the session cookie; returns `{ ok, mustChangePassword }` |
| `POST /api/admin/auth/sign-out` | Revokes the current session and clears the cookie |
| `POST /api/admin/auth/change-password` | `{ currentPassword, newPassword, confirmPassword }`; ends other sessions; 409 if the password changed in another request, 401 if this session has ended |
| `POST /api/admin/auth/temporary-password` | System administrator only: `{ userId }` → `{ email, temporaryPassword }` |

### Code map

- `backend/auth/staff-auth.ts`: hashing, sessions, lockout, temporary passwords
- `backend/auth/staff-session.ts`: resolves the signed-in person for server pages and admin API routes
- `backend/routes/admin/auth/*`: the four endpoints above
- `frontend/components/sign-in-landing.tsx`, `change-password-panel.tsx`: sign-in and password screens
- `drizzle/0006_staff_auth.sql`: `staff_credentials`, `staff_sessions`
- `tests/staff-auth.test.ts`: 15 tests (policy, cookie parsing, lockout, deactivation, expiry, sign-out, temporary password and forced change, parishioner exclusion, plus racing and double-submitted password changes and changes from signed-out or expired sessions)

## Local demonstration accounts

Seeded only in local development, together with the synthetic demonstration data. The full list of staff, clergy and parishioner demo accounts (password `ParishLink2026!`) is in [DEMO_DATA.md](DEMO_DATA.md). The local sign-in page lists them under "Local demonstration accounts".

> These accounts and this password must never be used with real personal data or in a production deployment.

## Verification

**18 November 2026 (local):** admin release check passed: 374 admin tests (17 staff-auth), 121/121 security regressions, 39/39 account Worker checks, TypeScript, ESLint and production build.

**9 November 2026 (historical, at introduction):**

- Admin unit tests: 268/268 passed (includes 11 new staff-auth tests); TypeScript and ESLint clean.
- Security regression: 97/97 passed. Migration validator: 7 files, 29 tables, 49 indexes.
- Live HTTP check against the running local server: anonymous access → 401; forged legacy identity headers → 401; wrong password → 401 generic; missing Origin → 403; staff/clergy/admin sign-in → correct role and parish scope; temporary password → portal blocked (403) until password changed → 200; parish staff cannot issue temporary passwords (403); sign-out → 401 afterwards; parishioner email on staff sign-in → 401.

## Production note

There is no hosted deployment. If the system is deployed later, the first system administrator must be created with a one-time, out-of-band setup step (not the demo seed), and the hosting platform must serve the portal over HTTPS so the `__Host-` cookie is accepted.
