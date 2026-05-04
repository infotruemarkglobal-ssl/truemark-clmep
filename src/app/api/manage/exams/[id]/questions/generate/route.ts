import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { auditLog } from "@/lib/audit";
const ALLOWED = ["SUPER_ADMIN", "CERTIFICATION_OFFICER", "EXAMINER"];

// Vercel Pro required for maxDuration > 10.
// Anthropic API calls for question generation can take 15–45s.
// See: https://vercel.com/docs/functions/runtimes#max-duration
export const maxDuration = 60; // seconds — Anthropic API calls can take 15–45s

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!ALLOWED.includes(session.user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json(
      { error: "AI question generation is not configured. Set ANTHROPIC_API_KEY to enable this feature." },
      { status: 501 },
    );
  }

  const { id } = await params;
  const paper = await db.examPaper.findFirst({ where: { id }, include: { scheme: true } });
  if (!paper) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (!["SUPER_ADMIN", "CERTIFICATION_OFFICER"].includes(session.user.role) && paper.creatorId !== session.user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const generateSchema = z.object({
    sectionId: z.string().min(1),
    topic: z.string().min(1).max(500),
    // A03:2021 — bound count to prevent runaway API credit consumption / DoS
    count: z.number().int().min(1).max(50).default(5),
    type: z.enum(["mcq_single", "mcq_multi", "true_false", "essay", "fill_blank"]).default("mcq_single"),
    difficulty: z.enum(["easy", "medium", "hard"]).default("medium"),
    domain: z.string().max(200).optional(),
  });

  const parsed = generateSchema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const { sectionId, topic, count, type, difficulty, domain } = parsed.data;

  // IDOR guard: confirm the section belongs to this exam paper before inserting AI-generated questions.
  const section = await db.examSection.findFirst({ where: { id: sectionId, examPaperId: id } });
  if (!section) return NextResponse.json({ error: "Section not found in this exam paper" }, { status: 404 });

  const schemeName = paper.scheme?.name ?? paper.title;

  const typeInstructions: Record<string, string> = {
    mcq_single: "Multiple choice with exactly ONE correct answer. Include 4 options.",
    mcq_multi: "Multiple choice where candidates SELECT ALL THAT APPLY. Include 4-5 options, 2-3 correct.",
    true_false: 'True or False question. Options must be exactly ["True", "False"].',
    essay: "Open-ended essay question requiring a detailed written response. No options needed.",
    fill_blank: "Fill in the blank. The correctAnswer field should contain the expected answer. No options needed.",
  };

  const prompt = `You are an expert exam writer for professional certification programmes. Generate ${count} ${difficulty}-difficulty exam questions about "${topic}" for the "${schemeName}" certification.

Question type: ${typeInstructions[type] ?? typeInstructions.mcq_single}
${domain ? `Domain/Topic area: ${domain}` : ""}

Respond ONLY with a valid JSON array. No markdown, no prose, just the JSON array.

Each question must follow this exact structure:
{
  "text": "The question text",
  "type": "${type}",
  "marks": ${type === "essay" ? 10 : 1},
  "difficulty": "${difficulty}",
  "domain": "${domain ?? topic}",
  "explanation": "Brief explanation of why the answer is correct",
  "options": [
    { "id": "opt_a", "text": "Option text", "isCorrect": false },
    { "id": "opt_b", "text": "Option text", "isCorrect": true }
  ],
  "correctAnswer": null
}

Rules:
- For essay/fill_blank, set options to [] and put expected answer in correctAnswer (fill_blank) or null (essay)
- For true_false, options must be exactly [{"id":"opt_a","text":"True","isCorrect":...},{"id":"opt_b","text":"False","isCorrect":...}]
- Make questions realistic, professional, and aligned with ISO 17024 certification standards
- Ensure questions test genuine understanding, not just memorisation
- Each question must have a unique question text
- Generate exactly ${count} questions`;

  const { Anthropic } = await import("@anthropic-ai/sdk");
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  try {
    const message = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 4096,
      messages: [{ role: "user", content: prompt }],
    });

    const raw = (message.content[0] as { type: string; text: string }).text.trim();
    // Strip any accidental markdown fences
    const jsonStr = raw.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "");
    const generated = JSON.parse(jsonStr) as Array<{
      text: string;
      type: string;
      marks: number;
      difficulty: string;
      domain: string;
      explanation: string;
      options: Array<{ id: string; text: string; isCorrect: boolean }>;
      correctAnswer: string | null;
    }>;

    // Insert all into DB
    const created = await Promise.all(
      generated.map((q) =>
        db.examQuestion.create({
          data: {
            sectionId,
            type: q.type,
            text: q.text,
            marks: q.marks ?? 1,
            difficulty: q.difficulty ?? difficulty,
            domain: q.domain ?? domain ?? null,
            explanation: q.explanation ?? null,
            options: q.options?.length ? JSON.stringify(q.options) : null,
            correctAnswer: q.correctAnswer ?? null,
          },
        })
      )
    );

    await auditLog({
      userId: session.user.id,
      action: "EXAM_QUESTIONS_GENERATED",
      entityType: "ExamPaper",
      entityId: id,
      metadata: { sectionId, topic, count: created.length, type, difficulty, severity: "MEDIUM" },
    }).catch(() => {});

    return NextResponse.json({ questions: created, count: created.length });
  } catch (err) {
    console.error("AI generation error:", err);
    return NextResponse.json({
      error: err instanceof Error ? err.message : "AI generation failed",
    }, { status: 500 });
  }
}
