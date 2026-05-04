// ─── User Roles ───────────────────────────────────────────────────────────────
export const USER_ROLES = {
  SUPER_ADMIN: "SUPER_ADMIN",
  CERTIFICATION_OFFICER: "CERTIFICATION_OFFICER",
  EXAMINER: "EXAMINER",
  TRAINER: "TRAINER",
  PROCTOR: "PROCTOR",
  AUDITOR: "AUDITOR",
  ORG_MANAGER: "ORG_MANAGER",
  CANDIDATE: "CANDIDATE",
} as const;

export type UserRole = (typeof USER_ROLES)[keyof typeof USER_ROLES];

// Roles that MUST have MFA enabled (ISO 27001 A.8.3)
export const MFA_REQUIRED_ROLES: UserRole[] = [
  USER_ROLES.SUPER_ADMIN,
  USER_ROLES.CERTIFICATION_OFFICER,
  USER_ROLES.EXAMINER,
  USER_ROLES.PROCTOR,
  USER_ROLES.AUDITOR,
];

// Staff roles (not candidates)
export const STAFF_ROLES: UserRole[] = [
  USER_ROLES.SUPER_ADMIN,
  USER_ROLES.CERTIFICATION_OFFICER,
  USER_ROLES.EXAMINER,
  USER_ROLES.TRAINER,
  USER_ROLES.PROCTOR,
  USER_ROLES.AUDITOR,
  USER_ROLES.ORG_MANAGER,
];

// ─── Account Statuses ─────────────────────────────────────────────────────────
export const ACCOUNT_STATUS = {
  ACTIVE: "ACTIVE",
  INACTIVE: "INACTIVE",
  SUSPENDED: "SUSPENDED",
  PENDING_VERIFICATION: "PENDING_VERIFICATION",
} as const;

// ─── Certificate Statuses ─────────────────────────────────────────────────────
export const CERTIFICATE_STATUS = {
  ACTIVE: "ACTIVE",
  EXPIRED: "EXPIRED",
  SUSPENDED: "SUSPENDED",
  REVOKED: "REVOKED",
  LAPSED: "LAPSED",
} as const;

// ─── Exam Statuses ────────────────────────────────────────────────────────────
export const EXAM_STATUS = {
  SCHEDULED: "SCHEDULED",
  IN_PROGRESS: "IN_PROGRESS",
  COMPLETED: "COMPLETED",
  CANCELLED: "CANCELLED",
  VOIDED: "VOIDED",
} as const;

// ─── Certification Decision ───────────────────────────────────────────────────
export const CERTIFICATION_DECISION = {
  APPROVED: "approved",
  REJECTED: "rejected",
  REFERRED: "referred",
} as const;

// ─── ISO 17024 Separation of Duties ──────────────────────────────────────────
// These pairs CANNOT perform both actions for the same candidate
export const DUTY_SEPARATIONS = [
  { action1: "TRAINER", action2: "EXAMINER" },
  { action1: "EXAMINER", action2: "CERTIFICATION_OFFICER" },
  { action1: "TRAINER", action2: "CERTIFICATION_OFFICER" },
] as const;

// ─── Consent Purposes (GDPR) ──────────────────────────────────────────────────
export const CONSENT_PURPOSE = {
  MARKETING: "MARKETING",
  DIRECTORY_LISTING: "DIRECTORY_LISTING",
  RESEARCH: "RESEARCH",
  CPD_TRACKING: "CPD_TRACKING",
  THIRD_PARTY_SHARING: "THIRD_PARTY_SHARING",
} as const;

// ─── Data Retention Periods (days) ───────────────────────────────────────────
export const RETENTION_DAYS = {
  CERTIFICATION_RECORDS: 365 * 7,   // 7 years
  EXAM_RECORDS: 365 * 3,             // 3 years
  PROCTORING_RECORDINGS: 180,        // 6 months
  CANDIDATE_PII: 365 * 3,            // 3 years inactive
  AUDIT_LOGS_HOT: 90,
  AUDIT_LOGS_COLD: 365 * 3,
  CPD_RECORDS: 365 * 2,              // 2 years post-lapse
  APPEALS: 365 * 3,
  PAYMENT_RECORDS: 365 * 7,
} as const;

// ─── Certificate Number Format ────────────────────────────────────────────────
export const CERT_NUMBER_PREFIX = "TG";

// ─── Security Settings ───────────────────────────────────────────────────────
export const SECURITY = {
  MAX_LOGIN_ATTEMPTS: 5,
  LOCKOUT_MINS: 15,
  SESSION_TIMEOUT_MINS: 30,
  PASSWORD_MIN_LENGTH: 12,
  TOTP_WINDOW: 1, // allow 1 step either side
} as const;

// ─── Notification Types ───────────────────────────────────────────────────────
export const NOTIFICATION_TYPE = {
  EXAM_REMINDER: "EXAM_REMINDER",
  CERTIFICATE_EXPIRY: "CERTIFICATE_EXPIRY",
  ENROLMENT_CONFIRMATION: "ENROLMENT_CONFIRMATION",
  PAYMENT_CONFIRMATION: "PAYMENT_CONFIRMATION",
  APPEAL_UPDATE: "APPEAL_UPDATE",
  COMPLAINT_UPDATE: "COMPLAINT_UPDATE",
  CPD_REMINDER: "CPD_REMINDER",
  SYSTEM_ALERT: "SYSTEM_ALERT",
  RENEWAL_REMINDER: "RENEWAL_REMINDER",
} as const;

// ─── Renewal Warning Periods (days before expiry) ────────────────────────────
export const RENEWAL_WARNINGS_DAYS = [180, 90, 30] as const;

// ─── Appeal/Complaint SLA (days) ─────────────────────────────────────────────
export const APPEAL_SLA_DAYS = 28;
export const COMPLAINT_ACK_DAYS = 2;
