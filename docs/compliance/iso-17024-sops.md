# Standard Operating Procedures — ISO/IEC 17024:2012 Compliance
**Organisation:** Truemark Global  
**System:** Certification and Learning Management & Examination Platform (CLMEP)  
**Standard:** ISO/IEC 17024:2012 — Conformity assessment: General requirements for bodies operating certification of persons  
**Document status:** Controlled  
**Review cycle:** Annual, or following any material change to the platform

---

## Table of Contents

1. [Scope and Purpose](#1-scope-and-purpose)
2. [Roles and Responsibilities](#2-roles-and-responsibilities)
3. [Impartiality and Conflict of Interest](#3-impartiality-and-conflict-of-interest)
4. [Candidate Registration and Eligibility](#4-candidate-registration-and-eligibility)
5. [Examination Administration](#5-examination-administration)
6. [Blind Marking and Assessment](#6-blind-marking-and-assessment)
7. [Certification Decision](#7-certification-decision)
8. [Certificate Issuance and Maintenance](#8-certificate-issuance-and-maintenance)
9. [Surveillance and Recertification](#9-surveillance-and-recertification)
10. [Appeals](#10-appeals)
11. [Complaints](#11-complaints)
12. [Suspension and Revocation](#12-suspension-and-revocation)
13. [Record Keeping and Retention](#13-record-keeping-and-retention)
14. [Internal Audit and Review](#14-internal-audit-and-review)

---

## 1. Scope and Purpose

These SOPs govern the operation of the Truemark Global CLMEP for all personnel certification activities conducted under ISO/IEC 17024:2012. They apply to every person who interacts with the system in a staff capacity and to every certification scheme hosted on the platform.

These procedures are stored in the application repository so that changes to operational processes are version-controlled alongside the code that implements them. Any pull request that modifies examination, certification, appeals, or data-handling behaviour **must** be accompanied by an update to the relevant section of this document.

---

## 2. Roles and Responsibilities

The platform enforces the following role hierarchy. No user may hold more than one role that creates a prohibited combination (see Section 3).

| System Role | ISO 17024 Function | MFA Required |
|---|---|---|
| `SUPER_ADMIN` | Platform governance, user management, final escalations | Yes |
| `CERTIFICATION_OFFICER` | Certification decisions, scheme management, certificate issuance and revocation | Yes |
| `EXAMINER` | Examination creation, blind marking, grade submission | Yes |
| `TRAINER` | Course and learning content delivery | No |
| `PROCTOR` | Real-time examination supervision, incident logging | Yes |
| `AUDITOR` | Read-only access to audit logs, reports, and compliance records | Yes |
| `ORG_MANAGER` | Manages organisational enrolments and member records | No |
| `CANDIDATE` | Applies for certification, sits examinations, receives certificates | No |

**Responsibility matrix:**

| Activity | Who initiates | Who approves | Who may not be involved |
|---|---|---|---|
| Exam paper creation | `EXAMINER` | `CERTIFICATION_OFFICER` | The candidate's `TRAINER` |
| Exam marking | `EXAMINER` | — | The candidate's `TRAINER`; the `CERTIFICATION_OFFICER` who decides |
| Certification decision | `CERTIFICATION_OFFICER` | `SUPER_ADMIN` (if escalated) | The marking `EXAMINER`; the `TRAINER` |
| Certificate issuance | Platform (automated) | `CERTIFICATION_OFFICER` | — |
| Appeal decision | `CERTIFICATION_OFFICER` or independent panel | `SUPER_ADMIN` | The original decision-maker |
| Revocation | `CERTIFICATION_OFFICER` | `SUPER_ADMIN` | — |

---

## 3. Impartiality and Conflict of Interest

**Reference:** ISO 17024 Cl.4.3, Cl.6.1

### 3.1 Enforced Separation of Duties

The platform enforces the following prohibitions in code (`src/lib/constants.ts → DUTY_SEPARATIONS`). Attempting to assign a user to a conflicting role combination is rejected at the API layer.

| Prohibited combination | Reason |
|---|---|
| `TRAINER` + `EXAMINER` for the same candidate | The person who taught cannot assess |
| `EXAMINER` + `CERTIFICATION_OFFICER` for the same candidate | The marker cannot make the certification decision |
| `TRAINER` + `CERTIFICATION_OFFICER` for the same candidate | The teacher cannot certify |

These are enforced at enrolment, at exam-attempt creation, and at grade submission. Any attempt to circumvent them is logged in the immutable audit trail.

### 3.2 Conflict of Interest Declarations (COI)

Before undertaking any assessment or certification activity, staff must submit a COI declaration via the `COIDeclaration` record. The platform records:

- Date of declaration
- Nature of any declared interest
- Whether the declared interest was disqualifying

A COI declaration with a disqualifying interest removes the staff member from that candidate's workflow. `CERTIFICATION_OFFICER` must verify COI status before initiating a certification decision.

### 3.3 Annual Impartiality Review

The `SUPER_ADMIN` must conduct an annual review of:
- All COI declarations from the preceding 12 months
- Any cases where a role-combination prohibition was triggered
- Any audit log entries with action `CONFLICT_OF_INTEREST_DECLARED`

Evidence of this review must be retained for 3 years.

---

## 4. Candidate Registration and Eligibility

**Reference:** ISO 17024 Cl.7.1

### 4.1 Registration

Candidates register via email/password or OAuth (Google, Microsoft). On registration:

1. Email verification is required before the account becomes `ACTIVE`.
2. The `CandidateProfile` is created with `registrationType` set to either `individual` or `organisational`.
3. Organisational candidates are linked to an `Organisation` record by an `ORG_MANAGER`.

### 4.2 Eligibility Verification

Before a candidate may sit an examination under a given `CertificationScheme`:

1. `CERTIFICATION_OFFICER` reviews the candidate's stated eligibility (professional title, employer, CPD records where applicable).
2. If eligibility is confirmed, the `CERTIFICATION_OFFICER` creates or approves the enrolment on the relevant course.
3. Paid certification schemes require successful payment (Paystack) before enrolment is granted; the platform rejects enrolment requests for paid courses without a confirmed payment record.

Eligibility decisions are recorded in the audit log under action `ENROLMENT_APPROVED` or `ENROLMENT_REJECTED`.

---

## 5. Examination Administration

**Reference:** ISO 17024 Cl.7.3, Cl.7.4

### 5.1 Exam Paper Lifecycle

| Status | Meaning |
|---|---|
| `SCHEDULED` | Paper created; not yet opened to candidates |
| `IN_PROGRESS` | At least one candidate has an active attempt |
| `COMPLETED` | Attempt window closed; pending grading |
| `CANCELLED` | Withdrawn before any attempt was submitted |
| `VOIDED` | Results invalidated post-submission (e.g., integrity breach) |

Only `EXAMINER` and `CERTIFICATION_OFFICER` may create, edit, or publish exam papers. `TRAINER` has no access to exam paper content.

### 5.2 Timed Examinations

The allowed duration is defined in `ExamPaper.durationMins` and is snapshotted into `ExamAttempt.durationMins` at attempt creation. This prevents a duration change mid-attempt from affecting active candidates.

### 5.3 Proctoring

When `ExamPaper.requiresProctoring = true`:

1. A `ProctoringSession` is created at attempt start. A proctoring session is **only** created when the exam paper requires it — the platform will not create proctoring records for unproctored exams.
2. `PROCTOR` monitors the session in real time and logs incidents to `ProctoringIncident`.
3. Incident types and severities are recorded. Severe incidents may result in the attempt being voided (`VOIDED` status) by a `CERTIFICATION_OFFICER`.

Proctoring recordings are retained for 180 days, then deleted (see Section 13).

### 5.4 Attempt Integrity

- Candidates may not submit progress for a `lessonId` that does not belong to their enrolled course.
- Candidates may not mark arbitrary lessons as complete.
- All progress updates are validated server-side before being persisted.

---

## 6. Blind Marking and Assessment

**Reference:** ISO 17024 Cl.7.4, Cl.6.2 (impartiality)

### 6.1 Principle

Examiners must not be able to identify the candidate whose work they are marking. The platform implements this as follows:

1. The `ExamGrade` record links to `ExamAttempt` by ID, not by candidate name or email.
2. The marking interface presents only the attempt reference, not the candidate's personal data.
3. `EXAMINER` role does not have `SELECT` permission on `User.firstName`, `User.lastName`, or `User.email` for candidates with active attempts.
4. If an examiner recognises a candidate by other means (e.g., handwriting on an uploaded response), they must declare a COI immediately and recuse themselves.

### 6.2 AI-Assisted Question Generation

The platform supports AI-generated exam questions (`POST /api/manage/exams/[id]/questions/generate`). AI generation is a tool for `EXAMINER` productivity — all generated questions must be reviewed, edited, and approved by a qualified `EXAMINER` before publication. AI output may not be published without human review.

### 6.3 Second Marking

For borderline results (defined in each scheme's cut-score specification), a second `EXAMINER` must independently mark the response. The second marker must not be shown the first marker's grade until after submitting their own. The platform's `ExamGrade` model supports multiple grade records per attempt; the `CERTIFICATION_OFFICER` reconciles them.

---

## 7. Certification Decision

**Reference:** ISO 17024 Cl.7.5

### 7.1 Decision Process

Following marking, a `CERTIFICATION_OFFICER` reviews the `ExamGrade` record(s) and the candidate's eligibility file, then creates a `CertificationDecision` with one of three outcomes:

| Decision | Meaning |
|---|---|
| `approved` | Candidate meets all requirements; certificate to be issued |
| `rejected` | Candidate does not meet requirements; certificate not issued |
| `referred` | Decision deferred pending additional evidence or re-sit |

### 7.2 Separation from Marking

The `CERTIFICATION_OFFICER` who makes the certification decision **must not** be the `EXAMINER` who marked the attempt. This is enforced by the `DUTY_SEPARATIONS` constant and checked at decision submission.

### 7.3 Decision Audit

Every `CertificationDecision` is written to the immutable audit log with:
- The deciding officer's user ID
- The decision outcome
- The timestamp
- The attempt and grade IDs used as evidence

---

## 8. Certificate Issuance and Maintenance

**Reference:** ISO 17024 Cl.7.6

### 8.1 Certificate Number

Every certificate is assigned a unique number with the prefix `TG` followed by an 8-character alphanumeric fragment (e.g., `TG-A1B2C3D4`). Certificate numbers are immutable once issued.

### 8.2 Certificate Contents

Each `Certificate` record holds:
- `certificateNumber` — globally unique
- `issuedAt` — date of issue
- `expiresAt` — expiry date (computed from `CertificationScheme.validityMonths`)
- `holderName` — snapshot of the holder's name at time of issue
- `schemeNameSnapshot` — snapshot of the scheme name at time of issue
- `qrCodeUrl` — URL to the public verification page
- `openBadgeJson` — JSON-LD Open Badge v2.1 assertion

### 8.3 Public Verification

The verification page at `/verify/[certNumber]` is publicly accessible without login. It is:
- Rendered with `force-dynamic` so revoked certificates are never served from cache
- Rate-limited to 30 lookups per minute per IP to prevent enumeration attacks

### 8.4 Certificate Statuses

| Status | Meaning | Action |
|---|---|---|
| `ACTIVE` | Valid; holder meets all requirements | None |
| `EXPIRED` | Validity period elapsed; not renewed | Send renewal reminders at 180/90/30 days |
| `SUSPENDED` | Temporarily withdrawn pending investigation | Must not show as valid on verification |
| `REVOKED` | Permanently withdrawn | Must not show as valid; reason logged |
| `LAPSED` | Grace period for renewal elapsed | Treated as expired for verification |

### 8.5 CPD Requirements

Where a scheme requires ongoing CPD, candidates must log CPD activities in `CPDRecord`. The `CERTIFICATION_OFFICER` reviews CPD compliance prior to renewal. CPD records are retained for 2 years post-lapse.

---

## 9. Surveillance and Recertification

**Reference:** ISO 17024 Cl.7.7

### 9.1 Expiry Warnings

The `cert-expiry-warnings` Inngest function (`src/inngest/functions/certExpiry.ts`) runs daily at 07:00 UTC and sends email warnings at:

- **180 days** before expiry — initial renewal prompt
- **90 days** before expiry — reminder
- **30 days** before expiry — urgent reminder

Emails are suppressed for candidates who have withdrawn MARKETING consent (GDPR Art. 7(3)). Idempotency is enforced: each (certificate, warning interval) pair produces at most one email per calendar day regardless of retries.

### 9.2 Renewal Workflow

The renewal page (`/certificates/[id]/renew`) initiates a new certification cycle. Depending on the scheme:

- **Re-examination required** — candidate must sit the examination again
- **CPD-only renewal** — `CERTIFICATION_OFFICER` reviews CPD log and issues renewed certificate without re-examination
- **Declaration renewal** — candidate submits a statutory declaration; `CERTIFICATION_OFFICER` approves

Renewal history is maintained in `CertificateRenewal`. A new `Certificate` record is issued on successful renewal; the predecessor's `expiresAt` is not modified.

---

## 10. Appeals

**Reference:** ISO 17024 Cl.7.9

### 10.1 Grounds for Appeal

Candidates may appeal on the following grounds (platform-enforced enumeration):

| Type | Description |
|---|---|
| `exam_result` | Dispute of mark, alleged marking error |
| `certification_decision` | Dispute of approved/rejected/referred outcome |
| `misconduct_finding` | Dispute of a proctoring incident finding |
| `other` | Any other ground not listed above |

### 10.2 Submission

Appeals are submitted via `POST /api/appeals` with a minimum 20-character description of grounds and optional evidence attachments (`evidenceUrls`). The platform assigns a unique reference (`APL-XXXXXXXX`) and sets `dueAt` to 28 days from submission.

### 10.3 Processing SLA

Appeals must be resolved within **28 days** of submission (ISO 17024 Cl.7.9, `APPEAL_SLA_DAYS`). The `appeal-sla-monitor` Inngest function runs daily and creates in-app notifications for `SUPER_ADMIN` and `CERTIFICATION_OFFICER` when any appeal has remained in `SUBMITTED` or `UNDER_REVIEW` status beyond 28 days.

### 10.4 Independent Review

Appeals of certification decisions (`certification_decision` type) must be reviewed by a `CERTIFICATION_OFFICER` who was not involved in the original decision. The reviewing officer is recorded in `Appeal.assignedTo`.

### 10.5 Decision Finality

Appeal decisions are **final and irrevocable** once status is set to `UPHELD` or `REJECTED`. The platform enforces this at the API level — any attempt to modify a finalised appeal returns HTTP 409. This implements ISO 17024 Cl.6.2.4.

### 10.6 Outcomes

| Status | Meaning | Consequence |
|---|---|---|
| `UPHELD` | Appeal succeeds | `CERTIFICATION_OFFICER` takes corrective action (re-mark, re-issue, etc.) |
| `REJECTED` | Appeal fails | Original decision stands; candidate may seek external review |

All appeal decisions and their rationale are written to the audit log and retained for 3 years.

---

## 11. Complaints

**Reference:** ISO 17024 Cl.7.10

### 11.1 Scope

Complaints cover concerns about the certification body's conduct, processes, or staff — distinct from appeals (which challenge specific technical decisions about a candidate's results).

### 11.2 Acknowledgement SLA

All complaints must be acknowledged within **2 calendar days** of receipt (`COMPLAINT_ACK_DAYS`). Acknowledgement means the complainant receives a written confirmation that their complaint has been received and a named officer assigned.

### 11.3 Resolution

Complaints are investigated by a `CERTIFICATION_OFFICER` (or `SUPER_ADMIN` for complaints about `CERTIFICATION_OFFICER` conduct). The investigation outcome is documented in the `Complaint` record with a resolution statement.

### 11.4 Records

Complaint records are retained for 3 years. Patterns of complaints are reviewed at the annual management review.

---

## 12. Suspension and Revocation

**Reference:** ISO 17024 Cl.7.8

### 12.1 Grounds for Suspension

A certificate may be suspended (`SUSPENDED`) when:
- A complaint or appeal investigation is pending that could affect the certification decision
- The holder fails to maintain CPD requirements and a cure period is granted
- The holder fails to respond to a surveillance notice

Suspension is temporary. The verification page shows suspended certificates as invalid.

### 12.2 Grounds for Revocation

A certificate must be revoked (`REVOKED`) when:
- The holder obtained certification through fraud or misrepresentation
- The holder is found to have committed professional misconduct
- The holder requests voluntary surrender
- The holder's suspension is not resolved within the defined cure period

### 12.3 Process

1. `CERTIFICATION_OFFICER` initiates suspension or revocation via `POST /api/certificates/[id]/revoke`.
2. The action is logged in the immutable audit trail with reason and officer ID.
3. The `Certificate.status` is updated immediately; the public verification page reflects this on the next request (force-dynamic).
4. The holder is notified via email and in-app notification.
5. `SUPER_ADMIN` approval is required for revocations.

Revocations are permanent and cannot be reversed through the platform UI.

---

## 13. Record Keeping and Retention

**Reference:** ISO 17024 Cl.8.3 — NDPR/GDPR Art. 5(1)(e)

All retention periods are defined in `src/lib/constants.ts → RETENTION_DAYS` and enforced by scheduled data-disposal jobs.

| Record type | Retention period | Rationale |
|---|---|---|
| Certification records | 7 years | Regulatory minimum for professional certification |
| Payment records | 7 years | Financial regulation (FIRS, VAT Act) |
| Exam records | 3 years | Appeals and surveillance evidence |
| Appeal records | 3 years | Disputes evidence |
| Candidate PII | 3 years post-inactivity | NDPR proportionality |
| CPD records | 2 years post-lapse | Renewal evidence |
| Audit logs (hot) | 90 days | Operational investigation |
| Audit logs (cold/archive) | 3 years | Compliance evidence |
| Proctoring recordings | 180 days | Investigation window |

Records in the `AuditLog` table are **immutable** — no API endpoint allows modification or deletion of audit log entries. Content integrity is verified via a SHA-256 hash (`contentHash`) computed at creation time.

---

## 14. Internal Audit and Review

**Reference:** ISO 17024 Cl.8.6

### 14.1 Annual Management Review

`SUPER_ADMIN` must conduct an annual management review covering:
- Number of certifications issued, renewed, suspended, and revoked by scheme
- Appeal outcomes and SLA compliance rate
- Complaint resolution times
- COI declarations and separation-of-duty violations
- Audit log anomalies flagged by the `AUDITOR` role
- Non-conformities and corrective actions (`NonConformity`, `CorrectiveAction` records)

Evidence of the review (minutes, action items) must be stored as `Document` records of type `report` and retained for 3 years.

### 14.2 Code-Change Review

Any pull request affecting:
- Examination flow (attempt creation, submission, grading)
- Certification decision logic
- Certificate issuance or revocation
- Appeals or complaints processing
- Audit log writing
- Data retention logic

requires a review comment confirming the relevant SOP section has been re-read and the change does not breach any ISO 17024 requirement. This review is separate from the general code review.

### 14.3 SOP Review

This document is reviewed annually by `SUPER_ADMIN` and `CERTIFICATION_OFFICER`. Substantive changes require sign-off from both roles and a corresponding audit log entry with action `SOP_UPDATED`.
