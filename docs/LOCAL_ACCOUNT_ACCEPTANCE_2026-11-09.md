# Local account acceptance — step 1

**Evidence window:** Started 2026-11-08; completed 2026-11-09, Asia/Singapore. Original log and screenshot filenames retain their recorded 8 November date.  
**Scope:** Local connection diagnosis and account-flow verification.  
**Decision:** The previously blocked local connection and account checks now run in this session. Hold release, live email acceptance, native acceptance and stakeholder pilot. No deployment, signed build, source upload, provider send or production migration was performed.

## 1. Connection finding

The earlier `EACCES` connection failure was not reproduced after the current, turn-scoped network permission grant. A task-owned loopback diagnostic passed listen, TCP connection and HTTP checks on both `127.0.0.1` and `::1` — six observations in total. The actual provider Worker runner, account Worker runner, development HTTP server and browser preview subsequently connected.

This demonstrates that local connections work under the current permissions. It does not establish a definitive Windows/root cause or a permanent fix across future sessions, restarts, sleep/resume or another computer. No firewall, proxy, hosts file, authentication control, CORS allowlist, certificate rule or dependency version was weakened or changed to obtain these results. If the permission block recurs, retain the safe error category and restore the necessary local test permission; do not disable security protections or expose the server publicly as a workaround.

## 2. Isolation and unchanged product controls

The actual admin/API ran with Node 24 and Vinext, bound only to `127.0.0.1:3000`. For this test process, `MAIL_ENABLED`, `MAIL_DELIVERY_VERIFIED`, `PUSH_NOTIFICATIONS_ENABLED` and `GEMINI_ENABLED` were false. These were process-only overrides; the existing ignored environment files and provider credentials were preserved. No real email, remote push or Gemini request was needed by the acceptance journeys.

The real HTTP runner requires both an explicit `--mail-disabled-test` operator flag and positive `/ready` evidence of development mode, configured local database/private storage, and disabled mail/push before creating any account. It rejects non-loopback targets, production mode, unsafe origins and redirects. It creates a unique fictional `example.test` account, keeps credentials only in memory, and revokes every obtained session in cleanup. Its synthetic account and audit record remain in the local development database; no records are silently deleted.

The Worker source-route runner executes the actual auth routes, HTTP/CORS/body/error/rate-limit helpers, recovery/mailer and disabled-push source in workerd. It applies all six append-only migrations to ephemeral D1 and intercepts every outbound request. Its only substitutions are the test router and the database accessor/bootstrap for the already-migrated test D1. Codes, passwords and tokens remain transient and are not printed or persisted. It is not full Vinext/framework, inbox, physical-device or production-infrastructure acceptance.

## 3. Observed checks

| Check | Outcome and boundary |
|---|---|
| Loopback diagnostic | Six IPv4/IPv6 listen/TCP/HTTP observations passed in the current session |
| Provider Worker compatibility | **9/9 passed** with intercepted synthetic responses and no provider traffic |
| Account Worker source routes | **39/39 passed** on real workerd D1; actual source with the explicit test router/DB bootstrap boundary above |
| Actual local backend HTTP | **36/36 passed** through running Vinext and the development database; all obtained sessions revoked or already invalid |
| HTTP runner safeguards | **6/6 passed**; target/production/preflight/response parsing boundaries tested separately |
| Browser recovery entry | Sign-in → Forgot password opens the recovery form; empty request button is disabled |
| Browser invalid input | Invalid email produces the client validation error |
| Browser unavailable mail | A fictional valid address reaches the real disabled-mail response; the UI displays unavailability and does not falsely advance to a delivered-code state |
| Controlled API outage | Stopping only the task-owned API produced the honest request-failed/no-confirmed-delivery state in the browser, without false code-phase success or automatic retry; this was backend unavailability, not physical internet loss |
| API restart / restored browser flow | Pending final observation in this step |
| Read-only local runtime probe | Pending final observation in this step |

The 36 HTTP checks include sign-up, duplicate/invalid input, valid and invalid sign-in, authoritative session restore, authenticated password change, trigger-inclusive success reporting, preservation of the initiating session, revocation of other sessions, old-password denial, new-password success, logout/revocation, CORS, malformed/unsupported/oversized requests, identical unavailable-mail responses for known/unknown addresses, required verification authentication and rejection of undelivered codes.

The 39 Worker checks additionally exercise successful code-based verification/reset with intercepted email, same-session verification, real `workers.waitUntil` after acknowledgement, pending-to-ready challenge activation, all-session and push-binding reset revocation, newest/expired/reused/wrong-attempt codes, concurrent redemption, controlled provider rejection and redirect refusal. These successful code deliveries are test transport events, not evidence that a real mailbox received a message.

A deliberately hostile browser origin is rejected before the application handler by the development framework with a bounded plain-text HTTP 403 and no allowed-origin header. The HTTP checker recognizes that exact intentional denial only. Normal API responses still require JSON; no production origin policy was broadened to make the test pass.

The first browser navigation timed out while Metro performed a roughly 24-second cold bundle; the preview subsequently rendered. This was not recorded as successful initial loading or proof of a permanent connection repair. The browser reported an existing deprecated shadow-style warning; it is separate from the account-flow results. Expo's optional DevTools download/cache setup encountered access denial and used its bundled fallback; that is a tool limitation, not an application-flow failure.

## 4. Repeat the checks without deployment

Use the supported Node version (22.13 or later; the observed run used Node 24). Existing dependencies must already be installed. From `apps/admin`, the isolated checks are:

```text
pnpm test:accounts:worker
pnpm test:accounts:runner
node scripts/check-provider-worker.mjs
```

The release runner now includes the account Worker check and HTTP-runner safeguards. It does not start a server or run the stateful HTTP journey automatically. No full release rerun is implied by adding those steps.

For the actual HTTP journey, first start a dedicated local test process with providers disabled. Preserve the environment files:

```powershell
cd apps/admin
$env:MAIL_ENABLED='false'
$env:MAIL_DELIVERY_VERIFIED='false'
$env:PUSH_NOTIFICATIONS_ENABLED='false'
$env:GEMINI_ENABLED='false'
node node_modules/vinext/dist/cli.js dev --hostname 127.0.0.1 --port 3000
```

In another terminal, from `apps/admin`:

```text
pnpm test:accounts:local --mail-disabled-test
```

Inspect its safe JSON result, every failed check and `sessionCleanup`. A failed request must not be relabeled passed. Do not repeat state-changing probes without checking their outcome; ordinary rate limits remain active, and each completed run retains a fictional account/audit record. Use a dedicated test terminal and close it when acceptance is finished so process overrides do not become an accidental operator default.

The read-only stability probe remains `pnpm probe:local` against the running server. It is a bounded development probe, not a load test or a guarantee of production availability. Stop only task-owned processes when testing an outage or restart; retain the database and environment files.

## 5. Evidence and remaining work

Safe local evidence is retained under ignored `.validation-tmp/`:

- `step1-provider-worker-2026-11-08.log`
- `step1-account-worker-2026-11-08.log`
- `step1-account-http-2026-11-08.log`
- `step1-recovery-unavailable-2026-11-08.png`

Earlier **257 admin tests, 164 mobile tests and 97 security regressions** remain the separately dated preceding increment. The new counts above are additional, specifically scoped checks; they are not a new combined full-release run or stakeholder results.

Actual inbox delivery still needs an authorized sender/provider and controlled domain. Signed Android/iOS builds, device-accessible trusted HTTPS API, native permission/push/offline acceptance and operational release gates remain unfinished. Beneficiary/pilot approval is pending, and no participant measurements or feedback have been collected. Continue with [account email acceptance](ACCOUNT_RECOVERY.md), [native acceptance](NATIVE_ACCEPTANCE.md) and the [approved pilot protocol](PILOT_PROTOCOL.md). The earlier [critical-gap record](CRITICAL_GAPS_ACCEPTANCE_2026-11-08.md) is preserved as the state before these local checks were unblocked.
