# Data Protection Impact Assessment (DPIA)
**Organisation:** Truemark Global  
**System:** Certification and Learning Management & Examination Platform (CLMEP)  
**Legal framework:** GDPR (EU) 2016/679 · Nigeria Data Protection Regulation (NDPR) 2019  
**Trigger:** Article 35 GDPR — systematic processing of personal data for large-scale professional assessment  
**Document status:** Controlled  
**Review cycle:** Annual, or upon material change to data flows, third-party processors, or processing purposes

---

## Table of Contents

1. [Overview and Context](#1-overview-and-context)
2. [Data Flows and Processing Activities](#2-data-flows-and-processing-activities)
3. [Legal Basis for Each Processing Activity](#3-legal-basis-for-each-processing-activity)
4. [Necessity and Proportionality](#4-necessity-and-proportionality)
5. [Risk Assessment](#5-risk-assessment)
6. [Technical and Organisational Measures](#6-technical-and-organisational-measures)
7. [Third-Party Processors and Sub-processors](#7-third-party-processors-and-sub-processors)
8. [Data Subject Rights](#8-data-subject-rights)
9. [Residual Risks and Accepted Risk Register](#9-residual-risks-and-accepted-risk-register)
10. [DPO Consultation and Sign-off](#10-dpo-consultation-and-sign-off)

---

## 1. Overview and Context

### 1.1 Purpose of Processing

Truemark Global operates the CLMEP to:

1. Register and manage candidates seeking professional certification under ISO/IEC 17024:2012
2. Deliver and administer online examinations, including proctored sittings
3. Issue, maintain, and publicly verify personnel certificates
4. Track continuing professional development (CPD) for certificants
5. Manage appeals and complaints relating to certification decisions
6. Comply with GDPR/NDPR obligations including consent management, data subject requests, and breach notification

### 1.2 Why a DPIA Is Required

A DPIA is required under GDPR Art. 35 because the platform:
- Processes special-category-adjacent data (professional competence assessments that may affect employability)
- Conducts systematic evaluation of natural persons (examination results, certification decisions)
- Involves large-scale processing of personal data (all candidates for Truemark certification schemes)
- Includes automated proctoring (behavioural monitoring during examinations)

### 1.3 Scope

This DPIA covers all personal data processed by the CLMEP, including data held in:
- The Neon PostgreSQL database (primary data store)
- Private file storage (signatures, uploaded documents) — local `private-uploads/` directory or AWS S3
- Inngest background job queues
- Third-party processors listed in Section 7

---

## 2. Data Flows and Processing Activities

### 2.1 Data Categories and Sources

| Category | Fields | Source | Subjects |
|---|---|---|---|
| Identity | `firstName`, `lastName`, `email`, `photoUrl` | Candidate self-registration or OAuth | Candidates, Staff |
| Authentication | `passwordHash` (bcrypt, cost 12), `mfaSecret` (TOTP), `failedLoginCount`, `lockedUntil` | System-generated | All users |
| Professional profile | `professionalTitle`, `employer`, `country`, `linkedinUrl`, `registrationType` | Candidate self-declaration | Candidates |
| Contact | `phone` | Candidate self-declaration | Candidates, Staff |
| Organisational affiliation | `Organisation`, `OrganisationMember` | ORG_MANAGER data entry | Candidates |
| Examination data | `ExamAttempt`, `ExamResponse`, `ExamGrade` | Candidate examination; Examiner marking | Candidates, Examiners |
| Proctoring data | `ProctoringSession`, `ProctoringIncident`, video recordings (external) | Automated and proctor-logged | Candidates |
| Certification records | `Certificate`, `CertificationDecision`, `CertificateRenewal`, `CertificationScheme` | System-generated on certification decision | Candidates |
| CPD records | `CPDRecord` (title, hours, provider, evidence URL) | Candidate self-declaration | Candidates |
| Payment data | `Purchase` (amount, currency, reference); no card data held | Paystack callback | Candidates |
| Consent records | `ConsentRecord` (purpose, granted, grantedAt, withdrawnAt) | Candidate preference | Candidates |
| Audit trail | `AuditLog` (userId, action, entityType, entityId, metadata, contentHash) | System-generated | All users |
| Appeal/Complaint data | `Appeal`, `Complaint` (description, evidence URLs, resolution) | Candidate submission | Candidates |
| Data subject requests | `DataSubjectRequest` (type, status, dueAt) | Candidate submission | Candidates |
| Breach incident records | `BreachIncident` (title, severity, affectedUsers, dataTypesAffected) | Staff-logged | Staff |
| Session tokens | JWT, stored in HTTP-only cookie | NextAuth | All users |
| Signatures | Director signature image; candidate signature image | Staff/candidate upload | Staff, Candidates |

### 2.2 Data Flow Diagram (Narrative)

```
Candidate ──► [Registration/OAuth] ──► User + CandidateProfile (DB)
     │
     ├──► [Course Enrolment + Payment] ──► Purchase + Enrolment (DB)
     │                                           │
     │                              Paystack ────┘ (callback only; no card data retained)
     │
     ├──► [Examination] ──► ExamAttempt + ExamResponse (DB)
     │         │
     │    [Proctoring] ──► ProctoringSession + Incidents (DB) + recordings (external)
     │
     ├──► [Marking (blind)] ──► ExamGrade (DB, examiner cannot see candidate identity)
     │
     ├──► [Certification Decision] ──► CertificationDecision + Certificate (DB)
     │                                       │
     │                              [Public Verification] ──► /verify/[certNumber] (no login)
     │
     ├──► [CPD Logging] ──► CPDRecord (DB)
     │
     ├──► [Expiry Warnings] ──► Email (via configured email provider) ◄── Inngest cron
     │
     └──► [DSR / Erasure] ──► DataSubjectRequest ──► Manual fulfilment by CERTIFICATION_OFFICER
```

---

## 3. Legal Basis for Each Processing Activity

| Processing activity | Legal basis | Notes |
|---|---|---|
| Account registration and authentication | Art. 6(1)(b) — performance of contract | Necessary to provide certification services |
| Professional profile | Art. 6(1)(b) — performance of contract | Required for eligibility verification |
| Examination delivery and marking | Art. 6(1)(b) — performance of contract | Core service delivery |
| Proctoring (behavioural monitoring) | Art. 6(1)(b) + candidate explicit consent at exam start | Candidates must consent before a proctored exam begins |
| Certification decision and certificate issuance | Art. 6(1)(b) + Art. 6(1)(c) — legal obligation under ISO 17024 | |
| Certificate public verification | Art. 6(1)(f) — legitimate interests of employers and the public | Proportionate: only name, scheme, and validity status are disclosed |
| CPD tracking | Art. 6(1)(b) — performance of contract where scheme requires CPD | |
| Payment processing | Art. 6(1)(b) — performance of contract | Card data not retained; only Paystack transaction reference |
| Audit logging | Art. 6(1)(c) — legal obligation (ISO 17024 Cl.8.3, NDPR) | Immutable; retained 3 years |
| Marketing emails (expiry warnings branded/promotional) | Art. 6(1)(a) — consent (`MARKETING` consent purpose) | Suppressed on withdrawal |
| Directory listing | Art. 6(1)(a) — consent (`DIRECTORY_LISTING` consent purpose) | Opt-in only |
| Research and analytics | Art. 6(1)(a) — consent (`RESEARCH` consent purpose) | Opt-in only |
| Third-party sharing | Art. 6(1)(a) — consent (`THIRD_PARTY_SHARING` consent purpose) | Not currently active |
| Appeals and complaints | Art. 6(1)(c) — legal obligation under ISO 17024 Cl.7.9/7.10 | |
| Breach incident recording | Art. 6(1)(c) — legal obligation (GDPR Art. 33/34) | |
| Error monitoring (Sentry) | Art. 6(1)(f) — legitimate interests (platform security and reliability) | Sentry data minimisation configured; no PII in breadcrumbs |

---

## 4. Necessity and Proportionality

### 4.1 Data Minimisation Assessment

| Data element | Collected? | Necessary? | Notes |
|---|---|---|---|
| `firstName`, `lastName` | Yes | Yes | Required for certificate, blind-marking anonymisation |
| `email` | Yes | Yes | Login, notifications |
| `passwordHash` | Yes | Yes | Bcrypt cost 12; plain-text never stored |
| `phone` | Yes | Optional | Candidate-supplied; nullable |
| `photoUrl` | Yes | Optional | Used on candidate dashboard and certificate |
| `linkedinUrl` | Yes | Optional | Professional profile; nullable |
| Card number / CVV | **No** | No | Never requested; Paystack handles PCI scope |
| IP address | No (rate limit only) | Minimal | Used only for rate limiting; not persisted to DB |
| Device fingerprint | No | No | Not collected |
| Proctoring video | External | Yes (where proctored) | Deleted at 180 days |

All `SELECT` queries in API handlers use explicit `select` clauses to prevent accidental over-fetching of personal data. The `CandidateProfile` is never returned as `profile: true` (implicit full select) — only named fields are projected.

### 4.2 Retention Proportionality

Retention periods (see `RETENTION_DAYS` in `src/lib/constants.ts`) are set to the minimum necessary for the stated purpose:

- Proctoring recordings (180 days) — sufficient for the appeal window (28 days + investigation time) with margin
- Candidate PII (3 years post-inactivity) — aligned with NDPR Article 2.1(1)(d)
- Certification records (7 years) — regulatory minimum for professional certification bodies in Nigeria

### 4.3 Access Controls

No staff role has unrestricted access to all personal data:
- `EXAMINER` cannot see candidate PII during marking (blind marking architecture)
- `TRAINER` cannot access exam papers, grades, or certification decisions
- `AUDITOR` has read-only access and cannot modify any record
- `ORG_MANAGER` can only see members of their own organisation

---

## 5. Risk Assessment

### 5.1 Risk Register

| # | Risk description | Likelihood | Impact | Pre-mitigation level | Mitigation | Post-mitigation level |
|---|---|---|---|---|---|---|
| R1 | Unauthorised access to candidate PII via compromised staff account | Medium | High | **High** | MFA enforced for all staff roles; account lockout after 5 failed attempts; 30-min session timeout | Medium |
| R2 | SQL injection or IDOR allowing cross-candidate data access | Low | Critical | **High** | Prisma ORM (parameterised queries); ownership checks on all candidate-scoped endpoints; IDOR guards on exam sections | Low |
| R3 | Enumeration of certificate holders via public verification endpoint | Medium | Medium | **Medium** | Rate limit: 30/min per IP; only name + scheme + validity returned | Low |
| R4 | Payment amount manipulation (pay less than required) | Low | High | **High** | Paystack amount verified server-side (kobo comparison); mismatches logged and flagged | Low |
| R5 | File upload containing malware (SCORM, documents, signatures) | Low | High | **High** | Magic byte validation; ZIP-slip protection; Inngest async malware scan | Low |
| R6 | Path traversal via crafted file paths | Low | High | **High** | `path.resolve()` + `startsWith(baseDir)` boundary check on all file reads; `private-uploads/` never served directly | Low |
| R7 | Breach of blind marking (examiner identifies candidate) | Low | High | **High** | Examiner API returns attempt ID only; no PII in marking interface | Low |
| R8 | Art. 33 GDPR notification window missed (72 hours) | Medium | High | **High** | `BreachIncident` creation notifies all SUPER_ADMIN immediately; `dpaDeadline` surfaced in UI; Inngest 48-hour reminder (see Section 9) | Low |
| R9 | Marketing email sent to opted-out candidate | Low | Medium | **Medium** | MARKETING consent checked per-candidate before every expiry email; batch-fetched (no N+1); suppressed on `withdrawnAt` | Low |
| R10 | OAuth user bypasses MFA enforcement | Low | High | **High** | JWT callback fetches `mfaEnabled` from DB for OAuth sign-ins; middleware enforces TOTP challenge regardless of sign-in method | Low |
| R11 | Forced password change bypassed via API | Low | High | **High** | Middleware intercepts all non-passthrough paths; API routes return 403 if `mustChangePassword=true` | Low |
| R12 | SCORM package uploaded to another trainer's course | Low | Medium | **Medium** | `lessonId` course ownership verified against uploader's `createdBy` for TRAINER role | Low |
| R13 | Proctoring data retained beyond 180 days | Low | Medium | **Medium** | Scheduled deletion job; retention period in constants and enforced by data disposal Inngest function | Low |
| R14 | Audit log tampered or deleted | Very Low | Critical | **High** | `AuditLog` has no DELETE endpoint; `contentHash` integrity verification; Prisma adapter logs DB-level changes | Very Low |

### 5.2 Likelihood and Impact Scale

- **Likelihood:** Very Low / Low / Medium / High
- **Impact:** Low / Medium / High / Critical
- **Risk level:** Low / Medium / High / Critical

---

## 6. Technical and Organisational Measures

### 6.1 Technical Measures

**Authentication and session security**
- Passwords: bcrypt, cost factor 12, minimum 12 characters with uppercase, digit, and special character requirements
- MFA: TOTP enforced for `SUPER_ADMIN`, `CERTIFICATION_OFFICER`, `EXAMINER`, `PROCTOR`, `AUDITOR`
- Session: JWT, 30-minute timeout, 5-minute rotation, HTTP-only cookie
- Account lockout: 5 failed attempts → 15-minute lockout; logged to audit trail
- OAuth: Google and Microsoft Entra ID; custom fields fetched from DB (not trusted from provider)

**Authorisation**
- Role-based access control enforced at every API endpoint
- Separation of duties: TRAINER ≠ EXAMINER ≠ CERTIFICATION_OFFICER enforced in code
- Ownership checks: every candidate-scoped resource verified against authenticated user
- IDOR protection: section/question IDs cross-checked against their parent exam paper

**Data in transit**
- TLS 1.2+ enforced at the load balancer / CDN layer (platform requirement for deployment)
- All API calls from client to server are over HTTPS; enforced by CSP and HSTS headers

**Data at rest**
- Database: Neon PostgreSQL with encryption at rest (AES-256, managed by Neon)
- File storage: `private-uploads/` served only through signed, authenticated API routes; never directly accessible via web path
- Passwords: bcrypt hash only; no reversible encryption

**Input validation**
- All API inputs validated with Zod schemas before processing
- File uploads validated by magic bytes (PNG, JPEG, PDF, WebP, ZIP) — MIME type and extension not trusted alone
- `permissionId` validated against the permission catalog before assignment
- Document type enum enforced on query params
- Array sizes bounded (e.g., notification ID arrays capped at 100 entries)

**Rate limiting**
- All authentication endpoints: rate-limited per user/IP
- Certificate verification: 30/min per IP
- Password change: 5/hour per user
- AI suggestion endpoint: 5/hour per user
- Backed by Upstash Redis sliding window

**Audit logging**
- Every material action logged to `AuditLog` with `contentHash` (SHA-256 of id + action + entity + metadata)
- Audit log entries are immutable — no API endpoint permits modification or deletion
- Covers: login, logout, failed login, account lockout, OAuth login, password change, certificate issuance/revocation, appeal decisions, breach incident creation, profile updates, payment events, SOP updates

**File security**
- Path traversal: `path.resolve()` + `startsWith(baseDir + sep)` boundary check on all file reads
- ZIP-slip: all SCORM zip entries validated before extraction
- SCORM launch URLs: sanitised against allowlisted character set; JavaScript and protocol-relative URLs rejected

### 6.2 Organisational Measures

- All staff with access to personal data are trained on GDPR/NDPR obligations before system access is granted
- Access is provisioned by `SUPER_ADMIN` on a need-to-know basis with a documented request
- Contractor and third-party staff sign a data processing agreement before access is granted
- This DPIA is reviewed annually and on any material change to data flows
- The ISO 17024 SOPs (see `docs/compliance/iso-17024-sops.md`) document operational procedures including blind marking and appeals finality
- A designated Data Protection Officer (DPO) is appointed and listed in Section 10

---

## 7. Third-Party Processors and Sub-processors

All processors are engaged under a Data Processing Agreement (DPA) before personal data is shared.

| Processor | Purpose | Data shared | Location | DPA in place? |
|---|---|---|---|---|
| **Neon Technologies** | PostgreSQL database hosting | All structured personal data | US (multi-region available) | Required before go-live |
| **Paystack** | Payment processing | Candidate name, email, amount, transaction reference | Nigeria / Ireland | Required before go-live |
| **AWS S3** (if `STORAGE_PROVIDER=s3`) | File storage for signatures and uploaded documents | Signature images, uploaded documents | Configurable region | Required before go-live |
| **Upstash** | Redis for rate limiting | Hashed user ID + endpoint key (no PII) | US-East-1 (default) | Required before go-live |
| **Inngest** | Background job orchestration | Job payloads (may contain user IDs, cert IDs) | US | Required before go-live |
| **Sentry** | Error monitoring | Stack traces, user IDs (no passwords or card data) | US | Required before go-live |
| **OpenAI / Anthropic** (AI question generation) | AI-assisted exam question generation | Exam section titles and descriptions (no candidate PII) | US | Required before go-live |
| **Email provider** (SMTP/SendGrid/etc.) | Transactional and notification email | Candidate name, email, certificate reference | Provider-dependent | Required before go-live |

**Instruction to DPO:** Confirm DPA status for each processor before the platform goes live. Sub-processor changes must be disclosed to data subjects with 30 days notice under standard GDPR controller-processor contracts.

---

## 8. Data Subject Rights

The platform implements the following rights. All requests are tracked via `DataSubjectRequest`.

| Right | GDPR Article | Platform implementation | SLA |
|---|---|---|---|
| Right of access | Art. 15 | `POST /api/gdpr/dsr` with `type: "access"` — `CERTIFICATION_OFFICER` exports the data package | 30 days |
| Right to erasure | Art. 17 | `POST /api/gdpr/dsr` with `type: "erasure"` — officer anonymises or deletes non-retained records | 30 days |
| Right to rectification | Art. 16 | `POST /api/gdpr/dsr` with `type: "rectification"` — candidate self-serves via profile; officer assists for certified fields | 30 days |
| Right to portability | Art. 20 | `POST /api/gdpr/dsr` with `type: "portability"` — JSON export of personal data and certificate records | 30 days |
| Right to restriction | Art. 18 | `POST /api/gdpr/dsr` with `type: "restriction"` — officer flags account as restricted; processing paused | 30 days |
| Right to withdraw consent | Art. 7(3) | `POST /api/gdpr/consent` — immediate; `ConsentRecord.withdrawnAt` set; marketing emails suppressed from next batch | Immediate |
| Right to object to marketing | Art. 21 | Same as consent withdrawal | Immediate |

**Erasure limitations:** Certification records, audit logs, payment records, and appeal records are subject to retention obligations (see Section 4.2) and cannot be erased before the retention period expires. Data subjects are informed of this limitation in the privacy notice.

### 8.1 Consent Management

Consent is granular — each purpose (`MARKETING`, `DIRECTORY_LISTING`, `RESEARCH`, `CPD_TRACKING`, `THIRD_PARTY_SHARING`) is recorded separately with a timestamp. Withdrawal of one consent does not affect others. The platform records the most recent consent state per (user, purpose) pair and applies it at the point of use.

Consent for email marketing is checked at the individual level immediately before sending each expiry warning, not at batch creation time. Candidates who withdraw consent between batch run and email dispatch will not receive the email.

---

## 9. Residual Risks and Accepted Risk Register

The following residual risks are accepted after mitigation. They are reviewed annually.

| Risk ref | Residual risk | Accepted by | Date | Next review |
|---|---|---|---|---|
| R8 | Inngest 48-hour Art. 33 breach reminder is implemented but requires correct Inngest cron configuration at deployment. A misconfigured deployment could miss the automated reminder. Manual fallback: DPO calendar reminder at breach logging. | DPO + SUPER_ADMIN | — | Annual |
| R13 | Proctoring recording deletion relies on an external proctoring system's own retention policy. If an external provider is used, their data processing agreement must specify 180-day deletion. | DPO | — | Annual |
| R14 | Audit log hash integrity is verified at read time but there is no continuous integrity monitoring. A compromised database administrator could modify entries before the hash is checked. Mitigated by Neon's access controls and the requirement for DBA access to go through `SUPER_ADMIN` approval. | SUPER_ADMIN | — | Annual |

---

## 10. DPO Consultation and Sign-off

This DPIA was prepared by the platform development team and submitted to the Data Protection Officer for review.

**DPO review checklist:**

- [ ] All processing activities are listed in Section 2
- [ ] Legal basis is identified for every activity in Section 3
- [ ] Third-party processors in Section 7 each have a signed DPA
- [ ] Data retention periods in Section 4.2 are confirmed as minimum necessary
- [ ] Risk mitigations in Section 6 are confirmed as implemented and tested
- [ ] Residual risks in Section 9 are reviewed and formally accepted
- [ ] Data subject rights procedures in Section 8 have been tested end-to-end
- [ ] This DPIA is stored in the repository and version-controlled

| Role | Name | Date | Signature |
|---|---|---|---|
| DPIA Author | | | |
| DPO | | | |
| SUPER_ADMIN (platform owner) | | | |

**Next scheduled review:** _(set to one year from sign-off date)_

---

*This document is version-controlled in the application repository. Changes are subject to code review and DPO approval. The git commit history provides a tamper-evident record of all amendments.*
