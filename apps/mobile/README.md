# ParishLink mobile

The parishioner app for ParishLink, built with Expo SDK 58 (React Native 0.88, React 19, TypeScript 6.0). Staff, clergy and administrator work happens in the separate admin web portal (`apps/admin`), never in this app.

## Screens

`src/screens/` holds 13 screens: Welcome (sign in / create account), Home, Services, Booking, Appointments, Appointment detail, Assistant, Queue, Announcements, Parishes (directory), Notifications, More, and Profile. The bottom navigation shows Home, Services, Appointments, Assistant and More.

The interface is designed for older parishioners: large text, large touch targets, plain-language labels and messages, status shown in words (not only colour), and screen-reader labels.

## Run locally

Requirements: Node.js 22.13 or newer and pnpm. Start the admin/API server first (see the root [`README.md`](../../README.md)), then:

```powershell
pnpm install
if (-not (Test-Path -LiteralPath .env)) { Copy-Item -LiteralPath .env.example -Destination .env }
pnpm start
```

Open the app in Expo Go (same Wi-Fi as the laptop) or press `w` for the web preview at `http://localhost:8081`.

`EXPO_PUBLIC_API_BASE_URL` in `.env` must point to the admin server's `/api`:

| Where the app runs | API base URL |
|---|---|
| Web preview on the laptop | `http://localhost:3000/api` |
| Phone with Expo Go | `http://<laptop Wi-Fi address>:3000/api` (the root `scripts/start-demo.ps1` writes this for you) |
| Android emulator | `http://10.0.2.2:3000/api` |
| Preview / production build | An approved `https://` address (plain `http://` is rejected outside development) |

`.env` is ignored by git. Setting `EXPO_PUBLIC_DEMO_MODE=true` instead runs a self-contained demonstration that stores fictional data on the device only; it does not reach any parish.

## How it talks to the server

Screens never call the network directly. They use `src/repositories/parishLinkRepository.ts`, which uses `src/api/mobileApiClient.ts` for authentication headers, timeouts, cancellation and safe error messages. Session tokens are kept in Expo SecureStore on phones (AsyncStorage only in the web preview).

| Method | Endpoint (under `/api`) | Purpose |
|---|---|---|
| `GET` | `/mobile/catalog` | Parishes, services, priests, venues, requirements, queue services |
| `POST` | `/mobile/auth/sign-up`, `/mobile/auth/sign-in`, `/mobile/auth/sign-out` | Account and session |
| `GET` | `/mobile/auth/session` | Restore the saved session |
| `POST` | `/mobile/auth/change-password` | Change password (other sessions are signed out) |
| `POST` | `/mobile/auth/password-reset/request`, `/mobile/auth/password-reset/confirm` | Reset a forgotten password with an emailed code |
| `POST` | `/mobile/auth/email-verification/request`, `/mobile/auth/email-verification/confirm` | Verify the account email with a code |
| `GET` | `/mobile/snapshot` | Profile, appointments, notifications, announcements, active queue ticket |
| `POST` | `/mobile/availability` | Available times for a priest, venue and date |
| `POST` | `/mobile/appointments` | Submit an appointment request |
| `POST` | `/mobile/appointments/{id}/documents/{documentId}` | Upload one document |
| `POST` | `/mobile/appointments/{id}/cancel` | Cancel, or ask the parish to cancel once approved |
| `POST` | `/mobile/appointments/{id}/reschedule` | Ask to move the appointment |
| `POST` | `/mobile/appointments/{id}/change-request/withdraw` | Withdraw a pending cancel/reschedule request |
| `POST` / `DELETE` | `/mobile/queue/tickets`, `/mobile/queue/tickets/active` | Join or leave the walk-in queue |
| `POST` | `/mobile/notifications/{id}/read` | Mark a notification read |
| `POST` | `/mobile/assistant` | Ask the parish assistant |
| `PUT` | `/mobile/profile` | Update name, mobile number, home parish, notification preference |
| `POST` / `DELETE` | `/mobile/push/devices` | Register or remove this phone for push notifications |

The server is the final authority for scheduling conflicts, file checks, ownership and permissions; the app's own checks only give faster feedback.

Email codes need an email sender configured on the server, and push notifications are disabled on the server. Neither has been tested on a physical phone.

## Parish assistant

Answers about requirements, the parish directory, and the user's own requests, documents and queue ticket come from ParishLink's data. The assistant cannot approve, verify or change anything. If the server has Google Gemini configured and the user turns on the permission switch, general public questions may be answered by Gemini; questions about the user's own requests, documents, queue ticket or account always stay on the ParishLink server and are not sent to Gemini. Never put any provider key in an `EXPO_PUBLIC_*` variable.

## Verification

```powershell
pnpm typecheck
pnpm test
node ./scripts/release-check.mjs   # config check, TypeScript, tests, Web/iOS/Android export
```

On 16 November 2026: TypeScript clean, 195 tests passed in 18 files, and Web, iOS and Android bundles exported. These are unsigned local exports, not physical-device testing or a store build.

## Key files

- `App.tsx`: app shell, navigation state and Android back button
- `src/screens/`: the 13 screens
- `src/components/`: shared UI (`ui.tsx`), header and bottom navigation, document attachment controls
- `src/hooks/useParishLink.ts`: app state, loading and error handling
- `src/repositories/parishLinkRepository.ts`: API and demonstration repositories
- `src/api/`: HTTP client, secure token store, retry-safe submission keys
- `src/config/environment.ts`: environment and development Wi-Fi address handling
- `src/lib/`: scheduling, status labels, document picking, contact links, assistant helpers
- `src/data/catalog.ts`: offline fallback catalogue (eight parishes, five services)
- `tests/`: unit tests
