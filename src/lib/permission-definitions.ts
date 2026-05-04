// Central catalogue of every platform permission.
// Used by both the seed script and the hasPermission() helper.

export type PermissionDef = {
  resource: string;
  action: string;
  label: string;
  description: string;
  category: string;
};

export const PERMISSIONS: PermissionDef[] = [
  // ── Learning ──────────────────────────────────────────────────────────────
  { resource: "courses", action: "read",    label: "View Courses",              description: "Browse and view published course content",                    category: "Learning" },
  { resource: "courses", action: "create",  label: "Create Courses",            description: "Create new courses and draft content",                       category: "Learning" },
  { resource: "courses", action: "update",  label: "Edit Courses",              description: "Edit course details, modules, and lessons",                  category: "Learning" },
  { resource: "courses", action: "delete",  label: "Delete Courses",            description: "Permanently delete courses",                                 category: "Learning" },
  { resource: "courses", action: "publish", label: "Publish / Unpublish Courses", description: "Change course status between Draft and Published",          category: "Learning" },
  { resource: "scorm",   action: "read",    label: "View SCORM Packages",       description: "View uploaded SCORM packages",                               category: "Learning" },
  { resource: "scorm",   action: "manage",  label: "Manage SCORM Packages",     description: "Upload, edit, and delete SCORM packages",                    category: "Learning" },

  // ── Exams ─────────────────────────────────────────────────────────────────
  { resource: "exams", action: "read",    label: "View Exam Papers",            description: "View exam papers, sections, and questions",                  category: "Exams" },
  { resource: "exams", action: "create",  label: "Create Exam Papers",          description: "Create new exam papers and sections",                        category: "Exams" },
  { resource: "exams", action: "update",  label: "Edit Exam Papers",            description: "Edit questions, scoring, and pass marks",                    category: "Exams" },
  { resource: "exams", action: "delete",  label: "Delete Exam Papers",          description: "Permanently delete exam papers",                             category: "Exams" },
  { resource: "exams", action: "take",    label: "Sit Exams",                   description: "Start and submit exam attempts as a candidate",              category: "Exams" },
  { resource: "exams", action: "grade",   label: "Grade Exam Responses",        description: "Review and grade candidate exam responses",                  category: "Exams" },
  { resource: "exams", action: "proctor", label: "Proctor Exam Sessions",       description: "Monitor live exam sessions and log incidents",               category: "Exams" },

  // ── Certification ─────────────────────────────────────────────────────────
  { resource: "certifications", action: "read",   label: "View Certificates",          description: "View issued certificates and their status",             category: "Certification" },
  { resource: "certifications", action: "issue",  label: "Issue Certificates",         description: "Generate and issue certificates to candidates",         category: "Certification" },
  { resource: "certifications", action: "revoke", label: "Revoke Certificates",        description: "Suspend or revoke an active certificate",              category: "Certification" },
  { resource: "decisions",      action: "read",   label: "View Certification Decisions", description: "View certification outcome decisions",               category: "Certification" },
  { resource: "decisions",      action: "manage", label: "Make Certification Decisions", description: "Record pass/fail decisions for certification",        category: "Certification" },

  // ── Enrolments ────────────────────────────────────────────────────────────
  { resource: "enrolments", action: "read",   label: "View Enrolments",         description: "View enrolment records across the platform",                 category: "Enrolments" },
  { resource: "enrolments", action: "create", label: "Enrol in Courses",        description: "Self-enrol in available courses",                            category: "Enrolments" },
  { resource: "enrolments", action: "manage", label: "Manage All Enrolments",   description: "Bulk-enrol, cancel, and manage any enrolment",              category: "Enrolments" },

  // ── Organisations ─────────────────────────────────────────────────────────
  { resource: "organisations", action: "read",    label: "View Organisations",        description: "View organisation profiles and details",                category: "Organisations" },
  { resource: "organisations", action: "create",  label: "Create Organisations",      description: "Register new client organisations",                     category: "Organisations" },
  { resource: "organisations", action: "update",  label: "Edit Organisations",        description: "Edit organisation details and settings",                category: "Organisations" },
  { resource: "organisations", action: "verify",  label: "Verify Organisations",      description: "Approve or reject organisation verification requests",  category: "Organisations" },
  { resource: "organisations", action: "members", label: "Manage Org Members",        description: "Add, remove, and manage members within an organisation", category: "Organisations" },

  // ── Appeals ───────────────────────────────────────────────────────────────
  { resource: "appeals", action: "read",   label: "View Appeals",              description: "View all appeal submissions and their status",               category: "Appeals" },
  { resource: "appeals", action: "submit", label: "Submit Appeals",            description: "Submit a new appeal or complaint as a candidate",            category: "Appeals" },
  { resource: "appeals", action: "manage", label: "Manage / Resolve Appeals",  description: "Review, update, and resolve appeal cases",                  category: "Appeals" },

  // ── CPD ───────────────────────────────────────────────────────────────────
  { resource: "cpd", action: "read",   label: "View CPD Records",            description: "View continuing professional development logs",               category: "CPD" },
  { resource: "cpd", action: "manage", label: "Manage CPD Records",          description: "Create, edit, and verify CPD activity records",              category: "CPD" },

  // ── Documents ─────────────────────────────────────────────────────────────
  { resource: "documents", action: "read",   label: "View Documents",          description: "Access the document library",                                category: "Documents" },
  { resource: "documents", action: "manage", label: "Manage Documents",        description: "Upload, edit, and archive documents",                       category: "Documents" },

  // ── Compliance & Audit ────────────────────────────────────────────────────
  { resource: "compliance", action: "read", label: "View ISO 17024 Status",   description: "View the platform's ISO 17024 compliance dashboard",         category: "Compliance & Audit" },
  { resource: "audit",      action: "read", label: "View Audit Log",           description: "Read the immutable platform audit trail",                    category: "Compliance & Audit" },
  { resource: "reports",    action: "read", label: "View Reports",             description: "Access platform-wide analytics and reports",                 category: "Compliance & Audit" },

  // ── Users & Staff ─────────────────────────────────────────────────────────
  { resource: "users", action: "read",    label: "View Users",                description: "View user profiles and account information",                 category: "Users & Staff" },
  { resource: "users", action: "create",  label: "Create Users",              description: "Create new platform user accounts",                          category: "Users & Staff" },
  { resource: "users", action: "update",  label: "Edit Users",                description: "Edit user profile details and settings",                     category: "Users & Staff" },
  { resource: "users", action: "suspend", label: "Suspend / Reactivate Users", description: "Suspend or reactivate user accounts",                       category: "Users & Staff" },
  { resource: "staff", action: "manage",  label: "Manage Staff Accounts",     description: "Create and manage staff (non-candidate) accounts",           category: "Users & Staff" },

  // ── Platform (SUPER_ADMIN) ────────────────────────────────────────────────
  { resource: "payments",    action: "read",   label: "View Payments",         description: "View all payment transactions on the platform",              category: "Platform" },
  { resource: "payments",    action: "manage", label: "Manage Payments",       description: "Process refunds and manage payment records",                 category: "Platform" },
  { resource: "settings",    action: "manage", label: "Platform Settings",     description: "Configure global platform settings",                        category: "Platform" },
  { resource: "permissions", action: "manage", label: "Manage Roles & Permissions", description: "Create roles and assign permissions across the platform", category: "Platform" },
  { resource: "files",       action: "upload", label: "Upload Files",          description: "Upload files such as avatars and documents",                category: "Platform" },
];

// Which permissions each system role gets by default.
// Keys match the user.role string values.
export const SYSTEM_ROLE_PERMISSIONS: Record<string, Array<[string, string]>> = {
  SUPER_ADMIN: PERMISSIONS.map((p) => [p.resource, p.action]),

  CERTIFICATION_OFFICER: [
    ["courses",       "read"],
    ["courses",       "update"],
    ["courses",       "publish"],
    ["scorm",         "read"],
    ["exams",         "read"],
    ["exams",         "create"],
    ["exams",         "update"],
    ["exams",         "delete"],
    ["exams",         "grade"],
    ["certifications","read"],
    ["certifications","issue"],
    ["certifications","revoke"],
    ["decisions",     "read"],
    ["decisions",     "manage"],
    ["enrolments",    "read"],
    ["enrolments",    "manage"],
    ["organisations", "read"],
    ["organisations", "verify"],
    ["appeals",       "read"],
    ["appeals",       "manage"],
    ["cpd",           "read"],
    ["cpd",           "manage"],
    ["documents",     "read"],
    ["documents",     "manage"],
    ["compliance",    "read"],
    ["audit",         "read"],
    ["reports",       "read"],
    ["users",         "read"],
    ["files",         "upload"],
  ],

  EXAMINER: [
    ["courses", "read"],
    ["exams",   "read"],
    ["exams",   "create"],
    ["exams",   "update"],
    ["exams",   "delete"],
    ["exams",   "grade"],
    ["documents","read"],
    ["files",   "upload"],
  ],

  TRAINER: [
    ["courses",   "read"],
    ["courses",   "create"],
    ["courses",   "update"],
    ["courses",   "publish"],
    ["scorm",     "read"],
    ["scorm",     "manage"],
    ["enrolments","read"],
    ["documents", "read"],
    ["documents", "manage"],
    ["files",     "upload"],
  ],

  PROCTOR: [
    ["exams",  "read"],
    ["exams",  "proctor"],
    ["users",  "read"],
    ["files",  "upload"],
  ],

  AUDITOR: [
    ["certifications","read"],
    ["compliance",    "read"],
    ["audit",         "read"],
    ["reports",       "read"],
    ["documents",     "read"],
    ["documents",     "manage"],
    ["users",         "read"],
  ],

  ORG_MANAGER: [
    ["organisations", "read"],
    ["organisations", "members"],
    ["enrolments",    "read"],
    ["enrolments",    "create"],
    ["enrolments",    "manage"],
    ["courses",       "read"],
    ["users",         "read"],
    ["cpd",           "read"],
    ["appeals",       "read"],
    ["appeals",       "submit"],
    ["files",         "upload"],
  ],

  CANDIDATE: [
    ["courses",       "read"],
    ["exams",         "take"],
    ["certifications","read"],
    ["enrolments",    "create"],
    ["appeals",       "submit"],
    ["cpd",           "read"],
    ["cpd",           "manage"],
    ["files",         "upload"],
  ],
};
