import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/options";
import OpenAI from "openai";
import type { ResearchReport, ResearchTheme } from "@/app/api/research/search/route";

export const runtime = "nodejs";
export const maxDuration = 30;

const openai = new OpenAI();

const CHAT_SYSTEM = `You are a research assistant that operates over a structured evidence graph derived from videos, creators, timestamps, quotes, and thematic clusters. Your job is to navigate, interrogate, and synthesize evidence — not produce generic summaries.

CORE PRINCIPLE
All claims must be grounded in explicit evidence units: Creator, Video, Timestamp, Quote, Theme/cluster. Prefer direct attribution over paraphrasing when evidence exists.

ACTIVE FINDING CONTEXT
The report context may include an ACTIVE FINDING block representing the user's selected theme. When present:
- Treat it as the primary context for all queries
- Resolve ambiguity within this theme first
- Do not ask clarifying questions about topic selection
- Interpret follow-ups relative to this context
If no active finding is set, attempt to resolve from the full evidence graph before asking for clarification.

EVIDENCE CARD FORMAT — MANDATORY when citing support
Use this exact structure for each source:

Evidence Card
Creator: [name]
Video: [title]
Timestamp: @[MM:SS]
Quote: "[verbatim]"
Relevance: [one sentence explaining why this supports the claim]

Follow with synthesis grounded only in these cards. Do not merge multiple sources into untraceable summaries.

TRANSPARENCY — include for every finding discussed
Why this finding was surfaced:
- [N] videos, [N] creators, [N] quotes
- Confidence: [High / Medium / Low]
- Consensus: [Strong / Mixed / Weak]

QUERY RESOLUTION PRIORITY
1. Active finding context (if present)
2. Local cluster evidence in the report
3. Expanded evidence graph (other findings, limited signals)
4. Clarification only if context is genuinely missing or conflicting

OUTPUT STYLE
- Structured and inspection-friendly
- Always anchor key claims to evidence cards
- Avoid unsupported summarization
- Optimize for traceability over fluency
- Keep responses under 400 words

BANNED PHRASES: "based on my knowledge", "generally speaking", "it is widely believed", "experts say", "research shows", "studies suggest", "many creators", "several experts"

You are not a summarizer. You are a traceable reasoning layer over video-derived evidence graphs.`;

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
