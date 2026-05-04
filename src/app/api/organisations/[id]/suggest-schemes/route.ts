import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { USER_ROLES } from "@/lib/constants";
import { rateLimit } from "@/lib/rate-limit";
const ALLOWED = [USER_ROLES.SUPER_ADMIN, USER_ROLES.CERTIFICATION_OFFICER, USER_ROLES.ORG_MANAGER];

// Vercel Pro required for maxDuration > 10.
// Anthropic API calls for scheme suggestions can take 15–45s.
// See: https://vercel.com/docs/functions/runtimes#max-duration
export const maxDuration = 60; // seconds — Anthropic API calls can take 15–45s

// POST /api/organisations/[id]/suggest-schemes
// Uses AI to suggest relevant certification schemes based on org profile
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(ALLOWED as string[]).includes(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;

  // ORG_MANAGER must belong to this organisation.
  if (session.user.role === USER_ROLES.ORG_MANAGER) {
    const membership = await db.organisationMember.findUnique({
      where: { userId_organisationId: { userId: session.user.id, organisationId: id } },
    });
    if (!membership) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // 5 AI calls per hour — prevents runaway API credit spend.
  const rl = await rateLimit(session.user.id, "scheme-suggest", { limit: 5, windowMs: 60 * 60_000 });
  if (!rl.success) {
    return NextResponse.json(
      { error: "Too many requests. Please try again later." },
      { status: 429, headers: { "Retry-After": String(rl.retryAfterSecs) } },
    );
  }

  const org = await db.organisation.findUnique({ where: { id } });
  if (!org) return NextResponse.json({ error: "Organisation not found" }, { status: 404 });

  if (!org.description && !org.industry) {
    return NextResponse.json({
      error: "Please fill in your organisation description and industry first so we can suggest relevant schemes.",
    }, { status: 400 });
  }

  const schemes = await db.certificationScheme.findMany({
    where: { isActive: true },
    select: { code: true, name: true, description: true },
  });

  if (schemes.length === 0) {
    return NextResponse.json({ suggestions: [], message: "No active certification schemes available." });
  }

  if (!process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_API_KEY.includes("YOUR_KEY")) {
    // Fallback: suggest based on industry keywords without AI
    const industryKeywords: Record<string, string[]> = {
      "Healthcare": ["ISO27001", "ISO9001", "ISO45001"],
      "Manufacturing": ["ISO9001", "ISO14001", "ISO45001"],
      "Information Technology": ["ISO27001", "ISO9001"],
      "Finance & Banking": ["ISO27001", "ISO9001"],
      "Energy & Utilities": ["ISO45001", "ISO14001", "ISO9001"],
      "Construction": ["ISO45001", "ISO9001", "ISO14001"],
    };

    const industry = org.industry ?? "";
    const suggested = Object.entries(industryKeywords).find(([k]) => industry.includes(k));
    const suggestedCodes = suggested ? suggested[1] : schemes.slice(0, 2).map((s) => s.code);

    return NextResponse.json({
      suggestions: schemes.filter((s) => suggestedCodes.some((c) => s.code.includes(c))).map((s) => ({
        code: s.code,
        name: s.name,
        reason: `Commonly pursued by organisations in the ${industry || "your"} sector.`,
        relevanceScore: 80,
      })),
      aiPowered: false,
    });
  }

  const prompt = `You are a certification scheme advisor for Truemark Global, an ISO/IEC 17024 accredited certification body.

An organisation has provided the following profile:
- Name: ${org.name}
- Industry: ${org.industry ?? "Not specified"}
- Country: ${org.country ?? "Not specified"}
- Description: ${org.description ?? "Not provided"}

Available certification schemes:
${schemes.map((s) => `- ${s.code}: ${s.name}${s.description ? ` — ${s.description}` : ""}`).join("\n")}

Based on the organisation's industry and description, suggest the most relevant certification schemes from the available list.
For each suggestion, provide:
1. The scheme code (must be from the available list exactly)
2. A concise reason (1-2 sentences) explaining why this scheme is relevant to this organisation
3. A relevance score out of 100

Respond ONLY with a JSON array. No markdown. No prose. Example:
[{"code":"ISO9001-IA","name":"ISO 9001:2015 Quality Management Internal Auditor","reason":"...","relevanceScore":90}]

Return only schemes that genuinely apply. If no schemes are relevant, return an empty array.`;

  const { Anthropic } = await import("@anthropic-ai/sdk");
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  try {
    const message = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 1024,
      messages: [{ role: "user", content: prompt }],
    });

    const raw = (message.content[0] as { type: string; text: string }).text.trim();
    const jsonStr = raw.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "");
    const suggestions = JSON.parse(jsonStr) as Array<{
      code: string;
      name: string;
      reason: string;
      relevanceScore: number;
    }>;

    // Validate suggested codes are real
    const validCodes = new Set(schemes.map((s) => s.code));
    const valid = suggestions.filter((s) => validCodes.has(s.code));

    return NextResponse.json({ suggestions: valid, aiPowered: true });
  } catch (err) {
    console.error("Scheme suggestion error:", err);
    return NextResponse.json({ error: "AI suggestion failed. Please try again later." }, { status: 500 });
  }
}
