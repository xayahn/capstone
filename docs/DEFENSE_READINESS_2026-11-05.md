# ParishLink Capstone 2 Defense Assessment

Assessment date: 5 November 2026, Asia/Singapore.

**Later implementation on the same date:** [Gemini/push integration](GEMINI_PUSH_SETUP.md) now supplies the server gateway and native notification code. Both remain disabled locally pending provider configuration; live provider/device evidence is absent. The original paper, research results and overall defense verdict below have not thereby become complete.

**6 November update:** Gemini is now configured locally and a real public-question reply plus the private-local boundary have passed through the app API. The combined engineering evidence is now 429 checks, including actual workerd compatibility checks. Push still awaits Expo/FCM/APNs setup and physical-device delivery evidence; the research and defense gaps below remain open.

**Verdict: the project is defensible, but the supplied manuscript and current verification evidence do not yet justify a final-defense-ready declaration.** This is an assessment against the supplied objectives and implementation, not a prediction of the panel's grade. The institution's actual Capstone 2 rubric was not supplied. Production release remains on HOLD and no deployment was performed for this assessment.

## Basis and strengths

Reviewed the original July 2026 manuscript, current requirements/traceability documents, current feature implementations and the [November technical audit](AUDIT_2026-11-04.md). The manuscript paragraph references below identify nonempty paragraphs in the original document; they are not page numbers.

The study has a coherent practical problem: coordinating appointments, clergy, venues, documents and working records across eight named parishes, while retaining a walk-in option. Its delimitations preserve human/clergy authority and exclude unrelated accounting, inventory and streaming work. These are useful boundaries for a capstone.

The implementation provides substantial evidence: the last recorded run passed 72 admin tests, 91 mobile tests and 93 backend security checks, plus type checks, lint, migration validation, an admin build and unsigned iOS/Android/web exports. A local synthetic signup-to-booking/queue/logout journey passed. These results support specific engineering claims; they do not establish user acceptance or study outcomes.

The strongest contribution to defend is the design, integration and evaluation of a solution for the participating vicariate's validated workflow. A universal claim to be the first parish-management system is unnecessary and unsupported by the search evidence supplied.

## Current readiness

| Area | Assessment |
| --- | --- |
| Problem, target users and bounded concept | Defensible, subject to documented local stakeholder validation. |
| Core implementation | Substantial working local implementation with meaningful regression evidence. |
| Paper-to-feature alignment | Incomplete: Gemini, notification delivery and records/reporting depth require explicit reconciliation. |
| Android/iOS operation | Bundle generation verified; installed-device behavior remains unverified. |
| Research completion | Supplied Chapters IV/V contain headings only; evaluation evidence is not included. |
| Final defense | Not yet supported as ready by the evidence available. A supervised progress/mock defense is more supportable. |
| Production launch | HOLD; see the technical audit for separate release blockers. |

## System issues that matter in a defense

| Issue | Current evidence | Required action or defensible statement |
| --- | --- | --- |
| Gemini is explicitly promised | Paper paragraphs 36, 43, 50 and 174 specify Gemini; the current assistant selects predefined guidance and deliberately makes no external provider call. | Complete the bounded Gemini feature required by the approved paper, or obtain adviser/sponsor approval for a scope amendment and update all affected objectives, methods and evaluation items. Do not present fallback guidance as Gemini. |
| Notification wording exceeds demonstrated delivery | In-app notification records/read states work; the active app refreshes at 30-second intervals. Push-token registration and a delivery provider were not demonstrated. | Describe current behavior as in-app updates. Complete and test push delivery if required by approved scope. Define what “real-time” means and measure it. |
| Account lifecycle is incomplete | Signup, login, session expiry, logout and password change have test coverage; verified email and forgotten-password recovery are unresolved. | Finish and test the required lifecycle; accurately describe residual restrictions during a controlled demo. |
| Records depth is limited | Parish-scoped working-record creation/search/verification exists; complete certificate issuance, correction and export workflows were not demonstrated. | Map the broad records scope to exact accepted functions. Official certificate issuance is not automatically required merely because certificates are mentioned as record types; obtain a clear approved boundary. |
| Provider/security integration remains unverified | Scanner, real internal identity/MFA and production boundary checks remain open. Production uploads fail closed without the scanner. | Distinguish isolated/mocked security checks from real provider validation. Do not claim completed malware scanning or production authentication from local simulation. |
| Device/network evidence is incomplete | No fresh physical iOS/Android evidence for permissions, secure storage, foreground/background, poor network, accessibility or complete journeys. | Test actual devices and retain device/OS/version, tasks, failures and reruns. Walk-in access does not itself establish offline backend operation. |
| Remaining dependency and scale risk | Five advisories remain, including a high Expo CLI dependency finding. Legacy dashboard collections remain unbounded. | Resolve or document reachability and compatibility assessment. Retain a bounded load test; do not infer capacity from 48 local requests or advertise five proven exploits. |

The advantages are integrated parish workflows, reusable mobile code, server-enforced parish/role boundaries, human document decisions, duplicate-request protection and an auditable implementation. The disadvantages are the broad delivery scope, provider dependencies, internet/device access barriers, operational ownership costs and incomplete deployment/device evidence. These require explicit limits and measured acceptance, rather than an assurance of zero bugs.

## Study issues requiring correction

1. **The supplied final chapters are empty.** Paragraphs 265–266 contain Chapter IV/V headings without results, discussion or conclusions. This establishes incompleteness of this file, not that the team has never conducted research elsewhere. Include the actual results and evidence before claiming completion.
2. **The instrument is not included despite the appendix claim.** Paragraph 226 says the questionnaire is appended. The supplied document has no questionnaire appendix; its two embedded images are adjacent to the conceptual-framework and Scrum sections. Attach the actual item list, mapping to characteristics, validation records and pilot reliability procedure/results.
3. **Planned research is not recorded as completed.** Paragraphs 189–190 propose permissions, expert validation, pilot testing, ethics clearance, consent, interviews and surveys. Supply the required records and actual dates. Changing verbs alone does not supply evidence.
4. **Sampling and precision are not reconciled.** Paragraphs 192–195 combine purposive selection, staff/clergy enumeration, Slovin at 0.05 and recruitment of experienced test users. Define population, eligibility, frame, sample size, parish distribution, selection and nonresponse. A purposive sample does not acquire a conventional 5% sampling margin merely by using a sample-size formula. [AAPOR disclosure guidance](https://aapor.org/standards-and-ethics/disclosure-standards/) requires explicit model/assumption support for precision measures on nonprobability samples. Obtain adviser/statistician review of the actual plan.
5. **Perceptions cannot establish all claimed outcomes.** A favorable four-point rating does not alone prove reduced waiting, fewer conflicts, secure access or maintainability. Pair role-appropriate questionnaires with observed task completion, retrieval/booking time, document rework and technical tests. If no baseline comparison is conducted, constrain conclusions to the functions tested and participants' reported experience.
6. **Clarify the ISO edition and instrument provenance.** The paper uses the eight-characteristic 2011 product model. ISO lists [25010:2011 as withdrawn](https://www.iso.org/standard/35733.html); [25010:2023 has nine characteristics](https://www.iso.org/standard/78176.html). Agree with the adviser whether to justify the approved historical framework or revise it consistently. Do not just replace the year. The four-point questionnaire and verbal interpretation are the study's instrument choices, not automatic ISO certification or an ISO-mandated rating scale.
7. **Qualify the literature gap.** Paragraphs 142 and 152–153 make broad absence/uniqueness claims without a documented exhaustive search or full competitor fit assessment. Limit conclusions to the sources and products actually reviewed. Explain local workflow requirements and evaluated design contributions.
8. **Reconcile citations and support specialist claims.** Dizon et al. (2023) is cited in the text but is not listed in the supplied bibliography. Joint SDG Fund appears as 2025 in paragraph 92 and 2024 in the reference list. Check every author/year/DOI and the findings actually supported. The canonical-validity assertion at paragraph 148 requires qualified authoritative support or narrower administrative wording. This review does not establish that any source is fabricated or that all bibliography entries are verified.
9. **Show the development process actually used.** A generic Scrum description and M1–M6 timeline do not document completed sprints. Retain dated backlog items, sprint goals, review feedback, completed increments, team responsibilities and actual schedules.
10. **Connect each objective to a result.** Objective 1 needs documented needs/consultations; Objective 2 needs validated requirements; Objective 3 needs a traceable demonstrated implementation including Gemini or an approved amendment; Objective 4 needs actual evaluation and analysis. A test count alone does not satisfy all four.

## Recommended preparation order

1. Review the actual school rubric with the adviser. Approve scope, the sampling plan, evaluation instrument and the required ethics/permission process before participant data collection.
2. Make a requirement-to-evidence table for the current version: implemented, partial, not implemented and not tested. Reconcile Gemini, notification claims, records boundaries and specialist parish rules.
3. Complete required functions and high-risk fixes; run role-based journeys on actual Android/iOS devices and the admin browser. Record invalid inputs, conflicts, denied access, document replacement, slow/offline behavior and recovery.
4. Conduct the approved stakeholder task tests and evaluation. Keep anonymized underlying data, consent/permission evidence, respondent-group counts, calculations and limitations. Do not invent scores, acceptance or approvals.
5. Complete Chapters IV/V from those results. Link every conclusion to its evidence and scope; consolidate the current test manifest so older dated results are not mistaken for current totals.
6. Freeze an identified demo version and rehearse with synthetic records: parishioner request, staff review, clergy decision where appropriate, user status update, conflict rejection, forbidden access and queue handling. Retain a clearly labeled backup recording and explain failures honestly.

Public deployment is not an inherent prerequisite for demonstrating a controlled local implementation. If the school's rubric requires operational implementation or stakeholder pilot evidence, agree on an authorized controlled approach with the adviser. This assessment does not authorize deployment.

## Questions the team should be able to answer

- What local evidence established the parish problem and validated the requirements?
- What contribution does ParishLink make beyond an ordinary booking system or existing church products?
- Which promised features are complete, partial or unavailable, and who approved scope changes?
- Where are the questionnaire, validation, sample definition, data and reproducible calculations?
- What proves improved processing time or fewer conflicts, and what remains only perceived usefulness?
- Why is the sampling method appropriate, and what conclusions can the sample support?
- What is the difference between predefined guidance and the Gemini feature promised?
- How are parish/role isolation, duplicate requests, conflicting schedules and private documents protected?
- What actually happened on Android, iOS and poor networks?
- Can each group member explain the architecture, database, key rules, tests and their own contribution?

The defensible position is a demonstrated, evaluated system with transparent boundaries and a supported contribution. Readiness should follow completion of that evidence package rather than a percentage estimate.
