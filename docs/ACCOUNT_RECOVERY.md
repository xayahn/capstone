# Account recovery and email verification

Status at 2026-11-09: backend/mobile implementation, 39 actual-Worker source-route checks and 36 running-development-backend HTTP checks pass. Browser recovery navigation, input validation and unavailable-mail handling were observed. **Live email delivery is not configured or accepted. Installed Android/iPhone acceptance is not executed. No deployment.** See [local account acceptance](LOCAL_ACCOUNT_ACCEPTANCE_2026-11-09.md) for the test-router/DB-bootstrap boundary, disabled-provider controls and exact evidence. Historical dated audits remain historical evidence.

## User flows

From mobile sign-in, choose **Forgot password?**, enter the sign-in email and request a code. An accepted request gives the same acknowledgement for eligible, unknown, disabled and internal accounts. Acceptance does not mean a message reached an inbox. Enter the newest 12-character code, new password and matching confirmation. A successful reset returns to manual sign-in; it never grants a new session automatically.

In Profile, **Email security** shows the server's `emailVerified` value. Request a verification code and confirm it in the same active session. A client badge, demo account, accepted request, provider response, or editable profile field cannot create verified status. Accounts created before this change remain unverified. A successful password reset also establishes ownership of the current email. Booking is not currently conditioned on email verification; enforcing that policy requires a deliberate migration/owner decision rather than silently locking existing users out.

If mail is disabled or incomplete, requests fail uniformly with HTTP 503 and the app explains that delivery is unavailable. Invalid input, rate limits, unavailable services, lost connectivity and uncertain confirmation results remain visible. A failed response is never converted to success. A confirmation whose result is uncertain tells the user to check sign-in/profile state before retrying. Closing the form aborts the pending client request, clears sensitive fields and prevents delayed callbacks changing a different account's UI; an already accepted server operation may still complete.

Internal parish staff, clergy and system administrators use their configured identity-provider recovery process. Mobile recovery cannot reset internal SSO identities. Loss of mailbox access requires the parish's approved identity/support procedure; staff must never ask for passwords or one-time codes, or issue an informal password override.

## API contract

All calls use JSON and the existing mobile origin/body-size/error policies. Verification routes additionally require the current mobile bearer session. None returns a code or password.

| Method and path | Input | Success |
|---|---|---|
| `POST /api/mobile/auth/password-reset/request` | `email` | 202 `{accepted:true,message:...}`; generic acknowledgement |
| `POST /api/mobile/auth/password-reset/confirm` | `email, code, newPassword, confirmPassword` | 204; all sessions and push bindings revoked |
| `POST /api/mobile/auth/email-verification/request` | `{}` and active session | 202 `{accepted:true}` |
| `POST /api/mobile/auth/email-verification/confirm` | `code` and same active session | 200 `{emailVerified:true}` |

Sign-up, sign-in, session and profile responses include a server-computed `emailVerified` boolean. The new password follows the existing 12–128-character uppercase/lowercase/number policy. Wrong/expired/used codes return a generic invalid-code error. Requests and confirmations have separate account/email and IP rate limits, returning 429 when exceeded.

## Security design

- Random codes have 60 bits of entropy, represented as 12 unambiguous Base32 characters. Case, spaces and hyphens normalize before hashing. Only the SHA-256 hash is stored; plaintext exists only in the transient delivery operation and the requested message.
- Codes expire after 15 minutes using an integer database deadline. Five wrong attempts invalidate that challenge without locking ordinary sign-in. Requesting a replacement invalidates the previous code.
- Pending challenges become redeemable only after the fixed email provider accepts the message. Replaced, expired, disabled, changed-identity, changed-password or logged-out verification challenges cannot be reactivated by a late delivery callback.
- Reset redemption claims the challenge, revokes every mobile session/push binding, records a safe audit event and replaces credentials in one database transaction. Concurrent redemption has one winner. Password-version and identity triggers invalidate stale challenges; an email change clears its verification proof.
- A final review reproduced and fixed a success-reporting bug in reset and authenticated password change: D1 counts trigger side effects in `meta.changes`, so a committed credential update must not require that total to equal one. The test adapter models the actual total-change semantics, including both challenge purposes. See [Cloudflare D1 metadata](https://developers.cloudflare.com/api/resources/d1/). The subsequent actual-Worker source-route runner passed the triggered password-change/reset transactions and real background-task continuation; this uses ephemeral D1 with intercepted email, not a real inbox.
- Recovery eligibility and provider work run after acknowledgement through the Worker background-task facility. No eligible-account lookup/provider delay is awaited by the public acknowledgement. Mailer configuration failure has the same 503 for every address.
- The transport only calls `https://api.resend.com/emails`, rejects redirects, limits response size to 8 KiB and has an eight-second deadline. It does not follow user-supplied URLs or persist plaintext for retries. A failed send deletes its exact pending challenge. There is no automatic mail retry queue; the user can explicitly request a new code within rate limits.
- Diagnostics retain safe stage/category information without provider response bodies, email codes or keys. Avoid including email addresses, message bodies or codes in support screenshots/log exports.

The recovery design follows the [OWASP Forgot Password Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Forgot_Password_Cheat_Sheet.html). This does not certify the whole application or replace live acceptance.

## Owner setup, without deployment

No sender/provider account has been created for this increment. Before enabling email, the owner must select and authorize the sender, provider processing/retention settings and acceptance recipients. The current adapter supports Resend; another provider requires an adapter change and equivalent checks.

1. Use a sending domain/subdomain controlled by the group or parish and complete the provider's domain verification. The owner approves any DNS changes; do not replace existing parish mail records without review. Consult [Resend domain documentation](https://resend.com/docs/dashboard/domains/introduction).
2. Create a dedicated **sending-only**, domain-restricted key where supported; store it only in ignored backend configuration. Keep test and eventual production credentials separate. See [Resend API-key management](https://resend.com/docs/dashboard/api-keys/introduction).
3. Keep `MAIL_ENABLED=false` while preparing the environment. Set a bare `MAIL_FROM` address on the verified domain and `RESEND_API_KEY` in `apps/admin/.dev.vars` for local acceptance. These must never be `EXPO_PUBLIC_*` variables or client configuration.
4. Record controlled provider-domain/sender acceptance and approve the test mailbox list. `MAIL_DELIVERY_VERIFIED=true` is an operator attestation used as an activation gate, not an automatic inbox probe. In an isolated, authorized acceptance environment, set both mail flags true for actual app delivery tests. If acceptance fails, return `MAIL_ENABLED=false` immediately. Production remains disabled until evidence is approved.
5. Run the acceptance cases below using only owner-controlled synthetic account mailboxes. Confirm actual inbox receipt, not merely a 2xx provider response. The implemented request uses the documented [Resend Send Email API](https://resend.com/docs/api-reference/emails/send-email).
6. Retain redacted evidence references, measured delivery latency and the exact app/API/schema version. Never record the codes, password, sender key, mailbox credentials or personal messages in the evidence. Document the authorized delivery/support owner and incident/rotation procedure.

Configuration template:

```dotenv
MAIL_ENABLED=false
MAIL_DELIVERY_VERIFIED=false
RESEND_API_KEY=
MAIL_FROM=
```

The local integration checker reports only configuration presence/shape. It cannot prove DNS ownership, actual delivery, provider quota, native operation or research approval.

## Required live acceptance

| Case | Expected evidence | Current result |
|---|---|---|
| Known / unknown / disabled account request | Generic acknowledgement and no account-existence disclosure | Known/unknown source-route and disabled-mail HTTP parity passed; live sender NotRun |
| Controlled inbox receipt | Correct sender and newest code arrives within usable expiry; spam behavior recorded | NotRun |
| Valid reset from each native platform | New password works, old one fails, prior sessions/push bindings stop; manual sign-in | NotRun |
| Wrong, expired, reused and replaced code | Generic rejection and bounded attempts | Actual Worker with intercepted email passed; native NotRun |
| Same-session verification / revoked session | Proof only on correct current account; revoked session rejected | Actual Worker with intercepted email passed; native NotRun |
| Slow, interrupted or unavailable mail/network | Honest error/uncertain state; no silent retry or false success | Unavailable-mail HTTP/browser passed; controlled outage/slow-network observation pending |
| Provider denial/quota/timeout | Safe failure, no leaked provider details, no usable pending code | Worker rejection/redirect and synthetic transport checks passed; live provider/inbox NotRun |
| Email/password change and concurrent redemption | Old challenges invalidated; exactly one reset succeeds | Actual Worker transactions passed; native NotRun |

Append-only migration `0005_account_recovery.sql` is supplied and tested in an isolated database; no production migration has been executed. Follow the existing migration/backup procedure when the owner eventually deploys. Full physical cases are in [NATIVE_ACCEPTANCE.md](NATIVE_ACCEPTANCE.md), and approved stakeholder measurements follow [PILOT_PROTOCOL.md](PILOT_PROTOCOL.md).
