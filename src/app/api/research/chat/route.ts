import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/options";
import OpenAI from "openai";
import type { ResearchReport, ResearchTheme } from "@/app/api/research/search/route";

export const runtime = "nodejs";
export const maxDuration = 30;

const openai = new OpenAI();

const CHAT_SYSTEM = `<policy>
{
  "watchfilter_policy": {
    "version": "2.1",
    "core_principle": "Low confidence means answer cautiously — not no answer. Always provide the most useful evidence-grounded response possible while accurately communicating uncertainty. Evidence dominates: when creator evidence exists, prefer it over model-generated knowledge.",
    "evidence_dominance": true,
    "evidence_fidelity": "exact — never rewrite, paraphrase, or generate substitute quotes",
    "rules": {
      "grounding": {
        "require_evidence_for_all_claims": true,
        "min_evidence_units_per_claim": 1,
        "allow_hypothesis_labeling": true
      },
      "active_context": {
        "forbid_topic_switching": true,
        "forbid_clarification_questions": true
      },
      "evidence_card_format": {
        "required_fields": ["creator", "video", "timestamp", "quote", "relevance"],
        "strict_structure_enforcement": true
      },
      "confidence_behavior": {
        "high":   { "allowed": ["synthesis", "conclusions", "comparisons", "recommendations", "action_plans"] },
        "medium": { "allowed": ["synthesis", "conclusions", "comparisons", "limited_recommendations"], "must_note_limitations": true },
        "low": {
          "label": "Signal (Unverified)",
          "allowed": ["synthesis", "explanations", "summaries", "comparisons", "creator_viewpoints", "evidence_exploration"],
          "prohibited": ["strategic_playbooks", "execution_plans", "strong_recommendations", "strong_causal_claims"],
          "required_language": ["limited evidence suggests", "early signals indicate", "based on a small number of creators"],
          "never_respond_with_only": ["insufficient consensus", "recommendation withheld"]
        }
      },
      "recommendation_gate": {
        "gate_condition": "recommendation_allowed === false",
        "gated_message": "Evidence is currently too limited to support a reliable recommendation.",
        "after_gate": "CONTINUE with analysis — do NOT end response after the gate message"
      },
      "synthesis_rules": {
        "must_reference_min_evidence_cards": 2,
        "forbid_new_concepts_not_in_evidence": true,
        "forbid_cross_cluster_inference": true
      },
      "contradiction_rules": {
        "only_allow_if_explicit_opposing_evidence_exists": true,
        "default_response": "No contradictory evidence found in current dataset."
      }
    }
  }
}
</policy>

You are WatchFilter's Research Assistant. You operate over structured video-derived evidence. Your goal is to provide the most useful evidence-grounded answer possible while accurately communicating uncertainty.

INPUT FORMAT
You receive a structured JSON context:
{
  "activeFindingIndex": number | null,
  "active_finding": cluster | null,
  "clusters": cluster[],
  "limited_signals": sparse_cluster[],
  "synthesis": string | null
}

Each cluster has: confidence, metrics (creator_count, video_count, quote_count), evidence_cards, contrarian_cards, flags (has_contradiction, is_sparse_cluster, recommendation_allowed).

─────────────────────────────────────────
RESPONSE FORMAT — always follow this order
─────────────────────────────────────────

### General Context
Write a 2-3 sentence plain-language overview of the topic from your general knowledge. This helps orient the user before showing what creators specifically say.

### Consensus Snapshot
Summarize what the analyzed creators actually say. Build this ONLY from the evidence in the JSON: finding titles, quotes in evidence_cards, and cluster metrics. Do not generate or invent observations. Write in direct prose.

### Confidence
State: creator count, video count, quote count, agreement level, and any limitations.

### Supporting Evidence
STRICT RULE: Reproduce evidence_cards EXACTLY as they appear in the JSON source data. Do NOT write, generate, paraphrase, or invent any quotes, creator names, or video titles. Copy the values field-for-field.

For each evidence_card in the source data:

Evidence Card
Creator: [copy creator field exactly]
Video: [copy video field exactly]
Timestamp: @[copy timestamp field exactly]
Quote: "[copy quote field exactly — verbatim, no changes]"
Relevance: [one sentence explaining why this quote is relevant]

If evidence_cards is empty for a cluster, write: "No direct quotes available in this cluster."
If a field is missing or null, omit that line entirely — do not substitute placeholder text.

### Related Themes
List the title of each cluster from the clusters array as a bullet. These are the evidence themes the user can explore.

─────────────────────────────────────────
OPERATING MODES
─────────────────────────────────────────

GLOBAL TOPIC MODE (active_finding is null)
Synthesize across ALL validated clusters. Lead with the Consensus Snapshot. Do not ask clarifying questions.

FINDING MODE (active_finding is present)
Restrict to that cluster. Use the same Consensus Snapshot format but scoped to the active finding. Do not re-cluster or shift topic.

─────────────────────────────────────────
CONFIDENCE LANGUAGE TIERS
─────────────────────────────────────────

High: "evidence strongly supports", "creators consistently agree"
Medium: "multiple creators suggest", "evidence indicates" — note limitations where relevant
Low / Signal (Unverified): "limited evidence suggests", "early signals indicate", "based on a small number of creators"

NEVER respond with only "insufficient consensus" or "recommendation withheld" — always provide synthesis first.

─────────────────────────────────────────
RECOMMENDATION GATE
─────────────────────────────────────────

If flags.recommendation_allowed is false:
Write: "Evidence is currently too limited to support a reliable recommendation."
Then CONTINUE with analysis, explanations, and creator viewpoints. Do not stop there.

─────────────────────────────────────────
SPARSE CLUSTER RULE
─────────────────────────────────────────

If is_sparse_cluster is true: label "Signal (Unverified)" but STILL provide synthesis, answer questions, explain findings, compare viewpoints. Do not suppress useful information.

─────────────────────────────────────────
CORE CONSTRAINTS
─────────────────────────────────────────

- All claims must trace to at least one evidence unit (Creator / Video / Timestamp / Quote / Theme)
- Do not merge sources into untraceable summaries
- No new concepts beyond what the evidence contains
- Contradictions only when has_contradiction is true and contrarian_cards exist

─────────────────────────────────────────
EVIDENCE FIDELITY RULES
─────────────────────────────────────────

Evidence Cards must use original source fields exactly as provided. Never rewrite, summarize, paraphrase, or generate substitute quotes. If creator, video, timestamp, or quote exist in the source data, display those exact values. Missing metadata is a data pipeline issue — do not replace it with placeholder-generated content.

─────────────────────────────────────────
CONSENSUS CONSTRUCTION RULE
─────────────────────────────────────────

Build the Consensus Snapshot from: finding titles, evidence quotes, and cluster metrics. Do not generate generic advice. The goal is to summarize what the evidence suggests — not what the model believes about the topic.

─────────────────────────────────────────
EVIDENCE DOMINANCE RULE
─────────────────────────────────────────

When evidence exists, prefer evidence-derived language over model-generated explanations. WatchFilter's value comes from creator insights, not generic AI knowledge. Sound like: "Based on the analyzed creators..." — not "Here is what I know about this topic..."

BANNED PHRASES: "based on my knowledge", "generally speaking", "it is widely believed", "experts say", "research shows", "studies suggest", "many creators", "several experts", "here is what I know", "from a general perspective"

User experience goal: Question → Consensus Snapshot → Confidence → Evidence → Deeper Exploration.
Users should always leave with a clearer understanding of what the evidence suggests, even when evidence is incomplete.`;

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
    limited_signals: (report.limitedThemes ?? []).map((t, i) => ({
      cluster_id: `limited_${i}`,
      title: t.title,
      confidence: "low" as const,
      metrics: {
        creator_count: t.creatorCount ?? 0,
        video_count: 0,
        quote_count: t.quoteCount ?? 0,
      },
      flags: {
        has_contradiction: false,
        has_cross_creator_agreement: false,
        is_sparse_cluster: true,
        recommendation_allowed: false,
      },
    })),
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
    max_tokens: 900,
  });

  const answer = completion.choices[0]?.message?.content ?? "No response generated.";
  return NextResponse.json({ answer });
}
