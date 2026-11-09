# Gemini Assistant and Native Push Setup

Local implementation and setup guide, updated **7 November 2026**. **Nothing was built for a device, submitted to an app store, or deployed.** After explicit owner approval, a dedicated Google project named **ParishLink Development** and key named **ParishLink local development** were created. The key is stored only in the ignored backend configuration, and live Gemini replies have been verified through the local application API. Billing settings were not changed.

The configured local model is **gemini-3.5-flash**. A real public-question reply succeeded in approximately 2.6 seconds; the full synthetic signup/booking/queue/logout journey also passed with a live Gemini reply and a private appointment-status reply kept local. This is connectivity/functional evidence, not a broad AI-quality evaluation.

The Expo foundation is now established under owner **`xayahrs-team`**, project slug **`parishlink-mobile`**, and project UUID **`13c930c7-a431-4f44-a247-09024c28fcd2`**. That project is linked in `apps/mobile/app.json` and in the ignored mobile/backend runtime configuration. The owner also enabled Google MFA. These account and configuration changes are not a native build, store submission, provider-delivery test, scheduler registration, or deployment.

**Push is not active yet.** On 7 November the owner approved Firebase Terms and created the free, dedicated Firebase project **ParishLink Notifications** (`parishlink-notifications`) on the Spark no-cost plan. Google Analytics and the optional Firebase AI assistance offered by the setup wizard were disabled. FCM HTTP v1 is visibly enabled, and a dedicated sender service account exists with the single verified project role described below. The public Android client file is linked through the preserved ignored mobile environment. The Google sender key created through the official external public-certificate flow is now assigned to the ParishLink Android application, and a fresh Expo server query verified the project, organization, package, sender identity and key metadata. Push remains disabled pending signed-build and physical-device acceptance; no provider message, scheduler registration, Android signing credential, submission credential, native build, submission or deployment has been completed. Android and iPhone physical devices are available for later acceptance; iOS remote signing/push credentials remain a separate future step requiring a paid Apple Developer membership, which the owner does not currently have. Overall production release remains on HOLD for the other items in the [technical audit](AUDIT_2026-11-04.md).

## What triggers a notification

| Saved system event | Recipient and behavior |
| --- | --- |
| Appointment submitted or its status changed | The appointment owner receives the existing in-app notice and a generic push when a current device is registered. |
| Document verified or returned for replacement | The appointment owner receives a review update; document names/review notes are visible only inside the signed-in app. |
| Queue joined, called or completed | The linked mobile account receives the corresponding existing notice. Accountless front-desk visitors have no device token to receive a push. |
| Parish/vicariate announcement published | Existing audience-scoped notification records enqueue deliveries only for eligible recipients' devices. |
| Approved appointment is approaching | A scheduled dispatch creates one reminder per appointment/start time while it is between 30 minutes and 24 hours away. The scheduler must actually be running. |

These are business events, not a promise that the software independently detects every possible incident. Technical error/security monitoring is a separate operational concern. Push is for the parishioner iOS/Android app; browser previews and the internal admin web do not gain browser push from this feature.

## Gemini activation

1. The sponsor/team-controlled Google account was used to create the dedicated **ParishLink Development** project and **ParishLink local development** API key in [Google AI Studio](https://aistudio.google.com/). Limited provider usage did occur for the model-list and live generation checks recorded below; billing settings were not changed. Review provider terms, permitted data use, quotas and billing again before any wider or production activation.
2. Copy `apps/admin/.dev.vars.example` to the ignored `apps/admin/.dev.vars` for local testing. Set the key there using your editor:

   ```dotenv
   GEMINI_ENABLED=true
   GEMINI_API_KEY=your_real_server_key
   GEMINI_MODEL=gemini-3.5-flash
   ```

   The key is a backend secret. Never place it in `EXPO_PUBLIC_*`, the mobile app, source control, screenshots or chat messages. For a future deployment, use the selected host's runtime secret mechanism.
3. Restart the local API after changing configuration. Sign in to the mobile app in integrated API mode.
4. Open the assistant and explicitly allow general questions to use Google Gemini. Consent is session/account scoped and resets when the account changes or signs out.
5. Ask a public process question, such as “How does document verification work?” or “Why can an appointment need review before approval?” Check the reply's provider label. A local response is not presented as a Gemini answer.

The model receives only a supported public question plus bounded public service descriptions, parish directory fields and the fixed navigation guide. It receives no account profile, private request/queue lookup, files, chat history or transcript. Exact checklists and live/private statuses stay on the authoritative local path. Unknown vocabulary, identifiers, sensitive topics and requests for official decisions stay local. Current public-question coverage is conservative and English-only.

The gateway validates structured output and source IDs, supplies its own actions, bounds response bytes/time and falls back safely on timeouts, quota/provider errors or invalid output. It uses a verified classic structured-response schema, a 1,024-token output budget, and model-aware thinking settings (MINIMAL for supported 3.5 Flash models, LOW for other Gemini 3 models). It cannot approve requests, verify documents, judge sacramental eligibility or write business data. Public-source grounding and automated guards do not prove that every model answer is correct; perform a human-reviewed quality evaluation before the defense claims the AI is validated.

The new Google authorization-key format can begin with `AQ.`. Validation accepts it without changing the fixed endpoint or `x-goog-api-key` header. Formatting checks are application safety bounds, not proof of authentication. Key values must never appear in documentation or commits.

## Android and iOS push activation

1. The team-controlled Expo/EAS project is created and linked: owner **`xayahrs-team`**, slug **`parishlink-mobile`**, UUID **`13c930c7-a431-4f44-a247-09024c28fcd2`**. The existing application identifier is `ph.parishlink.mobile`. The UUID is present in `apps/mobile/app.json` and the ignored runtime configuration; no EAS build or submission has been started.
2. The Android Firebase/FCM foundation is verified:
   - Firebase display name: **ParishLink Notifications**
   - Firebase project ID: `parishlink-notifications`
   - Project number / FCM sender ID: `71224104898`
   - Android Firebase App ID: `1:71224104898:android:4b475a7b63b8abc11de85b`
   - Android package: `ph.parishlink.mobile`
   - Plan: Spark no-cost plan
   - Google Analytics: disabled in the project wizard
   - Optional Firebase AI assistance: disabled in the project wizard
   - FCM HTTP v1 API: visibly confirmed enabled
   - Dedicated sender identity: `parishlink-push-sender@parishlink-notifications.iam.gserviceaccount.com`
   - Verified project IAM role: exactly **Firebase Cloud Messaging API Admin**

   After the in-app-browser download failed, the owner explicitly approved the Firebase CLI's broader Google access solely to retrieve the public Android client file. The official `apps:sdkconfig` command saved `apps/mobile/google-services.json`; the file was checked against the project ID, project number/sender ID, Android App ID and package listed above. The existing ignored `apps/mobile/.env` was preserved and updated with `ANDROID_GOOGLE_SERVICES_FILE=./google-services.json`. Both the client file and environment file remain ignored/untracked. Never substitute a service-account JSON or private key for `google-services.json`.

   The FCM sender credential was subsequently created using a local RSA-2048 private key and self-signed X.509 v3 certificate, with only the public certificate uploaded through Google's official external key flow. Google assigned key ID `348b6f77a70d428a1fb99f094be89e836485fd42`; its validity is 7 November 2026 through 7 November 2027, so it must be rotated before expiry. A Google OAuth JWT exchange for the `firebase.messaging` scope returned HTTP 200. That check stored no access token and sent no push; it does not prove project-level send permission, Expo app assignment, device delivery or production readiness.

   The private credential JSON is stored only at repository-root `.local-secrets/parishlink-fcm-service-account.json`. The repository ignore rules include `.local-secrets/`; never commit, print, paste or move this credential into a client configuration location. The Expo credentials UI for organization `xayahrs-team` saved this Google service-account key and displayed matching project/key/client metadata, including Google client ID `107120799089225394499`. The credential is now assigned to the ParishLink Android app as described next.
3. The owner explicitly approved the Expo settings access and temporary sign-in needed for assignment. The filesystem permission surface still exposed only Expo's `.expo` folder, so the EAS child process used task-owned settings paths under ignored `.validation-tmp/expo-cli-settings`; no Windows profile or Android SDK source setting was changed. The Expo device authorization selected only organization `xayahrs-team` with the **Release Manager** role; the personal account option remained unchecked.

   A metadata-only, ignored credential work directory used the real owner `xayahrs-team`, slug `parishlink-mobile`, project UUID `13c930c7-a431-4f44-a247-09024c28fcd2`, and package `ph.parishlink.mobile`. It did not use a fake API, change application release guards, or start a build. The normal interactive EAS credentials menu stalled before mutation and was interrupted. Root then used the credential client functions from the officially installed EAS tooling with 10-second request limits to:

   1. preflight the real Expo project and existing organization Google key;
   2. create the empty Android app-credential identity required for association;
   3. assign the existing Google key; and
   4. perform a fresh server query verifying all owner/slug/UUID/package and sender key/email metadata.

   The fresh query verified FCM v1 assignment to Expo project UUID `13c930c7-a431-4f44-a247-09024c28fcd2`, organization `xayahrs-team`, and package `ph.parishlink.mobile`, with Google key ID `348b6f77a70d428a1fb99f094be89e836485fd42` and sender `parishlink-push-sender@parishlink-notifications.iam.gserviceaccount.com`. It also reported **zero Android signing credentials** and no submission credential. Assignment therefore does not imply a keystore, signed build, submission, or push delivery.

   After verification, the official Expo auth/logout endpoint returned HTTP 200 and local Expo authentication was removed through the official session manager. The retained non-secret proof states `expoServerLogoutAccepted: true` and `localExpoAuthRemoved: true`. No Expo authentication remains. The earlier Firebase CLI token revocation remains complete and unchanged. Existing privileged-account and credential-access review requirements still apply.

   Firebase CLI access was temporary and retrieval-only. Its standard logout failed locally before revocation because Windows denied cleanup of an ADC path outside the workspace, while the CLI misleadingly printed `Logged out` even though user/token state remained in its temporary store. The refresh token was then revoked directly through Google's official fixed HTTPS revocation endpoint, which returned HTTP 200. Task-owned temporary Firebase CLI authentication state and the one-time code/login URL were removed, and no global Firebase ADC file was found. No Firebase CLI authentication remains and no other Google project data was changed. The later external public-certificate credential flow did not restore Firebase CLI authentication. Both Android and iPhone devices are available for later physical acceptance; iOS remote signing/APNs credential configuration still requires a paid Apple Developer membership. Do not present device availability as credential readiness or delivery evidence.
4. The same public Expo project UUID is already linked in the mobile and ignored backend configuration. The relevant values are:

   ```dotenv
   # Backend: apps/admin/.dev.vars for local testing
   # Current local value: keep disabled until credentials and device acceptance are ready.
   PUSH_NOTIFICATIONS_ENABLED=false
   EXPO_PROJECT_ID=13c930c7-a431-4f44-a247-09024c28fcd2
   EXPO_ACCESS_TOKEN=your_server_token_if_enhanced_push_security_is_enabled
   PUSH_DISPATCH_SECRET=an_independent_random_secret_of_at_least_32_characters
   ```

   ```dotenv
   # Mobile build: apps/mobile/.env or the approved build environment
   EXPO_PUBLIC_EAS_PROJECT_ID=13c930c7-a431-4f44-a247-09024c28fcd2
   ANDROID_GOOGLE_SERVICES_FILE=./google-services.json
   ```

   Project IDs are public configuration; access tokens, service-account files and dispatch secrets are not. Common Firebase Admin SDK/service-account JSON and EAS credential filenames are ignored by Git, but always verify a downloaded credential's actual path before committing. Omit `EXPO_ACCESS_TOKEN` if enhanced push security is not enabled rather than using a placeholder token. Use a different dispatch secret from every other credential. This documentation update did not inspect any secret or credential value.

   The public client file was retrieved without printing its contents using the official command:

   ```text
   firebase apps:sdkconfig ANDROID 1:71224104898:android:4b475a7b63b8abc11de85b --project parishlink-notifications --out ./google-services.json --non-interactive
   ```

   This was run from `apps/mobile` under the owner's explicit one-purpose approval. Firebase CLI requests broader Firebase and Google Cloud scopes, not a permission limited to this file, so future use requires fresh explicit approval and must not rely on the revoked session. The generated client file is public native configuration, distinct from the still-uncreated private FCM sender key. Do not generate a signing key merely to get past the website wizard.
5. Prepare/install an internal native build with the updated plugins and configuration. The existing preview build profile requires a device-reachable public HTTPS API URL as well as platform credentials. The current loopback server is reachable only on the development computer; it does not make the API available to a physical phone. If deployment is deferred, arrange an approved device-reachable HTTPS development setup before live device testing. Native cleartext restrictions are preserved. A web bundle and Expo Go are insufficient for remote-push verification; an ordinary Metro restart does not add native notification support.
6. On a physical device, sign in, enable the account's notification preference, then choose **Enable on this device** in Profile. This is the explicit OS-permission action. Startup never silently requests permission.
7. If the OS denies permission, use the displayed settings/retry controls. If project/provider configuration is missing, the UI reports setup failure/unavailability and preserves in-app updates.

On sign-in/resume, already-consented devices refresh registration. Tokens are tied to the installation, user and server session. The server excludes revoked/expired sessions, disabled preferences and stale account bindings. Best-effort logout unregisters the device; successful server revocation is authoritative. Offline logout cannot guarantee that an already-sent provider notification is recalled. Lock-screen text remains generic even in that case.

## Dispatch while the app is closed

Notification insertion and delivery enqueue occur in the same database transaction. User/admin mutations request background dispatch after the business event succeeds. Delivery failures do not undo the business event.

Retries, receipt checks and time-based reminders require an independent scheduler. A browser refresh loop cannot perform that job while the app is closed.

- API endpoint: `POST /api/internal/notifications/dispatch`.
- Authorization: `Bearer <PUSH_DISPATCH_SECRET>`; mobile user tokens and admin browser identity do not grant access.
- Adapter: `apps/admin/jobs/push-scheduler.ts`.
- Configuration example: `apps/admin/jobs/wrangler.push-scheduler.example.jsonc`, a one-minute Cron Trigger.
- Set the approved HTTPS `PUSH_DISPATCH_URL` and the same independent secret in the scheduler runtime.
- For a private Sites-hosted API, the external scheduler must also satisfy the platform's service-access boundary using an authorized `SITES_SERVICE_ACCESS_TOKEN` where required. Do not make the site public or weaken sign-in to bypass that boundary.

The adapter/example is separate from the app build and has not been registered, scheduled or deployed. The owner must configure the approved scheduler when choosing to deploy. For local verification, invoke the same endpoint through a local test harness with synthetic/mocked provider responses.

The dispatcher claims bounded work with leases, checks current authorization/preference before sends, retries transient failures with backoff, handles Expo tickets/receipts, disables unregistered tokens and expires stale delivery work. It retains completed delivery rows for bounded seven-day cleanup. Existing in-app notification retention is a separate privacy policy.

Delivery is at least once: a provider accepting a request before a connection fails can cause a duplicate retry. An Expo receipt means handoff to FCM/APNs, not proof that the OS displayed it or the user read it. Tap handling accepts only a matching notice fetched from the authenticated API, rather than navigating from arbitrary push URLs or trusting message contents.

## Database and checks

Migration `0004_push_notifications.sql` adds device registrations, delivery records and the notification-enqueue trigger. Registration does not replay historical notifications. The session foreign keys cascade so normal session pruning cannot block login.

Existing migration history lacked Drizzle snapshots. The current model was generated in isolation and retained as `0004_snapshot.json`; the append-only SQL contains only the new push schema and trigger. The generator must report no unintended schema changes. No production migration was applied.

From the repository root:

```text
node scripts/check-integrations.mjs
```

The check reports configuration presence and mismatches without printing secrets or contacting a provider. Its Android configuration validation checks the expected package, Firebase project, sender/project number and Android App ID, rejects a private service-account credential where the public native configuration is required, and rejects reuse of the backend Gemini key as a client key without printing either value. The current root check reports the Gemini configuration and Android Firebase client configuration as present; `PUSH_NOTIFICATIONS_ENABLED` remains false, so disabled push keeps the overall result incomplete and exit code 1 remains expected. The separate fresh Expo server query verifies credential assignment, but neither check proves APNs/FCM delivery or physical-device acceptance.

For a read-only live credential/model metadata check:

```text
node scripts/check-gemini-live.mjs
```

This lists public model identifiers using the server key and prints no credential. A successful model-list response does not prove text generation works; that distinction was observed during setup. For an explicitly requested local live journey, set `PARISHLINK_SMOKE_GEMINI=true` when running `apps/admin/scripts/smoke-local.mjs`. That opt-in sends one public question; the default smoke run does not call Gemini. It also verifies private status remains local and revokes the synthetic session.

### Provider and verification status on 7 November

- Expo/EAS owner, project slug and UUID are established and linked as recorded above.
- Google MFA is enabled by the owner.
- Firebase project **ParishLink Notifications** (`parishlink-notifications`) exists on the Spark no-cost plan with project number/sender ID `71224104898`. Its Android app is registered as `ph.parishlink.mobile` with App ID `1:71224104898:android:4b475a7b63b8abc11de85b`. Analytics and optional Firebase AI assistance were disabled in the setup wizard, and FCM HTTP v1 is visibly enabled.
- Dedicated service account `parishlink-push-sender@parishlink-notifications.iam.gserviceaccount.com` exists with exactly the **Firebase Cloud Messaging API Admin** role verified in project IAM. Its externally created Google key is assigned to the ParishLink Android app.
- Google sender key ID `348b6f77a70d428a1fb99f094be89e836485fd42` was created through the external public-certificate flow using RSA-2048/X.509 v3, with validity from 7 November 2026 to 7 November 2027. Rotate it before expiry. The private JSON is confined to ignored `.local-secrets/parishlink-fcm-service-account.json`.
- A JWT exchange for the `firebase.messaging` scope returned HTTP 200 without storing an access token or sending a push. This verifies the credential exchange only—not project send authorization or delivery.
- Expo organization `xayahrs-team` saved the Google service-account credential and displayed matching project/key/client metadata (client ID `107120799089225394499`). A fresh server query verified its FCM v1 assignment to project UUID `13c930c7-a431-4f44-a247-09024c28fcd2` and package `ph.parishlink.mobile`, including the expected key ID and sender email.
- After the in-app-browser download failed, explicit owner approval was obtained for one-purpose Firebase CLI access. The official `apps:sdkconfig` command saved `apps/mobile/google-services.json`, and its project/sender/App/package identifiers were verified. The ignored existing `apps/mobile/.env` was preserved and linked with `ANDROID_GOOGLE_SERVICES_FILE=./google-services.json`; both files remain ignored/untracked.
- The owner approved temporary Expo sign-in. Safe task-owned EAS settings under ignored `.validation-tmp/expo-cli-settings` avoided Windows-profile/SDK changes; the organization-only device authorization selected `xayahrs-team` Release Manager and left the personal account unchecked. The standard menu stalled before mutation, then official EAS credential client functions assigned and freshly verified the existing key. Official server logout returned 200, the official session manager removed local auth, and no Expo authentication remains.
- Firebase CLI's local logout path failed before revocation because Windows denied ADC cleanup outside the workspace and printed a misleading logged-out message. Direct refresh-token revocation through Google's official HTTPS endpoint returned 200; task-owned temporary auth/login artifacts were removed, no global Firebase ADC file was found, and no Firebase CLI authentication remains. No other Google project data was changed. The owner later approved task-owned EAS settings and temporary sign-in; after assignment verification, Expo server logout returned 200 and the official session manager removed local authentication, so no EAS/Expo authentication remains either.
- The root integration checker validates the public Android configuration identifiers without printing secrets, rejects private service-account material in that file position, and rejects a client key equal to the backend Gemini key. It reports Gemini and Android Firebase client configuration present; disabled push keeps readiness incomplete and the overall exit at 1.
- **217 admin tests in 15 files** and **127 mobile tests in 13 files** pass on 7 November, with TypeScript passing in both applications. Together with the unchanged **93 backend security regressions** and **nine workerd provider compatibility assertions** last run on 6 November, the combined automated evidence is **446 checks**, not a single same-day full release run. These checks do not prove device delivery; the Expo assignment is separate fresh-server metadata evidence.
- Latest unsigned export metadata and the web index are present from 7 November after Expo linkage. This is export/linkage evidence only—not a signed native build or installed-device test.
- Android and iPhone devices are available for later acceptance. iOS remote credential setup still requires a paid Apple Developer membership.
- `PUSH_NOTIFICATIONS_ENABLED` remains false. The fresh Expo query reports zero Android signing credentials and no submission credential. No signing key, native/device build, app-store submission, scheduler registration, provider/device push, production migration or deployment has been performed. A reachable trusted-HTTPS device API, signed build, physical Android acceptance, and independent scheduler remain future work; APNs is not configured because the paid Apple Developer membership is absent.

### Current verification on 6 November

- **200 admin tests**, including 82 Gemini checks, 39 push checks and seven integration-readiness checks.
- **93 backend security regressions**, plus **nine actual workerd provider compatibility assertions** with outbound networking blocked and synthetic responses.
- **127 mobile tests** remain the latest unchanged-client evidence; unsigned Android/iOS/web exports passed on 5 November. Combined automated checks: **429**.
- Full admin check passes TypeScript, lint, tests, isolated migration validation and build. The actual Worker compatibility check is now included in the release runner.
- Live Google model-list authentication returns 200. A real app API question returns `provider:gemini`, a public-source reference and a human-authority disclaimer. The optional live smoke journey passes both public-Gemini and private-local assertions.
- A full-key match scan of generated client artifacts found no credential; the backend configuration is ignored by Git.
- No Expo push was transmitted, no scheduler was registered, and no production migration or deployment was performed. As of the 6 November verification no FCM/APNs credential had been created; the later verified 7 November Firebase project/IAM state and its remaining setup steps are recorded separately above.

Two integration defects were caught and fixed before launch: the initial validator rejected Google's new dotted authorization key format, and Workers rejected the initial `redirect:error` option. Both providers now use `redirect:manual` with explicit rejection/cancellation of redirects. The runtime probe reproduces the former failure and verifies the corrected helpers inside actual workerd. Browser-only request credentials are omitted on server requests.

Provider diagnostics expose only controlled failure stages/statuses and correlation IDs. Raw questions, keys, headers, provider error bodies and private records are excluded. During setup, an initially selected model returned 503 and an older listed model returned 404; the working 3.5 configuration was chosen from live verification. Do not infer generation support or stable latency solely from the advertised model list.

### Historical verification on 5 November

Verified locally on 2026-11-05:

- **152 admin tests** in 15 files, including 51 Gemini tests, 23 push tests and six integration-readiness checks.
- **93 backend security regressions** with migrated isolated SQLite and mocked scanner/storage.
- **127 mobile tests** in 13 files; TypeScript passes in both applications. Combined automated count: **372**.
- Admin full check passes lint, tests, security regressions, five-migration/26-table/46-index validation and production compilation.
- Unsigned web, Android and iOS exports pass. These are bundle checks, not signed/installed-device acceptance.
- The real local HTTP signup/availability/booking/replay/conflict/queue/logout journey passes after integration.
- Fresh exported-web browser checks pass synthetic sign-in, assistant consent, public-question fallback/provider labeling, push-unavailable explanation in Profile, and logout. Profile/push content was inspected at 390 × 844 with no page-level horizontal overflow. This is web layout evidence only.
- Dependency scans remain **one moderate admin advisory** and **four mobile advisories** (one high, two moderate, one low), the same unresolved package advisories recorded in the technical audit. The new dependencies do not clear those release blockers.

The Expo development launcher was blocked by the session's automatic approval policy. A loopback-only preview of the already-exported web files was used for browser verification instead (`node scripts/preview-mobile-export.mjs`). Task-owned preview processes are stopped after checks.

The 5 November provider tests used synthetic/mock responses; live Gemini verification was subsequently completed on 6 November as recorded above. Push still reports setup needed. No production migration, scheduled job registration or deployment occurred.

## Required live acceptance evidence

- Gemini: opt-in, useful public answer, source accuracy, private/identifier refusal, authority refusal, missing key, rate/quota failure, timeout and unavailable-provider behavior.
- Push: Android/iOS permission granted and denied, foreground/background/terminated delivery, tap routing, token refresh/reinstall, account switch, server-revoked session, disabled preference, transient retry and DeviceNotRegistered receipt.
- Events: appointment change, document replacement request, queue call and announcement reach only the intended account/parish; a reminder is generated once for an approved appointment.
- Operability: independent scheduler keeps processing with both apps closed; backlog/retry failures are observable; device/provider records follow the approved retention and access policy.

Official references: [Gemini generateContent](https://ai.google.dev/api/generate-content), [Expo push setup](https://docs.expo.dev/push-notifications/push-notifications-setup/), [Expo sending/receipts](https://docs.expo.dev/push-notifications/sending-notifications/), [Expo SDK 57 notifications](https://docs.expo.dev/versions/v57.0.0/sdk/notifications/), [EAS CLI](https://docs.expo.dev/eas/cli/), [Firebase CLI](https://firebase.google.com/docs/cli), [Google OAuth token revocation](https://developers.google.com/identity/protocols/oauth2/web-server#tokenrevoke).
