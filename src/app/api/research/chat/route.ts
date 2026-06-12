import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/options";
import OpenAI from "openai";
import type { ResearchReport, ResearchTheme } from "@/app/api/research/search/route";

export const runtime = "nodejs";
export const maxDuration = 30;

const openai = new OpenAI();

const CHAT_SYSTEM = `You are an evidence-based research analyst operating over a structured dataset of video-derived knowledge (creators, videos, timestamps, quotes, and thematic clusters). Your role is to analyze, compare, and synthesize ideas strictly using traceable evidence units. You must not generate unsupported claims.

CORE RULE (STRICT)
All insights MUST be grounded in explicit evidence units: Creator, Video, Timestamp, Quote, Theme/cluster. If a claim cannot be traced to at least one evidence unit — remove it or label it as a hypothesis. No freeform reasoning without evidence support.

ACTIVE FINDING CONTEXT (CRITICAL)
If an ACTIVE FINDING block is present in the report:
- Treat it as the primary context for all queries
- Resolve all queries within it; do not re-cluster or shift topics
- Do not ask clarifying questions about topic selection
- Interpret follow-ups relative to this context
If no active finding is set, ask a clarifying question before answering.

EVIDENCE CARD FORMAT — MANDATORY when citing support
Evidence Card
Creator: [name]
Video: [title]
Timestamp: @[MM:SS]
Quote: "[verbatim]"
Relevance: [one sentence]

Do not merge multiple sources into a single unsupported statement.

CONFIDENCE & LABELING (STRICT)
Base confidence on number of creators, videos, quotes, and cross-source agreement.
If fewer than 3 creators OR fewer than 3 quotes OR fewer than 2 videos:
- Label output as: Signal (Unverified)
- Prohibit recommendations, strong causal claims, and absolute language ("ensures", "drives", "is essential")
- Use only: "suggests", "may indicate", "limited evidence shows"

SYNTHESIS RULE
Replace narrative summaries with a bounded synthesis:
- Must reference ≥2 evidence cards OR explicitly state single-source limitation
- No new concepts beyond evidence; no extrapolation beyond cluster scope

CONTRADICTIONS
Only include a contrarian view if explicit opposing evidence exists. Otherwise state: "No contradictory evidence found in current dataset." Do not infer disagreement.

RECOMMENDATIONS (HIGH RESTRICTION)
Only provide recommendations if ALL are true: ≥3 creators, ≥2 videos, ≥2 independent quotes, confidence = Medium or High. Otherwise state: "Actionable recommendations withheld due to insufficient consensus."

RELATED SIGNALS
Label as: Adjacent (Non-Core Evidence). Exploratory only — cannot influence synthesis or recommendations.

BANNED PHRASES: "based on my knowledge", "generally speaking", "it is widely believed", "experts say", "research shows", "studies suggest", "many creators", "several experts"

You are NOT a summarizer. You are a traceable reasoning layer over video-derived evidence that enforces epistemic discipline, uncertainty calibration, and cluster-bound synthesis.`;

type ChatHistory = Array<{ role: "user" | "assistant"; content: string }>;

function buildFindingContext(t: ResearchTheme, label: string): string {
  const lines: string[] = [];
  lines.push(`${label}: ${t.title}`);
  lines.push(`Confidence: ${t.confidenceLabel ?? "Unknown"} — ${t.confidenceReasoning ?? ""}`);
  lines.push(`Evidence density: ${t.creatorCount} creators, ${t.videoCount} videos, ${t.quoteCount} quotes`);
  if (t.marketSignal) lines.push(`Analyst verdict: ${t.marketSignal}`);
  if (t.sources?.length) {
    lines.push("Supporting quotes:");
    t.sources.forEach(s => {
      lines.push(`  • ${s.creator} @${s.timestampStr ?? "?"} (${s.videoTitle}): "${s.quote}"`);
    });
  }
  if (t.contrarians?.length) {
    lines.push("Contrarian views:");
    t.contrarians.forEach(c => {
      lines.push(`  • ${c.creator} @${c.timestampStr ?? "?"}: "${c.quote ?? c.reason ?? ""}"`);
    });
  }
  if (t.operatorPlaybook && !t.operatorPlaybook.withheld) {
    lines.push(`Recommended action: ${t.operatorPlaybook.strategicStep}`);
  }
  return lines.join("\n");
}

function buildReportContext(report: ResearchReport, activeFindingIndex?: number): string {
  const lines: string[] = [`Research topic: ${report.topic}`, ""];

  if (activeFindingIndex !== undefined && report.themes[activeFindingIndex]) {
    lines.push("=== ACTIVE FINDING (user is focused on this) ===");
    lines.push(buildFindingContext(report.themes[activeFindingIndex]!, `Finding #${activeFindingIndex + 1}`));
    lines.push("=== END ACTIVE FINDING ===");
    lines.push("");
  }

  lines.push("ALL FINDINGS:");
  report.themes.forEach((t, i) => {
    if (i === activeFindingIndex) return;
    lines.push(buildFindingContext(t, `Finding #${i + 1}`));
    lines.push("");
  });

  if (report.limitedThemes?.length) {
    lines.push("Limited-evidence signals:");
    report.limitedThemes.forEach((t, i) => {
      lines.push(`  [L${i + 1}] ${t.title} — ${t.creatorCount} creators, ${t.quoteCount} quotes`);
    });
    lines.push("");
  }

  if (report.synthesis) lines.push(`Overall synthesis: ${report.synthesis}`);
  return lines.join("\n");
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: { query: string; reportSnapshot: ResearchReport; chatHistory: ChatHistory; activeFindingIndex?: number };
  try {
    body = await req.json() as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const { query, reportSnapshot, chatHistory, activeFindingIndex } = body;
  if (!query?.trim() || !reportSnapshot) {
    return NextResponse.json({ error: "Missing query or report" }, { status: 400 });
  }

  const reportContext = buildReportContext(reportSnapshot, activeFindingIndex);

  const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
    { role: "system", content: CHAT_SYSTEM },
    { role: "user", content: `<report>\n${reportContext}\n</report>\n\nQuestion: ${query.trim()}` },
  ];

  const history = (chatHistory ?? []).slice(0, -1);
  if (history.length > 0) {
    messages.splice(1, 0, ...history.map(m => ({ role: m.role as "user" | "assistant", content: m.content })));
  }

  const completion = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages,
    temperature: 0.1,
    max_tokens: 700,
  });

  const answer = completion.choices[0]?.message?.content ?? "No response generated.";
  return NextResponse.json({ answer });
}
