# ParishLink Native Acceptance Protocol

**Evidence status:** NotRun  
**Release effect:** Blocking for native pilot/release. Unsigned exports, web previews, unit tests, provider metadata, and credential assignment do not substitute for installed-device evidence.

**Owner update, 2026-11-08:** Both phones are available without an installed test build. No email provider/sender domain exists, and beneficiary approval is pending. No signing, build, membership purchase, API exposure or deployment was performed in this increment.

## 1. Current prerequisite state

| Prerequisite | Current state | Required before execution |
|---|---|---|
| Android FCM v1 sender | Assigned and server-query verified for the ParishLink Expo project/package | Keep key protected; confirm rotation ownership |
| Android signing credential | None | Approved keystore/signing custody and signed internal build |
| iOS APNs/signing | Not configured; paid Apple Developer membership absent | Membership, identifiers, APNs/signing credentials, signed internal build |
| Push feature flag | Disabled | Enable only in the controlled acceptance environment |
| Device-reachable API | Trusted HTTPS endpoint not configured | Approved HTTPS development/staging origin reachable from devices |
| Independent scheduler | Not configured/deployed | Approved scheduler, secret, monitoring, and retry processing |
| Physical devices | Owner confirms Android and iPhone available, with no test build installed | Coordinator confirms device codes, OS versions, dates, ownership, permissions, and cleanup plan |
| Account mail | No provider or sender domain, confirmed by owner | Authorized sender/domain/key and controlled inbox acceptance under ACCOUNT_RECOVERY.md |
| Local Android build tools | No Android SDK, adb or emulator found on this Windows host | Approved local toolchain installation or reviewed Expo internal-build route |
| Test accounts/data | Not authorized in this protocol | Synthetic accounts/cases and reset/revoke procedure |
| Build/submission/deployment | None | Internal signed build only; no store submission required for this protocol |

Do not start native acceptance until applicable prerequisites are approved. Do not weaken cleartext/network, authentication, or notification protections to make a test pass.

## 2. Evidence rules

Each execution row records platform, physical device code, OS, exact build/version/source revision, API environment, network profile, account role, UTC time, executor code, outcome, defect ID, and evidence reference. Evidence may be a redacted device video/screenshot, server correlation ID, notification/delivery record, or test log according to approved privacy rules. Never record tokens, credentials, private notification bodies, or real sacramental data.

Allowed status values are `NotRun`, `Pass`, `Fail`, `Blocked`, and `NotApplicable`. Default is `NotRun`. A blocked prerequisite is not a pass. Re-tests create a new row or linked attempt; do not overwrite failed evidence.

## 3. Required physical-device matrix

Run applicable cases on at least one approved real Android device and one approved real iPhone. Repeat on additional OS/device baselines selected by the product owner.

### 3.1 Install, identity, recovery, and secure exit

| Test ID | Scenario | Expected result | Android | iOS |
|---|---|---|---|---|
| NAT-ID-01 | Clean install and first launch | Correct build/environment; no secret/debug data; no silent notification prompt | NotRun | NotRun |
| NAT-ID-02 | Valid sign-in and app restart | Session persists only through protected platform storage | NotRun | NotRun |
| NAT-ID-03 | Recovery request for existing and unknown synthetic account | Same safe response; no account enumeration | NotRun | NotRun |
| NAT-ID-04 | Valid recovery link/code | One-time reset succeeds under approved policy; prior sessions revoked | NotRun | NotRun |
| NAT-ID-05 | Expired, invalid, and reused recovery link/code | Safely rejected without revealing private state | NotRun | NotRun |
| NAT-ID-06 | Secure logout online | Server session/device registration revoked; protected local state removed | NotRun | NotRun |
| NAT-ID-07 | Logout while offline, then reconnect | Local state clears; server reconciliation follows documented limitation; stale push cannot open private data | NotRun | NotRun |
| NAT-ID-08 | Account switch on one installation | Old account data/token/routes are unavailable to the new account | NotRun | NotRun |

Recovery testing requires a synthetic delivery channel and approved recovery configuration. It must not use a real parishioner address or phone number.

### 3.2 Permission and notification delivery states

| Test ID | Scenario | Expected result | Android | iOS |
|---|---|---|---|---|
| NAT-PUSH-01 | Permission accepted through explicit in-app action | Token registered to current session/installation; preference visible | NotRun | NotRun |
| NAT-PUSH-02 | Permission denied | Clear guidance/settings path; in-app notices still work; no prompt loop | NotRun | NotRun |
| NAT-PUSH-03 | Foreground event | Generic push/in-app state behaves as designed without duplicate business action | NotRun | NotRun |
| NAT-PUSH-04 | Background event | Delivery and safe generic lock-screen text verified | NotRun | NotRun |
| NAT-PUSH-05 | Terminated-app event | Delivery occurs; tap requires authenticated authoritative fetch | NotRun | NotRun |
| NAT-PUSH-06 | Appointment status event | Only intended synthetic account receives it | NotRun | NotRun |
| NAT-PUSH-07 | Document replacement event | Generic preview; private note visible only after authenticated fetch | NotRun | NotRun |
| NAT-PUSH-08 | Queue call event | Correct synthetic ticket/account; no accountless-user token assumption | NotRun | NotRun |
| NAT-PUSH-09 | Parish announcement | Correct parish/audience only | NotRun | NotRun |
| NAT-PUSH-10 | Scheduled reminder | Generated once in approved window by independent scheduler | NotRun | NotRun |
| NAT-PUSH-11 | Preference disabled | No new remote push; in-app authoritative state retained | NotRun | NotRun |
| NAT-PUSH-12 | Server-revoked session | Stale token excluded; tap cannot expose private content | NotRun | NotRun |
| NAT-PUSH-13 | Reinstall/token refresh | New token binding works; obsolete token disabled after receipt/registration logic | NotRun | NotRun |
| NAT-PUSH-14 | Provider transient failure | Durable retry/backoff without duplicate business event | NotRun | NotRun |
| NAT-PUSH-15 | DeviceNotRegistered receipt | Token disabled; no retry loop | NotRun | NotRun |

### 3.3 Accessibility, network, and resilience

| Test ID | Scenario | Expected result | Android | iOS |
|---|---|---|---|---|
| NAT-UX-01 | Large text/dynamic type | Core flows remain readable and actionable without clipping | NotRun | NotRun |
| NAT-UX-02 | Screen reader | Controls, errors, statuses, and navigation have meaningful order/names | NotRun | NotRun |
| NAT-UX-03 | Reduced motion and orientation/safe areas | No essential information depends on motion; layout remains usable | NotRun | NotRun |
| NAT-NET-01 | Slow/intermittent network | Loading/retry state is understandable; no duplicate write on retry | NotRun | NotRun |
| NAT-NET-02 | Network loss during booking/upload | Outcome is recoverable/idempotent; prior result checked before resubmit | NotRun | NotRun |
| NAT-NET-03 | API unavailable | Safe error/fallback; no false success or local corruption | NotRun | NotRun |
| NAT-NET-04 | Gemini unavailable | Deterministic guidance/handoff; core functions continue | NotRun | NotRun |
| NAT-SEC-01 | Untrusted/deep push payload | Arbitrary route/content ignored; server-fetched authorized target required | NotRun | NotRun |
| NAT-SEC-02 | Screenshot/task switch/notifications review | No unnecessary secret/private content exposed | NotRun | NotRun |

## 4. Execution order

1. Approve environment, synthetic dataset, accounts, signed build, devices, evidence storage, and rollback.
2. Verify build identity and trusted HTTPS API; confirm production is not targeted.
3. Execute identity/recovery/logout tests before enabling push.
4. Enable push only in the acceptance environment and run permission/device-token cases.
5. Start the independent scheduler and run event/reminder/retry/receipt cases.
6. Run accessibility, bad-network, and adversarial routing cases.
7. Revoke test sessions/tokens, uninstall/clean devices as approved, disable test flags/scheduler, and reconcile synthetic records.
8. Review failures, attach defects, and repeat only with a new evidence attempt.

## 5. Acceptance decision

Native acceptance requires every applicable critical case to pass on both selected physical platforms, no open critical/high defect, credential/access review, and authorized product/security/privacy sign-off. Android may be assessed before iOS, but Android success is not iOS acceptance. Missing Apple membership/APNs remains `Blocked`, not `Pass` or `NotApplicable`, while iOS is in release scope.

**Current decision:** NotRun / Blocked by missing signed builds, trusted HTTPS device API, scheduler, Android signing credential, and iOS membership/APNs.

## 6. Next build plan, pending prerequisites

The existing `apps/mobile/eas.json` **preview** profile creates an internally distributed Android APK with demo mode disabled. It requires a real trusted public HTTPS API; the production profile is outside this acceptance work. Do not use a placeholder API or weaken the native cleartext guard. This Windows host has no Android SDK; no local Android build or USB install was executed.

Before a cloud internal build, review the API origin, exact source/archive contents, required ignored files, dependencies, signing-key custodian and Expo account. Obtain action-time approval for creating/using signing credentials and uploading reviewed source to Expo's build service; earlier setup explicitly excluded signing/builds. No store submission is required. Exposing a local API through a tunnel needs a separately reviewed exposure plan: authentication, synthetic data, allowed origins, duration and cleanup. No tunnel is assumed.

iOS remains blocked until the applicable Apple membership/signing/APNs and approved distribution route exist. Do not purchase membership or treat Android success, Expo Go, a web preview or unsigned JavaScript as iPhone acceptance. If membership remains unavailable, disclose the limitation and obtain the adviser's scope decision; do not mark iOS passed.

Once approved builds/API exist, install on the available phones, record device/build/OS identifiers, execute this matrix, retain redacted evidence and review defects/sign-off. Then open the stakeholder pilot's technical gate.
