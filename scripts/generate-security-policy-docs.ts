// Generates and registers the real Tier 5 "Security & Scale" policy
// documents in the Document Library — the same Document/DocumentVersion
// pattern already proven with the AI-Assisted Proctoring policy. Re-runnable:
// each document is looked up by title and, if it already exists, gets a NEW
// version registered and approved (superseding the old one) rather than a
// duplicate Document.
//
// Usage: npx ts-node --project tsconfig.seed.json scripts/generate-security-policy-docs.ts
import { db, buildPolicyPdf, upsertPolicyDocument, type Section } from "./policy-doc-lib";

const SECURITY_TESTING_POLICY: Section[] = [
  {
    heading: "1. Purpose and scope",
    body: [
      "This policy establishes Truemark Global's security-testing program for the CLMEP certification platform:",
      "continuous automated scanning, a recurring internal review cadence, load/resilience testing, and the honest",
      "boundary of what an internal, engineering-run program can and cannot substitute for.",
    ],
  },
  {
    heading: "2. Continuous automated scanning (real, running today)",
    body: [
      "Two automated layers run on every change, not on a schedule someone has to remember:",
      "  - Dependabot (.github/dependabot.yml): weekly scans of npm dependencies and GitHub Actions, opening pull",
      "    requests for vulnerable/outdated packages automatically, grouped by minor/patch to reduce noise.",
      "  - `npm audit` in CI (.github/workflows/ci.yml): runs on every pull request and push to main, reporting",
      "    high/critical advisories in production dependencies. Currently configured as reporting-only",
      "    (continue-on-error), not a hard merge gate -- see the baseline finding in the first Security Review",
      "    log entry for why, and the remediation plan to change that.",
    ],
  },
  {
    heading: "3. Quarterly internal review cadence (enforced by the system, not memory)",
    body: [
      "A scheduled job (src/inngest/functions/securityReviewCadence.ts) checks daily whether the latest entry in",
      "the Security Review & Vulnerability Management Log is more than 100 days old. If so, every Super Admin gets",
      "a real in-app notification until a new review is logged. This is what makes the cadence 'regular, not a",
      "one-time review' -- the reminder does not depend on anyone remembering to check a calendar.",
    ],
  },
  {
    heading: "4. Third-party penetration testing (explicit, honest scope boundary)",
    body: [
      "A genuine penetration test -- an authorized, live adversarial engagement against a running system, performed",
      "by a contracted specialist firm with its own tooling and methodology -- is deliberately out of scope for this",
      "engineering program to perform or claim. The automated scanning and internal review described above are real,",
      "ongoing security testing; they are not a substitute for that engagement, and this document does not claim",
      "otherwise. Truemark Global's own management should procure a third-party penetration test on at least an",
      "annual cadence, and after any major architecture change (e.g. a new authentication method, a new externally-",
      "reachable service). The findings in this policy and the Security Review log are the right starting brief",
      "for that engagement.",
    ],
  },
  {
    heading: "5. Load and resilience testing",
    body: [
      "Exam-day traffic (concurrent proctored sittings) is the platform's real stress pattern, distinct from ordinary",
      "browsing load. Load tests against this pattern are run and reported as dated entries in the Document Library",
      "(type: report, e.g. 'Exam-Day Load Test Report') -- see the Compliance dashboard for the most recent date.",
    ],
  },
  {
    heading: "6. Review cycle for this policy",
    body: [
      "This policy is reviewed whenever the scanning tools, cadence thresholds, or testing scope change, and at",
      "minimum annually, alongside the Security Review log.",
    ],
  },
];

const INCIDENT_RESPONSE_PLAN: Section[] = [
  {
    heading: "1. Purpose and scope",
    body: [
      "This plan governs Truemark Global's response to security and availability incidents affecting the CLMEP",
      "platform, with particular attention to incidents during a live proctored exam window, where impact on",
      "candidates is immediate and time-sensitive.",
    ],
  },
  {
    heading: "2. Severity classification",
    body: [
      "  Sev1 (Critical): platform-wide outage, or any confirmed unauthorized access to personal or exam data,",
      "  during or immediately before a scheduled exam window. Immediate response required.",
      "  Sev2 (High): a core feature is degraded or unavailable (exam submission, proctoring, certificate issuance,",
      "  login) but the platform is otherwise reachable. Response target: acknowledge within 15 minutes.",
      "  Sev3 (Moderate): a non-core feature is broken or degraded (reports, document library, notifications) with",
      "  a viable workaround. Response target: same business day.",
      "  Sev4 (Low): cosmetic or edge-case issues with no candidate impact. Scheduled into normal work.",
    ],
  },
  {
    heading: "3. Detection sources",
    body: [
      "  - Sentry error capture (sentry.server.config.ts / sentry.client.config.ts) -- real-time exception alerts.",
      "  - /api/health and the public /status page -- live checks of database, storage, rate-limiting/Redis, and",
      "    background-job configuration.",
      "  - A spike in HIGH-severity proctoring incidents or exam-attempt voids -- may indicate a platform issue",
      "    rather than candidate misconduct, and should be checked before being treated as the latter.",
      "  - The existing BreachIncident intake, for suspected personal-data breaches specifically (see section 5).",
      "  - Direct reports from candidates, staff, or organisation managers.",
    ],
  },
  {
    heading: "4. Roles and escalation",
    body: [
      "The on-duty Super Admin acts as Incident Commander: owns the response, the status-page update, and the",
      "final all-clear. A Certification Officer is looped in for any incident with a compliance or candidate-",
      "fairness dimension (e.g. a voided exam attempt caused by a platform bug, not candidate behaviour -- see the",
      "existing attempt-reinstatement path for the remedy). Engineering support is whoever built or last touched",
      "the affected area, identified via the audit log or version-control history.",
    ],
  },
  {
    heading: "5. Personal-data breaches follow the existing GDPR path, unchanged",
    body: [
      "A suspected breach of personal data is NOT handled ad hoc under this plan -- it is logged as a BreachIncident",
      "immediately, which starts the already-implemented Art. 33 clock: a 48-hour reminder",
      "(src/inngest/functions/breachReminder.ts) if the 72-hour supervisory-authority notification deadline has not",
      "yet been met. This incident-response plan governs availability/security incidents generally; it does not",
      "replace or duplicate that specific, already-proven GDPR mechanism.",
    ],
  },
  {
    heading: "6. Response process",
    body: [
      "  1. Detect -- via any source in section 3.",
      "  2. Triage -- classify severity per section 2 within the response-target window.",
      "  3. Contain -- stop active harm first (e.g. disable a broken feature flag, roll back a bad deploy) before",
      "     full root-cause analysis.",
      "  4. Communicate -- for Sev1/Sev2, post a status-page incident within the containment step, not after.",
      "     Update it at least hourly until resolved, even if the update is 'still investigating.'",
      "  5. Resolve -- confirm the fix in production, not just in a local/preview environment.",
      "  6. Post-incident review -- required for every Sev1 and Sev2. Logged as a NonConformity with a linked",
      "     CorrectiveAction (the existing ISO 9001 Cl.8.7/Cl.10.2 models already used elsewhere in this platform),",
      "     not a new, separate incident-tracking system.",
    ],
  },
  {
    heading: "7. Candidate communication -- example template (Sev1/Sev2 during an exam window)",
    body: [
      "'We are aware of an issue affecting [exam submission / proctoring / login] and are actively working on it.",
      "If you are mid-exam, do not close your browser -- your progress up to this point is saved. We will update",
      "this page as soon as we have more information. If your exam session times out due to this issue, contact",
      "support and it will be excluded from your attempt count.'",
    ],
  },
  {
    heading: "8. Review cycle",
    body: [
      "This plan is reviewed after every Sev1/Sev2 incident it is actually used for, and at minimum annually.",
    ],
  },
];

async function main() {
  const approver = await db.user.findFirst({ where: { role: "SUPER_ADMIN", status: "ACTIVE" }, select: { id: true } });
  if (!approver) throw new Error("No active SUPER_ADMIN found to approve these documents as");

  console.log("Generating and registering Tier 5 security policy documents...\n");

  const policyPdf = await buildPolicyPdf(
    "Security Testing & Vulnerability Management Policy",
    "Truemark Global Standards and Solutions Limited — ISO 27001 A.5.36/A.8.8 compliance deliverable",
    SECURITY_TESTING_POLICY,
  );
  await upsertPolicyDocument({
    title: "Security Testing & Vulnerability Management Policy",
    type: "policy",
    description: "Governs continuous dependency scanning, the quarterly internal review cadence, load/resilience testing, and the honest scope boundary around third-party penetration testing.",
    pdfBytes: policyPdf,
    keyPrefix: "security-testing-policy",
    changeNotes: "Initial release, establishing the Tier 5 Security & Scale testing program.",
    approverId: approver.id,
  });

  const irPdf = await buildPolicyPdf(
    "Security Incident Response Plan",
    "Truemark Global Standards and Solutions Limited — availability & security incident response",
    INCIDENT_RESPONSE_PLAN,
  );
  await upsertPolicyDocument({
    title: "Security Incident Response Plan",
    type: "policy",
    description: "Severity classification, detection sources, roles, response process, and candidate communication for security and availability incidents, with the GDPR breach path kept as its own unchanged mechanism.",
    pdfBytes: irPdf,
    keyPrefix: "incident-response-plan",
    changeNotes: "Initial release.",
    approverId: approver.id,
  });

  console.log("\nDone. The Security Review & Vulnerability Management Log's first entry is generated separately");
  console.log("(scripts/security-review-2026-09.ts) — it depends on real npm audit + code review findings.");

  await db.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
