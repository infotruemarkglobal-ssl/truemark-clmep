import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCachedSession as auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { rateLimit, getClientIp } from "@/lib/rate-limit";
import { SUPPORTED_LOCALES } from "@/i18n/locales";

const schema = z.object({ locale: z.enum(SUPPORTED_LOCALES) });

// POST /api/locale — switch the UI language for the current visitor.
// Reachable without a session (the public certificate-verification page has
// its own language switcher); when a session exists, also persists the
// choice to User.locale so it follows the signed-in user across devices.
export async function POST(req: NextRequest) {
  const ip = getClientIp(req);
  const rl = await rateLimit(ip, "set-locale", { limit: 20, windowMs: 60_000 });
  if (!rl.success) {
    return NextResponse.json(
      { error: "Too many requests. Please try again later." },
      { status: 429, headers: { "Retry-After": String(rl.retryAfterSecs) } },
    );
  }

  const body = schema.safeParse(await req.json());
  if (!body.success) return NextResponse.json({ error: "Invalid locale" }, { status: 400 });
  const { locale } = body.data;

  const session = await auth();
  if (session?.user?.id) {
    await db.user.update({ where: { id: session.user.id }, data: { locale } });
  }

  const res = NextResponse.json({ locale });
  res.cookies.set("locale", locale, {
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
    sameSite: "lax",
  });
  return res;
}
