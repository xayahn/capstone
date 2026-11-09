# Draft post-task feedback instrument

**Status:** Unapproved working draft. No responses collected. This is not the missing questionnaire appendix from the paper and is not a validated ISO/IEC 25010 instrument.

The adviser/beneficiary and research reviewers must approve a version, translation and role/task-appropriate subset before recruitment. Use the same applicable wording and scale after matched manual/app tasks. Administer after the timer stops. Do not suggest the preferred answer or promise the app is faster.

## Instructions for review

“Please rate the task you just attempted. Your opinion may be positive or negative. You may leave an item unanswered, choose not applicable, or stop without penalty. Do not write names, contact details, document numbers, passwords, email codes or real parish-record details.”

Suggested scale, pending approval: **1 Strongly disagree; 2 Disagree; 3 Agree; 4 Strongly agree**. Not applicable / prefer not to answer has no numeric score.

| Item ID | Statement | Applicability |
|---|---|---|
| F01_NEXT | I could identify the next action needed to carry out this task. | Both modes |
| F02_COMPLETE | I could tell whether I had completed the task. | Both modes, including unsuccessful attempts |
| F03_READ | I could read the information and instructions without difficulty. | Both modes, with approved accommodations |
| F04_REQUIRE | The requirements for this task were clear to me. | Tasks with stated requirements |
| F05_RECOVER | The available guidance helped me recover when I encountered a problem. | Only when a problem and guidance were encountered |
| F06_EFFORT | The effort required for this task was reasonable. | Both modes |

Optional neutral prompts:

- What, if anything, made this task difficult?
- What one change would help you complete it?
- Is there anything else about this task you would like reviewers to know?

## Recording and interpretation

Record approved instrument version, coded participant/task, Manual/App mode, item, rating and UTC timestamp in `feedback.csv`. Only one response per participant/task/mode/item is scored. Practice feedback does not enter scored summaries. Comments must be redacted; do not invent a rating to attach an optional comment. Qualitative notes without ratings belong in a separately controlled coded record.

Unanswered/not-applicable items have no scored CSV row. Retain an approved separate missing-response tally so nonresponse stays visible; zero is not a valid rating. Withdrawal follows the approved consent and retention process.

Report item-level counts, distributions/medians, missing-response counts and redacted themes under the approved disclosure threshold. The summarizer separates items and modes and suppresses small cells. It does not create a pooled quality score, prove security/reliability or establish causal improvement. Those controls need technical and operational evidence.

Changes require a new approved instrument version. If the school requires a particular validated questionnaire or ISO edition, obtain its instrument and scoring rules from the adviser instead of relabeling this draft.
