# ParishLink Role-Based Access Control

## 1. Authorization model

ParishLink uses four source roles: **parishioner, parish staff, clergy/priest, and system administrator**. A role provides a permission set; an additional resource rule determines whether the actor may use that permission on the requested parish, appointment, document, record, or assignment.

Authorization is evaluated on the server for every request:

```text
allow = authenticated
    AND account_is_active
    AND role_has_permission
    AND actor_scope_contains_resource
    AND resource_state_allows_action
    AND required_policy_conditions_are_met
```

Client navigation is a convenience, not a security control. Denial returns a safe `403`, changes no data, and creates an audit signal for privileged or suspicious attempts.

## 2. Role and client boundary

| Role | Primary client | Default scope |
|---|---|---|
| Parishioner | Mobile application | Own profile, own appointments/documents/notifications, own active queue ticket; public parish content |
| Parish staff | Internal web portal | Assigned parish or explicitly assigned parishes |
| Clergy/priest | Internal web portal | Own assignments plus appointments/parishes explicitly assigned or authorized by policy |
| System administrator | Internal web portal | Vicariate-wide system configuration and oversight, subject to purpose limitation for highly restricted content |

The working interpretation of “admin-only web” is an internal portal for parish staff, clergy, and system administrators—not a parishioner web app. DEC-002 must confirm this before UAT.

## 3. Permission matrix

Legend: **Own** = own resource; **Scoped** = assigned parish/appointment; **Assigned** = own clergy assignment; **All** = vicariate scope; **Config** = only when explicitly configured; **No** = denied.

| Capability | Parishioner | Parish staff | Clergy/priest | System administrator |
|---|---:|---:|---:|---:|
| View approved public parish/service information | All public | All public | All public | All public |
| Manage own account/contact preferences | Own | Own | Own | Own |
| Request/reschedule/cancel appointment | Own, within policy | Scoped on behalf of parishioner, within policy | Config | Config/support only |
| View appointment | Own | Scoped | Assigned/scoped | All metadata; restricted content by purpose |
| Review appointment workflow | No | Scoped operational steps | Assigned/scoped decision steps | Config/support; not automatic canonical authority |
| Approve/reject sacramental request | No | Config | Assigned/scoped | No by default; emergency permission requires policy |
| Upload appointment document | Own | Scoped assistance | No by default | No by default |
| View private document | Own submission | Scoped and need-to-know | Assigned/scoped and need-to-know | Purpose-granted support only |
| Verify/request replacement document | No | Scoped | Config/assigned | No by default; support override audited |
| View own notification | Own | Own | Own | Own |
| Publish parish announcement | No | Scoped | Config/scoped | All scopes |
| Issue/call/complete queue ticket | Own self-ticket where enabled | Scoped | Config/scoped | Config/support |
| Apply queue priority override | No | Scoped with reason | Config with reason | Config/support with reason |
| Manage venues/availability | No | Scoped | Own/assigned availability, per policy | All |
| Manage clergy assignments | No | Config/scoped | View own; propose if enabled | All |
| Search sacramental working records | Own request result only, if approved | Scoped/need-to-know | Assigned/scoped/need-to-know | All metadata; content by purpose |
| Create/correct/verify working record | No | Config/scoped | Config/scoped | Config/support; final authority remains designated custodian |
| Issue official certificate | No | Config only after DEC-006 | Config only after DEC-006 | No by default |
| View operational reports | Own status only | Scoped aggregate | Assigned/scoped aggregate | Vicariate aggregate |
| View evaluation reports | Published aggregate only | Scoped aggregate if authorized | Aggregate if authorized | All approved aggregate |
| Export personal/record data | Own approved request | Scoped and purpose-authorized | Scoped and purpose-authorized | Purpose-authorized; auditable |
| Manage service/checklist configuration | No | Propose/scoped if enabled | Approve per policy | Technical publish after required approval |
| Manage internal users and memberships | No | No by default | No | All, with separation-of-duties review |
| View security audit logs | Own security events where appropriate | No by default | No by default | Security-authorized administrators only |
| Configure providers/secrets/retention | No | No | No | Authorized system administrators; dual review recommended |
| Use Gemini general inquiry | Own session | Public-content test | Public-content test | Configuration/test without private data |

“Config” means the source material does not settle the permission and an approved policy must enable it. Until approval, default deny.

## 4. Resource scoping rules

### Parishioner ownership

An appointment, document submission, notification, or account-linked queue ticket is owned through the authenticated user ID—not through a request-supplied email, name, reference number, or parishioner ID. A reference number alone never grants access.

### Parish staff membership

The backend derives active parish memberships from server data. Supplying a different `parishId` cannot widen scope. Vicariate-wide search is denied unless a separate permission expressly grants it.

### Clergy assignment

Clergy access is limited to their own profile/assignments and the appointments or parishes for which policy grants participation. An appointment that merely names a clergy member but is not committed/assigned must not automatically expose private documents.

### System administrator purpose limitation

System administration requires broad configuration and diagnostic capability, but broad role membership is not a blanket need to read uploaded civil documents, private review notes, or sacramental record bodies. Highly restricted access should use time-bound elevation or explicit permission, display a purpose notice, and create a high-value audit event.

## 5. Sensitive actions and separation of duties

The following actions require reauthentication or recent MFA for internal users: role/membership changes, secret/provider configuration, bulk export, retention/deletion execution, backup restore, official-certificate configuration, and emergency access.

Recommended dual review applies to:

- granting/revoking system-administrator access;
- bulk export of confidential/highly restricted data;
- production retention purge or archive import;
- enabling official certificate issuance;
- changing canonical checklist/eligibility policy;
- emergency access to private documents outside normal parish scope.

The same person may technically hold multiple responsibilities in a capstone pilot, but the audit record must preserve the actual actor and approvals; shared accounts are prohibited.

## 6. Transition authorization

Business-state authorization is stricter than CRUD access. For example:

- A reviewer who can view an appointment cannot necessarily approve it.
- A document reviewer can mark a file `verified` but cannot bypass required-item gates without override permission.
- A system administrator can repair configuration but does not become clergy/canonical authority.
- A parishioner can cancel only their own appointment and only within approved policy.
- Queue priority changes require both the permission and an entered reason.
- Record correction preserves the prior value/event rather than erasing provenance.

Allowed appointment and document transitions are defined in [`DATA_MODEL.md`](DATA_MODEL.md).

## 7. Account lifecycle

Internal users are invited and assigned by an authorized administrator; memberships and effective dates are reviewed by the parish owner. Transfers remove obsolete parish access. Departures disable sessions promptly. Privileged access is reviewed at least before each release/pilot and at a stakeholder-approved recurring interval thereafter. Parishioner recovery must not disclose whether sensitive appointments exist.

## 8. Authorization test minimum

For every protected endpoint, test unauthenticated, wrong role, correct role/wrong parish, correct role/correct parish, inactive account, stale membership, altered resource ID, and prohibited transition. Private-file tests also cover guessed keys, expired links, URL forwarding, and changed appointment ownership. The release fails if any negative case exposes data or mutates state.
