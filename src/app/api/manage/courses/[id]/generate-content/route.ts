import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { auditLog } from "@/lib/audit";

const ALLOWED = ["TRAINER", "SUPER_ADMIN"];

// Anthropic API calls for content generation can take 15–45s.
export const maxDuration = 60;

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!ALLOWED.includes(session.user.role))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json(
      { error: "AI content generation is not configured. Set ANTHROPIC_API_KEY to enable this feature." },
      { status: 501 },
    );
  }

  const { id } = await params;
  const course = await db.course.findFirst({
    where: { id },
    select: { id: true, title: true, creatorId: true, scheme: { select: { name: true } } },
  });
  if (!course) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // TRAINER can only generate content for their own courses
  if (session.user.role === "TRAINER" && course.creatorId !== session.user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const bodySchema = z.object({
    moduleTitle: z.string().min(1).max(500),
    targetAudience: z.string().min(1).max(500),
    // Bound array length to prevent runaway API credit consumption
    learningObjectives: z.array(z.string().min(1).max(300)).min(1).max(10),
    contentType: z.enum(["lesson", "module_overview", "assessment_criteria"]),
  });

  const parsed = bodySchema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const { moduleTitle, targetAudience, learningObjectives, contentType } = parsed.data;

  const schemeName = course.scheme?.name ?? course.title;
  const objectivesList = learningObjectives.map((o, i) => `${i + 1}. ${o}`).join("\n");

  const userPrompts: Record<string, string> = {
    lesson: `Generate a comprehensive lesson on "${moduleTitle}" for the "${schemeName}" certification programme targeting ${targetAudience}.

Learning objectives:
${objectivesList}

Return ONLY valid JSON in this exact structure:
{
  "title": "Lesson title",
  "introduction": "Engaging introduction paragraph",
  "sections": [
    { "heading": "Section heading", "content": "Section content in 2-4 paragraphs" }
  ],
  "summary": "Concise summary paragraph",
  "keyTakeaways": ["Takeaway 1", "Takeaway 2", "Takeaway 3"]
}

Include 3-5 sections. Each section content should be 100-200 words.`,

    module_overview: `Generate a module overview for "${moduleTitle}" in the "${schemeName}" certification programme targeting ${targetAudience}.

Learning objectives:
${objectivesList}

Return ONLY valid JSON in this exact structure:
{
  "title": "Module title",
  "overview": "Comprehensive overview paragraph (150-200 words)",
  "topics": ["Topic 1", "Topic 2", "Topic 3"],
  "prerequisites": "Prerequisites description",
  "estimatedDuration": "e.g. 4 hours"
}`,

    assessment_criteria: `Generate assessment criteria for "${moduleTitle}" in the "${schemeName}" certification programme targeting ${targetAudience}.

Learning objectives:
${objectivesList}

Return ONLY valid JSON in this exact structure:
{
  "title": "Assessment title",
  "criteria": [
    {
      "id": "AC1",
      "description": "Criterion description",
      "performance_indicators": ["Indicator 1", "Indicator 2"]
    }
  ],
  "assessmentMethods": ["Method 1", "Method 2"],
  "passingRequirements": "Passing requirements description"
}

Include 3-5 criteria, each with 2-3 performance indicators.`,
  };

  const systemPrompt = `You are an expert curriculum developer creating content for professional certification programmes complying with ISO/IEC 17024:2012.
Generate structured, professional learning content that is:
- Academically rigorous and industry-relevant
- Written in clear, accessible English
- Structured with clear headings and sections
- Appropriate for professional certification candidates
Always return valid JSON only.`;

  const { Anthropic } = await import("@anthropic-ai/sdk");
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  try {
    const message = await client.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 4096,
      system: systemPrompt,
      messages: [{ role: "user", content: userPrompts[contentType] }],
    });

    const raw = (message.content[0] as { type: string; text: string }).text.trim();
    const jsonStr = raw.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "");
    const generated = JSON.parse(jsonStr) as Record<string, unknown>;

    await auditLog({
      userId: session.user.id,
      action: "COURSE_CONTENT_GENERATED",
      entityType: "Course",
      entityId: id,
      metadata: { moduleTitle, contentType, targetAudience },
    }).catch(() => {});

    return NextResponse.json({ content: generated, contentType });
  } catch (err) {
    console.error("AI generation error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "AI generation failed" },
      { status: 500 },
    );
  }
}
