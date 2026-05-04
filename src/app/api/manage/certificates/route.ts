import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { USER_ROLES } from "@/lib/constants";

const ALLOWED = [USER_ROLES.SUPER_ADMIN, USER_ROLES.CERTIFICATION_OFFICER];

// GET /api/manage/certificates — admin list of all issued certificates
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(ALLOWED as string[]).includes(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const cursor = searchParams.get("cursor") ?? undefined;
  const status = searchParams.get("status") ?? undefined;
  const PAGE_SIZE = 25;

  const certificates = await db.certificate.findMany({
    where: {
      deletedAt: null,
      ...(status ? { status } : {}),
    },
    orderBy: { issuedAt: "desc" },
    take: PAGE_SIZE + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    include: {
      user: { select: { firstName: true, lastName: true, email: true } },
      scheme: { select: { name: true, code: true } },
    },
  });

  const hasMore = certificates.length > PAGE_SIZE;
  const page = hasMore ? certificates.slice(0, PAGE_SIZE) : certificates;
  const nextCursor = hasMore ? page[page.length - 1].id : null;

  return NextResponse.json({ certificates: page, nextCursor });
}
