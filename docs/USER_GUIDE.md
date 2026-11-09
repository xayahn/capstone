# ParishLink Mobile User Guide

## 1. Who this guide is for

The ParishLink mobile application is for parishioners coordinating services with the eight participating parishes. Internal parish staff, clergy, and system administrators use the separate web portal.

ParishLink helps with requests and pre-validation. It does not determine sacramental eligibility, replace consultation with clergy, replace official Church archives, or guarantee that an available/requested time is finally approved.

## 2. Before you begin

- Install the app only from the approved distribution link/store when released.
- Confirm the publisher and app name before signing in.
- Use a private device lock and keep verification codes/passwords private.
- Prepare clear copies of only the documents requested for your chosen service.
- Do not enter confidential document numbers or personal stories into the AI assistant.

Screens can vary slightly by release. A feature that is disabled pending parish approval will show an explanation or contact path rather than pretending to be available.

## 3. Sign in and profile

1. Open ParishLink and choose the approved sign-in or registration method.
2. Review the privacy notice and create/sign in to your parishioner account. A new account begins as **Not verified** until its email code is confirmed.
3. Enter only the required profile/contact information.
4. Choose notification preferences. In-app notifications remain available; push notifications require device permission and can be revoked.
5. To sign out, open the account/profile area and choose **Sign out**. If a device is lost, use account recovery or contact the approved support channel to revoke access.

Never share a one-time code with a person claiming to be support.

To verify the signed-in email:

1. Open **More > Profile & settings** and find **Email security**.
2. Choose **Send verification code**. An accepted request does not prove inbox delivery; check the account inbox and spam folder.
3. Enter the newest 12-character code and choose **Confirm email address**. The code expires after 15 minutes, is single-use, and stops working after five wrong attempts.
4. Confirm that the server-backed badge changes to **Verified**. If the result was interrupted, refresh the profile before requesting another code.

Legacy/local accounts can still show **Not verified**. The current implementation reports that state but does not yet block appointment booking on it. Do not treat that temporary behavior as a permanent parish policy.

To recover a forgotten parishioner password:

1. On the API-connected sign-in screen, choose **Forgot password?** and enter the sign-in email.
2. ParishLink intentionally shows the same accepted response whether or not an eligible account exists. It never confirms account existence.
3. If an email arrives, enter the newest code, a new 12–128 character password with uppercase and lowercase letters plus a number, and the matching confirmation.
4. After **Reset confirmed**, return to sign-in and enter the new password manually. Every prior mobile session and push-device binding has been revoked, so re-enable push on trusted devices if/when native push is released.

The current local environment cannot send these messages because `MAIL_ENABLED`, `MAIL_DELIVERY_VERIFIED`, `RESEND_API_KEY`, and `MAIL_FROM` are unavailable. A `503`/delivery-unavailable message is expected locally and is not evidence that an email was attempted or delivered. Internal parish staff, clergy, and system administrators use their separately governed SSO recovery path; they do not use the parishioner reset form. See [`ACCOUNT_RECOVERY.md`](ACCOUNT_RECOVERY.md).

## 4. Explore parishes and services

The baseline contains exactly:

1. Metropolitan Cathedral of San Fernando
2. San Guillermo Parish
3. Sanctuario de San Jose Parish
4. Sta. Lucia Parish
5. Sto. Niño Parish
6. San Isidro Labrador Parish
7. St. Joseph Parish
8. Archdiocesan Shrine of Our Lady of Lourdes

The named services are **Baptism, Wedding, Confirmation, First Communion, and Funeral Mass**.

From the home/service area:

1. Select a service to read its approved description and current checklist.
2. Select a parish to see approved office/service information.
3. Contact the parish when the app marks a rule as needing confirmation. Documentary and canonical rules can differ and remain subject to authorized parish/clergy review.

## 5. Request an appointment

1. Choose **Request appointment** or select a service.
2. Select the service and parish.
3. Enter the required participant details. Do not add unrelated sensitive information in notes.
4. Select an available date/time and, when offered, clergy/venue option.
5. Review the service, parish, local date/time, participants, documentary checklist, and policy.
6. Submit once and wait for the confirmation. If the connection is interrupted, return to **My appointments** before resubmitting.
7. Save the unique reference shown in the app.

Availability can change between viewing and submission. ParishLink rechecks clergy and venue conflicts before accepting the request. If a slot has become unavailable, no duplicate appointment should be created; refresh and choose an alternative.

## 6. Appointment statuses

The app may use friendly labels for these authoritative states:

| Status | What it means | What to do |
|---|---|---|
| Submitted | Request received; no approval yet | Review checklist and notifications |
| Documents pending | Required items are incomplete | Upload the requested items |
| Under review | Authorized parish personnel are reviewing | Wait or respond to a request |
| Needs changes/action | Information or a document must be corrected | Read the note and resubmit safely |
| Ready for approval | Pre-validation gates are satisfied; human decision remains | Await authorized decision |
| Approved | Appointment is approved for the displayed schedule | Reconfirm instructions and attend |
| Rejected | Request was declined with an authorized explanation | Read the note/contact parish; create a new request if appropriate |
| Completed | Appointment/service is marked complete | Keep the reference for follow-up |
| Cancelled | Request was cancelled under policy | Contact parish if this is unexpected |
| No-show | Attendance was not recorded | Contact parish if correction is needed |

A notification or AI response is not itself an approval; the appointment details screen is authoritative.

## 7. Upload and replace documents

1. Open **My appointments**, select an appointment, and open **Documents**.
2. Select a requirement marked **Not submitted** or **Needs replacement**.
3. Read the allowed format/size and privacy notice.
4. Take/select a clear file showing only the requested material; verify it before uploading.
5. Submit and keep the app open until receipt is confirmed.
6. Check the resulting state:
   - **Submitted/Under review:** received, but not yet accepted.
   - **Verified:** an authorized reviewer completed pre-validation.
   - **Needs replacement:** read the safe reviewer note and submit a corrected copy.
   - **Not required:** approved applicability rule/exception.

Choosing a file on the device is not submission, and an automated scan is not human verification. A verified upload still does not replace final parish/clergy authority or the official document/archive.

If a document was sent to the wrong appointment or device access is compromised, contact the approved privacy/support channel promptly. Do not send replacements through informal chat or email unless the parish's reviewed procedure explicitly directs it.

## 8. Reschedule or cancel

Open the appointment and select the available action. The app shows the approved parish policy and any restriction. Review the new slot or cancellation consequence, confirm, and wait for the updated authoritative status. Staff/clergy may need to review a reschedule. If the action is unavailable, contact the parish; do not create several duplicate requests.

## 9. Notifications and announcements

- Open **Notifications** to view appointment/document/queue updates and announcements.
- Select a notification to open its related item when available.
- Mark items read without deleting the underlying appointment history.
- Manage push permission in app/device settings. Lock-screen previews intentionally avoid sensitive details.
- If a push alert seems inconsistent, open the app and refresh the appointment; do not rely on the preview alone.

## 10. Walk-in queue

Where the selected parish enables mobile self-ticketing:

1. Open **Queue**, choose the parish and service, review its opening status, and request one ticket.
2. Keep the ticket number visible and watch its state/last update.
3. Arrive/follow parish instructions. Any displayed wait is an estimate, not a guarantee.
4. Cancel the ticket if you will not attend.

A person without a phone/account can request a ticket from parish staff. If the system is unavailable, staff may use a controlled manual queue. Do not request multiple tickets to move ahead. Priority handling follows parish policy, not the AI assistant.

## 11. Ask ParishLink (Gemini-assisted guidance)

Use the assistant for general questions about services, approved document guidance, appointment procedure, office inquiries, and app navigation.

It cannot:

- approve/reject an appointment or verify a document;
- decide sacramental eligibility or give an official Church ruling;
- inspect your uploaded files or private sacramental records;
- replace clergy counseling;
- provide legal or financial advice;
- change your booking, queue, or account.

Do not type document numbers, credentials, private record details, or unnecessary personal information. If the assistant is uncertain/unavailable or the question needs authority, use the displayed parish contact/handoff.

## 12. Privacy, accessibility, and safety

- Use only your own account; do not rely on a reference number as proof of identity.
- Sign out on shared devices and remove screenshots/downloads containing personal information.
- Review uploaded files for bystander information and unnecessary pages.
- The app supports screen-reader labels, scalable text, readable status labels, and large targets as release requirements. Report an accessibility barrier through support with device/OS/app version and safe steps.
- Privacy access/correction/deletion questions go to the approved DPO/privacy contact shown in the released app; retention or official-record obligations may affect the outcome.

## 13. Troubleshooting

| Problem | Safe action |
|---|---|
| Slot disappears or conflict appears | Refresh and select another slot; do not repeatedly submit |
| Submission result is unclear | Check **My appointments** and the reference/history before retrying |
| Upload fails | Check approved type/size and connection; retry from the same requirement |
| Document stays in review | Wait for parish review; use the approved contact if outside the stated service window |
| Push missing | Check in-app notifications, device permission, and connection; appointment screen is authoritative |
| Queue estimate unavailable | Keep the ticket/status; ask parish staff rather than guessing |
| Assistant unavailable/uncertain | Use approved FAQ/parish contact; other app functions should remain available |
| Verification/reset code does not arrive | An accepted request is not delivery proof. Check the correct inbox/spam folder, wait for the configured service window, then request one new code; only the newest code works. If account email is reported unavailable, use the approved parish support path. |
| Reset result is interrupted | Try one manual sign-in with the new password before requesting another code. Never allow the client or support staff to retry the password change automatically. |
| Wrong data or suspicious access | Stop sharing, sign out/recover access, and contact privacy/security support promptly |

When contacting support, provide app version, device/OS, approximate time, selected parish, safe reference/correlation ID, and steps. Never provide a password, one-time code, access token, or uploaded document through an unapproved support channel.
