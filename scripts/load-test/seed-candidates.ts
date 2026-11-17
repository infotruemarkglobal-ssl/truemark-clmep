// Seeds N throwaway candidates + an isolated "Load Test Paper" + N
// IN_PROGRESS ExamAttempt/ProctoringSession rows, and mints a real, valid
// NextAuth session cookie per candidate — so the load-test runners can hit
// session-authenticated routes as N distinct real candidates without driving
// N real login flows (which would be slow and would itself hammer the
// login-rate-limit bucket this exercise isn't testing).
//
// The cookie is minted with next-auth/jwt's encode(), matching exactly what
// src/proxy.ts's getToken() call expects to decode (see its cookieName/salt
// comment) — confirmed directly against that code, not guessed.
//
// Usage: npx tsx scripts/load-test/seed-candidates.ts [count]
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { encode } from "next-auth/jwt";
import bcrypt from "bcryptjs";
import { randomBytes } from "crypto";
import { writeFile, mkdir } from "fs/promises";
import path from "path";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL ?? "" });
const db = new PrismaClient({ adapter });

const COUNT = Number(process.argv[2] ?? 100);
const DATA_DIR = path.join(__dirname, ".data");
const OUT_FILE = path.join(DATA_DIR, "candidates.json");
const COOKIE_NAME = "authjs.session-token"; // dev cookie name — see src/proxy.ts:218-227

async function main() {
  if (!process.env.AUTH_SECRET) throw new Error("AUTH_SECRET is not set");

  const admin = await db.user.findFirst({ where: { role: "SUPER_ADMIN", status: "ACTIVE" }, select: { id: true } });
  if (!admin) throw new Error("No active SUPER_ADMIN found to own the load-test paper as creator");

  const scheme = await db.certificationScheme.findFirst({ where: { isActive: true }, select: { id: true } });
  if (!scheme) throw new Error("No active certification scheme found");

  console.log(`Seeding ${COUNT} load-test candidates...`);

  // Isolated exam paper — approved + active so it behaves exactly like a
  // real proctored paper (ExamPaper.approvalStatus gate, added in Tier 4,
  // set directly here since this is a fixture script bypassing the API).
  let paper = await db.examPaper.findFirst({ where: { title: "LOAD TEST — Exam-Day Surge Paper" } });
  if (!paper) {
    paper = await db.examPaper.create({
      data: {
        title: "LOAD TEST — Exam-Day Surge Paper",
        description: "Scratch paper for scripts/load-test — safe to delete via cleanup.ts.",
        schemeId: scheme.id,
        creatorId: admin.id,
        durationMins: 120,
        passMark: 70,
        totalMarks: 10,
        requiresProctoring: true,
        tabSwitchLimit: 3,
        approvalStatus: "APPROVED",
        approvedBy: admin.id,
        approvedAt: new Date(),
        isActive: true,
      },
    });
    const section = await db.examSection.create({ data: { examPaperId: paper.id, title: "Section 1", order: 0 } });
    await db.examQuestion.create({
      data: {
        sectionId: section.id,
        type: "mcq_single",
        text: "Load-test placeholder question — 2 + 2?",
        marks: 10,
        options: JSON.stringify([
          { id: "a", text: "3", isCorrect: false },
          { id: "b", text: "4", isCorrect: true },
          { id: "c", text: "5", isCorrect: false },
        ]),
      },
    });
    console.log("  Created isolated load-test paper:", paper.id);
  } else {
    console.log("  Reusing existing load-test paper:", paper.id);
  }

  const dummyHash = await bcrypt.hash(randomBytes(32).toString("hex"), 4); // low cost factor — this account is never really logged into
  const candidates: { userId: string; attemptId: string; proctoringSessionId: string; cookie: string }[] = [];

  for (let i = 1; i <= COUNT; i++) {
    const email = `loadtest+${i}@internal.test`;
    const user = await db.user.upsert({
      where: { email },
      update: {},
      create: {
        email,
        firstName: "Load",
        lastName: `Test${i}`,
        passwordHash: dummyHash,
        role: "CANDIDATE",
        status: "ACTIVE",
        emailVerified: new Date(),
      },
    });

    const attempt = await db.examAttempt.create({
      data: { userId: user.id, examPaperId: paper.id, status: "IN_PROGRESS", startedAt: new Date(), attemptNumber: 1 },
    });
    const proctoringSession = await db.proctoringSession.create({ data: { attemptId: attempt.id, status: "active" } });

    const cookie = await encode({
      secret: process.env.AUTH_SECRET,
      salt: COOKIE_NAME,
      token: {
        id: user.id,
        sub: user.id,
        email: user.email,
        name: `${user.firstName} ${user.lastName}`,
        role: "CANDIDATE",
        mfaEnabled: false,
        mfaVerified: false,
        mustChangePassword: false,
        permissions: null,
      },
    });

    candidates.push({ userId: user.id, attemptId: attempt.id, proctoringSessionId: proctoringSession.id, cookie });
    if (i % 20 === 0) console.log(`  ...${i}/${COUNT}`);
  }

  await mkdir(DATA_DIR, { recursive: true });
  await writeFile(OUT_FILE, JSON.stringify({ paperId: paper.id, cookieName: COOKIE_NAME, candidates }, null, 2));
  console.log(`\nDone. ${candidates.length} candidates seeded, written to ${OUT_FILE}`);

  await db.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
