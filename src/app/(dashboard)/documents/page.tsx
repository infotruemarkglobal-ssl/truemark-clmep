import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCachedSession as auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { USER_ROLES } from "@/lib/constants";
import DocumentsPage from "@/components/documents/DocumentsPage";

export const metadata: Metadata = { title: "Document Library" };

export default async function Page() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const ALLOWED = [
    USER_ROLES.SUPER_ADMIN, USER_ROLES.CERTIFICATION_OFFICER,
    USER_ROLES.AUDITOR, USER_ROLES.EXAMINER,
    USER_ROLES.CANDIDATE, USER_ROLES.ORG_MANAGER, USER_ROLES.TRAINER,
  ];
  if (!(ALLOWED as string[]).includes(session.user.role)) redirect("/dashboard");

  const ADMIN_ROLES = [USER_ROLES.SUPER_ADMIN, USER_ROLES.CERTIFICATION_OFFICER];
  const isAdmin = (ADMIN_ROLES as string[]).includes(session.user.role);

  // Admins see all; candidates/org/trainer see candidate-facing; auditors/examiners see internal+candidate
  const STAFF_ROLES = [USER_ROLES.AUDITOR, USER_ROLES.EXAMINER, USER_ROLES.TRAINER];
  const isStaff = (STAFF_ROLES as string[]).includes(session.user.role);

  const documents = await db.document.findMany({
    where: isAdmin
      ? undefined
      : isStaff
      ? { accessLevel: { in: ["public", "candidate", "internal"] } }
      : { accessLevel: { in: ["public", "candidate"] } },
    orderBy: { createdAt: "desc" },
    include: {
      versions: {
        orderBy: { createdAt: "desc" },
        take: 1,
      },
    },
  });

  const serialised = documents.map((d) => ({
    id: d.id,
    title: d.title,
    type: d.type,
    description: d.description,
    accessLevel: d.accessLevel,
    createdAt: d.createdAt.toISOString(),
    latestVersion: d.versions[0]
      ? {
          id: d.versions[0].id,
          version: d.versions[0].version,
          status: d.versions[0].status,
          fileUrl: d.versions[0].fileUrl,
          changeNotes: d.versions[0].changeNotes,
          approvedAt: d.versions[0].approvedAt?.toISOString() ?? null,
          createdAt: d.versions[0].createdAt.toISOString(),
        }
      : null,
  }));

  return <DocumentsPage documents={serialised} isAdmin={isAdmin} />;
}
