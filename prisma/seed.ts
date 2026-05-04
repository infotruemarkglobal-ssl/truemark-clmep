import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import bcrypt from "bcryptjs";
import "dotenv/config";
import { PERMISSIONS, SYSTEM_ROLE_PERMISSIONS } from "../src/lib/permission-definitions";

const adapter = new PrismaPg({
  connectionString: process.env.DIRECT_URL ?? process.env.DATABASE_URL ?? "",
});
const db = new PrismaClient({ adapter });

async function main() {
  // C10: Guard against running seed in production — demo data must never
  // be inserted into a live database.
  if (process.env.NODE_ENV === "production") {
    console.error("❌  Seed script refused to run in NODE_ENV=production.");
    process.exit(1);
  }

  console.log("🌱 Seeding database...");

  // C11: Use an environment variable for the demo password so the value is
  // never committed to source control. Fall back to a clearly-labelled
  // development-only default that satisfies the password complexity policy.
  const seedPassword = process.env.SEED_USER_PASSWORD ?? "DevSeed@2024!";
  const passwordHash = await bcrypt.hash(seedPassword, 12);

  // ── Users ─────────────────────────────────────────────────────────────────────
  const demoUsers = [
    { email: "candidate@demo.truemarkglobal.com", firstName: "John", lastName: "Doe", role: "CANDIDATE" },
    { email: "admin@demo.truemarkglobal.com", firstName: "Admin", lastName: "User", role: "SUPER_ADMIN" },
    { email: "orgmanager@demo.truemarkglobal.com", firstName: "Sarah", lastName: "Manager", role: "ORG_MANAGER" },
    { email: "certification@demo.truemarkglobal.com", firstName: "Claire", lastName: "Officer", role: "CERTIFICATION_OFFICER" },
    { email: "examiner@demo.truemarkglobal.com", firstName: "Evan", lastName: "Examiner", role: "EXAMINER" },
    { email: "trainer@demo.truemarkglobal.com", firstName: "Tara", lastName: "Trainer", role: "TRAINER" },
  ];

  const createdUsers: Record<string, string> = {};
  for (const u of demoUsers) {
    const user = await db.user.upsert({
      where: { email: u.email },
      update: {},
      create: { ...u, passwordHash, status: "ACTIVE", emailVerified: new Date() },
    });
    createdUsers[u.role] = user.id;
    console.log(`  ✓ ${u.role.padEnd(25)} ${u.email}`);
  }

  // ── Certification Schemes ─────────────────────────────────────────────────────
  const schemes = [
    { code: "ISO27001-LA", name: "ISO 27001 Lead Auditor", description: "Information security management systems lead auditor certification. Demonstrates ability to plan, implement, manage, and maintain an ISMS.", validityMonths: 36, cpdHoursRequired: 20, passMark: 70, maxAttempts: 3 },
    { code: "ISO9001-IA", name: "ISO 9001 Internal Auditor", description: "Quality management systems internal auditor certification. Recognises competence to conduct internal audits of a QMS.", validityMonths: 36, cpdHoursRequired: 15, passMark: 65, maxAttempts: 3 },
    { code: "ISO14001-IA", name: "ISO 14001 Environmental Auditor", description: "Environmental management systems auditor certification. Validates expertise in auditing environmental management systems.", validityMonths: 36, cpdHoursRequired: 15, passMark: 65, maxAttempts: 3 },
    { code: "ISO45001-LA", name: "ISO 45001 OH&S Lead Auditor", description: "Occupational health and safety management lead auditor certification. Leads OHSMS audit programmes.", validityMonths: 36, cpdHoursRequired: 20, passMark: 70, maxAttempts: 3 },
  ];

  const createdSchemes: Record<string, string> = {};
  for (const scheme of schemes) {
    const s = await db.certificationScheme.upsert({
      where: { code: scheme.code },
      update: {},
      create: scheme,
    });
    createdSchemes[scheme.code] = s.id;
    console.log(`  ✓ Scheme: ${scheme.code}`);
  }

  // ── Courses ───────────────────────────────────────────────────────────────────
  const courseData = [
    {
      schemeCode: "ISO27001-LA",
      title: "ISO 27001:2022 Lead Auditor Certification Programme",
      slug: "iso27001-lead-auditor",
      shortDescription: "Master information security management systems and lead ISMS audits to international standards.",
      description: `This comprehensive programme prepares candidates to plan, implement, manage, and continually improve an Information Security Management System (ISMS) based on ISO/IEC 27001:2022.

You will develop deep expertise in risk assessment methodologies, security controls (Annex A), audit planning and execution, and the ISO 17024 certification process.

Upon completion and successful examination, candidates are certified as ISO 27001 Lead Auditors, recognised internationally.`,
      price: 1200,
      currency: "NGN",
      cpdHours: 40,
      durationHours: 32,
      minProgressToExam: 80,
      modules: [
        {
          title: "Foundations of Information Security",
          lessons: [
            { title: "Introduction to ISO/IEC 27001:2022", contentType: "video", durationMins: 45, isPreview: true },
            { title: "Understanding the ISMS Framework", contentType: "video", durationMins: 60, isPreview: false },
            { title: "ISMS Scope and Context", contentType: "pdf", durationMins: 30, isPreview: false },
            { title: "Leadership and Commitment Requirements", contentType: "text", durationMins: 25, isPreview: false },
          ],
        },
        {
          title: "Risk Assessment & Treatment",
          lessons: [
            { title: "Information Security Risk Assessment", contentType: "video", durationMins: 55, isPreview: false },
            { title: "Risk Treatment Options and Controls", contentType: "video", durationMins: 50, isPreview: false },
            { title: "Statement of Applicability (SoA)", contentType: "pdf", durationMins: 35, isPreview: false },
            { title: "Risk Register Workshop", contentType: "scorm", durationMins: 45, isPreview: false },
          ],
        },
        {
          title: "Annex A Controls Deep Dive",
          lessons: [
            { title: "Organisational and People Controls (A.5-A.6)", contentType: "video", durationMins: 60, isPreview: false },
            { title: "Physical and Technological Controls (A.7-A.8)", contentType: "video", durationMins: 65, isPreview: false },
            { title: "Cryptography and Access Control", contentType: "text", durationMins: 40, isPreview: false },
          ],
        },
        {
          title: "Audit Planning and Execution",
          lessons: [
            { title: "Audit Programme Management", contentType: "video", durationMins: 50, isPreview: false },
            { title: "Audit Evidence and Sampling", contentType: "video", durationMins: 45, isPreview: false },
            { title: "Writing Non-Conformity Reports", contentType: "pdf", durationMins: 35, isPreview: false },
            { title: "Mock Audit Simulation", contentType: "scorm", durationMins: 90, isPreview: false },
          ],
        },
      ],
    },
    {
      schemeCode: "ISO9001-IA",
      title: "ISO 9001:2015 Quality Management Internal Auditor",
      slug: "iso9001-internal-auditor",
      shortDescription: "Develop the competence to plan and conduct effective internal audits of a Quality Management System.",
      description: `This programme equips participants with the knowledge and practical skills to conduct internal audits of a Quality Management System (QMS) in accordance with ISO 9001:2015 and ISO 19011:2018.

Topics include process approach, risk-based thinking, audit planning, checklist development, nonconformity reporting, and audit follow-up.`,
      price: 800,
      currency: "NGN",
      cpdHours: 24,
      durationHours: 20,
      minProgressToExam: 75,
      modules: [
        {
          title: "Quality Management Fundamentals",
          lessons: [
            { title: "ISO 9001:2015 Overview and Structure", contentType: "video", durationMins: 40, isPreview: true },
            { title: "Process Approach and Risk-Based Thinking", contentType: "video", durationMins: 50, isPreview: false },
            { title: "Documentation Requirements", contentType: "pdf", durationMins: 30, isPreview: false },
          ],
        },
        {
          title: "Planning and Conducting Audits",
          lessons: [
            { title: "Audit Planning and Preparation", contentType: "video", durationMins: 45, isPreview: false },
            { title: "Conducting Audit Activities", contentType: "video", durationMins: 50, isPreview: false },
            { title: "Audit Reporting and Follow-up", contentType: "pdf", durationMins: 35, isPreview: false },
            { title: "Practical Audit Exercise", contentType: "scorm", durationMins: 60, isPreview: false },
          ],
        },
      ],
    },
  ];

  const createdCourses: Record<string, string> = {};
  const trainerId = createdUsers["TRAINER"];

  for (const courseInfo of courseData) {
    const { modules: modulesData, schemeCode, ...courseFields } = courseInfo;
    const schemeId = createdSchemes[schemeCode];

    const existing = await db.course.findUnique({ where: { slug: courseFields.slug } });
    if (existing) {
      createdCourses[courseFields.slug] = existing.id;
      console.log(`  → Course exists: ${courseFields.title}`);
      continue;
    }

    const course = await db.course.create({
      data: {
        ...courseFields,
        schemeId,
        creatorId: trainerId,
        status: "PUBLISHED",
        publishedAt: new Date(),
      },
    });
    createdCourses[courseFields.slug] = course.id;

    for (let mi = 0; mi < modulesData.length; mi++) {
      const mod = modulesData[mi];
      const module = await db.courseModule.create({
        data: { courseId: course.id, title: mod.title, order: mi + 1 },
      });

      for (let li = 0; li < mod.lessons.length; li++) {
        await db.courseLesson.create({
          data: {
            moduleId: module.id,
            title: mod.lessons[li].title,
            contentType: mod.lessons[li].contentType,
            durationMins: mod.lessons[li].durationMins,
            isPreview: mod.lessons[li].isPreview,
            order: li + 1,
          },
        });
      }
    }
    console.log(`  ✓ Course: ${courseFields.title} (${modulesData.length} modules)`);
  }

  // ── Exam Papers ───────────────────────────────────────────────────────────────
  const examPapers = [
    {
      schemeCode: "ISO27001-LA",
      title: "ISO 27001 Lead Auditor — Certification Examination",
      durationMins: 120,
      passMark: 70,
      totalMarks: 100,
      sections: [
        {
          title: "Section A: ISMS Foundations",
          questions: [
            { text: "Which clause of ISO 27001:2022 requires the organisation to determine external and internal issues relevant to its purpose?", type: "mcq_single", marks: 2, options: [{ id: "a", text: "Clause 4.1", isCorrect: true }, { id: "b", text: "Clause 5.1", isCorrect: false }, { id: "c", text: "Clause 6.1", isCorrect: false }, { id: "d", text: "Clause 8.2", isCorrect: false }] },
            { text: "What does the Statement of Applicability (SoA) document?", type: "mcq_single", marks: 2, options: [{ id: "a", text: "All employees' security responsibilities", isCorrect: false }, { id: "b", text: "Selected Annex A controls and justification for inclusions/exclusions", isCorrect: true }, { id: "c", text: "The organisation's business continuity plan", isCorrect: false }, { id: "d", text: "A list of all identified information assets", isCorrect: false }] },
            { text: "ISO 27001 requires organisations to conduct information security risk assessments at planned intervals.", type: "true_false", marks: 1, options: [{ id: "true", text: "True", isCorrect: true }, { id: "false", text: "False", isCorrect: false }] },
            { text: "The minimum number of mandatory documented information items required by ISO 27001:2022 is ___.", type: "fill_blank", marks: 2, correctAnswer: "10", options: [] },
          ],
        },
        {
          title: "Section B: Audit Principles",
          questions: [
            { text: "According to ISO 19011, which of the following is NOT a principle of auditing?", type: "mcq_single", marks: 2, options: [{ id: "a", text: "Integrity", isCorrect: false }, { id: "b", text: "Confidentiality", isCorrect: false }, { id: "c", text: "Profitability", isCorrect: true }, { id: "d", text: "Fair presentation", isCorrect: false }] },
            { text: "An audit finding that identifies non-fulfilment of a requirement is classified as a:", type: "mcq_single", marks: 2, options: [{ id: "a", text: "Observation", isCorrect: false }, { id: "b", text: "Opportunity for improvement", isCorrect: false }, { id: "c", text: "Nonconformity", isCorrect: true }, { id: "d", text: "Audit objective", isCorrect: false }] },
            { text: "Opening meetings are mandatory at the start of every audit activity.", type: "true_false", marks: 1, options: [{ id: "true", text: "True", isCorrect: false }, { id: "false", text: "False", isCorrect: true }] },
            { text: "The Lead Auditor is responsible for ensuring that the audit is conducted ___.", type: "fill_blank", marks: 2, correctAnswer: "objectively", options: [] },
            { text: "Describe the key differences between a first-party, second-party, and third-party audit.", type: "essay", marks: 10, options: [] },
          ],
        },
      ],
    },
  ];

  const examinerUser = await db.user.findUnique({ where: { email: "examiner@demo.truemarkglobal.com" } });

  for (const epData of examPapers) {
    const { sections: sectionsData, schemeCode, ...epFields } = epData;
    const schemeId = createdSchemes[schemeCode];

    const existing = await db.examPaper.findFirst({ where: { title: epFields.title } });
    if (existing) {
      console.log(`  → Exam paper exists: ${epFields.title}`);
      continue;
    }

    const examPaper = await db.examPaper.create({
      data: {
        ...epFields,
        schemeId,
        creatorId: examinerUser!.id,
        isActive: true,
        randomiseQuestions: true,
        randomiseOptions: true,
      },
    });

    for (let si = 0; si < sectionsData.length; si++) {
      const section = await db.examSection.create({
        data: {
          examPaperId: examPaper.id,
          title: sectionsData[si].title,
          marks: sectionsData[si].questions.reduce((s, q) => s + q.marks, 0),
          order: si + 1,
        },
      });

      for (const q of sectionsData[si].questions) {
        const { options, ...qFields } = q;
        await db.examQuestion.create({
          data: {
            sectionId: section.id,
            ...qFields,
            options: options.length > 0 ? JSON.stringify(options) : null,
          },
        });
      }
    }

    console.log(`  ✓ Exam paper: ${epFields.title} (${sectionsData.length} sections)`);
  }

  // ── TrueMark Global Standards and Solutions Limited (platform owner org) ─────────────────────────────────────
  const superAdminId = createdUsers["SUPER_ADMIN"];

  let truemarkOrg = await db.organisation.findFirst({
    where: { isPlatformOwner: true },
  });

  if (!truemarkOrg) {
    truemarkOrg = await db.organisation.create({
      data: {
        name: "TrueMark Global Standards and Solutions Limited",
        registrationNo: "TM-PLATFORM-001",
        country: "Nigeria",
        address: "1 Certification Way, Victoria Island, Lagos",
        website: "https://truemarkglobal.com",
        description: "TrueMark Global Standards and Solutions Limited is the platform owner and certification body operating the CLMEP system under ISO/IEC 17024.",
        industry: "Certification & Professional Standards",
        verificationStatus: "VERIFIED",
        isActive: true,
        isPlatformOwner: true,
      },
    });
    console.log("  ✓ Platform owner org: TrueMark Global Standards and Solutions Limited");
  } else {
    console.log("  → Platform owner org already exists: TrueMark Global Standards and Solutions Limited");
  }

  // Link all SUPER_ADMIN users to TrueMark Global Standards and Solutions Limited
  if (superAdminId && truemarkOrg) {
    const existing = await db.organisationMember.findUnique({
      where: { userId_organisationId: { userId: superAdminId, organisationId: truemarkOrg.id } },
    });
    if (!existing) {
      await db.organisationMember.create({
        data: { userId: superAdminId, organisationId: truemarkOrg.id, role: "SUPER_ADMIN" },
      });
      console.log("  ✓ Linked SUPER_ADMIN to TrueMark Global Standards and Solutions Limited");
    } else {
      console.log("  → SUPER_ADMIN membership already exists");
    }
  }

  // ── Demo Organisation (for ORG_MANAGER) ──────────────────────────────────────
  const orgManagerId = createdUsers["ORG_MANAGER"];

  let demoOrg = await db.organisation.findFirst({
    where: { name: "Acme Nigeria Ltd" },
  });

  if (!demoOrg) {
    demoOrg = await db.organisation.create({
      data: {
        name: "Acme Nigeria Ltd",
        registrationNo: "RC-1234567",
        country: "Nigeria",
        address: "14 Broad Street, Lagos Island, Lagos",
        website: "https://acme.ng",
        description: "Acme Nigeria Ltd is a leading provider of professional services and technology solutions across West Africa, committed to international standards and workforce excellence.",
        industry: "Professional Services",
        verificationStatus: "VERIFIED",
        isActive: true,
      },
    });
    console.log("  ✓ Demo organisation: Acme Nigeria Ltd");
  } else {
    console.log("  → Organisation already exists: Acme Nigeria Ltd");
  }

  // Link orgmanager to the demo organisation
  if (orgManagerId && demoOrg) {
    const existingMembership = await db.organisationMember.findUnique({
      where: { userId_organisationId: { userId: orgManagerId, organisationId: demoOrg.id } },
    });
    if (!existingMembership) {
      await db.organisationMember.create({
        data: { userId: orgManagerId, organisationId: demoOrg.id, role: "ORG_MANAGER" },
      });
      console.log("  ✓ Linked orgmanager to Acme Nigeria Ltd");
    } else {
      console.log("  → OrgManager membership already exists");
    }
  }

  // ── INDIVIDUAL candidate: John Doe (already created above) ───────────────────
  // Stamp his CandidateProfile as INDIVIDUAL (he registered without an org).
  const candidateId = createdUsers["CANDIDATE"];
  const iso27001CourseId = createdCourses["iso27001-lead-auditor"];

  // ── CandidateProfile for John Doe (INDIVIDUAL) ───────────────────────────────
  if (candidateId) {
    await db.candidateProfile.upsert({
      where: { userId: candidateId },
      create: { userId: candidateId, registrationType: "INDIVIDUAL" },
      update: {},
    });
  }

  // ── Enrol John Doe (INDIVIDUAL) in ISO 27001 ──────────────────────────────────
  if (candidateId && iso27001CourseId) {
    const existingEnrolment = await db.enrolment.findUnique({
      where: { userId_courseId: { userId: candidateId, courseId: iso27001CourseId } },
    });

    if (!existingEnrolment) {
      const enrolment = await db.enrolment.create({
        data: {
          userId: candidateId,
          courseId: iso27001CourseId,
          status: "ACTIVE",
          progress: 85,
          registrationSource: "SELF",
          // organisationId: null — true INDIVIDUAL, no org context
        },
      });

      const lessons = await db.courseLesson.findMany({
        where: { module: { courseId: iso27001CourseId } },
        take: 8,
      });

      for (const lesson of lessons) {
        await db.lessonProgress.create({
          data: {
            enrolmentId: enrolment.id,
            lessonId: lesson.id,
            completed: true,
            completedAt: new Date(),
          },
        });
      }

      console.log("  ✓ Enrolled John Doe (INDIVIDUAL) in ISO 27001 course (85% progress)");
    } else {
      // Back-fill registrationSource on existing row if missing
      await db.enrolment.update({
        where: { userId_courseId: { userId: candidateId, courseId: iso27001CourseId } },
        data: { registrationSource: "SELF" },
      });
      console.log("  → John Doe enrolment already exists (registrationSource back-filled)");
    }
  }

  // ── 2 More INDIVIDUAL candidates ─────────────────────────────────────────────
  const iso9001CourseId = createdCourses["iso9001-internal-auditor"];

  const individualUsers = [
    { email: "individual1@demo.truemarkglobal.com", firstName: "Emma", lastName: "Stone" },
    { email: "individual2@demo.truemarkglobal.com", firstName: "Femi", lastName: "Adeyemi" },
  ];

  const individualIds: string[] = [];
  for (const u of individualUsers) {
    const user = await db.user.upsert({
      where: { email: u.email },
      update: {},
      create: { ...u, passwordHash, role: "CANDIDATE", status: "ACTIVE", emailVerified: new Date() },
    });
    individualIds.push(user.id);

    await db.candidateProfile.upsert({
      where: { userId: user.id },
      create: { userId: user.id, registrationType: "INDIVIDUAL" },
      update: {},
    });
    console.log(`  ✓ INDIVIDUAL candidate: ${u.firstName} ${u.lastName}`);
  }

  // Emma self-enrolls in ISO 9001
  if (individualIds[0] && iso9001CourseId) {
    await db.enrolment.upsert({
      where: { userId_courseId: { userId: individualIds[0], courseId: iso9001CourseId } },
      create: {
        userId: individualIds[0],
        courseId: iso9001CourseId,
        status: "ACTIVE",
        progress: 30,
        registrationSource: "SELF",
      },
      update: { registrationSource: "SELF" },
    });
    console.log("  ✓ Emma self-enrolled in ISO 9001");
  }

  // ── 3 ORG_SPONSORED candidates ────────────────────────────────────────────────
  const orgSponsoredUsers = [
    { email: "sponsored1@demo.truemarkglobal.com", firstName: "Alice", lastName: "Sponsored" },
    { email: "sponsored2@demo.truemarkglobal.com", firstName: "Bob", lastName: "Sponsored" },
    { email: "sponsored3@demo.truemarkglobal.com", firstName: "Carol", lastName: "Sponsored" },
  ];

  const sponsoredIds: string[] = [];
  for (const u of orgSponsoredUsers) {
    const user = await db.user.upsert({
      where: { email: u.email },
      update: {},
      create: { ...u, passwordHash, role: "CANDIDATE", status: "ACTIVE", emailVerified: new Date() },
    });
    sponsoredIds.push(user.id);
    console.log(`  ✓ Candidate (to be ORG_SPONSORED): ${u.firstName} ${u.lastName}`);
  }

  // Add sponsored candidates as org members
  for (const uid of sponsoredIds) {
    const exists = await db.organisationMember.findUnique({
      where: { userId_organisationId: { userId: uid, organisationId: demoOrg.id } },
    });
    if (!exists) {
      await db.organisationMember.create({
        data: { userId: uid, organisationId: demoOrg.id, role: "CANDIDATE" },
      });
    }
  }

  // ORG_MANAGER bulk-enrols all 3 sponsored candidates in ISO 27001
  for (const uid of sponsoredIds) {
    await db.enrolment.upsert({
      where: { userId_courseId: { userId: uid, courseId: iso27001CourseId } },
      create: {
        userId: uid,
        courseId: iso27001CourseId,
        status: "ACTIVE",
        progress: 0,
        organisationId: demoOrg.id,
        registrationSource: "ORG_ASSIGNED",
      },
      update: { organisationId: demoOrg.id, registrationSource: "ORG_ASSIGNED" },
    });

    // Stamp candidate profile as ORG_SPONSORED
    await db.candidateProfile.upsert({
      where: { userId: uid },
      create: {
        userId: uid,
        registrationType: "ORG_SPONSORED",
        sponsoringOrgId: demoOrg.id,
      },
      update: { registrationType: "ORG_SPONSORED", sponsoringOrgId: demoOrg.id },
    });
  }
  console.log(`  ✓ 3 ORG_SPONSORED candidates enrolled in ISO 27001 by Acme Nigeria Ltd`);

  // Alice (sponsored1) also enrolled in ISO 9001 — ORG_ASSIGNED second course
  if (sponsoredIds[0] && iso9001CourseId) {
    await db.enrolment.upsert({
      where: { userId_courseId: { userId: sponsoredIds[0], courseId: iso9001CourseId } },
      create: {
        userId: sponsoredIds[0],
        courseId: iso9001CourseId,
        status: "ACTIVE",
        organisationId: demoOrg.id,
        registrationSource: "ORG_ASSIGNED",
      },
      update: { organisationId: demoOrg.id, registrationSource: "ORG_ASSIGNED" },
    });
    console.log("  ✓ Alice also enrolled in ISO 9001 (second ORG_ASSIGNED enrolment)");
  }

  // ── 1 ORG_SELF_ENROL candidate ────────────────────────────────────────────────
  // Grace is an Acme member who self-enrolled (was never assigned by ORG_MANAGER).
  const graceEmail = "selfenrol@demo.truemarkglobal.com";
  const graceUser = await db.user.upsert({
    where: { email: graceEmail },
    update: {},
    create: {
      email: graceEmail,
      firstName: "Grace",
      lastName: "SelfEnrol",
      passwordHash,
      role: "CANDIDATE",
      status: "ACTIVE",
      emailVerified: new Date(),
    },
  });

  // Add Grace as Acme member
  await db.organisationMember.upsert({
    where: { userId_organisationId: { userId: graceUser.id, organisationId: demoOrg.id } },
    create: { userId: graceUser.id, organisationId: demoOrg.id, role: "CANDIDATE" },
    update: {},
  });

  // Grace self-enrolls in ISO 9001 — registrationSource: SELF, but org context captured
  if (iso9001CourseId) {
    await db.enrolment.upsert({
      where: { userId_courseId: { userId: graceUser.id, courseId: iso9001CourseId } },
      create: {
        userId: graceUser.id,
        courseId: iso9001CourseId,
        status: "ACTIVE",
        progress: 15,
        organisationId: demoOrg.id,       // org context captured because she's a member
        registrationSource: "SELF",       // but she enrolled herself
      },
      update: { organisationId: demoOrg.id, registrationSource: "SELF" },
    });
  }

  await db.candidateProfile.upsert({
    where: { userId: graceUser.id },
    create: {
      userId: graceUser.id,
      registrationType: "ORG_SELF_ENROL",
      sponsoringOrgId: demoOrg.id,
    },
    update: {},
  });
  console.log("  ✓ Grace (ORG_SELF_ENROL) — Acme member who self-enrolled in ISO 9001");

  // ── CPD records ───────────────────────────────────────────────────────────────
  // 1. ORG_MANAGER logs CPD on behalf of Alice (ORG_SPONSORED)
  const existingAliceCpd = await db.cPDRecord.count({ where: { userId: sponsoredIds[0], loggedBy: "ORG_MANAGER" } });
  if (!existingAliceCpd && orgManagerId) {
    await db.cPDRecord.create({
      data: {
        userId: sponsoredIds[0],
        title: "ISO 27001:2022 Implementation Workshop",
        type: "conference",
        hoursLogged: 16,
        activityDate: new Date("2026-03-10"),
        status: "approved",
        organisationId: demoOrg.id,
        loggedBy: "ORG_MANAGER",
        loggedByUserId: orgManagerId,
      },
    });
    console.log("  ✓ CPD record: ORG_MANAGER logged for Alice");
  }

  // 2. Femi (INDIVIDUAL) logs their own CPD
  if (individualIds[1]) {
    const existingFemiCpd = await db.cPDRecord.count({ where: { userId: individualIds[1] } });
    if (!existingFemiCpd) {
      await db.cPDRecord.create({
        data: {
          userId: individualIds[1],
          title: "GDPR and Data Protection Self-Study",
          type: "self_study",
          hoursLogged: 6,
          activityDate: new Date("2026-02-20"),
          status: "pending",
          loggedBy: "SELF",
          loggedByUserId: individualIds[1],
        },
      });
      console.log("  ✓ CPD record: Femi (INDIVIDUAL) logged own CPD");
    }
  }

  // ── Demo Notifications ────────────────────────────────────────────────────────
  const now = new Date();
  const daysAgo = (d: number) => new Date(now.getTime() - d * 86_400_000);

  const existingNotifCount = await db.notification.count({ where: { userId: candidateId } });
  if (existingNotifCount === 0 && candidateId) {
    await db.notification.createMany({
      data: [
        {
          userId: candidateId,
          type: "ENROLMENT",
          title: "Enrolment Confirmed",
          message: "You have been successfully enrolled in ISO 27001:2022 Lead Auditor Certification Programme.",
          link: "/courses/iso27001-lead-auditor",
          read: true,
          readAt: daysAgo(6),
          sentAt: daysAgo(7),
        },
        {
          userId: candidateId,
          type: "PROGRESS",
          title: "Keep it up — 85% complete!",
          message: "You are 85% through the ISO 27001 Lead Auditor course. Complete the remaining lessons to unlock your exam.",
          link: "/courses/iso27001-lead-auditor",
          read: true,
          readAt: daysAgo(3),
          sentAt: daysAgo(4),
        },
        {
          userId: candidateId,
          type: "EXAM_ELIGIBLE",
          title: "You are eligible for the exam",
          message: "You have met the minimum progress requirement (80%) and can now sit the ISO 27001 Lead Auditor Certification Examination.",
          link: "/courses/iso27001-lead-auditor",
          read: false,
          sentAt: daysAgo(1),
        },
        {
          userId: candidateId,
          type: "SYSTEM",
          title: "Welcome to Truemark Global CLMEP",
          message: "Your account is active. Explore available certification programmes and begin your professional development journey.",
          link: "/courses",
          read: true,
          readAt: daysAgo(8),
          sentAt: daysAgo(9),
        },
      ],
    });
    console.log("  ✓ Demo notifications created for John Doe");
  } else {
    console.log("  → Notifications already exist for candidate");
  }

  if (orgManagerId) {
    const orgManagerNotifCount = await db.notification.count({ where: { userId: orgManagerId } });
    if (orgManagerNotifCount === 0) {
      await db.notification.createMany({
        data: [
          {
            userId: orgManagerId,
            type: "SYSTEM",
            title: "Organisation Account Created",
            message: "Your organisation account for Acme Nigeria Ltd has been created. Add team members and assign courses to get started.",
            link: "/organisations",
            read: false,
            sentAt: daysAgo(2),
          },
          {
            userId: orgManagerId,
            type: "VERIFICATION",
            title: "Organisation Verified",
            message: "Acme Nigeria Ltd has been verified by a Certification Officer. Your organisation now has full access to all certification programmes.",
            link: "/organisations",
            read: false,
            sentAt: daysAgo(1),
          },
        ],
      });
      console.log("  ✓ Demo notifications created for org manager");
    } else {
      console.log("  → Notifications already exist for org manager");
    }
  }

  // Notifications for Alice (ORG_SPONSORED) — shows ORG_ASSIGNED pathway
  if (sponsoredIds[0]) {
    const aliceNotifCount = await db.notification.count({ where: { userId: sponsoredIds[0] } });
    if (aliceNotifCount === 0) {
      await db.notification.createMany({
        data: [
          {
            userId: sponsoredIds[0],
            type: "ENROLMENT",
            title: "Course assigned to you",
            message: `Your organisation has enrolled you in "ISO 27001:2022 Lead Auditor Certification Programme". You can start learning immediately.`,
            link: "/courses/iso27001-lead-auditor",
            read: false,
            sentAt: daysAgo(5),
          },
        ],
      });
      console.log("  ✓ Demo notifications created for Alice (ORG_SPONSORED)");
    }
  }

  // ── Permission Matrix ─────────────────────────────────────────────────────
  console.log("\n🔐 Seeding permission matrix...");

  // Upsert all permissions
  for (const p of PERMISSIONS) {
    await db.permission.upsert({
      where: { resource_action: { resource: p.resource, action: p.action } },
      create: p,
      update: { label: p.label, description: p.description, category: p.category },
    });
  }
  console.log(`  ✓ ${PERMISSIONS.length} permissions upserted`);

  // Upsert system roles and their permission assignments
  const systemRoleNames = Object.keys(SYSTEM_ROLE_PERMISSIONS);
  const roleDescriptions: Record<string, string> = {
    SUPER_ADMIN:            "Full platform access — TrueMark Global staff only",
    CERTIFICATION_OFFICER:  "Manages certification decisions, certificates, and appeals",
    EXAMINER:               "Creates and grades exam papers",
    TRAINER:                "Authors course content and SCORM packages",
    PROCTOR:                "Monitors live exam sessions",
    AUDITOR:                "Read-only access to compliance, audit, and reports",
    ORG_MANAGER:            "Manages members and enrolments within their organisation",
    CANDIDATE:              "Learner — takes courses and sits exams",
  };

  for (const roleName of systemRoleNames) {
    const role = await db.customRole.upsert({
      where: { name: roleName },
      create: { name: roleName, description: roleDescriptions[roleName], isSystem: true },
      update: { description: roleDescriptions[roleName], isSystem: true },
    });

    // Resolve permission IDs from resource+action pairs
    const pairs = SYSTEM_ROLE_PERMISSIONS[roleName];
    const permRecords = await db.permission.findMany({
      where: { OR: pairs.map(([resource, action]) => ({ resource, action })) },
      select: { id: true },
    });

    // Wipe and re-assign so changes to SYSTEM_ROLE_PERMISSIONS always take effect
    await db.rolePermission.deleteMany({ where: { roleId: role.id } });
    if (permRecords.length > 0) {
      await db.rolePermission.createMany({
        data: permRecords.map((p) => ({ roleId: role.id, permissionId: p.id })),
        skipDuplicates: true,
      });
    }
    console.log(`  ✓ Role "${roleName}": ${permRecords.length} permissions`);
  }

  console.log("\n✅ Seed complete!");
  console.log(`\nDemo credentials (password: ${seedPassword}):`);
  for (const u of demoUsers) {
    console.log(`  ${u.role.padEnd(25)} ${u.email}`);
  }
  console.log(`\nRegistration type demo accounts (password: ${seedPassword}):`);
  console.log(`  ${"INDIVIDUAL".padEnd(25)} candidate@demo.truemarkglobal.com  (John Doe)`);
  console.log(`  ${"INDIVIDUAL".padEnd(25)} individual1@demo.truemarkglobal.com (Emma Stone)`);
  console.log(`  ${"INDIVIDUAL".padEnd(25)} individual2@demo.truemarkglobal.com (Femi Adeyemi)`);
  console.log(`  ${"ORG_SPONSORED".padEnd(25)} sponsored1@demo.truemarkglobal.com  (Alice Sponsored)`);
  console.log(`  ${"ORG_SPONSORED".padEnd(25)} sponsored2@demo.truemarkglobal.com  (Bob Sponsored)`);
  console.log(`  ${"ORG_SPONSORED".padEnd(25)} sponsored3@demo.truemarkglobal.com  (Carol Sponsored)`);
  console.log(`  ${"ORG_SELF_ENROL".padEnd(25)} selfenrol@demo.truemarkglobal.com   (Grace SelfEnrol)`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => db.$disconnect());
