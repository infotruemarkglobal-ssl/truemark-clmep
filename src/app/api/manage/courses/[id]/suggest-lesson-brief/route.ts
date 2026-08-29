import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { can } from "@/lib/permissions";
import { rateLimit } from "@/lib/rate-limit";

// Vercel Pro required for maxDuration > 10.
export const maxDuration = 60;

// POST /api/manage/courses/[id]/suggest-lesson-brief
// Given just a lesson title, suggests a target audience + learning objectives
// to seed the AI Content Generator form — a lighter, faster call than full
// content generation, so an admin isn't required to hand-type both fields
// before they can even try the generator.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await can(session, "courses:update")))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json(
      { error: "AI suggestions are not configured. Set ANTHROPIC_API_KEY to enable this feature." },
      { status: 501 },
    );
  }

  const { id } = await params;
  const course = await db.course.findFirst({
    where: { id },
    select: { id: true, title: true, creatorId: true, scheme: { select: { name: true } } },
  });
  if (!course) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Same authoring boundary as generate-content: TRAINER only for their own courses.
  if (session.user.role === "TRAINER" && course.creatorId !== session.user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Cheap call, but still real API spend — same order of magnitude as scheme
  // suggestions, generous enough for iterating on a title a few times.
  const rl = await rateLimit(session.user.id, "lesson-brief-suggest", { limit: 20, windowMs: 60 * 60_000 });
  if (!rl.success) {
    return NextResponse.json(
      { error: "Too many requests. Please try again later." },
      { status: 429, headers: { "Retry-After": String(rl.retryAfterSecs) } },
    );
  }

  const bodySchema = z.object({ moduleTitle: z.string().min(1).max(500) });
  const parsed = bodySchema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const schemeName = course.scheme?.name ?? course.title;

  const prompt = `You are a curriculum designer for professional certification programmes. Given only a lesson title, propose a realistic target audience and 3-5 learning objectives for it.

Certification programme: "${schemeName}"
Lesson title: "${parsed.data.moduleTitle}"

Respond ONLY with valid JSON in this exact structure, no markdown, no prose:
{
  "targetAudience": "One sentence describing the intended learner",
  "learningObjectives": ["Objective 1", "Objective 2", "Objective 3"]
}`;

  const { Anthropic } = await import("@anthropic-ai/sdk");
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  try {
    const message = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 1024,
      messages: [{ role: "user", content: prompt }],
    });

    const textBlock = message.content.find((b) => b.type === "text");
    if (!textBlock || textBlock.type !== "text") throw new Error("AI response contained no text content");
    const raw = textBlock.text.trim();
    const jsonStr = raw.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "");
    const suggestion = JSON.parse(jsonStr) as { targetAudience: string; learningObjectives: string[] };

    return NextResponse.json({
      targetAudience: suggestion.targetAudience ?? "",
      learningObjectives: Array.isArray(suggestion.learningObjectives) && suggestion.learningObjectives.length > 0
        ? suggestion.learningObjectives
        : [""],
    });
  } catch (err) {
    console.error("Lesson brief suggestion error:", err);
    return NextResponse.json({ error: "AI suggestion failed. Please try again later." }, { status: 500 });
  }
}
