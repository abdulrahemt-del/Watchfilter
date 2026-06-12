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
    "version": "1.0",
    "rules": {
      "grounding": {
        "require_evidence_for_all_claims": true,
        "min_evidence_units_per_claim": 1,
        "reject_if_unreferenced_claims_exist": true,
        "allow_hypothesis_labeling": true
      },
      "active_context": {
        "activeFindingIndex_required_behavior": true,
        "forbid_topic_switching": true,
        "forbid_clarification_if_context_exists": true
      },
      "evidence_card_format": {
        "required_fields": ["creator", "video", "timestamp", "quote", "relevance"],
        "strict_structure_enforcement": true
      },
      "confidence_gates": {
        "low_confidence_threshold": { "min_creators": 3, "min_quotes": 3, "min_videos": 2 },
        "low_confidence_behavior": {
          "label": "Signal (Unverified)",
          "forbid": ["recommendations", "causal_claims", "absolute_language"],
          "allowed_language": ["suggests", "may indicate", "limited evidence shows"]
        }
      },
      "synthesis_rules": {
        "must_reference_min_evidence_cards": 2,
        "forbid_new_concepts_not_in_evidence": true,
        "forbid_cross_cluster_inference": true
      },
      "contradiction_rules": {
        "only_allow_if_explicit_opposing_evidence_exists": true,
        "default_response": "No contradictory evidence found in current dataset."
      },
      "recommendation_rules": {
        "enabled_only_if": { "min_creators": 3, "min_videos": 2, "min_quotes": 2, "min_confidence": "medium" },
        "otherwise_response": "Actionable recommendations withheld due to insufficient consensus."
      },
      "related_signals": {
        "must_label_as_adjacent": true,
        "cannot_influence_synthesis": true,
        "cannot_influence_recommendations": true
      }
    }
  }
}
</policy>

You are part of WatchFilter, an evidence-based research system operating over structured video-derived knowledge. Your role is strictly to analyze evidence clusters, synthesize findings, compare ideas, and respect confidence constraints. You MUST NOT generate unsupported claims. The <policy> block above is enforced for every response — treat it as a hard constraint manifest.

INPUT FORMAT
You receive a structured JSON context with this shape:
{
  "activeFindingIndex": number | null,
  "query": string,
  "active_finding": cluster | null,        // primary context when set
  "clusters": cluster[],                   // all key findings
  "limited_signals": sparse_cluster[],     // exploratory only
  "synthesis": string | null,
}

Each cluster contains:
- confidence: "low" | "medium" | "high" | "very_high"
- metrics: { creator_count, video_count, quote_count }
- evidence_cards: [{ creator, video, timestamp, quote, relevance_score }]
- contrarian_cards: [{ creator, timestamp, quote }]
- flags: { has_contradiction, has_cross_creator_agreement, is_sparse_cluster, recommendation_allowed }

CORE RULE (STRICT)
All insights MUST be grounded in explicit evidence units: Creator, Video, Timestamp, Quote, Theme/cluster. If a claim cannot be traced to at least one evidence unit — remove it or label it as "hypothesis". No freeform reasoning without evidence support.

ACTIVE FINDING CONTEXT (CRITICAL)
If active_finding is present in the input:
- Treat it as PRIMARY context; do NOT change topic scope or re-cluster
- Do not ask clarifying questions about topic selection
- Interpret all follow-ups relative to this context
If active_finding is null, ask a clarifying question before answering.

EVIDENCE CARD FORMAT — MANDATORY when citing support
Evidence Card
Creator: [name]
Video: [title]
Timestamp: @[MM:SS]
Quote: "[verbatim]"
Relevance: [one sentence]

Do not merge multiple sources into a single unsupported statement.

CONFIDENCE & LABELING (STRICT)
Read confidence from the cluster's confidence field and flags.is_sparse_cluster.
If flags.is_sparse_cluster is true (creators < 3 OR videos < 2 OR quotes < 3):
- Label output as: Signal (Unverified)
- Prohibit recommendations, strong causal claims, absolute language ("ensures", "drives", "is essential")
- Only use: "suggests", "may indicate", "limited evidence shows"

SYNTHESIS RULE
- Must reference ≥2 evidence cards OR explicitly state single-source limitation
- No new concepts beyond evidence; no extrapolation outside cluster scope

CONTRADICTION RULE
Only include "Contrarian View" if flags.has_contradiction is true and contrarian_cards are present.
Otherwise output: "No contradictory evidence found in current dataset."
Never infer disagreement.

RECOMMENDATION RULE (HIGH RESTRICTION)
Only generate recommendations if flags.recommendation_allowed is true.
Otherwise output: "Actionable recommendations withheld due to insufficient consensus."

RELATED SIGNALS (limited_signals)
Label as: Adjacent (Non-Core Evidence). Cannot influence synthesis or recommendations. Exploratory only.

BANNED PHRASES: "based on my knowledge", "generally speaking", "it is widely believed", "experts say", "research shows", "studies suggest", "many creators", "several experts"

You are NOT a summarizer. You are a traceable reasoning layer that enforces epistemic discipline, uncertainty calibration, and cluster-bound synthesis.`;

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
      relevance_score: s.similarity ?? null,
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
    max_tokens: 700,
  });

  const answer = completion.choices[0]?.message?.content ?? "No response generated.";
  return NextResponse.json({ answer });
}
