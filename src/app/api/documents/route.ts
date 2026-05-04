import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { USER_ROLES } from "@/lib/constants";
import { auditLog } from "@/lib/audit";

const ADMIN_ROLES = [USER_ROLES.SUPER_ADMIN, USER_ROLES.CERTIFICATION_OFFICER];

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const isAdmin = (ADMIN_ROLES as string[]).includes(session.user.role);
  const url = new URL(req.url);

  const typeParam = url.searchParams.get("type") ?? undefined;
  const typeSchema = z.enum(["policy", "procedure", "exam_paper", "scheme", "form", "report"]).optional();
  const typeParsed = typeSchema.safeParse(typeParam);
  if (!typeParsed.success) {
    return NextResponse.json({ error: "Invalid document type" }, { status: 400 });
  }
  const type = typeParsed.data;

  const documents = await db.document.findMany({
    where: {
      ...(isAdmin ? {} : { accessLevel: { in: ["public", "candidate"] } }),
      ...(type ? { type } : {}),
    },
    orderBy: { createdAt: "desc" },
    include: {
      versions: {
        orderBy: { createdAt: "desc" },
        take: 1,
      },
    },
  });

  return NextResponse.json(documents);
}

const schema = z.object({
  title: z.string().min(2),
  type: z.enum(["policy", "procedure", "exam_paper", "scheme", "form", "report"]),
  description: z.string().optional(),
  accessLevel: z.enum(["internal", "public", "candidate", "restricted"]).default("internal"),
  version: z.string().min(1),
  fileUrl: z.string().url().optional().or(z.literal("")),
  changeNotes: z.string().optional(),
});

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(ADMIN_ROLES as string[]).includes(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = schema.safeParse(await req.json());
  if (!body.success) return NextResponse.json({ error: body.error.flatten() }, { status: 400 });

  const doc = await db.document.create({
    data: {
      title: body.data.title,
      type: body.data.type,
      description: body.data.description ?? null,
      accessLevel: body.data.accessLevel,
      createdBy: session.user.id,
      versions: {
        create: {
          version: body.data.version,
          status: "DRAFT",
          fileUrl: body.data.fileUrl || null,
          changeNotes: body.data.changeNotes ?? null,
          createdBy: session.user.id,
        },
      },
    },
    include: { versions: true },
  });

  await auditLog({
    userId: session.user.id,
    action: "DOCUMENT_CREATED",
    entityType: "Document",
    entityId: doc.id,
    metadata: { title: doc.title, type: doc.type },
  });

  return NextResponse.json(doc, { status: 201 });
}
