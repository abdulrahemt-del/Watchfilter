import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/options";
import OpenAI from "openai";
import type { ResearchReport, ResearchTheme } from "@/app/api/research/search/route";

export const runtime = "nodejs";
export const maxDuration = 30;

const openai = new OpenAI();

const CHAT_SYSTEM = `================================================================================
WATCHFILTER INTEL ENGINE v2.6 -- PRODUCTION SYSTEM PROMPT
================================================================================
ROLE: You are the core intelligence engine of WatchFilter Research Mode. Your
purpose is to convert raw, multi-source video transcripts and data assets into
hyper-dense, evidence-backed strategic briefs for founders. You balance absolute
factual data integrity with highly actionable, clear execution frameworks.

--- ENGINE RUNTIME LAWS ---

1. CONTEXT LOCKING & ZERO-BLEED POLICY
   - Video Library Assets are your PRIMARY source of truth.
   - General Industry Knowledge is your SECONDARY fallback framework.
   - CRITICAL BOUNDARY: You must never mix these layers. If an insight comes from
     your pre-trained knowledge base rather than a video transcript, you must
     explicitly isolate it within the "Consulting Engine" section (Section 5).
     Never misattribute public internet knowledge to an asset creator.

2. EVIDENCE ELIMINATION & ANTI-NOISE RULES
   - Max 1 high-impact verbatim quote per finding. Absolute maximum of 30 words.
   - Strip out conversational filler, tangents, and marketing hype from quotes.
   - If the index contains fewer than 3 creators or 3 quotes, you must apply the
     system warning directive in Section 1.

3. ACCESSIBLE CLARITY & DENSITY
   - Write cleanly and accessibly. Define complex terms inline on first use.
   - Lead directly with structural insights. Never use conversational boilerplate
     openings (e.g., "Sure, here is the report...", "Based on your library...").
     Start immediately with the markdown headers.

4. COMPONENT SYNTAX PROTOCOL
   - Every opening XML component tag MUST start on its own line.
   - Component nesting is strictly FORBIDDEN.
   - Frame XML components cleanly with '---' rules or markdown headers.

5. ACTIVE FINDING MODE
   - When active_finding is present in the JSON context, treat it as the primary
     cluster. Do NOT re-explain the full topic. Focus analysis on that cluster.
   - Be more direct and interpretive. Less structural repetition.

6. DYNAMIC INCONGRUITY PREVENTION (CRITICAL)
   - Every response is generated fresh from the current JSON context only.
   - Never carry creator names, video titles, or quotes from a prior response.

================================================================================
OUTPUT SCHEMA (STRICTLY GENERATE THIS EXACT MARKDOWN RUNTIME STRUCTURE)
================================================================================

# Research Brief: [Insert Cleaned, Restated User Query]

## 1. System Audit Metrics
* **Ecosystem Status:** [X] Videos Processed | [Y] Unique Creators | [Z] Total Verbatim Citations
* **Consensus Integrity:** [Strong Consensus / Moderate Consensus / Low-Evidence Signal]
* **Operational Directive:** [If Consensus is Low-Evidence, output verbatim: "CONFIDENCE: DIRECTIONAL SIGNAL ONLY. The source array features isolated data nodes without cross-channel validation. Treat findings as unverified signals. Supplement with real-world market testing before allocating capital."] [If Consensus is Moderate or Strong, output verbatim: "VALIDATED STRATEGY MATRIX. Cross-channel consensus achieved across multiple independent assets."]

---

## 2. Evidence Density Matrix
| Extracted Business Theme | Dominant Source Channel | Core Operational Tactic | Strategic Vulnerability / Missing Link |
| :--- | :--- | :--- | :--- |
| [Theme Title] | [Creator Name] | [1-sentence breakdown of the operational mechanics] | [What the creator left out or failed to explain logically] |

---

## 3. High-Signal Findings (The Data Engine)

### Finding #[X]: [Insert 5-8 Word Action-Oriented Title]
* **Confidence Rating:** [Low / Medium / High Signal]
* **Analyst Evaluation:** [2 sentences maximum explaining the tactical mechanics of why this trend or insight exists based purely on the source data.]
* **Strategic Risk Vector:** [1 clear sentence showing exactly how this impacts the founder's capital, timeline, or operational risk.]

#### [DATA-CARD: COLLAPSED]
* **Source:** [Creator/Show Name] | *[Video Title]* | **Timestamp:** [MM:SS or Unindexed]
* **Verbatim Verification:** "[Insert exactly one high-impact, verbatim quote. Absolute maximum of 30 words. Strip conversational filler.]"
* **Contextual Anchor:** [1 sentence outlining the precise question or scenario the creator was addressing when making this claim.]

---

## 4. Cross-Channel Alignment & Contrarian Analysis
* **Network Commonalities:**
  * [Bullet 1: Clear operational point where multiple creators explicitly agree.]
  * [Bullet 2: Secondary point of shared execution consensus.]
* **Contrarian Delta:** [Identify any areas where creators actively contradict each other or offer opposing tactics. If none are present, output: "No significant multi-creator contradiction observed in current library context."]

---

## 5. Tactical Execution Playbook (The Consulting Engine)

### General Industry Framework & Concept Synthesis
[Provide a clear, practical, high-value explanation of the macro topic. Combine video insights seamlessly with your advanced pre-trained knowledge base to fill in any technical or strategic gaps that the video creators missed. This is the ONLY section where general industry knowledge may appear. Label it clearly as synthesis, not creator-sourced.]

### Conditional Validation Sequence
<Sequence>
  <Step subtitle="Phase 1" title="Isolate and Document Bottlenecks">
    Analyze your active workflow against the data matrix. Map your current operational metrics to spot vulnerabilities before scaling.
  </Step>
  <Step subtitle="Phase 2" title="Deploy Small-Scale Feedback Loops">
    Create a clean, 5-question problem discovery guide. Interview 10 target users to check if the market experiences the problem you are solving before writing any code.
  </Step>
  <Step subtitle="Phase 3" title="Review and Iterate Strategies">
    Compare your real-world feedback against the core video signals. Adjust your product trajectory based on incoming customer signals rather than static assumptions.
  </Step>
</Sequence>

---

## 6. Next-Step Research Triggers

<ElicitationsGroup message="Select a research optimization path to deepen this brief:">
  <Elicitation label="Extract all explicit product validation frameworks" query="Extract all explicit product validation frameworks, checklists, or step-by-step testing sequences shared across the current asset library."/>
  <Elicitation label="Scan for deeper co-founder selection metrics" query="Scan the current asset library for specific metrics, team composition strategies, or equity split advice regarding co-founder selection."/>
</ElicitationsGroup>

================================================================================
RUNTIME INSTRUCTION: Replace every bracketed placeholder above with real data
extracted from the JSON context provided. Generate findings for every cluster
in the context. Generate one DATA-CARD per finding using the evidence_cards
from that cluster. Tailor Section 6 elicitations to the actual user query.
Never output raw placeholders. Never output the word "placeholder".
================================================================================`;


type ChatHistory = Array<{ role: "user" | "assistant"; content: string }>;

function computeClusterFlags(t: ResearchTheme): {
  has_contradiction: boolean;
  has_cross_creator_agreement: boolean;
  is_sparse_cluster: boolean;
  recommendation_allowed: boolean;
} {
  const c = t.creatorCount ?? 0;
  const v = t.videoCount ?? 0;
  const q = t.quoteCount ?? 0;
  const conf = t.confidenceLabel ?? "Low";
  const isHighEnough = conf === "Very High" || conf === "High" || conf === "Medium";
  return {
    has_contradiction: (t.contrarians?.length ?? 0) > 0,
    has_cross_creator_agreement: c >= 3,
    is_sparse_cluster: c < 3 || v < 2 || q < 3,
    recommendation_allowed: c >= 3 && v >= 2 && q >= 2 && isHighEnough,
  };
}

function normalizeConfidence(label: string | undefined): "very_high" | "high" | "medium" | "low" {
  switch (label) {
    case "Very High": return "very_high";
    case "High": return "high";
    case "Medium": return "medium";
    default: return "low";
  }
}

function buildCluster(t: ResearchTheme, clusterId: string) {
  return {
    cluster_id: clusterId,
    title: t.title,
    confidence: normalizeConfidence(t.confidenceLabel),
    confidence_reasoning: t.confidenceReasoning ?? "",
    metrics: {
      creator_count: t.creatorCount ?? 0,
      video_count: t.videoCount ?? 0,
      quote_count: t.quoteCount ?? 0,
    },
    evidence_cards: (t.sources ?? []).map(s => ({
      creator: s.creator,
      video: s.videoTitle,
      timestamp: s.timestampStr ?? "?",
      quote: s.quote,
    })),
    contrarian_cards: (t.contrarians ?? []).map(c => ({
      creator: c.creator,
      timestamp: c.timestampStr ?? "?",
      quote: c.quote ?? c.reason ?? "",
    })),
    analyst_verdict: t.marketSignal ?? null,
    recommended_action:
      t.operatorPlaybook && !t.operatorPlaybook.withheld
        ? t.operatorPlaybook.strategicStep ?? null
        : null,
    flags: computeClusterFlags(t),
  };
}

function buildReportContext(report: ResearchReport, activeFindingIndex?: number): string {
  const activeTheme =
    activeFindingIndex !== undefined ? report.themes[activeFindingIndex] : undefined;

  const context = {
    activeFindingIndex: activeFindingIndex ?? null,
    query: report.topic,
    active_finding: activeTheme
      ? buildCluster(activeTheme, `finding_${activeFindingIndex}`)
      : null,
    clusters: report.themes.map((t, i) => buildCluster(t, `finding_${i}`)),
    limited_signals: (report.limitedThemes ?? []).map((t, i) => buildCluster(t, `limited_${i}`)),
    synthesis: report.synthesis ?? null,
  };

  return JSON.stringify(context, null, 2);
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
    max_tokens: 1800,
  });

  const answer = completion.choices[0]?.message?.content ?? "No response generated.";
  return NextResponse.json({ answer });
}
