import { notFound, redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import ScormPlayer from "./ScormPlayer";

export default async function ScormPlayerPage({
  params,
}: {
  params: Promise<{ packageId: string }>;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const { packageId } = await params;

  const pkg = await db.sCORMPackage.findUnique({ where: { id: packageId } });
  if (!pkg) notFound();

  // Get or prepare session data (will be created client-side via POST /api/scorm/sessions)
  const existingSession = await db.sCORMSession.findUnique({
    where: { userId_packageId: { userId: session.user.id, packageId } },
  });

  const sessionData = existingSession
    ? {
        id: existingSession.id,
        completionStatus: existingSession.completionStatus,
        successStatus: existingSession.successStatus,
        scoreRaw: existingSession.scoreRaw,
        totalTime: existingSession.totalTime,
        suspendData: existingSession.suspendData,
        entry: existingSession.completionStatus === "not attempted" ? "ab-initio" : "resume",
        cmiData: existingSession.cmiData ? JSON.parse(existingSession.cmiData) : {},
      }
    : null;

  return (
    <ScormPlayer
      packageId={pkg.id}
      title={pkg.title}
      version={pkg.version}
      launchUrl={pkg.launchUrl}
      existingSession={sessionData}
      userId={session.user.id}
      userName={session.user.name ?? "Learner"}
    />
  );
}
