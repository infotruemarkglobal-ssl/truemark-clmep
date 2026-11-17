// Deletes every fixture seed-candidates.ts created — candidates, their exam
// attempts/proctoring sessions/incidents, the isolated load-test paper, and
// the local candidates.json (which holds real, if short-lived, session
// tokens and should never linger).
//
// Usage: npx tsx scripts/load-test/cleanup.ts
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { rm } from "fs/promises";
import path from "path";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL ?? "" });
const db = new PrismaClient({ adapter });

async function main() {
  const users = await db.user.findMany({ where: { email: { startsWith: "loadtest+", endsWith: "@internal.test" } }, select: { id: true } });
  const userIds = users.map((u) => u.id);
  console.log(`Found ${userIds.length} load-test candidate users.`);

  if (userIds.length > 0) {
    const attempts = await db.examAttempt.findMany({ where: { userId: { in: userIds } }, select: { id: true } });
    const attemptIds = attempts.map((a) => a.id);

    const sessions = await db.proctoringSession.findMany({ where: { attemptId: { in: attemptIds } }, select: { id: true } });
    const sessionIds = sessions.map((s) => s.id);

    const incidentCount = await db.proctoringIncident.deleteMany({ where: { sessionId: { in: sessionIds } } });
    const sessionCount = await db.proctoringSession.deleteMany({ where: { id: { in: sessionIds } } });
    const responseCount = await db.examResponse.deleteMany({ where: { attemptId: { in: attemptIds } } });
    const attemptCount = await db.examAttempt.deleteMany({ where: { id: { in: attemptIds } } });
    const auditCount = await db.auditLog.deleteMany({ where: { userId: { in: userIds } } });
    const userCount = await db.user.deleteMany({ where: { id: { in: userIds } } });

    console.log(`Deleted: ${incidentCount.count} incidents, ${sessionCount.count} proctoring sessions, ${responseCount.count} responses, ${attemptCount.count} attempts, ${auditCount.count} audit rows, ${userCount.count} users.`);
  }

  const paper = await db.examPaper.findFirst({ where: { title: "LOAD TEST — Exam-Day Surge Paper" } });
  if (paper) {
    const remainingAttempts = await db.examAttempt.count({ where: { examPaperId: paper.id } });
    if (remainingAttempts === 0) {
      await db.examQuestion.deleteMany({ where: { section: { examPaperId: paper.id } } });
      await db.examSection.deleteMany({ where: { examPaperId: paper.id } });
      await db.auditLog.deleteMany({ where: { entityType: "ExamPaper", entityId: paper.id } });
      await db.examPaper.delete({ where: { id: paper.id } });
      console.log("Deleted the isolated load-test paper.");
    } else {
      console.log(`Load-test paper still has ${remainingAttempts} attempt(s) referencing it (not from loadtest+ users) — left in place.`);
    }
  }

  await rm(path.join(__dirname, ".data"), { recursive: true, force: true });
  console.log("Removed scripts/load-test/.data/ (candidate session data + reports).");

  const residue = await db.user.count({ where: { email: { startsWith: "loadtest+", endsWith: "@internal.test" } } });
  console.log(`Residue check — remaining load-test users (expect 0): ${residue}`);

  await db.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
