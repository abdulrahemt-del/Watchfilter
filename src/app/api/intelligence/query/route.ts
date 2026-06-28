import { NextRequest } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/options";
import OpenAI from "openai";
import { getDeepResearchEvidence, countCreatorCorpusMatches, logCreatorCoverageGap, logCreatorOutcome, type DeepResearchRow } from "@/lib/db";
import { searchHN, extractHNClaims, type HNClaim } from "@/lib/hnSkill";
import { searchReddit, extractRedditClaims } from "@/lib/redditSkill";
import { intelligenceWebSearch, type IntelligenceArticle } from "@/lib/webSearch";

export const runtime = "nodejs";
export const maxDuration = 120;

const openai = new OpenAI();

// ── Public types (consumed by IntelligenceView) ───────────────────────────────

export type IntelligenceMemo = {
  query: string;
  generated_at: string;
  query_type: "BINARY" | "COMPARATIVE" | "EXPLORATORY";
  directional: string;
  decision_summary: string;
  comparative_verdict: {
    dimensions: Array<{
      label: string;
      winner: string;
      confidence: "High" | "Medium" | "Low";
      evidence_count: number;
      reasons: string[];
    }>;
    overall_recommendation: string;
    coverage_balance: Array<{ option: string; signal_count: number }> | null;
    comparison_quality: "Strong" | "Moderate" | "Weak" | null;
    // Phase 4: Comparative Intelligence Engine
    strategy_profiles: Array<{
      option: string;
      evidence_strength: number;          // 0-100
      source_coverage: {
        creator:   "Strong" | "Medium" | "Weak" | "Missing";
        community: "Strong" | "Medium" | "Weak" | "Missing";
        web:       "Strong" | "Medium" | "Weak" | "Missing";
      };
      advantages:       string[];
      costs:            string[];
      failure_modes:    string[];
      best_for:         string[];
      expected_outcome: string | null;
      evidence_gaps:    string[];
    }> | null;
    comparison_completeness: "High" | "Medium" | "Low" | null;
    completeness_reason:     string | null;
    missing_dimensions:      string[];
    decision_risk:           "High" | "Medium" | "Low" | null;
    decision_risk_reason:    string | null;
    strategy_roadmap: Array<{
      phase: string;
      steps: string[];
    }> | null;
    decision_flow: Array<{
      question: string;
      yes_action: string;
      no_action: string;
    }> | null;
  } | null;
  reddit_gap: boolean;
  confidence_score: number;
  confidence_breakdown: {
    agreement: number;           // 0-100
    sourceCoverage: number;      // 0-100
    contradictionPenalty: number;// 0-100
    signalDensity: number;       // 0-100
    crossSourceBonus: number;    // 0-15
  };
  consensus: {
    agreement_score: number; // 0-100
    shared_insights: string[];
    disagreements: string[];
    source_states: Record<"youtube" | "reddit" | "web", "SUPPORTS" | "OPPOSES" | "MIXED" | "NO_SIGNAL">;
    supporting_sources: number;
    opposing_sources: number;
    unavailable_sources: number;
    relationship_type: "CONTRADICTION" | "TRADEOFF" | "COMPLEMENTARY" | "CONSENSUS";
    relationship_reason: string;
    is_comparative_query: boolean;
  };
  source_breakdown: {
    youtube: { count: number; key_signals: string[] };
    reddit:  { count: number; key_signals: string[] };
    web:     { count: number; key_signals: string[] };
  };
  contradictions: Array<{
    claim_a: string;
    claim_b: string;
    why_it_matters: string;
    conflict_type: "direct" | "partial" | "contextual" | "tradeoff";
  }>;
  tradeoffs: Array<{
    claim_a: string;
    claim_b: string;
    why_it_matters: string;
  }>;
  cross_source_consensus: Array<{
    insight: string;
    source_types: Array<"creator" | "community" | "web">;
    source_count: number;
    source_detail: Partial<Record<"creator" | "community" | "web", { evidence_count: number }>>;
    confidence_score: number;
    agreement: "High" | "Medium" | "Low";
  }>;
  decision_recommendation: {
    stage_based_actions: {
      pre_product:  string[];
      early_stage:  string[];
      growth_stage: string[];
    };
    priority_actions: Array<{
      action: string;
      evidence_strength: "High" | "Medium" | "Low";
      supporting_signals: number;
    }>;
  };
  insight_clusters: Array<{
    theme: string;
    signal_count: number;
    confidence: "High" | "Medium" | "Low";
    key_themes: string[];
  }>;
  insight_density: {
    total_signals: number;
    unique_insights: number;
  };
  evidence_used: {
    total_signals: number;
    primary_themes: string[];
  };
  evidence_count: {
    youtube: number;
    reddit:  number;
    web:     number;
  };
  reddit_diagnostics: {
    queries_generated: number;
    posts_retrieved: number;
    posts_after_dedupe: number;
    posts_submitted: number;
    comments_retrieved: number;
    claims_extracted: number;
  } | null;
  source_quality_scores: {
    youtube: { score: number; level: "High" | "Medium" | "Low"; excluded: boolean };
    reddit:  { score: number; level: "High" | "Medium" | "Low"; excluded: boolean };
    web:     { score: number; level: "High" | "Medium" | "Low"; excluded: boolean };
  };
  sources_used: Array<"youtube" | "reddit" | "web">;
  best_evidence_ranking: string[];
  coverage: {
    score: number;
    active: string[];
    missing: string[];
    gap_impact: string[];
  };
  evidence_processing: {
    retrieved: number;
    relevance_passed: number;
    quality_accepted: number;
    query_intent: string;
    query_domain: string;
    is_recovery: boolean;
    quality_warning: string | null;
  };
  source_detail: Record<"youtube" | "reddit" | "web", {
    quality_score: number;
    signal_count: number;
    unique_insights: number;
    overlapping_insights: number;
    contribution_pct: number;
    primary_claims: string[];
    excluded: boolean;
    excluded_sample: Array<{ claim: string; reason: string }>;
  }>;
  attributed_evidence: Array<{
    claim: string;
    sources: Array<{ source: "youtube" | "reddit" | "web"; signal_count: number }>;
  }>;
  evidence_waterfall: {
    retrieved: { youtube: number; reddit: number; web: number };
    accepted:  { youtube: number; reddit: number; web: number };
    normalized: number;
    synthesized: number;
  };
  source_perspective: Record<"youtube" | "reddit" | "web", {
    bullets: string[];
    common_view: string;
    confidence: "High" | "Medium" | "Low";
    weak_signal: boolean;
  } | null>;
  cross_source_synthesis: {
    youtube: string | null;
    reddit: string | null;
    web: string | null;
  } | null;
  perspective_raw: Record<"youtube" | "reddit" | "web", string[]> | null;
  creator_intelligence: {
    themes_generated: number;
    alignment_percentage: number;
    coverage_alignment_state: "Strong Creator Signal" | "Adjacent Topic Problem" | "Niche But Relevant" | "Corpus Gap";
    creator_signal_outcome:
      | "Missing Creator Content"
      | "Retrieval Failure"
      | "Quality Gate Failure"
      | "Weak Query Alignment"
      | "Synthesis Failure"
      | "Weak Creator Signal"
      | "Strong Creator Signal";
    // Authoritative outcome enum — all UI and decision logic must gate on this
    outcome: "MISSING_CONTENT" | "RETRIEVAL_FAILURE" | "QUALITY_FAILURE" | "ALIGNMENT_FAILURE" | "SYNTHESIS_FAILURE" | "WEAK_SIGNAL" | "STRONG_SIGNAL";
    creator_available: boolean; // true iff themes_generated > 0
    claims: Array<{
      theme: string;
      confidence: "High" | "Medium" | "Low";
      confidence_score: number;
      consensus: "Anecdotal" | "Emerging Consensus" | "Strong Consensus" | "Broad Consensus";
      creator_count: number;
      evidence_count: number;
      avg_similarity: number;
      avg_alignment: number;              // avg question_alignment_score across evidence (0.0–1.0)
      potentially_off_question: boolean; // true when avg_alignment < 0.40
      evidence: Array<{
        creator: string;
        video_title: string | null;
        video_id: string | null;
        timestamp: string | null;
        quote: string;
        relevance_score: number;
        question_alignment_score: number; // 0.0–1.0: how directly this claim answers the query
      }>;
    }>;
    coverage: {
      retrieved: number;
      accepted: number;
      rejected: number;
      coverage_score: number;
      level: "High" | "Medium" | "Low";
      avg_similarity: number;
      unique_creators: number;
      evidence_density: number;
      evidence_density_level: "High" | "Medium" | "Low";
      top_rejections: Array<{ claim: string; relevance_score: number; reason: string }>;
      coverage_status: "Good" | "Weak" | "Contaminated" | "No Coverage";
      coverage_type: "MISSING_CONTENT" | "ADJACENT_CONTENT" | "DIRECT_CONTENT";
      off_topic_count: number;
      off_topic_ratio: number;
      corpus_matches: number;
      root_cause: "Missing Corpus Content" | "Retrieval Quality" | "None";
      primary_failure_stage: string;
      evidence_lost: number;
      most_common_rejection: string;
    };
    debug: {
      retrieval_funnel: {
        corpus_matches: number;
        retrieved: number;
        passed_strength: number;
        passed_relevance: number;
        passed_quality: number;
        passed_topic_gate: number;
        accepted: number;
      };
      retrieval_trace: Array<{
        creator: string;
        video: string;
        keyword_score: number;
        retrieval_rank: number;
        accepted: boolean;
        rejection_reason?: string;
      }>;
      rejection_breakdown: Record<string, number>;
      missed_evidence: Array<{
        creator: string;
        video: string;
        keyword_score: number;
        reason_not_selected: string;
        retrieval_rank: number;
      }>;
      evidence_lost_at_stage: Record<string, number>;
      alignment: {
        accepted_claims: number;
        high_alignment_claims: number;
        average_alignment: number;
      };
      top_answering_claims: Array<{
        creator: string;
        quote: string;
        alignment: number;
        video_title: string | null;
        theme: string;
      }>;
      off_question_claims: Array<{
        creator: string;
        quote: string;
        alignment: number;
        theme: string;
      }>;
    };
  } | null;
  decision_drivers: {
    positive_signals: Array<{
      insight: string;
      source_types: Array<"creator" | "community" | "web">;
      source_count: number;
      confidence_score: number;
      is_cross_source: boolean;
    }>;
    negative_signals: Array<{
      insight: string;
      source_types: Array<"creator" | "community" | "web">;
      source_count: number;
      confidence_score: number;
    }>;
    uncertainty_factors: string[];
    decision_justification: string;
    decision_strength: "Strong" | "Moderate" | "Weak";
    missing_evidence: string[];
  };
  recommendation_type: "Universal" | "Conditional" | "Stage-Based" | "Industry-Specific" | "Team-Dependent";
  condition_qualifier: string | null;
  consensus_quality: "Strong" | "Medium" | "Weak" | "Insufficient";
  canonical_agreement: {
    score: number;
    label: "Strong Consensus" | "Moderate Consensus" | "Partial Consensus" | "Mixed Evidence" | "No Consensus";
    supporting_sources: number;
    contradictions_count: number;
    tradeoffs_count: number;
    coverage_quality: "Strong" | "Moderate" | "Weak" | "Insufficient";
    explanation: string;
  };
  recommendation_stability: "High" | "Medium" | "Low";
  counter_evidence: string[];
  why_not_alternative: string | null;
  recommendation_conditions: string[];
};

// ── Internal types ────────────────────────────────────────────────────────────

type NormalizedClaim = {
  id: string;
  source: "youtube" | "reddit" | "web";
  claim: string;
  type: "pain_point" | "success" | "failure" | "opinion" | "statistic" | "recommendation";
  strength: number;
  specificity: number;
  recency: number;
  engagement: number;
  queryRelevance: number; // 0–100 — scored against current query keywords
};

type ClaimCluster = {
  theme: string;
  claims: NormalizedClaim[];
};

type ConfidenceResult = {
  confidence: number; // 0-1
  breakdown: {
    agreement: number;            // 0-100
    sourceCoverage: number;       // 0-100
    contradictionPenalty: number; // 0-100
    signalDensity: number;        // 0-100
    crossSourceBonus: number;     // 0-15
  };
};

// Per-source signal state — distinguishes "no evidence" (NO_SIGNAL) from "contradicting evidence" (OPPOSES)
type SourceSignalState = "SUPPORTS" | "OPPOSES" | "MIXED" | "NO_SIGNAL";

type ExtractorOutput = {
  normalized_claims: Array<{
    id: string;
    source: string;
    type: string;
    claim: string;
    evidence: string;
    tags: string[];
  }>;
  insight_clusters: Array<{
    theme: string;
    claims: string[];
    summary: string;
    key_themes?: string[];
  }>;
  contradictions: Array<{
    claim_a: string;
    claim_b: string;
    conflict_type: "direct" | "partial" | "contextual" | "tradeoff";
    explanation: string;
  }>;
  source_map: {
    youtube: { claims: number };
    reddit:  { claims: number; signal_status: "strong" | "weak" | "missing" };
    web:     { claims: number };
  };
  stage_interpretation: {
    pre_product:  { observations: string[] };
    early_stage:  { observations: string[] };
    growth_stage: { observations: string[] };
  };
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function clamp(v: number, min: number, max: number) { return Math.max(min, Math.min(max, v)); }

const STOP = new Set(["that","this","with","from","what","about","have","which","been","were","they","their","there","when","then","than","also","into","through","during","before","after","above","below","more","most","some","such","like","just","over","very","will","would","could","should","does","make","made","take","know","look","come","year","time","want","need","good","best","work","used","for","the","and","are","but","not","you","all","can","her","was","one","our","out","day","get","has","him","his","how","its","let","man","new","now","old","see","two","way","who","boy","did","put","say","she","too","use","why","your","have","that"]);

function extractKeywords(q: string): string[] {
  return [...new Set(
    q.toLowerCase().replace(/[^\w\s]/g, " ").split(/\s+/)
      .filter(w => w.length > 3 && !STOP.has(w))
  )].slice(0, 8);
}

// Morphological variants — catches singular/plural, -ing, and shared 5-char stem
// "acquisition" → ["acqui"], "strategies" → ["strat"], "startups" → ["startup"]
function keywordVariants(kw: string): string[] {
  const v = new Set([kw]);
  if (kw.endsWith("ies"))                                  v.add(kw.slice(0, -3) + "y");
  else if (kw.endsWith("y"))                               v.add(kw.slice(0, -1) + "ies");
  if (kw.endsWith("s") && kw.length > 4 && !kw.endsWith("ss")) v.add(kw.slice(0, -1));
  else if (!kw.endsWith("s"))                              v.add(kw + "s");
  if (kw.endsWith("ing") && kw.length > 5)                v.add(kw.slice(0, -3));
  if (kw.length >= 7)                                      v.add(kw.slice(0, 5)); // acquisi… → acqui
  return [...v].filter(w => w.length >= 4);
}

// Score how relevant a claim's text is to the current query (0–100)
function scoreClaimRelevance(text: string, keywords: string[]): number {
  if (!keywords.length) return 60;
  const lower = text.toLowerCase();
  const matched = keywords.filter(kw => keywordVariants(kw).some(v => lower.includes(v))).length;
  return Math.round((matched / keywords.length) * 100);
}

// Question alignment score — measures how directly a claim answers the user's query (0.0–1.0).
// Combines keyword overlap with bigram phrase matching and off-topic penalty.
function computeQuestionAlignment(text: string, keywords: string[]): number {
  if (!keywords.length) return 0.5;
  const lower = text.toLowerCase();

  const keywordScore = scoreClaimRelevance(text, keywords) / 100;

  // Bonus when 2 adjacent keywords appear together in the claim
  const bigrams = keywords.slice(0, -1).map((w, i) => `${w} ${keywords[i + 1]}`);
  let phraseBonus = 0;
  for (const phrase of bigrams) {
    if (lower.includes(phrase)) { phraseBonus = 0.25; break; }
  }

  // Penalty for explicit off-topic markers
  const offTopicMarkers = [
    "self-leadership", "personal development", "wealth mindset", "life lesson",
    "motivat", "lead yourself", "leadership principle", "self-improvement",
  ];
  const penalty = offTopicMarkers.some(m => lower.includes(m)) ? 0.5 : 0;

  return Math.max(0, Math.min(1, keywordScore * 0.75 + phraseBonus - penalty));
}

// ── Query intent classification ───────────────────────────────────────────────

type QueryIntent = "exploration" | "comparison" | "recommendation" | "decision" | "prediction" | "research";

function classifyQueryIntent(q: string): QueryIntent {
  const s = q.toLowerCase();
  if (s.includes(" vs ") || s.includes(" versus ") || s.includes("compar") || / or /.test(s)) return "comparison";
  if (s.includes("should i") || s.includes("should we") || s.includes("worth it") || s.includes("is it worth")) return "decision";
  if (s.includes("will ") || s.includes("predict") || s.includes("forecast") || /by 20\d\d/.test(s)) return "prediction";
  if (s.startsWith("what is ") || s.startsWith("define ") || s.startsWith("explain ")) return "research";
  if (s.startsWith("best ") || s.includes("strateg") || s.includes("how to") || s.includes("how do") || s.includes("what are")) return "exploration";
  return "recommendation";
}

// Looser gates for broad exploratory queries; tighter for precision decisions
const INTENT_THRESHOLDS: Record<QueryIntent, { relevanceGate: number; qualityExclude: number }> = {
  exploration:    { relevanceGate: 20, qualityExclude: 20 },
  recommendation: { relevanceGate: 25, qualityExclude: 25 },
  comparison:     { relevanceGate: 30, qualityExclude: 35 },
  decision:       { relevanceGate: 35, qualityExclude: 40 },
  prediction:     { relevanceGate: 40, qualityExclude: 45 },
  research:       { relevanceGate: 45, qualityExclude: 50 },
};

// Minimum query relevance for YouTube claims to enter the pipeline.
// Applied after the quality gate — off-topic YT claims are tracked but excluded
// from clustering, confidence scoring, cross-source consensus, and decision drivers.
const CREATOR_TOPIC_GATE = 50;

// Minimum question_alignment_score (0.0–1.0) for a YT claim to influence theme clustering.
// Claims below this threshold pass coverage tracking but are excluded from the extractor input,
// preventing generic founder advice from steering theme generation.
// 0.35 = floor(1/2 * 100) * 0.75 — allows 1-of-2 keyword matches to qualify for themes.
const MIN_THEME_ALIGNMENT = 0.35;

// ── Query domain classification ───────────────────────────────────────────────

type QueryDomain =
  | "customer_acquisition"
  | "growth_strategy"
  | "product_building"
  | "fundraising"
  | "technical"
  | "market_research";

// Per-domain: allowed vocabulary (for cluster validation) + forbidden markers
const DOMAIN_VOCABULARY: Record<QueryDomain, { label: string; allowed: string[]; forbidden: string[] }> = {
  customer_acquisition: {
    label: "Customer Acquisition",
    allowed: ["customer", "user", "acqui", "growth", "gtm", "outreach", "sales", "referral", "channel", "adopt", "traction", "lead", "conversion", "market", "funnel", "prospect", "signup", "revenue", "distribution", "niche", "audience", "trust", "early adopter", "cold", "inbound", "demand", "churn"],
    forbidden: ["self-leadership", "personal development", "life outcome", "wealth mindset", "self-improvement", "leadership principle", "motivat", "life lesson", "philosophy of wealth"],
  },
  growth_strategy: {
    label: "Growth Strategy",
    allowed: ["growth", "scale", "expand", "market", "strateg", "competitive", "position", "retention", "churn", "viral", "loop", "network", "distribution", "acquisition"],
    forbidden: ["self-leadership", "personal development", "life outcome", "wealth mindset"],
  },
  product_building: {
    label: "Product Building",
    allowed: ["product", "build", "feature", "mvp", "engineer", "develop", "iteration", "roadmap", "user research", "feedback", "ship", "launch", "design", "ux"],
    forbidden: ["personal development", "leadership mindset", "self-leadership"],
  },
  fundraising: {
    label: "Fundraising",
    allowed: ["fund", "invest", "raise", "venture", "capital", "seed", "pitch", "valuation", "term", "dilution", "equity", "angel", "investor"],
    forbidden: ["personal development", "self-leadership"],
  },
  technical: {
    label: "Technical",
    allowed: ["code", "engineer", "technical", "architect", "api", "infrastructure", "performance", "security", "deploy", "scale", "database", "system"],
    forbidden: ["personal development", "mindset", "self-leadership"],
  },
  market_research: {
    label: "Market Research",
    allowed: ["market", "research", "trend", "industry", "competition", "analysis", "insight", "data", "report", "survey", "segment", "customer"],
    forbidden: ["personal development", "self-leadership", "wealth mindset"],
  },
};

function classifyQueryDomain(q: string): QueryDomain {
  const s = q.toLowerCase();
  if (s.includes("customer") || s.includes("acqui") || s.includes("first user") || s.includes("first customer") || s.includes("gtm") || s.includes("go-to-market") || s.includes("sales channel") || s.includes("early traction") || s.includes("100 customer") || s.includes("traction")) return "customer_acquisition";
  if (s.includes("grow") || s.includes("scale") || s.includes("expand") || s.includes("viral") || s.includes("retention") || s.includes("churn")) return "growth_strategy";
  if (s.includes("build") || s.includes("product") || s.includes("feature") || s.includes("mvp") || s.includes("ship") || s.includes("engineer") || s.includes("develop")) return "product_building";
  if (s.includes("fund") || s.includes("invest") || s.includes("raise") || s.includes("pitch") || s.includes("vc ") || s.includes("capital")) return "fundraising";
  if (s.includes("code") || s.includes("technical") || s.includes("architect") || s.includes("infrastructure") || s.includes("engineer")) return "technical";
  return "market_research";
}

// ── Source → NormalizedClaim converters ───────────────────────────────────────
// Note: queryRelevance is added externally after construction

function ytToNormalizedClaims(rows: DeepResearchRow[]): Omit<NormalizedClaim, "queryRelevance">[] {
  return rows.slice(0, 40).map((r, i) => {
    const base = r.signal_strength === "HIGH" ? 0.85 : r.signal_strength === "MEDIUM" ? 0.6 : 0.35;
    const text = String(r.insight ?? r.quote ?? "").slice(0, 220);
    return {
      id: `yt-${i}`,
      source: "youtube" as const,
      claim: text,
      type: (r.type as NormalizedClaim["type"]) ?? "opinion",
      strength: base,
      specificity: clamp(text.length / 200, 0, 1),
      recency: 0.5,
      engagement: base,
    };
  }).filter(c => c.claim.length > 10);
}

function hnToNormalizedClaims(claims: HNClaim[]): Omit<NormalizedClaim, "queryRelevance">[] {
  const maxScore = Math.max(...claims.map(c => c.post_score), 1);
  return claims.map((c, i) => {
    // Use Date.parse (milliseconds) not Number() — Number() of an ISO string is NaN,
    // which propagates through computeClaimStrength and makes every HN claim fail the >= 0.3 filter.
    const createdMs = c.created_at ? Date.parse(c.created_at) : NaN;
    const age = Number.isFinite(createdMs)
      ? clamp(1 - (Date.now() - createdMs) / (365 * 86400 * 1000), 0, 1)
      : 0.5;
    const commentBoost = c.source_type === "comment" ? 1.5 : 1.0;
    const supportBonus = Math.min(((c.support_count ?? 1) - 1) * 0.1, 0.3);
    return {
      id: `rd-${i}`,
      source: "reddit" as const,
      claim: c.text,
      type: (c.claim_type as NormalizedClaim["type"]) ?? "opinion",
      strength: clamp(0.35 + Math.log1p(Math.max(0, c.post_score)) / 10, 0, 0.95),
      specificity: clamp(c.text.length / 300 + supportBonus, 0, 1),
      recency: age,
      engagement: clamp((c.post_score / maxScore) * commentBoost, 0, 1),
    };
  });
}

function webToNormalizedClaims(articles: IntelligenceArticle[]): Omit<NormalizedClaim, "queryRelevance">[] {
  return articles.filter(a => a.content.length > 80).map((a, i) => {
    const age = a.published_date
      ? clamp(1 - (Date.now() - new Date(a.published_date).getTime()) / (365 * 86400 * 1000), 0, 1)
      : 0.5;
    return {
      id: `web-${i}`,
      source: "web" as const,
      claim: a.content.slice(0, 220),
      type: "statistic" as const,
      strength: clamp(a.relevance_score ?? 0.65, 0, 0.9),
      specificity: clamp(a.content.length / 500, 0, 1),
      recency: age,
      engagement: a.relevance_score ?? 0.65,
    };
  });
}

// ── Evidence map (source metadata for extractor input) ────────────────────────

function buildEvidenceMap(
  ytRows: DeepResearchRow[],
  hnClaims: HNClaim[],
  articles: IntelligenceArticle[],
): Map<string, string> {
  const m = new Map<string, string>();
  ytRows.slice(0, 40).forEach((r, i) => {
    m.set(`yt-${i}`, `Creator: ${r.channel_name ?? "unknown"}${r.video_title ? ` | "${String(r.video_title).slice(0, 80)}"` : ""}`);
  });
  hnClaims.forEach((c, i) => {
    const quote = c.evidence ? ` | "${c.evidence.slice(0, 120)}"` : "";
    const srcTag = c.source_type === "comment" ? " [comment]" : " [post]";
    const supportTag = (c.support_count ?? 1) > 1 ? ` ×${c.support_count} corroborated` : "";
    m.set(`rd-${i}`, `HN${srcTag}${supportTag} | "${c.source_title.slice(0, 80)}"${quote} (${c.post_score} pts)`);
  });
  articles.filter(a => a.content.length > 80).forEach((a, i) => {
    m.set(`web-${i}`, `${a.domain} | "${a.title}"${a.published_date ? ` | ${a.published_date.slice(0, 10)}` : ""}`);
  });
  return m;
}

// ── Source quality scoring ────────────────────────────────────────────────────

type SourceQualityResult = {
  score:    number;
  level:    "High" | "Medium" | "Low";
  excluded: boolean;
};

// Authority base: YouTube creators are most authoritative for startup/SaaS queries
const BASE_AUTHORITY: Record<NormalizedClaim["source"], number> = {
  youtube: 85,
  reddit:  65,
  web:     72,
};

// Scores source quality using per-claim queryRelevance (claims are pre-filtered for strength >= 0.3)
// Formula: authority*0.25 + evidenceStrength*0.25 + queryRelevance*0.50
function scoreSourceQuality(
  claims: NormalizedClaim[],
  source: NormalizedClaim["source"],
  excludeThreshold = 25,
): SourceQualityResult {
  const sc = claims.filter(c => c.source === source);
  if (sc.length < 2) return { score: 0, level: "Low", excluded: true };

  const avgRelevance    = sc.reduce((s, c) => s + c.queryRelevance, 0) / sc.length;
  const avgStrengthPct  = sc.reduce((s, c) => s + computeClaimStrength(c) * 100, 0) / sc.length;
  const authority       = Math.min(100, BASE_AUTHORITY[source] + Math.min(15, sc.length * 1.5));

  const composite =
    authority       * 0.25 +
    avgStrengthPct  * 0.25 +
    avgRelevance    * 0.50;

  const score = Math.round(composite);
  const level: "High" | "Medium" | "Low" = score >= 70 ? "High" : score >= 50 ? "Medium" : "Low";
  return { score, level, excluded: score < excludeThreshold };
}

// ── Scoring ───────────────────────────────────────────────────────────────────

function computeClaimStrength(c: Omit<NormalizedClaim, "queryRelevance"> & { queryRelevance?: number }): number {
  const w = c.source === "youtube" ? 0.95 : c.source === "web" ? 0.80 : 0.70;
  return w * 0.4 + c.specificity * 0.3 + c.engagement * 0.2 + c.recency * 0.1;
}

// Global agreement: supportedClaims / totalClaims
// A claim is "supported" if its cluster has 2+ different sources (cross-source corroboration)
function computeClaimAgreement(clusters: ClaimCluster[]): number {
  const total = clusters.reduce((s, c) => s + c.claims.length, 0);
  if (!total) return 0;
  const supported = clusters.reduce((s, c) => {
    const srcs = new Set(c.claims.map(cl => cl.source));
    return s + (srcs.size >= 2 ? c.claims.length : 0);
  }, 0);
  return Math.round((supported / total) * 100); // 0–100
}

// Per-cluster agreement (used for contradiction penalty weighting only)
function computeClusterAgreement(cluster: ClaimCluster): number {
  if (!cluster.claims.length) return 0;
  const diversity = new Set(cluster.claims.map(c => c.source)).size / 3;
  const avgStrength = cluster.claims.reduce((s, c) => s + computeClaimStrength(c), 0) / cluster.claims.length;
  return Math.min(1, avgStrength * diversity);
}

function computeSourceCoverage(clusters: ClaimCluster[], gatedSources: Set<string>): number {
  if (!gatedSources.size) return 0;
  const used = new Set<string>();
  clusters.forEach(c => c.claims.forEach(cl => {
    if (gatedSources.has(cl.source)) used.add(cl.source);
  }));
  return used.size / gatedSources.size;
}

const OPPOSING: Array<[NormalizedClaim["type"], NormalizedClaim["type"]]> = [
  ["success", "failure"], ["success", "pain_point"],
  ["recommendation", "failure"], ["recommendation", "pain_point"],
];

function dominantType(c: ClaimCluster): NormalizedClaim["type"] {
  const m = new Map<string, number>();
  c.claims.forEach(cl => m.set(cl.type, (m.get(cl.type) ?? 0) + 1));
  let max = 0, dom: NormalizedClaim["type"] = "opinion";
  m.forEach((n, t) => { if (n > max) { max = n; dom = t as NormalizedClaim["type"]; } });
  return dom;
}

function areContradictory(a: ClaimCluster, b: ClaimCluster): boolean {
  const [da, db] = [dominantType(a), dominantType(b)];
  return OPPOSING.some(([x, y]) => (da === x && db === y) || (da === y && db === x));
}

function contradictionPenalty(clusters: ClaimCluster[]): number {
  let p = 0;
  for (let i = 0; i < clusters.length; i++)
    for (let j = i + 1; j < clusters.length; j++)
      if (areContradictory(clusters[i], clusters[j]))
        p += Math.min(computeClusterAgreement(clusters[i]), computeClusterAgreement(clusters[j])) * 0.3;
  return Math.min(0.5, p);
}

// Classifies a source's signal direction from cluster evidence.
// NO_SIGNAL = source excluded or has no claims — not the same as opposing.
function computeSourceState(
  source: "youtube" | "reddit" | "web",
  clusters: ClaimCluster[],
  qualityScores: Record<"youtube" | "reddit" | "web", SourceQualityResult>,
): SourceSignalState {
  if (qualityScores[source].excluded) return "NO_SIGNAL";
  const sourceClaims = clusters.flatMap(c => c.claims).filter(c => c.source === source);
  if (sourceClaims.length === 0) return "NO_SIGNAL";
  const pos = sourceClaims.filter(c => c.type === "success" || c.type === "recommendation").length;
  const neg = sourceClaims.filter(c => c.type === "failure"  || c.type === "pain_point").length;
  if (pos === 0 && neg === 0) return "SUPPORTS"; // neutral / opinion claims → soft support
  const posPct = pos / sourceClaims.length;
  const negPct = neg / sourceClaims.length;
  if (posPct >= 0.6) return "SUPPORTS";
  if (negPct >= 0.6) return "OPPOSES";
  return "MIXED";
}

// Query type detection
const COMPARISON_MARKERS = [" vs ", " vs.", " versus ", " vs\n", "compare", "comparison", "compared to", "alternative to", "better than", "which is better", "which works better"];
const EXPLORATORY_MARKERS = ["how do", "how to", "how can", "how should", "what are the best", "what are some", "what factors", "when should", "which approach", "best ways to", "tips for", "guide to"];

function detectQueryType(q: string): "BINARY" | "COMPARATIVE" | "EXPLORATORY" {
  const lower = q.toLowerCase().trim();
  if (COMPARISON_MARKERS.some(m => lower.includes(m))) return "COMPARATIVE";
  if (EXPLORATORY_MARKERS.some(m => lower.startsWith(m) || lower.includes(m))) return "EXPLORATORY";
  return "BINARY";
}
const isComparativeQuery = (q: string) => detectQueryType(q) === "COMPARATIVE";

type RelationshipType = "CONTRADICTION" | "TRADEOFF" | "COMPLEMENTARY" | "CONSENSUS";

function classifyRelationshipType(
  hardContradictionCount: number,
  tradeoffCount:          number,
  opposingSourceCount:    number,
  agreementScore:         number,
  isComparative:          boolean,
): RelationshipType {
  // Hard contradictions from the extractor win unconditionally — the extractor already
  // performed semantic "can both be true?" reasoning on the actual claim content.
  // Comparative query framing does NOT override this.
  if (hardContradictionCount > 0) return "CONTRADICTION";

  // Explicit tradeoff evidence OR comparative framing with no contradictions → TRADEOFF
  if (tradeoffCount > 0 || isComparative) return "TRADEOFF";

  // OPPOSES source without extractor evidence:
  // Low agreement means sources genuinely diverge on a non-comparative topic → CONTRADICTION
  // High agreement means the negativity is contextual, not absolute → TRADEOFF
  if (opposingSourceCount > 0 && agreementScore < 60) return "CONTRADICTION";
  if (opposingSourceCount > 0) return "TRADEOFF";

  return "CONSENSUS";
}

// Generate a human-readable explanation of why this relationship type was assigned.
// Uses extractor evidence when available; falls back to templated copy.
function buildRelationshipReason(
  type:         RelationshipType,
  extractor:    ExtractorOutput,
  isComparative: boolean,
): string {
  switch (type) {
    case "CONTRADICTION": {
      const first = extractor.contradictions.find(c => c.conflict_type !== "tradeoff");
      return first?.explanation ?? "Sources make mutually incompatible claims — both cannot be true simultaneously.";
    }
    case "TRADEOFF": {
      const first = extractor.contradictions.find(c => c.conflict_type === "tradeoff");
      if (first?.explanation) return first.explanation;
      return isComparative
        ? "Sources emphasize different strengths of the compared strategies — both approaches can succeed in different contexts."
        : "Sources emphasize different strengths rather than disagreeing — multiple approaches can succeed simultaneously.";
    }
    case "COMPLEMENTARY":
      return "Sources describe different aspects of the same process, reinforcing one another.";
    case "CONSENSUS":
      return "Sources independently support the same conclusion.";
  }
}

function computeFinalConfidence(
  clusters:            ClaimCluster[],
  qualityScores:       Record<string, SourceQualityResult>,
  extractorHasContrad: boolean,
  sourceStates:        Record<"youtube" | "reddit" | "web", SourceSignalState>,
): ConfidenceResult {
  if (!clusters.length) return {
    confidence: 0,
    breakdown: { agreement: 0, sourceCoverage: 0, contradictionPenalty: 0, signalDensity: 0, crossSourceBonus: 0 },
  };

  const rawAgreementPct = computeClaimAgreement(clusters);
  // Only treat contradictions as real if agreement is genuinely low
  const hasRealContrad  = extractorHasContrad && rawAgreementPct < 70;
  // When no real contradictions, sources are largely aligned — floor agreement at 60
  const agreementPct    = hasRealContrad ? rawAgreementPct : Math.max(60, rawAgreementPct);
  const agreement       = agreementPct / 100;

  const gated = new Set(
    Object.entries(qualityScores).filter(([, q]) => !q.excluded).map(([k]) => k)
  );
  const sourceCoverage = computeSourceCoverage(clusters, gated);

  const penalty = hasRealContrad ? contradictionPenalty(clusters) : 0;
  const totalClaims   = clusters.reduce((s, c) => s + c.claims.length, 0);
  const optimalCount  = Math.min(5, Math.ceil(totalClaims / 6));
  const signalDensity = Math.min(1, clusters.length / Math.max(1, optimalCount));

  const gatedArr = [...gated];
  const qualityBonus = gatedArr.length
    ? (gatedArr.reduce((s, k) => s + qualityScores[k].score, 0) / gatedArr.length / 100) * 0.10
    : 0;

  // Cross-source convergence bonus: reward when multiple distinct source types agree in the same cluster
  // Uses the highest-diversity cluster as the signal (one fully corroborated cluster is enough)
  const maxSourceDiversity = Math.max(...clusters.map(c => new Set(c.claims.map(cl => cl.source)).size), 0);
  const crossSourceBonus = maxSourceDiversity >= 3 ? 0.15 : maxSourceDiversity >= 2 ? 0.07 : 0;

  // Source state penalties — absence is not disagreement
  const SOURCE_STATE_PENALTY: Record<SourceSignalState, number> = {
    SUPPORTS:  0,
    NO_SIGNAL: 0.05,
    MIXED:     0.10,
    OPPOSES:   0.25,
  };
  const statesPenalty = (["youtube", "reddit", "web"] as const)
    .reduce((sum, s) => sum + SOURCE_STATE_PENALTY[sourceStates[s]], 0);

  // Evidence integrity gate — prevents strong agreement overriding weak source quality.
  // Formula: sum(weight_i * quality_i) where creator=40%, community=35%, web=25%.
  // Excluded sources contribute 0 — their absence caps the maximum achievable confidence.
  const SOURCE_QUALITY_WEIGHTS = { youtube: 0.40, reddit: 0.35, web: 0.25 } as const;
  const qualityWeightedScore = (["youtube", "reddit", "web"] as const).reduce((sum, src) => {
    return sum + SOURCE_QUALITY_WEIGHTS[src] * (qualityScores[src]?.excluded ? 0 : (qualityScores[src]?.score ?? 0) / 100);
  }, 0);

  // Blend: 40% formula-derived (rewards agreement/convergence) + 60% quality-weighted (integrity gate).
  // This lets cross-source bonuses contribute while preventing 91%-from-weak-sources inflation.
  const rawFormula = agreement * 0.40 + sourceCoverage * 0.25 + signalDensity * 0.15 + qualityBonus + crossSourceBonus - penalty * 0.10 - statesPenalty;
  const blendedConfidence = rawFormula * 0.40 + qualityWeightedScore * 0.60;

  return {
    confidence: clamp(blendedConfidence, 0, 1),
    breakdown: {
      agreement:            agreementPct,
      sourceCoverage:       Math.round(sourceCoverage * 100),
      contradictionPenalty: Math.round(penalty * 100),
      signalDensity:        Math.round(signalDensity * 100),
      crossSourceBonus:     Math.round(crossSourceBonus * 100),
    },
  };
}

// ── Reasoning integrity helpers ───────────────────────────────────────────────

// Classify evidence consensus quality — depth and breadth, not just directional agreement.
// Strong requires multiple independent sources each with quality evidence.
function computeConsensusQuality(
  qualityScores: Record<"youtube" | "reddit" | "web", SourceQualityResult>,
  clusters: ClaimCluster[],
  uniqueCreators: number,
): "Strong" | "Medium" | "Weak" | "Insufficient" {
  const nonExcluded = (["youtube", "reddit", "web"] as const).filter(s => !qualityScores[s].excluded);
  const highQuality = nonExcluded.filter(s => qualityScores[s].score >= 65);
  const crossSourceClusters = clusters.filter(c =>
    new Set(c.claims.filter(cl => !qualityScores[cl.source as "youtube" | "reddit" | "web"].excluded).map(cl => cl.source)).size >= 2
  ).length;

  // Strong: 2+ creators, 2+ high-quality sources, 2+ cross-source corroborated clusters
  if (uniqueCreators >= 2 && highQuality.length >= 2 && crossSourceClusters >= 2) return "Strong";
  // Medium: two high-quality sources agree, or one high-quality with cross-source support
  if (highQuality.length >= 2 && crossSourceClusters >= 1) return "Medium";
  if (highQuality.length >= 1 && nonExcluded.length >= 2 && crossSourceClusters >= 1) return "Medium";
  // Insufficient: only one source or very few clusters
  if (nonExcluded.length <= 1 || clusters.length <= 2) return "Insufficient";
  return "Weak";
}

// Single canonical agreement object — every section consumes this, nothing derives independently.
function computeCanonicalAgreement(
  rawScore: number,
  qualityScores: Record<"youtube" | "reddit" | "web", SourceQualityResult>,
  clusters: ClaimCluster[],
  uniqueCreators: number,
  contradictionsCount: number,
  tradeoffsCount: number,
  supportingSources: number,
  comparativeCompleteness: "High" | "Medium" | "Low" | null,
): IntelligenceMemo["canonical_agreement"] {
  let score = rawScore;

  // Penalty: creator coverage weakness (most impactful driver of false consensus signals)
  if (uniqueCreators === 0) score = Math.round(score * 0.35);
  else if (uniqueCreators === 1) score = Math.round(score * 0.62);

  // Penalty: all sources low quality
  const nonExcluded = (["youtube", "reddit", "web"] as const).filter(s => !qualityScores[s].excluded);
  const highQuality  = nonExcluded.filter(s => qualityScores[s].score >= 65);
  if (nonExcluded.length > 0 && highQuality.length === 0) score = Math.round(score * 0.75);

  // Penalty: contradictions (12 pts each, cap 36)
  score = Math.max(0, score - Math.min(contradictionsCount * 12, 36));

  // Penalty: no cross-source corroboration when multiple sources available
  const crossSourceClusters = clusters.filter(c =>
    new Set(c.claims.filter(cl => !qualityScores[cl.source as "youtube" | "reddit" | "web"].excluded).map(cl => cl.source)).size >= 2
  ).length;
  if (crossSourceClusters === 0 && nonExcluded.length > 1) score = Math.round(score * 0.82);

  // Hard cap: low comparison coverage cannot produce Moderate+ consensus
  if (comparativeCompleteness === "Low") score = Math.min(score, 65);

  score = Math.max(0, Math.min(100, Math.round(score)));

  const label: IntelligenceMemo["canonical_agreement"]["label"] =
    score >= 90 ? "Strong Consensus"
    : score >= 70 ? "Moderate Consensus"
    : score >= 50 ? "Partial Consensus"
    : score >= 30 ? "Mixed Evidence"
    : "No Consensus";

  const coverageQuality: IntelligenceMemo["canonical_agreement"]["coverage_quality"] =
    highQuality.length > 0 && highQuality.length === nonExcluded.length && nonExcluded.length >= 2 ? "Strong"
    : highQuality.length >= 2 ? "Moderate"
    : highQuality.length === 1 ? "Weak"
    : "Insufficient";

  const penalties: string[] = [];
  if (uniqueCreators === 0) penalties.push("no creator evidence");
  else if (uniqueCreators === 1) penalties.push("single creator");
  if (nonExcluded.length > 0 && highQuality.length === 0) penalties.push("low source quality");
  if (contradictionsCount > 0) penalties.push(`${contradictionsCount} contradiction${contradictionsCount > 1 ? "s" : ""}`);
  if (crossSourceClusters === 0 && nonExcluded.length > 1) penalties.push("no cross-source corroboration");
  if (comparativeCompleteness === "Low") penalties.push("incomplete comparison coverage");

  const explanation = penalties.length > 0
    ? `Adjusted from raw ${rawScore}: ${penalties.join(", ")}.`
    : `${supportingSources} source${supportingSources !== 1 ? "s" : ""} converge with ${coverageQuality.toLowerCase()} evidence quality.`;

  return { score, label, supporting_sources: supportingSources, contradictions_count: contradictionsCount, tradeoffs_count: tradeoffsCount, coverage_quality: coverageQuality, explanation };
}

// How robust is the recommendation to adding more evidence?
// Separate from confidence — a low-confidence answer can still be stable (no credible alternative).
function computeRecommendationStability(
  qualityScores: Record<"youtube" | "reddit" | "web", SourceQualityResult>,
  clusters: ClaimCluster[],
): "High" | "Medium" | "Low" {
  const totalSignals    = clusters.reduce((s, c) => s + c.claims.length, 0);
  const nonExcluded     = (["youtube", "reddit", "web"] as const).filter(s => !qualityScores[s].excluded).length;
  const highQuality     = (["youtube", "reddit", "web"] as const).filter(s => !qualityScores[s].excluded && qualityScores[s].score >= 65).length;
  const crossSourceClusters = clusters.filter(c => new Set(c.claims.map(cl => cl.source)).size >= 2).length;

  if (crossSourceClusters >= 3 && totalSignals >= 15 && highQuality >= 2) return "High";
  if (totalSignals < 8 || nonExcluded <= 1 || crossSourceClusters === 0) return "Low";
  return "Medium";
}

// For comparative queries: detect coverage imbalance between options (Items 4 & 5)
function extractComparisonOptions(query: string): string[] {
  const lower = query.toLowerCase().replace(/[?!.,]/g, "");
  for (const sep of [" vs ", " versus ", " or "]) {
    const idx = lower.indexOf(sep);
    if (idx !== -1) {
      // Take up to 3 words before and after the separator for each option label
      const a = lower.slice(0, idx).trim().split(/\s+/).slice(-3).join(" ");
      const b = lower.slice(idx + sep.length).trim().split(/\s+/).slice(0, 3).join(" ");
      if (a.length >= 3 && b.length >= 3) return [a, b];
    }
  }
  return [];
}

function computeComparativeCoverage(
  query: string,
  gatedClaims: NormalizedClaim[],
): { coverage_balance: Array<{ option: string; signal_count: number }>; comparison_quality: "Strong" | "Moderate" | "Weak" } | null {
  const options = extractComparisonOptions(query);
  if (options.length < 2) {
    console.log("[comparativeCoverage] no options found for query:", query.slice(0, 60));
    return null;
  }

  const counts = options.map(opt => {
    // Use 2-char minimum to catch short terms like "SEO", "AI", "B2B"
    const keywords = opt.split(/\s+/).filter(w => w.length > 1);
    const count = gatedClaims.filter(c =>
      keywords.some(kw => c.claim.toLowerCase().includes(kw))
    ).length;
    return { option: opt, signal_count: count };
  });

  console.log("[comparativeCoverage] options:", JSON.stringify(counts));

  const maxCount = Math.max(...counts.map(c => c.signal_count), 1);
  const minCount = Math.min(...counts.map(c => c.signal_count));
  const ratio    = minCount / maxCount;
  const comparison_quality: "Strong" | "Moderate" | "Weak" =
    ratio >= 0.6 ? "Strong" : ratio >= 0.3 ? "Moderate" : "Weak";

  return { coverage_balance: counts, comparison_quality };
}

// ── Extractor LLM ─────────────────────────────────────────────────────────────

const EXTRACTOR_PROMPT = `You are WatchFilter Intelligence Synthesizer.

You convert multi-source research data into decision-grade intelligence for startup and AI growth strategy.

You do NOT summarize.
You do NOT estimate confidence.
You do NOT generate scores.

You ONLY extract structured claims, clusters, and contradictions.

All scoring, confidence, and ranking is computed externally by a deterministic scoring engine.

---

# 🎯 CORE OBJECTIVE

Given multi-source input, your job is to produce:

1. Normalized claims
2. Insight clusters with synthesized key_themes
3. Contradictions
4. Source-aligned evidence structure
5. Stage-based strategic interpretations (non-scored)

You are building the "belief graph input layer", NOT the final decision.

---

# 📥 INPUT FORMAT

You will receive:

{
  "query": string,
  "youtube": [RawCreatorSignals],
  "reddit": [RedditClaims],
  "web": [WebClaims]
}

Each item contains:
- id (preserve exactly in output)
- claim text
- evidence snippet
- type (pain_point, success, failure, opinion, statistic, recommendation)

---

# ⚠️ CRITICAL RULES

DO NOT OUTPUT:
- confidence scores
- agreement percentages
- rankings
- numeric evaluations
- final recommendations with priority ordering

These are computed externally.

MUST: preserve the exact input id in normalized_claims.id and reference those ids in insight_clusters.claims.

---

# 🧠 REQUIRED OUTPUT FORMAT (STRICT JSON)

Return ONLY valid JSON:

{
  "normalized_claims": [
    {
      "id": string,
      "source": "youtube" | "reddit" | "web",
      "type": string,
      "claim": string,
      "evidence": string,
      "tags": [string]
    }
  ],

  "insight_clusters": [
    {
      "theme": string,
      "claims": [string],
      "summary": string,
      "key_themes": [string]
    }
  ],

  "contradictions": [
    {
      "claim_a": string,
      "claim_b": string,
      "conflict_type": "direct" | "partial" | "contextual" | "tradeoff",
      "explanation": string
    }
  ],

  "source_map": {
    "youtube": { "claims": number },
    "reddit": { "claims": number, "signal_status": "strong" | "weak" | "missing" },
    "web": { "claims": number }
  },

  "stage_interpretation": {
    "pre_product": {
      "observations": [string]
    },
    "early_stage": {
      "observations": [string]
    },
    "growth_stage": {
      "observations": [string]
    }
  }
}

---

# 🧩 CLAIM NORMALIZATION RULES

Each claim must be:
- atomic (one idea per claim)
- non-duplicated
- grounded in evidence
- source-preserving
- id-preserving (use the exact id from input, do not generate new IDs)

DO NOT:
- merge unrelated ideas
- infer missing facts
- generalize across sources

---

# 🎯 KEY_THEMES RULE (CRITICAL)

For each insight cluster, key_themes must contain 2–4 synthesized insight bullets.

REQUIRED: Each bullet is a standalone finding synthesized from the cluster's claims — NOT a quote or excerpt.
REQUIRED: Written as a present-tense factual statement ("Founder outreach drives early customer acquisition").
REQUIRED: Specific — mentions mechanisms, tactics, or measurable outcomes where available.
REQUIRED: Each bullet adds distinct information; do not repeat the theme in different words.

FORBIDDEN: Copying raw claim text verbatim.
FORBIDDEN: Generic statements that apply to any topic ("it is important to understand your customer").
FORBIDDEN: Motivational framing ("this is key", "you should focus on").

GOOD: "Founder-led outreach converts at 3× the rate of agency-led campaigns in sub-100-customer stage"
GOOD: "Early adopters tolerate product roughness when core value proposition is immediately clear"
GOOD: "Community-led growth (referrals, forums, open source) reduces CAC by eliminating cold outreach"
BAD: "outreach is important for startups"
BAD: "it's good to talk to customers early"

The summary field is one sentence synthesizing the cluster's entire finding.

---

# 🔍 SOURCE HANDLING RULE

Each source layer (Creator, Community, Web) contributes evidence of varying quality.

If a source layer has no input:
- Set its signal_status to "missing" in source_map
- Do NOT manufacture claims from absent sources

Weight claims by specificity and grounding — anecdotal claims need explicit evidence, statistics need attribution.

---

# ⚖️ TRADEOFF vs CONTRADICTION RULES (CRITICAL — read before classifying)

Most apparent conflicts in startup evidence are TRADEOFFS, not contradictions.

TRADEOFF (conflict_type: "tradeoff") — Two DESIRABLE outcomes that compete, or two strategies optimizing different goals:
- Two strategies with different strengths: "Cold outreach produces faster results" AND "Content marketing compounds long-term"
- Two valid approaches to the same goal: "Manual outreach builds relationships" AND "Automated outreach scales faster"
- Two dimensions that cannot both be maximized: "High transparency" AND "Competitive secrecy"
- These describe COMPETING BENEFITS, not a benefit vs a requirement

NOT a tradeoff (do NOT classify these as tradeoff):
- Benefit vs requirement: "Cold outreach works" AND "Cold outreach must be personalized" — the second is a condition, not a competing outcome
- Feature vs effort: "X generates leads" AND "X takes time" — effort is not a desirable outcome competing with benefit
- Claim vs caveat: "X works" AND "X works better in certain contexts" — the second is a nuance, not a tradeoff

CONTRADICTION (conflict_type: "direct" or "partial") — Claims CANNOT both be true:
- Opposite recommendations: "Founders should build in public" vs "Founders should NOT build in public"
- Opposite effectiveness: "Cold email works for SaaS" vs "Cold email does not work for SaaS"
- Opposite conclusions on the SAME specific outcome

CONTEXTUAL (conflict_type: "contextual") — Stage or context splits the truth:
- "X works at early stage" vs "X fails at scale" — both can be true in different contexts

THREE-PART TEST — all three must pass to classify as direct/partial contradiction:
1. Both claims discuss the SAME specific action or decision
2. Both claims discuss the SAME specific outcome
3. Conclusions point in OPPOSITE directions
→ If any test fails: use "tradeoff" or omit entirely

MANDATE: When in doubt, use "tradeoff" not "direct". True contradictions are rare.
Include 2–5 tradeoffs when present — they are useful signal, not noise.

DO NOT resolve contradictions. DO NOT choose sides.

---

# 🧠 TAGGING RULES

Each claim may include tags like:
- acquisition, referral, cold_outreach, ai_tools, branding, pricing, conversion, retention

Tags must be minimal, consistent, and reusable across sources.

---

# 📊 SOURCE MAP RULE

Count claims per source. Set Reddit signal_status (strong/weak/missing).
DO NOT interpret or weight sources.

---

# 📈 STAGE INTERPRETATION RULE

Infer stage-based implications as observations only:
- pre_product (0–10 users)
- early_stage (10–100 users)
- growth_stage (100+ users)

DO NOT prioritize actions, rank strategies, or suggest "best" option.

---

# 🚫 FORBIDDEN BEHAVIOR

NEVER:
- compute confidence
- compute agreement
- assign scores
- rank strategies
- generate priority actions
- output "best strategy"
- provide executive recommendations

---

# 🎯 FINAL GOAL

Your output must be: structured, source-faithful, contradiction-aware, clustering-ready, scoring-neutral.

You are building the INPUT GRAPH for a deterministic intelligence system. Not the conclusion.`;

const EXTRACTOR_EMPTY: ExtractorOutput = {
  normalized_claims: [],
  insight_clusters: [],
  contradictions: [],
  source_map: { youtube: { claims: 0 }, reddit: { claims: 0, signal_status: "missing" }, web: { claims: 0 } },
  stage_interpretation: { pre_product: { observations: [] }, early_stage: { observations: [] }, growth_stage: { observations: [] } },
};

async function runExtractor(
  query: string,
  queryDomain: QueryDomain,
  claims: NormalizedClaim[],
  evidenceMap: Map<string, string>,
): Promise<ExtractorOutput> {
  const vocab = DOMAIN_VOCABULARY[queryDomain];
  const domainLock = `

---

# 🔒 DOMAIN LOCK: ${vocab.label.toUpperCase()}

This analysis is STRICTLY scoped to: **${vocab.label}**

ONLY extract normalized_claims and insight_clusters that directly address: "${query}"

ACCEPT claims about: ${vocab.allowed.slice(0, 10).join(", ")}

HARD REJECT — DO NOT include in output:
• Personal development / mindset / self-leadership / life outcomes
• Wealth philosophy or financial worldview content
• Generic motivational or truism-style insights
• Any claim that does not directly answer: "${query}"

FORBIDDEN cluster themes (discard immediately):
• "Foundational Business Insights" — too generic
• "Core Principles" — personal development framing
• "Leadership and Mindset" — wrong domain
• Any theme that applies to life in general, not specifically to ${vocab.label}

REQUIRED: Every insight_cluster.theme must name a specific ${vocab.label} tactic, mechanism, or behavior.
Example GOOD: "Founder-Led Direct Outreach" / "Trust as a Conversion Driver" / "Early Adopter Tolerance"
Example BAD: "Foundational Insights" / "Key Principles" / "Business Fundamentals"`;

  const queryIntentLock = `

---

# 🎯 QUERY INTENT LOCK

You are answering EXACTLY this question: "${query}"

For each insight_cluster, ask: "Does this theme directly answer '${query}'?"

ACCEPT themes that:
- Directly discuss the specific action, decision, or strategy asked about
- Provide evidence FOR or AGAINST the proposition in the question
- Describe conditions or tradeoffs that change the answer

REJECT themes that:
- Discuss the general topic area but not the specific question
- Are broadly applicable founder/operator advice not specific to this question
- Would make sense as an insight in ANY startup question

EXPLICITLY BANNED THEME PATTERNS — discard immediately:
• "Leadership [anything]" unless explicitly connected to the query's specific topic
• "Relationships / networking / building relationships" — generic founder advice
• "Mindset / self-leadership / self-improvement / personal development"
• "Execution / discipline / consistency" without a query-specific mechanism
• "Systemize operations / agency systems" — unrelated operations content
• Any theme using "important", "matters", "is key", "is crucial" with no specific mechanism

SPECIFICITY RULE: The theme title must contain at least one concept unique to this query.
Generic virtues (leadership, discipline, relationships) only qualify when explicitly connected to the specific proposition in the question.

SELF-CHECK RULE: Mentally replace the question with "How do I improve my morning routine?" — if the theme would still apply, DISCARD IT. The theme must be specific to: "${query}"`;

  const systemPrompt = EXTRACTOR_PROMPT + domainLock + queryIntentLock;

  const toInput = (c: NormalizedClaim) => ({
    id: c.id,
    type: c.type,
    claim: c.claim,
    evidence: evidenceMap.get(c.id) ?? "",
  });

  const res = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    temperature: 0.1,
    max_tokens: 5000,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: systemPrompt },
      {
        role: "user",
        content: JSON.stringify({
          query,
          youtube: claims.filter(c => c.source === "youtube").map(toInput),
          reddit:  claims.filter(c => c.source === "reddit").map(toInput),
          web:     claims.filter(c => c.source === "web").map(toInput),
        }),
      },
    ],
  });

  try {
    return { ...EXTRACTOR_EMPTY, ...JSON.parse(res.choices[0]?.message?.content ?? "{}") as Partial<ExtractorOutput> };
  } catch { return EXTRACTOR_EMPTY; }
}

// ── Build ClaimClusters from extractor output ─────────────────────────────────

function buildClusters(extractor: ExtractorOutput, claimIndex: Map<string, NormalizedClaim>): ClaimCluster[] {
  return extractor.insight_clusters
    .map(ec => ({
      theme: ec.theme,
      claims: ec.claims.map(id => claimIndex.get(id)).filter((c): c is NormalizedClaim => c != null),
    }))
    .filter(c => c.claims.length >= 1);
}

// Domain validation safety net — catches any off-domain clusters the extractor
// let through despite the domain lock prompt
function filterClustersByDomain(
  clusters:    ClaimCluster[],
  extractor:   ExtractorOutput,
  queryDomain: QueryDomain,
): ClaimCluster[] {
  const vocab = DOMAIN_VOCABULARY[queryDomain];

  return clusters.filter(cluster => {
    const ec = extractor.insight_clusters.find(e => e.theme === cluster.theme);
    const allText = [
      cluster.theme,
      ec?.summary ?? "",
      ...(ec?.key_themes ?? []),
      ...cluster.claims.slice(0, 4).map(c => c.claim),
    ].join(" ").toLowerCase();

    // Hard-reject forbidden content
    if (vocab.forbidden.some(f => allText.includes(f.toLowerCase()))) return false;

    // Require at least one domain vocab match across the cluster's full text
    return vocab.allowed.some(a => allText.includes(a.toLowerCase()));
  });
}

// ── Decision LLM ──────────────────────────────────────────────────────────────

type PriorityAction = {
  action: string;
  evidence_strength: "High" | "Medium" | "Low";
  supporting_signals: number;
};

type DecisionResult = {
  directional: string;
  decision_summary: string;
  recommendation_type: "Universal" | "Conditional" | "Stage-Based" | "Industry-Specific" | "Team-Dependent";
  condition_qualifier: string | null;
  recommendation_conditions: string[];
  priority_actions: PriorityAction[];
  counter_evidence: string[];
  why_not_alternative: string | null;
};

type PerspectiveResult = {
  perspectives: Partial<Record<"youtube" | "reddit" | "web", { bullets: string[]; common_view: string }>>;
  cross_source_synthesis: Partial<Record<"youtube" | "reddit" | "web", string>>;
};

async function generateDecision(
  query: string,
  clusters: ClaimCluster[],
  stageInterpretation: ExtractorOutput["stage_interpretation"],
): Promise<DecisionResult> {
  const allFlat = clusters.flatMap(c => c.claims);
  const topBySource = (src: NormalizedClaim["source"]) =>
    allFlat
      .filter(c => c.source === src)
      .sort((a, b) => computeClaimStrength(b) - computeClaimStrength(a))
      .slice(0, 8)
      .map(c => ({ claim: c.claim, type: c.type }));

  const input = {
    question: query,
    creator_signals:   topBySource("youtube"),
    community_signals: topBySource("reddit"),
    web_signals:       topBySource("web"),
    stage_observations: stageInterpretation,
  };

  const res = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    temperature: 0.3,
    max_tokens: 2000,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content: `You are the Decision Intelligence Synthesizer for WatchFilter. Write like an experienced research analyst — precise, honest, and uncertainty-aware. Work only from provided signals. Do not invent facts.

LANGUAGE RULES (apply everywhere):
- NEVER use absolute statements: "X is essential", "X always works", "X is the best", "X will", "X must"
- Scale certainty to evidence: one source → "One practitioner suggested"; several → "Several operators reported"; strong convergence → "Evidence consistently supports"
- Write naturally. Avoid repetitive phrases like "The evidence suggests..." in every sentence. Vary the language.
- NEVER present inference as observed fact. Distinguish: "Practitioners report X" (evidence) vs "This suggests Y" (inference)

RULES:
1. Never output confidence scores or numeric probabilities.
2. Do NOT name platforms (YouTube, Reddit, HN). Refer to signal content only.
3. Lead with what sources agree on. Only surface disagreements if they materially change the decision.
4. Every insight must trace to at least one provided signal. No hallucinated synthesis.
5. decision_summary: REQUIRED structure — 2–3 sentences:
   - Sentence 1: What the recommendation is, stated with evidence basis (not as universal fact)
   - Sentence 2: The primary cost or tradeoff of this recommendation — acknowledge what is sacrificed
   - Sentence 3: A key uncertainty or what would change this recommendation
   NEVER recommend without acknowledging cost in sentence 2.
   Example: "The available evidence supports cold outreach as the stronger early-stage customer acquisition path. This approach requires sustained personal effort and typically produces results over 30–90 days rather than immediately. The recommendation shifts if consistent inbound demand already exists or if the sales cycle exceeds six months."
6. priority_actions: Generate 3–5 IMMEDIATELY EXECUTABLE actions.
   Each MUST have: specific verb + specific target + measurable criterion (number/frequency/binary).
   evidence_strength: "High" if 4+ signals, "Medium" if 2–3, "Low" if 1.
   GOOD: "Reach out directly to 50 target prospects this week, focusing on the problem before the product"
   GOOD: "Conduct 3 customer interviews per week to identify the single most painful problem"
   BAD: "Build relationships" | "Develop marketing campaigns" | "Create a community" | "Build value propositions"
6. directional MUST be EXACTLY one of:
   "Strong YES (conditional)" | "Lean YES" | "Neutral / Tradeoff" | "Lean NO" | "Strong NO (conditional)" | "Comparative Verdict"
   Use "Comparative Verdict" when the query compares two or more options (contains "vs", "versus", "or", "compare").
7. recommendation_type MUST be EXACTLY one of:
   "Universal" — correct regardless of stage, industry, or team context
   "Conditional" — correct answer depends on specific circumstances evident in the evidence
   "Stage-Based" — correct answer changes based on business stage (pre-PMF vs post-PMF vs growth)
   "Industry-Specific" — applies only to specific verticals or business models evident in the question
   "Team-Dependent" — depends on team capabilities, bandwidth, or resources
   NEVER force "Universal" when evidence shows the answer changes based on conditions.
8. condition_qualifier: A 1-sentence "when does this recommendation change?" statement.
   REQUIRED for Conditional, Stage-Based, Industry-Specific, Team-Dependent — explain when the recommendation shifts.
   Set to null ONLY for Universal recommendations.
   Example: "This shifts once product-market fit is established and repeatable messaging exists."
9. recommendation_conditions: 3–4 SPECIFIC conditions under which this recommendation would change.
   Each must be a concrete, testable situation a founder can self-identify.
   GOOD: "You already generate consistent inbound from existing content"
   GOOD: "Your average sales cycle exceeds six months"
   GOOD: "You cannot personally commit to outbound for 90+ days"
   BAD: "Your situation is different" | "Evidence changes" | "Context shifts"
   For Universal recommendations, return 1–2 edge-case conditions where the advice still might not apply.
10. counter_evidence: 1–3 observations presenting the STRONGEST GENUINE CASE FOR CHOOSING THE ALTERNATIVE.
    Answer the question: "Why might a reasonable founder choose the non-recommended option instead?"
    GOAL: Users should think "I understand why someone would choose that." NOT "I see why the winner is flawed."
    WRONG (if cold outreach recommended):
      BAD: "Cold outreach is time-consuming." ← disadvantage of winner, not case for alternative
      BAD: "Cold outreach fails at scale." ← still about the winner's weaknesses
    RIGHT (if cold outreach recommended):
      GOOD: "Content marketing compounds over 6–12 months and can lower blended CAC significantly after product-market fit." ← genuine strength of alternative
      GOOD: "Founder-led educational content can pre-qualify prospects before any outbound conversation begins." ← genuine strength of alternative
    Pull from actual evidence. No invented claims.
    Each item must describe a GENUINE STRENGTH or ADVANTAGE of the non-recommended option.
    Set to [] ONLY if no evidence for the alternative was found in the provided signals.
11. why_not_alternative: REQUIRED for comparative queries (Comparative Verdict directional).
    One sentence explaining why the non-recommended option was not chosen first, traced to specific evidence.
    Example: "Content marketing was not prioritized first because evidence consistently shows 6–12 month lag before measurable results — contradicting the early-stage need for rapid customer feedback."
    Set to null ONLY for non-comparative exploratory queries.

Return ONLY valid JSON:
{
  "directional": "...",
  "decision_summary": "Sentence 1: recommendation with evidence basis. Sentence 2: primary cost/tradeoff. Sentence 3: key uncertainty or what would change this.",
  "recommendation_type": "Universal|Conditional|Stage-Based|Industry-Specific|Team-Dependent",
  "condition_qualifier": "One sentence on when this recommendation changes, or null.",
  "recommendation_conditions": ["Specific condition 1", "Specific condition 2", "Specific condition 3"],
  "counter_evidence": ["specific failure/limitation of the RECOMMENDED option", "..."],
  "why_not_alternative": "One sentence on why the alternative was not chosen, traced to evidence. Or null.",
  "priority_actions": [
    { "action": "specific immediately executable action", "evidence_strength": "High|Medium|Low", "supporting_signals": 5 }
  ]
}`,
      },
      { role: "user", content: JSON.stringify(input) },
    ],
  });

  const VALID_DIRECTIONALS = new Set([
    "Strong YES (conditional)", "Lean YES", "Neutral / Tradeoff", "Lean NO", "Strong NO (conditional)", "Comparative Verdict",
  ]);

  const VALID_STRENGTHS = new Set(["High", "Medium", "Low"]);

  try {
    const VALID_REC_TYPES = new Set(["Universal", "Conditional", "Stage-Based", "Industry-Specific", "Team-Dependent"]);

    const p = JSON.parse(res.choices[0]?.message?.content ?? "{}") as {
      directional?: string;
      decision_summary?: string;
      recommendation_type?: string;
      condition_qualifier?: string | null;
      recommendation_conditions?: unknown;
      counter_evidence?: unknown;
      why_not_alternative?: string | null;
      priority_actions?: Array<{ action?: string; evidence_strength?: string; supporting_signals?: number }>;
    };
    return {
      directional:         VALID_DIRECTIONALS.has(p.directional ?? "") ? p.directional! : "Neutral / Tradeoff",
      decision_summary:    p.decision_summary ?? "Insufficient evidence to synthesize a decision.",
      recommendation_type: VALID_REC_TYPES.has(p.recommendation_type ?? "") ? p.recommendation_type as DecisionResult["recommendation_type"] : "Universal",
      condition_qualifier:  (typeof p.condition_qualifier === "string" && p.condition_qualifier.length > 5) ? p.condition_qualifier : null,
      recommendation_conditions: Array.isArray(p.recommendation_conditions)
        ? (p.recommendation_conditions as unknown[]).filter((s): s is string => typeof s === "string" && s.length > 10).slice(0, 4)
        : [],
      counter_evidence: Array.isArray(p.counter_evidence)
        ? (p.counter_evidence as unknown[]).filter((s): s is string => typeof s === "string" && s.length > 10).slice(0, 3)
        : [],
      why_not_alternative: (typeof p.why_not_alternative === "string" && p.why_not_alternative.length > 10) ? p.why_not_alternative : null,
      priority_actions: Array.isArray(p.priority_actions)
        ? p.priority_actions.slice(0, 5)
            .filter(a => typeof a.action === "string" && a.action.length > 0)
            .map(a => ({
                action:            a.action!,
                evidence_strength: VALID_STRENGTHS.has(a.evidence_strength ?? "") ? (a.evidence_strength as "High" | "Medium" | "Low") : "Medium",
                supporting_signals: Math.max(1, Math.round(a.supporting_signals ?? 1)),
              }))
        : [],
    };
  } catch (err) {
    console.error("[generateDecision] JSON parse failed:", err instanceof Error ? err.message : err);
    return {
      directional:         "Neutral / Tradeoff",
      decision_summary:    "Insufficient evidence to synthesize a decision.",
      recommendation_type: "Universal" as const,
      condition_qualifier:  null,
      recommendation_conditions: [],
      counter_evidence:    [],
      why_not_alternative: null,
      priority_actions:    [],
    };
  }
}

// ── Comparative Verdict — winner-per-dimension analysis for A vs B queries ────

async function generateComparativeVerdict(
  query:    string,
  clusters: ClaimCluster[],
  tradeoffs: ExtractorOutput["contradictions"],
): Promise<IntelligenceMemo["comparative_verdict"]> {
  const clusterSummaries = clusters.slice(0, 8).map(c => ({
    theme: c.theme,
    signals: c.claims.slice(0, 6).map(cl => ({ claim: cl.claim, type: cl.type })),
  }));
  const tradeoffSummaries = tradeoffs.filter(t => t.conflict_type === "tradeoff").slice(0, 5).map(t => ({
    a: t.claim_a, b: t.claim_b, why: t.explanation,
  }));

  const res = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    temperature: 0.3,
    max_tokens: 1800,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content: `You are a Comparative Intelligence Synthesizer for startup decisions.
The user asked a comparison query (A vs B). Produce a structured, multi-dimensional verdict.

RULES:
1. Identify 4–7 dimensions where the options genuinely differ. Cover breadth across: Speed to Results, Trust Building, Scalability, Cost Efficiency, Execution Difficulty, Predictability, Compounding Effect, Customer Quality, Capital Required, Founder Time.
2. For each dimension: pick a winner from the query options. Give 1–2 specific reasons pulled from evidence.
3. DO NOT output YES/NO. Compare ONLY the options mentioned in the query.
4. overall_recommendation: 1–2 sentences. What to prioritize first and why — conditional if evidence shows stage-dependency.
5. confidence: "High" = 4+ supporting signals, "Medium" = 2–3, "Low" = 1.
6. evidence_count: integer count of evidence signals supporting this dimension's verdict (same scale as confidence: High ≥ 4, Medium 2–3, Low 1).
7. Work ONLY from provided evidence. No hallucination.
8. If evidence is insufficient to declare a winner on a dimension, omit that dimension.

Return JSON:
{
  "dimensions": [
    { "label": "dimension name", "winner": "exact option from query", "confidence": "High|Medium|Low", "evidence_count": 3, "reasons": ["reason 1", "reason 2"] }
  ],
  "overall_recommendation": "Start with X because Y. Add Z when W."
}`,
      },
      {
        role: "user",
        content: JSON.stringify({ query, evidence_clusters: clusterSummaries, tradeoffs: tradeoffSummaries }),
      },
    ],
  });

  try {
    type RawDim = { label?: string; winner?: string; confidence?: string; evidence_count?: number; reasons?: unknown };
    const p = JSON.parse(res.choices[0]?.message?.content ?? "{}") as {
      dimensions?: RawDim[];
      overall_recommendation?: string;
    };
    const VALID_CONF = new Set(["High", "Medium", "Low"]);
    const dims = Array.isArray(p.dimensions)
      ? p.dimensions
          .filter(d => d.label && d.winner)
          .slice(0, 7)
          .map(d => ({
            label:          String(d.label),
            winner:         String(d.winner),
            confidence:     VALID_CONF.has(d.confidence ?? "") ? d.confidence as "High" | "Medium" | "Low" : "Medium",
            evidence_count: Math.max(1, Math.round(d.evidence_count ?? (d.confidence === "High" ? 4 : d.confidence === "Medium" ? 2 : 1))),
            reasons:        Array.isArray(d.reasons) ? (d.reasons as unknown[]).map(String).slice(0, 3) : [],
          }))
      : [];
    if (!dims.length) return null;
    // Phase 4 fields (coverage_balance, strategy_profiles, etc.) are merged in assembleMemo
    return {
      dimensions: dims,
      overall_recommendation: p.overall_recommendation ?? "",
      coverage_balance: null, comparison_quality: null,
      strategy_profiles: null, comparison_completeness: null, completeness_reason: null,
      missing_dimensions: [], decision_risk: null, decision_risk_reason: null, strategy_roadmap: null, decision_flow: null,
    };
  } catch {
    return null;
  }
}

// ── Strategy Profiles — per-option independent evidence analysis (Phase 4) ────

// Partition gated claims into per-option buckets using keyword matching
function partitionClaimsByOptions(
  options: string[],
  gatedClaims: NormalizedClaim[],
): Array<{ option: string; claims: NormalizedClaim[] }> {
  return options.map(opt => {
    const keywords = opt.split(/\s+/).filter(w => w.length > 1);
    const claims = gatedClaims.filter(c =>
      keywords.some(kw => c.claim.toLowerCase().includes(kw))
    );
    return { option: opt, claims };
  });
}

// Deterministically classify source coverage for one option
function classifyOptionSourceCoverage(
  claims: NormalizedClaim[],
  source: "youtube" | "reddit" | "web",
  excluded: boolean,
): "Strong" | "Medium" | "Weak" | "Missing" {
  if (excluded) return "Missing";
  const count = claims.filter(c => c.source === source).length;
  if (count >= 4) return "Strong";
  if (count >= 2) return "Medium";
  if (count >= 1) return "Weak";
  return "Missing";
}

// Compute evidence strength (0-100) per option deterministically
function computeOptionEvidenceStrength(
  claims: NormalizedClaim[],
  qualityScores: Record<"youtube" | "reddit" | "web", SourceQualityResult>,
): number {
  const WEIGHTS = { youtube: 0.40, reddit: 0.35, web: 0.25 } as const;
  let score = 0;
  for (const src of ["youtube", "reddit", "web"] as const) {
    const optClaims = claims.filter(c => c.source === src);
    if (optClaims.length === 0 || qualityScores[src].excluded) continue;
    const coveragePct = optClaims.length >= 4 ? 1.0 : optClaims.length >= 2 ? 0.65 : 0.35;
    score += WEIGHTS[src] * (qualityScores[src].score / 100) * coveragePct * 100;
  }
  // Cross-source bonus: if 2+ sources have at least one claim
  const srcCount = (["youtube", "reddit", "web"] as const).filter(s => claims.some(c => c.source === s)).length;
  if (srcCount >= 3) score = Math.min(100, score * 1.15);
  else if (srcCount >= 2) score = Math.min(100, score * 1.08);
  return Math.round(score);
}

type StrategyProfilesLLMResult = {
  profiles: Array<{
    option: string;
    evidence_strength?: number;
    advantages:       string[];
    costs:            string[];
    failure_modes:    string[];
    best_for:         string[];
    expected_outcome?: string | null;
    evidence_gaps?:    string[];
  }>;
  comparison_completeness: "High" | "Medium" | "Low";
  completeness_reason:     string | null;
  missing_dimensions:      string[];
  decision_risk:           "High" | "Medium" | "Low";
  decision_risk_reason:    string | null;
  strategy_roadmap: Array<{ phase: string; steps: string[] }>;
  decision_flow: Array<{ question: string; yes_action: string; no_action: string }>;
};

type StrategyProfilesOutput = {
  strategy_profiles: NonNullable<IntelligenceMemo["comparative_verdict"]>["strategy_profiles"];
  comparison_completeness: NonNullable<IntelligenceMemo["comparative_verdict"]>["comparison_completeness"];
  completeness_reason: string | null;
  missing_dimensions: string[];
  decision_risk: NonNullable<IntelligenceMemo["comparative_verdict"]>["decision_risk"];
  decision_risk_reason: string | null;
  strategy_roadmap: NonNullable<IntelligenceMemo["comparative_verdict"]>["strategy_roadmap"];
  decision_flow: NonNullable<IntelligenceMemo["comparative_verdict"]>["decision_flow"];
};

async function generateStrategyProfiles(
  query: string,
  options: string[],
  gatedClaims: NormalizedClaim[],
  clusters: ClaimCluster[],
  qualityScores: Record<"youtube" | "reddit" | "web", SourceQualityResult>,
): Promise<StrategyProfilesOutput> {
  const EMPTY: StrategyProfilesOutput = {
    strategy_profiles: [],
    comparison_completeness: null,
    completeness_reason: null,
    missing_dimensions: [],
    decision_risk: null,
    decision_risk_reason: null,
    strategy_roadmap: null,
    decision_flow: null,
  };

  if (options.length < 2) return EMPTY;

  const partitioned = partitionClaimsByOptions(options, gatedClaims);

  const evidenceContext = partitioned.map(({ option, claims }) => ({
    option,
    signal_count: { total: claims.length, creator: claims.filter(c => c.source === "youtube").length, community: claims.filter(c => c.source === "reddit").length, web: claims.filter(c => c.source === "web").length },
    sample_signals: [
      ...claims.filter(c => c.source === "youtube").slice(0, 3).map(c => ({ src: "creator", text: c.claim.slice(0, 180) })),
      ...claims.filter(c => c.source === "reddit").slice(0, 3).map(c => ({ src: "community", text: c.claim.slice(0, 180) })),
      ...claims.filter(c => c.source === "web").slice(0, 4).map(c => ({ src: "web", text: c.claim.slice(0, 180) })),
    ],
  }));

  const clusterContext = clusters.slice(0, 6).map(c => ({
    theme: c.theme,
    signals: c.claims.slice(0, 4).map(cl => cl.claim.slice(0, 150)),
  }));

  const res = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    temperature: 0.25,
    max_tokens: 2600,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content: `You are a Comparative Strategy Analyst for startup decision-making. Build independent evidence profiles for each option.

CRITICAL RULES:
1. Each profile is evaluated INDEPENDENTLY. A gap in evidence for one option does NOT make the other stronger.
2. advantages: 2–4 SPECIFIC benefits pulled from provided signals. Not generic startup advice.
3. costs: 2–3 real resource/effort requirements (time, money, consistency, skill). Be specific.
4. failure_modes: 3–4 ways this strategy commonly FAILS. These are the most valuable insight for founders.
   Examples: "Fails when offer is too generic and cannot be personalized", "Fails when CAC exceeds LTV before content compounds"
5. best_for: 3–4 conditions where this strategy works best (stage, model, founder type, situation).
6. expected_outcome: One specific, measurable result a founder should expect after 90 days of consistent execution.
   Ground in practitioner evidence. NOT generic forecasting.
   Example: "Founders who execute consistent outbound for 90 days typically close 2–5 pilot customers, per practitioner reports."
   If evidence is insufficient for a specific outcome, state that explicitly: "Evidence is insufficient to project a specific 90-day outcome."
7. evidence_gaps: 1–3 specific questions this option's evidence could NOT answer.
   These are blind spots — not general unknowns.
   Example: ["How does reply rate scale beyond 3 reps?", "Does this approach work in B2C contexts?", "What happens at sales cycles exceeding 6 months?"]
8. comparison_completeness: How comparable is the evidence for both options?
   "High" = both have substantial multi-source evidence
   "Medium" = one has moderately more evidence
   "Low" = significant imbalance — one option dominates the signal pool
7. missing_dimensions: Which decision criteria the evidence did NOT cover. Pick from: Customer Quality, Compounding Value, Scalability, Capital Requirements, Founder Time, Buying Intent, Sales Cycle, Brand Building, Trust Building, Conversion Rates, ROI Timeline.
8. decision_risk: "High" = recommendation relies on thin or single-source evidence. "Medium" = partial coverage. "Low" = multiple strong sources converge.
9. strategy_roadmap: 3 phases that show HOW to use BOTH strategies intelligently over time.
   Phase 1: Which strategy to start with and why (based on evidence).
   Phase 2: When and how to transition or add the second strategy.
   Phase 3: Long-term integrated state.
   Each phase: descriptive title + 3–4 sequential action steps.
10. decision_flow: 3–4 sequential decision questions followed by ONE TERMINAL CONCLUSION NODE.
    Questions 1–(n-1): answerable Yes/No. Each answer leads to a concrete next step.
    Question order: most critical decision gate first (e.g. PMF, ICP clarity, resource constraints, bandwidth).
    FINAL NODE (last entry): MUST be a terminal conclusion, not a question.
    Final node format: { "question": "Based on your answers above:", "yes_action": "Recommended: [Strategy] — [1-sentence reason grounded in evidence]", "no_action": "Alternative: [Strategy] — [1-sentence reason grounded in evidence]" }
    If a hybrid is the right answer for one path, use: "no_action": "Hybrid: [Strategy A + B] — [reason]"
    If evidence is insufficient for a strong recommendation: "yes_action": "Recommended: [best available option] — evidence is directional but limited", "no_action": "Alternative: [other option] — reasonable if [condition]"
    yes_action and no_action for decision questions should be CONCRETE actions, not just "proceed" or "don't proceed."
    Example:
      { "question": "Do you have product-market fit?", "yes_action": "Add content marketing to build inbound alongside outreach.", "no_action": "Start with cold outreach to collect rapid customer feedback." }
      { "question": "Based on your answers above:", "yes_action": "Recommended: Cold Outreach — evidence supports it as the faster path to customer feedback at this stage.", "no_action": "Alternative: Content Marketing — valid if you already have distribution or consistent inbound." }

Return JSON exactly:
{
  "profiles": [
    {
      "option": "exact option name",
      "advantages": ["specific evidence-backed benefit"],
      "costs": ["specific resource/time/effort cost"],
      "failure_modes": ["fails when X because Y"],
      "best_for": ["condition where this works best"],
      "expected_outcome": "Specific measurable result after 90 days of consistent execution, grounded in evidence.",
      "evidence_gaps": ["Specific question the evidence could not answer."]
    }
  ],
  "comparison_completeness": "High|Medium|Low",
  "completeness_reason": "One sentence.",
  "missing_dimensions": ["Customer Quality", "Scalability"],
  "decision_risk": "High|Medium|Low",
  "decision_risk_reason": "One sentence on why.",
  "strategy_roadmap": [
    { "phase": "Phase 1: Title", "steps": ["step 1", "step 2", "step 3"] },
    { "phase": "Phase 2: Title", "steps": ["step 1", "step 2", "step 3"] },
    { "phase": "Phase 3: Title", "steps": ["step 1", "step 2", "step 3"] }
  ],
  "decision_flow": [
    { "question": "Question a founder can answer Yes/No?", "yes_action": "Concrete action if yes.", "no_action": "Concrete action if no." }
  ]
}`,
      },
      {
        role: "user",
        content: JSON.stringify({ query, option_evidence: evidenceContext, insight_clusters: clusterContext }),
      },
    ],
  });

  try {
    const VALID_COMP = new Set(["High", "Medium", "Low"]);
    const p = JSON.parse(res.choices[0]?.message?.content ?? "{}") as Partial<StrategyProfilesLLMResult>;

    const rawProfiles = Array.isArray(p.profiles) ? p.profiles : [];

    const strategy_profiles = rawProfiles.map(profile => {
      const matchedPartition = partitioned.find(pt =>
        pt.option.toLowerCase().includes(profile.option?.toLowerCase() ?? "xxx") ||
        (profile.option?.toLowerCase() ?? "xxx").includes(pt.option.toLowerCase())
      ) ?? partitioned[0];

      return {
        option:          String(profile.option ?? matchedPartition.option),
        evidence_strength: computeOptionEvidenceStrength(matchedPartition.claims, qualityScores),
        source_coverage: {
          creator:   classifyOptionSourceCoverage(matchedPartition.claims, "youtube",  qualityScores.youtube.excluded),
          community: classifyOptionSourceCoverage(matchedPartition.claims, "reddit",   qualityScores.reddit.excluded),
          web:       classifyOptionSourceCoverage(matchedPartition.claims, "web",      qualityScores.web.excluded),
        },
        advantages:       Array.isArray(profile.advantages)    ? (profile.advantages as unknown[]).map(String).slice(0, 4)    : [],
        costs:            Array.isArray(profile.costs)         ? (profile.costs as unknown[]).map(String).slice(0, 3)         : [],
        failure_modes:    Array.isArray(profile.failure_modes) ? (profile.failure_modes as unknown[]).map(String).slice(0, 4) : [],
        best_for:         Array.isArray(profile.best_for)      ? (profile.best_for as unknown[]).map(String).slice(0, 4)      : [],
        expected_outcome: (typeof profile.expected_outcome === "string" && profile.expected_outcome.length > 10) ? profile.expected_outcome : null,
        evidence_gaps:    Array.isArray(profile.evidence_gaps)  ? (profile.evidence_gaps as unknown[]).map(String).slice(0, 3) : [],
      };
    });

    // If LLM returned fewer profiles than options, fill in missing ones deterministically
    if (strategy_profiles.length < options.length) {
      for (const { option, claims } of partitioned) {
        if (!strategy_profiles.some(sp => sp.option.toLowerCase().includes(option.toLowerCase()))) {
          strategy_profiles.push({
            option,
            evidence_strength: computeOptionEvidenceStrength(claims, qualityScores),
            source_coverage: {
              creator:   classifyOptionSourceCoverage(claims, "youtube",  qualityScores.youtube.excluded),
              community: classifyOptionSourceCoverage(claims, "reddit",   qualityScores.reddit.excluded),
              web:       classifyOptionSourceCoverage(claims, "web",      qualityScores.web.excluded),
            },
            advantages: [], costs: [], failure_modes: [], best_for: [], expected_outcome: null, evidence_gaps: [],
          });
        }
      }
    }

    const roadmap = Array.isArray(p.strategy_roadmap)
      ? (p.strategy_roadmap as Array<{ phase?: string; steps?: unknown[] }>)
          .filter(r => r.phase && Array.isArray(r.steps) && r.steps.length > 0)
          .slice(0, 3)
          .map(r => ({ phase: String(r.phase), steps: (r.steps as unknown[]).map(String).slice(0, 4) }))
      : null;

    const decision_flow = Array.isArray(p.decision_flow)
      ? (p.decision_flow as Array<{ question?: string; yes_action?: string; no_action?: string }>)
          .filter(n => typeof n.question === "string" && n.question.length > 5)
          .slice(0, 5)
          .map(n => ({
            question:   String(n.question),
            yes_action: String(n.yes_action ?? "Proceed with this strategy."),
            no_action:  String(n.no_action  ?? "Consider the alternative first."),
          }))
      : null;

    console.log(`[generateStrategyProfiles] profiles=${strategy_profiles.length} roadmap_phases=${roadmap?.length ?? 0} completeness=${p.comparison_completeness} risk=${p.decision_risk} flow_nodes=${decision_flow?.length ?? 0}`);

    return {
      strategy_profiles,
      comparison_completeness: VALID_COMP.has(p.comparison_completeness ?? "") ? p.comparison_completeness as "High" | "Medium" | "Low" : null,
      completeness_reason:     (typeof p.completeness_reason === "string" && p.completeness_reason.length > 5) ? p.completeness_reason : null,
      missing_dimensions:      Array.isArray(p.missing_dimensions) ? (p.missing_dimensions as unknown[]).map(String).slice(0, 6) : [],
      decision_risk:           VALID_COMP.has(p.decision_risk ?? "") ? p.decision_risk as "High" | "Medium" | "Low" : null,
      decision_risk_reason:    (typeof p.decision_risk_reason === "string" && p.decision_risk_reason.length > 5) ? p.decision_risk_reason : null,
      strategy_roadmap:        roadmap && roadmap.length >= 2 ? roadmap : null,
      decision_flow:           decision_flow && decision_flow.length >= 2 ? decision_flow : null,
    };
  } catch (err) {
    console.error("[generateStrategyProfiles] failed:", err instanceof Error ? err.message : err);
    return EMPTY;
  }
}

// ── Perspective extraction — dedicated single-job call ────────────────────────

async function generatePerspectives(
  query: string,
  creatorRaw: Array<{ claim: string; type: string }>,
  communityRaw: Array<{ claim: string; type: string }>,
  webRaw: Array<{ claim: string; type: string }>,
): Promise<PerspectiveResult> {
  const hasAny = creatorRaw.length > 0 || communityRaw.length > 0 || webRaw.length > 0;
  if (!hasAny) return { perspectives: {}, cross_source_synthesis: {} };

  const res = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    temperature: 0.2,
    max_tokens: 2000,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content: `You are a startup intelligence analyst. SINGLE TASK: extract source-specific perspectives from evidence for this exact question: "${query}"

For each source with 1+ evidence items, synthesize what that source reveals about the question:
- creator_evidence → "youtube": What do experienced operators and founders believe specifically about "${query}"? Recurring mental models, tactical beliefs, operator convictions backed by their own results.
- community_evidence → "reddit": What measurable outcomes did founders and practitioners actually report about "${query}"? Focus strictly on: what they tried, what specific results they observed, what failed and why. Every bullet must directly answer "${query}" — NOT adjacent advice.
- web_evidence → "web": What do published frameworks and industry sources recommend specifically for "${query}"? Specific playbooks, data-backed findings, documented approaches.

RULES (CRITICAL):
1. Synthesize ONLY from that source's own evidence. Never cross-contaminate with another source.
2. Source has 0 items → OMIT that key entirely from output.
3. Source has 1+ items → ALWAYS generate. No exceptions. Even 1 signal produces a perspective.
4. PRESERVE specific startup vocabulary: "founder-led sales", "cold outreach", "narrow ICP", "customer interviews", "referrals", "distribution", "warm intros", "outbound", "inbound", "early adopters"
5. Do NOT replace tactics with abstractions:
   "founder-led sales" stays "founder-led sales" — NOT "build trust"
   "cold outreach" stays "cold outreach" — NOT "engage your audience"
   "customer interviews" stays "customer interviews" — NOT "understand your customers"
6. Creator bullets: what specific belief or conviction do they hold? (operator viewpoint, not general advice)
7. Community bullets MUST describe OUTCOMES not ADVICE: "Founders who tried X reported Y results" — NEVER "Consider doing X" or "It's important to Y"
   CRITICAL FILTER: Every community bullet MUST directly address "${query}". REJECT observations that are weakly related, tangentially connected, or generically true for any startup question. If a bullet would make sense as an answer to "How do I build a successful startup?" rather than specifically "${query}", DISCARD it.
8. 3–5 bullets per active source. common_view: one sentence capturing the central pattern.
9. cross_source_synthesis: COMPARE sources against each other — do NOT summarize each source individually. Use exactly these three keys as COMPARISON DIMENSIONS (not source labels):
   - "youtube" key: One sentence on what ALL active sources AGREE on regarding "${query}". Lead with "All sources agree..." or "Both X and Y sources agree..."
   - "reddit" key: One sentence on the KEY DIFFERENCE between source perspectives. Lead with "Community practitioners emphasize..." or "While creators focus on X, web sources highlight Y..."
   - "web" key: One sentence on the most important perspective MISSING from all evidence. Lead with "No source covered..." or "Missing from all sources:..."
   Omit a key only if fewer than 2 active sources are available. These keys represent comparison dimensions, not the sources they are named after.

Return ONLY valid JSON:
{
  "youtube": { "bullets": ["..."], "common_view": "..." },
  "reddit":  { "bullets": ["..."], "common_view": "..." },
  "web":     { "bullets": ["..."], "common_view": "..." },
  "cross_source_synthesis": {
    "youtube": "All sources agree that cold outreach is strongest before product-market fit.",
    "reddit":  "Community practitioners emphasize execution quality; web sources emphasize strategic frameworks.",
    "web":     "No source directly addressed how these strategies perform at sales cycles exceeding 6 months."
  }
}
Omit source keys with 0 evidence. cross_source_synthesis only includes comparison dimensions when 2+ sources are active.`,
      },
      {
        role: "user",
        content: JSON.stringify({
          question: query,
          creator_evidence:   creatorRaw,
          community_evidence: communityRaw,
          web_evidence:       webRaw,
        }),
      },
    ],
  });

  const VALID_SRCS = new Set(["youtube", "reddit", "web"] as const);

  try {
    type RawPersp = Record<string, { bullets?: unknown[]; common_view?: string } | string>;
    const p = JSON.parse(res.choices[0]?.message?.content ?? "{}") as RawPersp & {
      cross_source_synthesis?: Record<string, unknown>;
    };

    const perspectives: PerspectiveResult["perspectives"] = {};
    for (const src of VALID_SRCS) {
      const val = p[src];
      if (val && typeof val === "object" && !Array.isArray(val) && "bullets" in val && Array.isArray(val.bullets)) {
        const bullets = (val.bullets as unknown[]).filter((b): b is string => typeof b === "string" && b.length > 5).slice(0, 6);
        if (bullets.length > 0) {
          perspectives[src] = {
            bullets,
            common_view: typeof val.common_view === "string" ? val.common_view : "",
          };
        }
      }
    }

    const cross_source_synthesis: PerspectiveResult["cross_source_synthesis"] = {};
    if (p.cross_source_synthesis && typeof p.cross_source_synthesis === "object") {
      for (const src of VALID_SRCS) {
        const val = p.cross_source_synthesis[src];
        if (typeof val === "string" && val.length > 5) {
          cross_source_synthesis[src] = val;
        }
      }
    }

    console.log(`[generatePerspectives] result: creator=${!!perspectives.youtube} community=${!!perspectives.reddit} web=${!!perspectives.web}`);
    return { perspectives, cross_source_synthesis };
  } catch (err) {
    console.error("[generatePerspectives] JSON parse failed:", err instanceof Error ? err.message : err);
    return { perspectives: {}, cross_source_synthesis: {} };
  }
}

// ── Best evidence ranking — synthesized insight bullets from clusters ─────────

function buildBestEvidenceRanking(
  gatedClaims: NormalizedClaim[],
  extractor:   ExtractorOutput,
): string[] {
  // One key_theme per cluster — guarantees each card represents a distinct insight, never two from the same cluster
  const fromKeyThemes = extractor.insight_clusters
    .map(c => (c.key_themes ?? []).find(t => t && t.length > 10 && !t.startsWith("#")))
    .filter((t): t is string => t != null)
    .slice(0, 4);

  if (fromKeyThemes.length >= 3) return fromKeyThemes;

  // Fill with top gated claims by strength × relevance (fallback only)
  const top = [...gatedClaims]
    .sort((a, b) =>
      (computeClaimStrength(b) * b.queryRelevance) -
      (computeClaimStrength(a) * a.queryRelevance)
    )
    .slice(0, 4 - fromKeyThemes.length)
    .map(c => c.claim.length > 150 ? c.claim.slice(0, 150) + "…" : c.claim);

  return [...new Set([...fromKeyThemes, ...top])].slice(0, 4);
}

// ── Coverage: 5-layer model (youtube, reddit, web, research, predictions) ─────

const COVERAGE_LAYERS = [
  { key: "youtube",     label: "Creator Intelligence" },
  { key: "reddit",      label: "Community Intelligence" },
  { key: "web",         label: "Web Intelligence" },
  { key: "research",    label: "Research Intelligence" },
  { key: "predictions", label: "Prediction Intelligence" },
];

const GAP_IMPACT: Record<string, string[]> = {
  "Community Intelligence":  ["Founder community experiences", "Operator-validated tactics", "Real-world startup discussions"],
  "Web Intelligence":        ["Published research and articles", "Industry reports", "Market data"],
  "Creator Intelligence":    ["Expert video analysis", "Creator-validated frameworks", "Long-form strategy content"],
  "Research Intelligence":   ["Startup benchmark data", "Academic evidence", "Market validation studies"],
  "Prediction Intelligence": ["Creator accuracy tracking", "Long-term trend validation", "Historical forecast outcomes"],
};

function computeCoverage(sourcesUsed: Array<"youtube" | "reddit" | "web">): {
  score: number; active: string[]; missing: string[]; gap_impact: string[];
} {
  const used = new Set<string>(sourcesUsed);
  const active  = COVERAGE_LAYERS.filter(l => used.has(l.key)).map(l => l.label);
  const missing = COVERAGE_LAYERS.filter(l => !used.has(l.key)).map(l => l.label);
  const gap_impact = missing.flatMap(m => GAP_IMPACT[m] ?? []).slice(0, 5);
  return {
    score: Math.round((active.length / COVERAGE_LAYERS.length) * 100),
    active,
    missing,
    gap_impact,
  };
}

// ── Source friendly names ─────────────────────────────────────────────────────

const SOURCE_FRIENDLY: Record<string, string> = {
  youtube: "Creator Intelligence",
  reddit:  "Community Intelligence",
  web:     "Web Intelligence",
};

// ── Creator Intelligence — evidence-backed claims with source attribution ─────

function buildCreatorIntelligence(
  ytRows:           DeepResearchRow[],
  rawClaims:        NormalizedClaim[],
  gatedClaims:      NormalizedClaim[],
  clusters:         ClaimCluster[],
  relevanceGate:    number,
  ytOffTopicClaims: NormalizedClaim[] = [],
  corpusMatchCount: number = 0,
  relevantYtClaims: NormalizedClaim[] = [],
  keywords:         string[] = [],
  query:            string = "",
): IntelligenceMemo["creator_intelligence"] {
  if (ytRows.length === 0) return null;

  // yt-${i} maps 1-to-1 with ytRows[i]
  const rowByClaimId = new Map<string, DeepResearchRow>(
    ytRows.map((r, i) => [`yt-${i}`, r])
  );

  const gatedYtIds = new Set(gatedClaims.filter(c => c.source === "youtube").map(c => c.id));
  const rawYtClaims = rawClaims.filter(c => c.source === "youtube");
  const acceptedYtClaims = gatedClaims.filter(c => c.source === "youtube");

  const retrieved    = ytRows.length;
  const accepted     = gatedYtIds.size;
  const coverageScore = retrieved > 0 ? Math.round((accepted / retrieved) * 100) : 0;
  const coverageLevel: "High" | "Medium" | "Low" =
    coverageScore >= 50 ? "High" : coverageScore >= 20 ? "Medium" : "Low";

  // Coverage-level aggregate metrics
  const coverageAvgSimilarity = acceptedYtClaims.length > 0
    ? Math.round(acceptedYtClaims.reduce((s, c) => s + c.queryRelevance, 0) / acceptedYtClaims.length)
    : 0;
  const coverageCreatorNames = new Set(
    acceptedYtClaims.map(c => rowByClaimId.get(c.id)?.channel_name).filter((n): n is string => !!n)
  );
  const uniqueCreators = coverageCreatorNames.size;
  const evidenceDensity = uniqueCreators > 0
    ? Math.round((accepted / uniqueCreators) * 10) / 10
    : 0;
  const evidenceDensityLevel: "High" | "Medium" | "Low" =
    evidenceDensity >= 3 ? "High" : evidenceDensity >= 1.5 ? "Medium" : "Low";

  // Top rejections: raw YT claims that didn't reach gated, highest relevance first
  const topRejections = rawYtClaims
    .filter(c => !gatedYtIds.has(c.id))
    .sort((a, b) => b.queryRelevance - a.queryRelevance)
    .slice(0, 5)
    .map(c => {
      const row = rowByClaimId.get(c.id);
      return {
        claim: (row?.insight ?? row?.quote ?? c.claim).slice(0, 80),
        relevance_score: c.queryRelevance,
        reason: c.queryRelevance < relevanceGate ? "Low relevance to query" : "Quality threshold not met",
      };
    });

  // Pre-compute question alignment for each cluster (for sorting by query relevance)
  type ClusterWithAlign = { cluster: ClaimCluster; avgAlignment: number };
  const clusterWithAlignment: ClusterWithAlign[] = clusters.map(cluster => {
    const ytInCluster = cluster.claims.filter(c => c.source === "youtube");
    if (ytInCluster.length === 0) return { cluster, avgAlignment: 0 };
    const aligns = ytInCluster.map(c => computeQuestionAlignment(c.claim, keywords));
    return { cluster, avgAlignment: aligns.reduce((s, a) => s + a, 0) / aligns.length };
  });
  // Sort clusters so most query-relevant themes appear first
  const sortedClusters = [...clusterWithAlignment].sort((a, b) => b.avgAlignment - a.avgAlignment);

  // Evidence items across all clusters — for global alignment diagnostics
  const allEvidenceItems: Array<{
    creator: string; quote: string; alignment: number; video_title: string | null; theme: string;
  }> = [];

  // One evidence card per cluster — only clusters with at least one YT claim
  const claimItems: NonNullable<IntelligenceMemo["creator_intelligence"]>["claims"] = [];
  for (const { cluster, avgAlignment } of sortedClusters) {
    const ytInCluster = cluster.claims.filter(c => c.source === "youtube");
    if (ytInCluster.length === 0) continue;

    // Total segment count and average similarity across all segments
    const evidence_count = ytInCluster.length;
    const avg_similarity = Math.round(
      ytInCluster.reduce((s, c) => s + c.queryRelevance, 0) / ytInCluster.length
    );

    // Dedup by creator — keep best-aligned quote per creator
    const byCreator = new Map<string, NonNullable<IntelligenceMemo["creator_intelligence"]>["claims"][0]["evidence"][0]>();
    for (const c of ytInCluster) {
      const alignment = computeQuestionAlignment(c.claim, keywords);
      const row = rowByClaimId.get(c.id);
      const creator = row?.channel_name ?? "Unknown Creator";
      const existing = byCreator.get(creator);
      if (!existing || alignment > existing.question_alignment_score) {
        byCreator.set(creator, {
          creator,
          video_title: row?.video_title ?? null,
          video_id:    row?.video_id    ?? null,
          timestamp:   row?.timestamp_str ?? null,
          quote:       (row?.quote ?? c.claim).slice(0, 300),
          relevance_score: c.queryRelevance,
          question_alignment_score: Math.round(alignment * 100) / 100,
        });
      }
    }

    const creator_count = byCreator.size;
    const evidence = [...byCreator.values()];
    const avg_alignment = Math.round(avgAlignment * 100) / 100;

    // Collect for alignment diagnostics
    for (const ev of evidence) {
      allEvidenceItems.push({
        creator: ev.creator,
        quote:   ev.quote,
        alignment: ev.question_alignment_score,
        video_title: ev.video_title,
        theme: cluster.theme,
      });
    }

    const consensus: "Anecdotal" | "Emerging Consensus" | "Strong Consensus" | "Broad Consensus" =
      creator_count >= 7 ? "Broad Consensus"
      : creator_count >= 4 ? "Strong Consensus"
      : creator_count >= 2 ? "Emerging Consensus"
      : "Anecdotal";

    // Confidence score: 40% creator diversity + 25% avg similarity + 20% evidence volume + 15% corpus coverage
    const creatorWeight  = Math.min(100, (creator_count / 7) * 100);
    const evidenceWeight = Math.min(100, (evidence_count / 10) * 100);
    const confidence_score = Math.round(
      creatorWeight  * 0.40 +
      avg_similarity * 0.25 +
      evidenceWeight * 0.20 +
      coverageScore  * 0.15
    );

    const confidence: "High" | "Medium" | "Low" =
      confidence_score >= 60 ? "High" : confidence_score >= 35 ? "Medium" : "Low";

    const potentially_off_question = avg_alignment < 0.40;

    claimItems.push({ theme: cluster.theme, confidence, confidence_score, consensus, creator_count, evidence_count, avg_similarity, avg_alignment, potentially_off_question, evidence });
  }

  // Alignment diagnostics — scoped to ALL accepted YT claims (not just clustered ones)
  // so "Synthesis Failure" can fire when aligned claims exist but no themes formed.
  const HIGH_ALIGNMENT_THRESHOLD = 0.60;
  const OFF_QUESTION_THRESHOLD   = 0.30;
  const acceptedYtAligns         = acceptedYtClaims.map(c => computeQuestionAlignment(c.claim, keywords));
  const acceptedHighAlignCount   = acceptedYtAligns.filter(s => s >= HIGH_ALIGNMENT_THRESHOLD).length;
  const alignment_percentage     = accepted > 0 ? Math.round(acceptedHighAlignCount / accepted * 100) : 0;
  const acceptedAvgAlignment     = acceptedYtAligns.length > 0
    ? Math.round((acceptedYtAligns.reduce((s, a) => s + a, 0) / acceptedYtAligns.length) * 100) / 100
    : 0;

  // Coverage type — corpus gap classification for ingestion roadmap
  const coverage_type: "MISSING_CONTENT" | "ADJACENT_CONTENT" | "DIRECT_CONTENT" =
    corpusMatchCount === 0                                                    ? "MISSING_CONTENT"
    : acceptedHighAlignCount >= 3                                             ? "DIRECT_CONTENT"
    : (acceptedHighAlignCount === 0 || acceptedAvgAlignment < 0.40) && retrieved > 0 ? "ADJACENT_CONTENT"
    :                                                                           "DIRECT_CONTENT";

  if (coverage_type === "ADJACENT_CONTENT") {
    const topCreators = [...coverageCreatorNames].slice(0, 5);
    const topVideos = [...new Set(
      acceptedYtClaims.map(c => rowByClaimId.get(c.id)?.video_title).filter((v): v is string => !!v)
    )].slice(0, 5);
    console.log("[IngestionRoadmap] ADJACENT_CONTENT", JSON.stringify({
      query,
      coverage_type: "ADJACENT_CONTENT",
      top_creators: topCreators,
      top_videos:   topVideos,
      average_alignment: acceptedAvgAlignment,
    }));
  }

  const top_answering_claims = [...allEvidenceItems]
    .sort((a, b) => b.alignment - a.alignment)
    .slice(0, 5);

  const off_question_claims = allEvidenceItems
    .filter(e => e.alignment < OFF_QUESTION_THRESHOLD)
    .sort((a, b) => a.alignment - b.alignment)
    .slice(0, 8);

  const alignment_debug = {
    accepted_claims:       accepted,
    high_alignment_claims: acceptedHighAlignCount,
    average_alignment:     acceptedAvgAlignment,
  };

  // Coverage × Alignment 2×2 state matrix
  const _covHigh = coverageLevel !== "Low";
  const _alignHigh = alignment_percentage >= 50;
  const coverage_alignment_state: NonNullable<IntelligenceMemo["creator_intelligence"]>["coverage_alignment_state"] =
    _covHigh  && _alignHigh  ? "Strong Creator Signal"
    : _covHigh  && !_alignHigh ? "Adjacent Topic Problem"
    : !_covHigh && _alignHigh  ? "Niche But Relevant"
    :                            "Corpus Gap";

  // Deterministic outcome classification — identifies which pipeline stage failed
  const themes_generated = claimItems.length;
  const creator_signal_outcome: IntelligenceMemo["creator_intelligence"] extends null ? never : NonNullable<IntelligenceMemo["creator_intelligence"]>["creator_signal_outcome"] =
    corpusMatchCount === 0                                        ? "Missing Creator Content"
    : retrieved === 0                                             ? "Retrieval Failure"
    : accepted === 0                                              ? "Quality Gate Failure"
    : acceptedHighAlignCount === 0                                ? "Weak Query Alignment"
    : themes_generated === 0                                      ? "Synthesis Failure"
    : acceptedHighAlignCount >= 3 && themes_generated >= 1       ? "Strong Creator Signal"
    :                                                               "Weak Creator Signal";

  // Single-source-of-truth outcome enum consumed by decision engine and UI
  type CreatorOutcomeEnum = NonNullable<IntelligenceMemo["creator_intelligence"]>["outcome"];
  const outcome: CreatorOutcomeEnum =
    creator_signal_outcome === "Missing Creator Content" ? "MISSING_CONTENT"
    : creator_signal_outcome === "Retrieval Failure"     ? "RETRIEVAL_FAILURE"
    : creator_signal_outcome === "Quality Gate Failure"  ? "QUALITY_FAILURE"
    : creator_signal_outcome === "Weak Query Alignment"  ? "ALIGNMENT_FAILURE"
    : creator_signal_outcome === "Synthesis Failure"     ? "SYNTHESIS_FAILURE"
    : creator_signal_outcome === "Strong Creator Signal" ? "STRONG_SIGNAL"
    :                                                      "WEAK_SIGNAL";

  // creator_available = true iff at least one theme was produced
  const creator_available = themes_generated > 0;

  const ytOffTopicCount   = ytOffTopicClaims.length;
  const totalQualityGated = accepted + ytOffTopicCount;
  const offTopicRatio     = totalQualityGated > 0 ? ytOffTopicCount / totalQualityGated : 0;
  const coverage_status: "Good" | "Weak" | "Contaminated" | "No Coverage" =
    accepted >= 3             ? "Good"
    : accepted > 0            ? "Weak"
    : ytOffTopicCount >= 3 && offTopicRatio >= 0.70 ? "Contaminated"
    : "No Coverage";

  const root_cause: "Missing Corpus Content" | "Retrieval Quality" | "None" =
    accepted > 0           ? "None"
    : corpusMatchCount === 0 ? "Missing Corpus Content"
    :                          "Retrieval Quality";

  // ── Retrieval trace — first-failure attribution for every retrieved segment ──
  const rawYtIdSet     = new Set(rawClaims.filter(c => c.source === "youtube").map(c => c.id));
  const workingYtIdSet = new Set(relevantYtClaims.map(c => c.id));
  const offTopicIdSet  = new Set(ytOffTopicClaims.map(c => c.id));
  const topicPassedIds = new Set(gatedClaims.filter(c => c.source === "youtube").map(c => c.id));
  const clusterYtIds   = new Set(clusters.flatMap(cl => cl.claims.filter(c => c.source === "youtube").map(c => c.id)));

  const passedStrength  = rawYtIdSet.size;
  const passedRelevance = workingYtIdSet.size;
  const passedQuality   = offTopicIdSet.size + topicPassedIds.size;
  const passedTopicGate = topicPassedIds.size;
  const usedInClusters  = clusterYtIds.size;

  const retrieval_trace = ytRows.map((row, i) => {
    const id          = `yt-${i}`;
    const creator     = row.channel_name ?? "Unknown";
    const video       = (row.video_title ?? "").slice(0, 80);
    const rawClaim    = rawYtIdSet.has(id) ? rawClaims.find(c => c.id === id) : null;
    const keyword_score = rawClaim
      ? rawClaim.queryRelevance
      : scoreClaimRelevance(row.insight ?? row.quote ?? "", keywords);

    let accepted_flag   = false;
    let rejection_reason: string | undefined;

    if (clusterYtIds.has(id)) {
      accepted_flag = true;
    } else if (topicPassedIds.has(id)) {
      // Passed topic gate — check if alignment gate excluded it from theme synthesis
      const alignScore = computeQuestionAlignment(row.insight ?? row.quote ?? "", keywords);
      rejection_reason = alignScore < MIN_THEME_ALIGNMENT ? "LOW_ALIGNMENT" : "DOMAIN_MISMATCH";
    } else if (offTopicIdSet.has(id)) {
      rejection_reason = "OFF_TOPIC";
    } else if (workingYtIdSet.has(id)) {
      rejection_reason = "LOW_QUALITY";    // passed relevance gate but quality-excluded
    } else if (rawYtIdSet.has(id)) {
      rejection_reason = "LOW_SIMILARITY"; // passed strength but failed relevance gate
    } else {
      rejection_reason = "LOW_QUALITY";    // failed strength filter
    }

    return { creator, video, keyword_score, retrieval_rank: i, accepted: accepted_flag, rejection_reason };
  });

  const rejection_breakdown: Record<string, number> = {};
  for (const t of retrieval_trace) {
    if (!t.accepted && t.rejection_reason) {
      rejection_breakdown[t.rejection_reason] = (rejection_breakdown[t.rejection_reason] ?? 0) + 1;
    }
  }

  const missed_evidence = [...retrieval_trace]
    .filter(t => !t.accepted)
    .sort((a, b) => b.keyword_score - a.keyword_score)
    .slice(0, 5)
    .map(t => ({
      creator: t.creator,
      video: t.video,
      keyword_score: t.keyword_score,
      reason_not_selected: t.rejection_reason ?? "UNKNOWN",
      retrieval_rank: t.retrieval_rank,
    }));

  const evidence_lost_at_stage: Record<string, number> = {
    "Retrieval":   Math.max(0, corpusMatchCount - retrieved),
    "Strength":    Math.max(0, retrieved - passedStrength),
    "Relevance":   Math.max(0, passedStrength - passedRelevance),
    "Quality":     Math.max(0, passedRelevance - passedQuality),
    "Topic Gate":  ytOffTopicCount,
    "Cluster":     Math.max(0, passedTopicGate - usedInClusters),
  };

  const primary_failure_stage = Object.entries(evidence_lost_at_stage)
    .filter(([, n]) => n > 0)
    .sort(([, a], [, b]) => b - a)[0]?.[0] ?? "None";

  const evidence_lost = Math.max(0, evidence_lost_at_stage[primary_failure_stage] ?? 0);

  const most_common_rejection = Object.entries(rejection_breakdown)
    .sort(([, a], [, b]) => b - a)[0]?.[0] ?? "NONE";

  return {
    themes_generated,
    alignment_percentage,
    coverage_alignment_state,
    creator_signal_outcome,
    outcome,
    creator_available,
    claims: coverage_status === "Contaminated" ? [] : claimItems,
    coverage: {
      retrieved,
      accepted,
      rejected: retrieved - accepted,
      coverage_score: coverageScore,
      level: coverageLevel,
      avg_similarity: coverageAvgSimilarity,
      unique_creators: uniqueCreators,
      evidence_density: evidenceDensity,
      evidence_density_level: evidenceDensityLevel,
      top_rejections: topRejections,
      coverage_status,
      coverage_type,
      off_topic_count: ytOffTopicCount,
      off_topic_ratio: Math.round(offTopicRatio * 100),
      corpus_matches: corpusMatchCount,
      root_cause,
      primary_failure_stage,
      evidence_lost,
      most_common_rejection,
    },
    debug: {
      retrieval_funnel: {
        corpus_matches: corpusMatchCount,
        retrieved,
        passed_strength:   passedStrength,
        passed_relevance:  passedRelevance,
        passed_quality:    passedQuality,
        passed_topic_gate: passedTopicGate,
        accepted:          usedInClusters,
      },
      retrieval_trace,
      rejection_breakdown,
      missed_evidence,
      evidence_lost_at_stage,
      alignment:           alignment_debug,
      top_answering_claims,
      off_question_claims,
    },
  };
}

// ── Cross-source consensus — clusters where 2+ distinct source types agree ────

function buildCrossSourceConsensus(
  clusters:     ClaimCluster[],
  extractor:    ExtractorOutput,
  qualityScores: Record<"youtube" | "reddit" | "web", SourceQualityResult>,
): IntelligenceMemo["cross_source_consensus"] {
  type SrcLabel = "creator" | "community" | "web";
  const SRC_TO_LABEL: Record<"youtube" | "reddit" | "web", SrcLabel> = {
    youtube: "creator",
    reddit:  "community",
    web:     "web",
  };
  const SRC_KEYS = ["youtube", "reddit", "web"] as const;

  const results: IntelligenceMemo["cross_source_consensus"] = [];

  for (const cluster of clusters) {
    // Count claims per source (only non-excluded sources)
    const countBySrc: Partial<Record<"youtube" | "reddit" | "web", number>> = {};
    for (const c of cluster.claims) {
      if (!qualityScores[c.source].excluded) {
        countBySrc[c.source] = (countBySrc[c.source] ?? 0) + 1;
      }
    }
    const activeSrcs = SRC_KEYS.filter(s => (countBySrc[s] ?? 0) > 0);
    if (activeSrcs.length < 2) continue; // skip single-source clusters

    const ec = extractor.insight_clusters.find(e => e.theme === cluster.theme);
    const insight = ec?.key_themes?.[0] ?? ec?.summary ?? cluster.theme;

    const source_types: SrcLabel[] = activeSrcs.map(s => SRC_TO_LABEL[s]);
    const source_detail: IntelligenceMemo["cross_source_consensus"][0]["source_detail"] = {};
    let totalQuality = 0;
    for (const src of activeSrcs) {
      source_detail[SRC_TO_LABEL[src]] = { evidence_count: countBySrc[src]! };
      totalQuality += qualityScores[src].score;
    }

    const source_count = activeSrcs.length;
    const avgQuality = totalQuality / source_count;
    const baseScore  = source_count >= 3 ? 80 : 60;
    const qualAdj    = Math.round((avgQuality - 65) * 0.35);
    const confidence_score = Math.min(100, Math.max(20, baseScore + qualAdj));
    const agreement: "High" | "Medium" | "Low" =
      source_count >= 3 ? "High" : confidence_score >= 70 ? "Medium" : "Low";

    results.push({ insight, source_types, source_count, source_detail, confidence_score, agreement });
  }

  return results
    .sort((a, b) => b.source_count - a.source_count || b.confidence_score - a.confidence_score)
    .slice(0, 5);
}

// ── Decision explainability — all deterministic, no LLM ──────────────────────

function buildDecisionDrivers(
  clusters:               ClaimCluster[],
  extractor:              ExtractorOutput,
  qualityScores:          Record<"youtube" | "reddit" | "web", SourceQualityResult>,
  confidenceResult:       ConfidenceResult,
  decision:               DecisionResult,
  creatorIntelligence:    IntelligenceMemo["creator_intelligence"],
  sourcesUsed:            Array<"youtube" | "reddit" | "web">,
  hardContradictionCount: number,
  tradeoffCount:          number,
  sourceStates:           Record<"youtube" | "reddit" | "web", SourceSignalState>,
  creatorVisible:         boolean,
  relationship_type:      RelationshipType,
  isComparative:          boolean,
  relationship_reason:    string,
): IntelligenceMemo["decision_drivers"] {
  type SrcLabel = "creator" | "community" | "web";
  const SRC_TO_LABEL: Record<"youtube" | "reddit" | "web", SrcLabel> = {
    youtube: "creator", reddit: "community", web: "web",
  };
  const POSITIVE_TYPES = new Set(["success", "recommendation"]);
  const NEGATIVE_TYPES = new Set(["failure", "pain_point"]);

  const positiveSignals: IntelligenceMemo["decision_drivers"]["positive_signals"] = [];
  const negativeSignals: IntelligenceMemo["decision_drivers"]["negative_signals"] = [];

  for (const cluster of clusters) {
    const dom = dominantType(cluster);
    const isPositive = POSITIVE_TYPES.has(dom);
    const isNegative = NEGATIVE_TYPES.has(dom);
    if (!isPositive && !isNegative) continue;

    const clusterSrcs = [...new Set(
      cluster.claims.filter(c => !qualityScores[c.source].excluded).map(c => c.source)
    )];
    if (clusterSrcs.length === 0) continue;

    const source_types: SrcLabel[] = clusterSrcs.map(s => SRC_TO_LABEL[s]);
    const source_count = clusterSrcs.length;
    const confidence_score = Math.round(
      cluster.claims.reduce((s, c) => s + c.queryRelevance, 0) / cluster.claims.length
    );
    const ec = extractor.insight_clusters.find(e => e.theme === cluster.theme);
    const insight = ec?.key_themes?.[0] ?? ec?.summary ?? cluster.theme;

    if (isPositive) {
      positiveSignals.push({ insight, source_types, source_count, confidence_score, is_cross_source: source_count >= 2 });
    } else {
      negativeSignals.push({ insight, source_types, source_count, confidence_score });
    }
  }

  positiveSignals.sort((a, b) => b.confidence_score - a.confidence_score || b.source_count - a.source_count);
  negativeSignals.sort((a, b) => b.confidence_score - a.confidence_score || b.source_count - a.source_count);

  const bd = confidenceResult.breakdown;
  const confPct = Math.round(confidenceResult.confidence * 100);

  // Uncertainty factors — single source of truth: keyed to creator outcome enum
  const uncertaintyFactors: string[] = [];

  // Creator — fires only when creator is NOT visible to the user.
  // "creatorVisible" = themes rendered OR perspective bullets rendered in the UI.
  // When visible, no unavailability warning should appear regardless of pipeline internals.
  if (!creatorVisible && creatorIntelligence) {
    const CREATOR_FACTOR: Partial<Record<NonNullable<IntelligenceMemo["creator_intelligence"]>["outcome"], string>> = {
      RETRIEVAL_FAILURE: "Creator content may exist but retrieval did not surface relevant material",
      ALIGNMENT_FAILURE: "Creator content exists but discusses adjacent topics — alignment to this query was low",
      MISSING_CONTENT:   "Creator library does not yet contain meaningful coverage for this topic",
      QUALITY_FAILURE:   "Creator content retrieved but did not meet evidence quality threshold",
      SYNTHESIS_FAILURE: "Creator evidence found but insufficient signal to form coherent themes",
    };
    const msg = CREATOR_FACTOR[creatorIntelligence.outcome];
    if (msg) uncertaintyFactors.push(msg);
  } else if (creatorVisible && sourceStates.youtube === "OPPOSES") {
    uncertaintyFactors.push(`Relationship: ${relationship_type} — ${relationship_reason}`);
  }

  // Community
  if (sourceStates.reddit === "NO_SIGNAL") {
    uncertaintyFactors.push("Community intelligence unavailable for this topic — no practitioner discussion found");
  } else if (sourceStates.reddit === "OPPOSES") {
    // Only push if creator didn't already push the relationship factor
    if (!creatorVisible || sourceStates.youtube !== "OPPOSES") {
      uncertaintyFactors.push(`Relationship: ${relationship_type} — ${relationship_reason}`);
    }
  }
  if (hardContradictionCount > 0 && relationship_type === "CONTRADICTION") {
    uncertaintyFactors.push(
      `${hardContradictionCount} direct contradiction${hardContradictionCount !== 1 ? "s" : ""} detected — sources disagree on specific outcomes`
    );
  }
  if (bd.signalDensity < 50) {
    uncertaintyFactors.push("Evidence volume is lower than optimal — fewer distinct perspectives sampled");
  }
  if (bd.sourceCoverage < 50) {
    uncertaintyFactors.push("Source diversity is limited — most evidence comes from a single source type");
  }

  const supportingCount = (["youtube", "reddit", "web"] as const).filter(s => sourceStates[s] === "SUPPORTS").length;
  const opposingCount   = (["youtube", "reddit", "web"] as const).filter(s => sourceStates[s] === "OPPOSES").length;

  let decision_strength: "Strong" | "Moderate" | "Weak" =
    confPct >= 80 ? "Strong" : confPct >= 55 ? "Moderate" : "Weak";
  // Strong Consensus rule: 2+ sources support and 0 oppose → upgrade Moderate → Strong
  if (supportingCount >= 2 && opposingCount === 0 && decision_strength === "Moderate") {
    decision_strength = "Strong";
  }

  const crossSourceCount = clusters.filter(c =>
    new Set(c.claims.filter(cl => !qualityScores[cl.source].excluded).map(cl => cl.source)).size >= 2
  ).length;

  const sourcesUsedFriendly = sourcesUsed.map(s =>
    s === "youtube" ? "Creator" : s === "reddit" ? "Community" : "Web"
  );
  const agrStr = bd.agreement >= 65 ? "strong" : bd.agreement >= 40 ? "moderate" : "limited";

  let justification = "";
  if (decision.directional.includes("YES")) {
    justification = `Positive evidence outweighs identified risks across ${sourcesUsedFriendly.join(", ")} sources, with ${agrStr} agreement (${bd.agreement}%).`;
    if (crossSourceCount >= 2) {
      justification += ` ${crossSourceCount} insights corroborated independently across multiple source types.`;
    }
    if (decision_strength !== "Strong") {
      const reason = uncertaintyFactors[0]
        ?? (negativeSignals.length > 0 ? `${negativeSignals.length} risk area${negativeSignals.length !== 1 ? "s" : ""} present` : "limited evidence volume");
      justification += ` Not "Strong YES" because: ${reason.toLowerCase()}.`;
    }
  } else if (decision.directional.includes("NO")) {
    justification = `Negative signals and risks outweigh positive evidence across ${sourcesUsedFriendly.join(", ")} sources, with ${agrStr} agreement (${bd.agreement}%).`;
    if (positiveSignals.length > 0) {
      justification += ` ${positiveSignals.length} positive signal${positiveSignals.length !== 1 ? "s" : ""} exist but are insufficient to overcome identified risks.`;
    }
  } else {
    justification = `Evidence is balanced across ${sourcesUsedFriendly.join(", ")} sources — ${tradeoffCount > 0 ? `${tradeoffCount} tradeoff${tradeoffCount !== 1 ? "s" : ""} identified` : "no clear directional consensus"}, with ${agrStr} agreement (${bd.agreement}%).`;
    if (positiveSignals.length > 0 && negativeSignals.length > 0) {
      justification += ` ${positiveSignals.length} positive and ${negativeSignals.length} negative signals are roughly balanced.`;
    }
  }

  // Missing evidence — what would raise confidence
  const missingEvidence: string[] = [];
  if (qualityScores.youtube.excluded) missingEvidence.push("More creator content indexed on this specific topic");
  if (qualityScores.reddit.excluded)  missingEvidence.push("Additional practitioner discussion on this topic (HN/Reddit)");
  if (creatorIntelligence?.coverage.level === "Low" && !qualityScores.youtube.excluded) {
    missingEvidence.push("More creators discussing this topic specifically");
  }
  if (crossSourceCount === 0) {
    missingEvidence.push("Cross-source corroboration — different evidence types reaching the same conclusion");
  }
  if (confPct < 70) missingEvidence.push("Higher signal volume: more distinct practitioner perspectives");
  if (hardContradictionCount > 0) {
    missingEvidence.push("Clearer practitioner consensus — current evidence shows conflicting outcomes");
  }

  return {
    positive_signals:       positiveSignals.slice(0, 4),
    negative_signals:       negativeSignals.slice(0, 3),
    uncertainty_factors:    uncertaintyFactors.slice(0, 4),
    decision_justification: justification,
    decision_strength,
    missing_evidence:       missingEvidence.slice(0, 5),
  };
}

// ── Memo assembly (pure, no LLM) ──────────────────────────────────────────────

// ── Source detail + attribution ───────────────────────────────────────────────

function computeSourceDetail(
  rawClaims:      NormalizedClaim[],
  gatedClaims:    NormalizedClaim[],
  clusters:       ClaimCluster[],
  qualityScores:  Record<"youtube" | "reddit" | "web", SourceQualityResult>,
  relevanceGate:  number,
): IntelligenceMemo["source_detail"] {
  const sources = ["youtube", "reddit", "web"] as const;
  const gatedSet = new Set(gatedClaims.map(c => c.id));

  // Weighted contribution: quality_score × signal_count for each accepted source
  const weights = sources.map(s => ({
    src: s,
    w: qualityScores[s].excluded ? 0
      : qualityScores[s].score * gatedClaims.filter(c => c.source === s).length,
  }));
  const totalW = weights.reduce((t, { w }) => t + w, 0);

  return Object.fromEntries(sources.map(src => {
    const q         = qualityScores[src];
    const srcGated  = gatedClaims.filter(c => c.source === src);
    const myWeight  = weights.find(w => w.src === src)!.w;
    const contribution = totalW > 0 ? Math.round((myWeight / totalW) * 100) : 0;

    // Unique = clusters where only this source contributed
    // Overlapping = clusters where this source AND others contributed
    const uniqueInsights = clusters.filter(c => {
      const srcs = new Set(c.claims.map(cl => cl.source));
      return srcs.has(src) && srcs.size === 1;
    }).length;
    const overlapInsights = clusters.filter(c => {
      const srcs = new Set(c.claims.map(cl => cl.source));
      return srcs.has(src) && srcs.size > 1;
    }).length;

    const primaryClaims = srcGated
      .sort((a, b) => computeClaimStrength(b) - computeClaimStrength(a))
      .slice(0, 4)
      .map(c => c.claim.length > 160 ? c.claim.slice(0, 160) + "…" : c.claim);

    const excludedSample = rawClaims
      .filter(c => c.source === src && !gatedSet.has(c.id))
      .sort((a, b) => b.queryRelevance - a.queryRelevance)
      .slice(0, 3)
      .map(c => ({
        claim: c.claim.length > 120 ? c.claim.slice(0, 120) + "…" : c.claim,
        reason: c.queryRelevance < relevanceGate ? "Low relevance to query" : "Source quality below threshold",
      }));

    return [src, {
      quality_score:        q.score,
      signal_count:         srcGated.length,
      unique_insights:      uniqueInsights,
      overlapping_insights: overlapInsights,
      contribution_pct:     contribution,
      primary_claims:       primaryClaims,
      excluded:             q.excluded,
      excluded_sample:      excludedSample,
    }];
  })) as IntelligenceMemo["source_detail"];
}

function buildAttributedEvidence(
  bestEvidence: string[],
  clusters:     ClaimCluster[],
  extractor:    ExtractorOutput,
): IntelligenceMemo["attributed_evidence"] {
  // Map each key_theme text → its parent ClaimCluster
  const themeToCluster = new Map<string, ClaimCluster>();
  extractor.insight_clusters.forEach(ec => {
    const mc = clusters.find(c => c.theme === ec.theme);
    if (mc) (ec.key_themes ?? []).forEach(kt => themeToCluster.set(kt, mc));
  });

  return bestEvidence.map(evidence => {
    const cluster = themeToCluster.get(evidence);
    if (!cluster) return { claim: evidence, sources: [] };

    const srcCounts = new Map<"youtube" | "reddit" | "web", number>();
    cluster.claims.forEach(cl => srcCounts.set(cl.source, (srcCounts.get(cl.source) ?? 0) + 1));

    return {
      claim: evidence,
      sources: [...srcCounts.entries()]
        .sort(([, a], [, b]) => b - a)
        .map(([source, signal_count]) => ({ source, signal_count })),
    };
  });
}

// ── Reasoning Audit — pre-render quality gate ─────────────────────────────────

function auditMemo(memo: IntelligenceMemo): IntelligenceMemo {
  const audit: string[] = [];
  let m = { ...memo };

  const uniqueCreators = m.creator_intelligence?.coverage?.unique_creators ?? 0;

  // Rule: No creator consensus inferred from a single creator
  if (uniqueCreators === 1) {
    if (m.consensus_quality === "Strong") {
      audit.push("FAIL consensus_quality=Strong with 1 creator → downgraded to Medium");
      m = { ...m, consensus_quality: "Medium" };
    }
    if (m.recommendation_stability === "High") {
      audit.push("FAIL recommendation_stability=High with 1 creator → downgraded to Medium");
      m = { ...m, recommendation_stability: "Medium" };
    }
  }

  // Rule: No overstated confidence — if all three source quality scores are Low, cap at 60
  const sq = m.source_quality_scores;
  const allLow = sq.youtube.level === "Low" && sq.reddit.level === "Low" && sq.web.level === "Low";
  if (allLow && m.confidence_score > 60) {
    audit.push(`FAIL confidence=${m.confidence_score} with all-Low source quality → capped at 60`);
    m = {
      ...m,
      confidence_score: 60,
      confidence_breakdown: { ...m.confidence_breakdown },
    };
  }

  // Rule: No consensus_quality=Strong when consensus.supporting_sources < 2
  const supporting = m.consensus?.supporting_sources ?? 0;
  if (m.consensus_quality === "Strong" && supporting < 2) {
    audit.push(`FAIL consensus_quality=Strong with ${supporting} supporting source(s) → downgraded to Medium`);
    m = { ...m, consensus_quality: "Medium" };
  }

  // Rule: Recommendation type cannot be Universal when unique_creators === 1 and no reddit/web signal
  const hasReddit = (m.evidence_count?.reddit ?? 0) > 0;
  const hasWeb    = (m.evidence_count?.web ?? 0) > 0;
  if (uniqueCreators === 1 && !hasReddit && !hasWeb && m.recommendation_type === "Universal") {
    audit.push("FAIL recommendation_type=Universal with 1 creator and no other sources → changed to Conditional");
    m = { ...m, recommendation_type: "Conditional" };
  }

  // Rule: Directional must match confidence level
  if (m.confidence_score < 55 && (m.directional === "Strong YES (conditional)" || m.directional === "Strong NO (conditional)")) {
    const safer = m.directional === "Strong YES (conditional)" ? "Lean YES" : "Lean NO";
    audit.push(`FAIL directional=${m.directional} with confidence=${m.confidence_score} (<55) → downgraded to ${safer}`);
    m = { ...m, directional: safer };
  }

  // Rule: consensus_quality=Strong requires agreement_score >= 65
  if (m.consensus_quality === "Strong" && (m.consensus?.agreement_score ?? 0) < 65) {
    audit.push(`FAIL consensus_quality=Strong with agreement_score=${m.consensus?.agreement_score} (<65) → downgraded to Medium`);
    m = { ...m, consensus_quality: "Medium" };
  }

  // Validate canonical_agreement label matches score (spec final validation rule)
  const ca = m.canonical_agreement;
  const expectedLabel: IntelligenceMemo["canonical_agreement"]["label"] =
    ca.score >= 90 ? "Strong Consensus"
    : ca.score >= 70 ? "Moderate Consensus"
    : ca.score >= 50 ? "Partial Consensus"
    : ca.score >= 30 ? "Mixed Evidence"
    : "No Consensus";
  if (ca.label !== expectedLabel) {
    audit.push(`FAIL canonical_agreement label="${ca.label}" does not match score=${ca.score} (expected "${expectedLabel}") → corrected`);
    m = { ...m, canonical_agreement: { ...ca, label: expectedLabel } };
  }

  // Spec rule: agreement_score cannot be 100 with Weak coverage quality
  if (ca.score >= 95 && ca.coverage_quality === "Weak") {
    audit.push(`FAIL canonical_agreement score=${ca.score} with coverage_quality=Weak → capped at 69`);
    m = { ...m, canonical_agreement: { ...m.canonical_agreement, score: 69, label: "Partial Consensus" } };
  }

  if (audit.length > 0) {
    console.warn(`[Reasoning Audit] ${audit.length} issue(s) found and corrected:\n${audit.map(a => `  · ${a}`).join("\n")}`);
  } else {
    console.log("[Reasoning Audit] PASS — no issues detected");
  }

  return m;
}

// ─────────────────────────────────────────────────────────────────────────────

function assembleMemo(
  query:              string,
  gatedClaims:        NormalizedClaim[],
  rawClaims:          NormalizedClaim[],
  relevanceGate:      number,
  clusters:           ClaimCluster[],
  extractor:          ExtractorOutput,
  confidenceResult:   ConfidenceResult,
  decision:           DecisionResult,
  perspResult:        PerspectiveResult,
  rawCounts:          { youtube: number; reddit: number; web: number },
  redditDiag:         IntelligenceMemo["reddit_diagnostics"],
  qualityScores:      Record<"youtube" | "reddit" | "web", SourceQualityResult>,
  evidenceProcessing: IntelligenceMemo["evidence_processing"],
  perspRaw:           Record<"youtube" | "reddit" | "web", string[]>,
  creatorIntelligence: IntelligenceMemo["creator_intelligence"],
  sourceStates:       Record<"youtube" | "reddit" | "web", SourceSignalState>,
  queryType:          IntelligenceMemo["query_type"],
  comparativeVerdict: IntelligenceMemo["comparative_verdict"],
  strategyProfiles:   StrategyProfilesOutput | null,
): IntelligenceMemo {
  const bySource = (src: NormalizedClaim["source"]) =>
    gatedClaims.filter(c => c.source === src)
      .sort((a, b) => computeClaimStrength(b) - computeClaimStrength(a));

  // Shared insights = top claims from multi-source clusters
  const sharedInsights = clusters
    .filter(c => new Set(c.claims.map(cl => cl.source)).size >= 2)
    .flatMap(c => c.claims.sort((a, b) => computeClaimStrength(b) - computeClaimStrength(a)).slice(0, 1).map(cl => cl.claim))
    .slice(0, 4);

  const agreementScore = confidenceResult.breakdown.agreement; // already 0-100
  const sourcesUsed = (["youtube", "reddit", "web"] as const).filter(s => !qualityScores[s].excluded);

  // creatorVisible = true when ANY creator content is rendered in the UI:
  // either structured evidence themes OR synthesized perspective bullets.
  // This is the single boolean that gates all creator uncertainty factors and
  // consensus source counts — prevents a rendered creator panel from coexisting
  // with a "creator unavailable" uncertainty factor.
  const creatorVisible =
    (creatorIntelligence?.creator_available ?? false) ||
    (perspResult.perspectives.youtube?.bullets?.length ?? 0) > 0;

  // When creator is visible but raw source state says NO_SIGNAL (e.g. quality gate
  // excluded YT but perspective fallback still rendered), upgrade to SUPPORTS so the
  // consensus counts and justification text are accurate.
  const effectiveSourceStates: typeof sourceStates =
    creatorVisible && sourceStates.youtube === "NO_SIGNAL"
      ? { ...sourceStates, youtube: "SUPPORTS" }
      : sourceStates;

  const isComparative = isComparativeQuery(query);

  // Split extractor output into hard contradictions and tradeoffs
  const hardContradictions = extractor.contradictions.filter(c => c.conflict_type !== "tradeoff");
  const softTradeoffs      = extractor.contradictions.filter(c => c.conflict_type === "tradeoff");

  // Suppress hard contradictions when sources are largely aligned
  const hasRealContrad = agreementScore < 70 && hardContradictions.length > 0;
  const filteredContradictions = hasRealContrad
    ? hardContradictions.slice(0, 3).map(c => ({
        claim_a: c.claim_a,
        claim_b: c.claim_b,
        why_it_matters: c.explanation,
        conflict_type: c.conflict_type ?? "direct" as const,
      }))
    : [];

  // Tradeoffs always surface (they're useful context, not negative signal)
  const filteredTradeoffs = softTradeoffs.slice(0, 5).map(c => ({
    claim_a: c.claim_a,
    claim_b: c.claim_b,
    why_it_matters: c.explanation,
  }));

  const opposingCount = (["youtube", "reddit", "web"] as const).filter(s => effectiveSourceStates[s] === "OPPOSES").length;
  const relationship_type = classifyRelationshipType(
    hardContradictions.length,
    filteredTradeoffs.length,
    opposingCount,
    agreementScore,
    isComparative,
  );
  const relationship_reason = buildRelationshipReason(relationship_type, extractor, isComparative);

  // Confidence adjustment by relationship type.
  // CONSENSUS bonus reduced (0.10 → 0.05): quality-weighted scoring already accounts for agreement depth.
  const RELATIONSHIP_DELTA: Record<RelationshipType, number> = {
    CONSENSUS:      0.05,
    COMPLEMENTARY:  0.03,
    TRADEOFF:       0.00,
    CONTRADICTION: -0.20,
  };
  const adjustedConfidence = Math.max(0, Math.min(1, confidenceResult.confidence + RELATIONSHIP_DELTA[relationship_type]));

  // Insight density: unique themes vs total signals
  const uniqueInsights = clusters.length;
  const totalSignals   = gatedClaims.length;

  // Primary themes for evidence_used
  const primaryThemes = clusters.slice(0, 5).map(c => c.theme);

  const bestEvidence = buildBestEvidenceRanking(gatedClaims, extractor);
  const crossSourceConsensus = buildCrossSourceConsensus(clusters, extractor, qualityScores);
  const decisionDrivers = buildDecisionDrivers(
    clusters,
    extractor,
    qualityScores,
    confidenceResult,
    decision,
    creatorIntelligence,
    sourcesUsed,
    hardContradictions.length,
    filteredTradeoffs.length,
    effectiveSourceStates,
    creatorVisible,
    relationship_type,
    isComparative,
    relationship_reason,
  );

  // Build new insight clusters format: synthesized themes, not raw excerpts
  const clusterByTheme = new Map(clusters.map(c => [c.theme, c]));
  const newClusters: IntelligenceMemo["insight_clusters"] = extractor.insight_clusters
    .filter(ec => clusterByTheme.has(ec.theme))
    .slice(0, 5)
    .map(ec => {
      const mc = clusterByTheme.get(ec.theme)!;
      const signal_count = mc.claims.length;
      const confidence: "High" | "Medium" | "Low" =
        signal_count >= 5 ? "High" : signal_count >= 3 ? "Medium" : "Low";
      const key_themes = (ec.key_themes ?? []).filter(t => t.length > 5).slice(0, 4);
      // Fallback to summary if key_themes absent
      const finalThemes = key_themes.length > 0 ? key_themes : ec.summary ? [ec.summary] : [];
      return { theme: ec.theme, signal_count, confidence, key_themes: finalThemes };
    })
    .filter(c => c.key_themes.length > 0);

  return {
    query,
    generated_at: new Date().toISOString(),
    query_type: queryType,
    directional: decision.directional,
    decision_summary: decision.decision_summary,
    recommendation_type: decision.recommendation_type,
    condition_qualifier:  decision.condition_qualifier,
    recommendation_conditions: decision.recommendation_conditions,
    consensus_quality: computeConsensusQuality(qualityScores, clusters, creatorIntelligence?.coverage.unique_creators ?? 0),
    canonical_agreement: computeCanonicalAgreement(
      agreementScore,
      qualityScores,
      clusters,
      creatorIntelligence?.coverage.unique_creators ?? 0,
      hardContradictions.length,
      filteredTradeoffs.length,
      (["youtube", "reddit", "web"] as const).filter(s => effectiveSourceStates[s] === "SUPPORTS").length,
      strategyProfiles?.comparison_completeness ?? null,
    ),
    recommendation_stability: computeRecommendationStability(qualityScores, clusters),
    counter_evidence: decision.counter_evidence,
    why_not_alternative: decision.why_not_alternative,
    comparative_verdict: comparativeVerdict
      ? {
          ...comparativeVerdict,
          ...(queryType === "COMPARATIVE" ? (computeComparativeCoverage(query, gatedClaims) ?? { coverage_balance: null, comparison_quality: null }) : { coverage_balance: null, comparison_quality: null }),
          strategy_profiles:       strategyProfiles?.strategy_profiles       ?? null,
          comparison_completeness: strategyProfiles?.comparison_completeness ?? null,
          completeness_reason:     strategyProfiles?.completeness_reason     ?? null,
          missing_dimensions:      strategyProfiles?.missing_dimensions      ?? [],
          decision_risk:           strategyProfiles?.decision_risk           ?? null,
          decision_risk_reason:    strategyProfiles?.decision_risk_reason    ?? null,
          strategy_roadmap:        strategyProfiles?.strategy_roadmap        ?? null,
          decision_flow:           strategyProfiles?.decision_flow           ?? null,
        }
      : null,
    reddit_gap: qualityScores.reddit.excluded,
    confidence_score: Math.round(adjustedConfidence * 100),
    confidence_breakdown: {
      agreement:            agreementScore,
      sourceCoverage:       confidenceResult.breakdown.sourceCoverage,
      contradictionPenalty: confidenceResult.breakdown.contradictionPenalty,
      signalDensity:        confidenceResult.breakdown.signalDensity,
      crossSourceBonus:     confidenceResult.breakdown.crossSourceBonus,
    },
    consensus: {
      agreement_score: agreementScore,
      shared_insights: sharedInsights,
      disagreements: hasRealContrad
        ? hardContradictions.slice(0, 3).map(c => c.explanation)
        : [],
      source_states: effectiveSourceStates,
      supporting_sources:  (["youtube", "reddit", "web"] as const).filter(s => effectiveSourceStates[s] === "SUPPORTS").length,
      opposing_sources:    (["youtube", "reddit", "web"] as const).filter(s => effectiveSourceStates[s] === "OPPOSES").length,
      unavailable_sources: (["youtube", "reddit", "web"] as const).filter(s => effectiveSourceStates[s] === "NO_SIGNAL").length,
      relationship_type,
      relationship_reason,
      is_comparative_query: isComparative,
    },
    source_breakdown: {
      youtube: { count: rawCounts.youtube, key_signals: bySource("youtube").slice(0, 4).map(c => c.claim) },
      reddit:  { count: rawCounts.reddit,  key_signals: bySource("reddit").slice(0, 4).map(c => c.claim) },
      web:     { count: rawCounts.web,     key_signals: bySource("web").slice(0, 4).map(c => c.claim) },
    },
    contradictions: filteredContradictions,
    tradeoffs: filteredTradeoffs,
    cross_source_consensus: crossSourceConsensus,
    decision_recommendation: {
      stage_based_actions: {
        pre_product:  extractor.stage_interpretation.pre_product?.observations?.slice(0, 3) ?? [],
        early_stage:  extractor.stage_interpretation.early_stage?.observations?.slice(0, 3) ?? [],
        growth_stage: extractor.stage_interpretation.growth_stage?.observations?.slice(0, 3) ?? [],
      },
      priority_actions: decision.priority_actions,
    },
    insight_clusters: newClusters,
    insight_density: { total_signals: totalSignals, unique_insights: uniqueInsights },
    evidence_used: { total_signals: totalSignals, primary_themes: primaryThemes },
    evidence_count: rawCounts,
    reddit_diagnostics: redditDiag,
    source_quality_scores: qualityScores,
    sources_used: sourcesUsed,
    best_evidence_ranking: bestEvidence,
    coverage: computeCoverage(sourcesUsed),
    evidence_processing: evidenceProcessing,
    source_detail: computeSourceDetail(rawClaims, gatedClaims, clusters, qualityScores, relevanceGate),
    attributed_evidence: buildAttributedEvidence(bestEvidence, clusters, extractor),
    evidence_waterfall: {
      retrieved: rawCounts,
      accepted: {
        youtube: gatedClaims.filter(c => c.source === "youtube").length,
        reddit:  gatedClaims.filter(c => c.source === "reddit").length,
        web:     gatedClaims.filter(c => c.source === "web").length,
      },
      normalized: gatedClaims.length,
      synthesized: clusters.length,
    },
    // source_perspective: generated by dedicated generatePerspectives call (not bundled with decision)
    source_perspective: {
      youtube: !(perspResult.perspectives.youtube?.bullets?.length)
        ? null
        : {
            bullets:     perspResult.perspectives.youtube.bullets,
            common_view: perspResult.perspectives.youtube.common_view,
            confidence:  qualityScores.youtube.score >= 70 ? "High" : qualityScores.youtube.score >= 50 ? "Medium" : "Low",
            weak_signal: qualityScores.youtube.excluded || qualityScores.youtube.score < 60,
          },
      reddit: !(perspResult.perspectives.reddit?.bullets?.length)
        ? null
        : {
            bullets:     perspResult.perspectives.reddit.bullets,
            common_view: perspResult.perspectives.reddit.common_view,
            confidence:  qualityScores.reddit.score >= 70 ? "High" : qualityScores.reddit.score >= 50 ? "Medium" : "Low",
            weak_signal: qualityScores.reddit.excluded || qualityScores.reddit.score < 60,
          },
      web: !(perspResult.perspectives.web?.bullets?.length)
        ? null
        : {
            bullets:     perspResult.perspectives.web.bullets,
            common_view: perspResult.perspectives.web.common_view,
            confidence:  qualityScores.web.score >= 70 ? "High" : qualityScores.web.score >= 50 ? "Medium" : "Low",
            weak_signal: qualityScores.web.excluded || qualityScores.web.score < 60,
          },
    },
    cross_source_synthesis: {
      youtube: qualityScores.youtube.excluded ? null : (perspResult.cross_source_synthesis.youtube ?? null),
      reddit:  qualityScores.reddit.excluded  ? null : (perspResult.cross_source_synthesis.reddit  ?? null),
      web:     qualityScores.web.excluded     ? null : (perspResult.cross_source_synthesis.web     ?? null),
    },
    perspective_raw: perspRaw,
    creator_intelligence: creatorIntelligence,
    decision_drivers: decisionDrivers,
  };
}

// ── Domain fallback HN queries (used when LLM expansion fails) ────────────────

// Short 2-4 word keyword queries — these are what Algolia HN search works best with.
const DOMAIN_HN_FALLBACKS: Record<QueryDomain, string[]> = {
  customer_acquisition: [
    "first customers",
    "customer acquisition",
    "founder-led sales",
    "early traction",
    "getting first users",
    "startup outreach",
    "startup distribution",
    "paying customers",
  ],
  growth_strategy: [
    "startup growth",
    "user acquisition",
    "growth channels",
    "scaling startup",
    "user retention",
    "viral growth",
  ],
  product_building: [
    "building MVP",
    "product market fit",
    "shipping product",
    "MVP launch",
    "startup product lessons",
  ],
  fundraising: [
    "seed funding",
    "raising capital",
    "angel investors",
    "startup fundraising",
    "pitch investors",
  ],
  technical: [
    "startup tech stack",
    "scaling engineering",
    "technical debt startup",
    "architecture lessons",
    "software startup lessons",
  ],
  market_research: [
    "startup validation",
    "customer discovery",
    "product market fit",
    "user interviews",
    "market research startup",
  ],
};

// ── Domain synonym map ────────────────────────────────────────────────────────

const DOMAIN_SYNONYMS: Record<string, string[]> = {
  "seo":              ["content marketing", "blogging", "organic traffic", "inbound marketing", "search traffic", "programmatic SEO"],
  "content marketing":["blogging", "SEO", "organic traffic", "inbound leads"],
  "ai":               ["LLMs", "agents", "automation", "machine learning", "GPT"],
  "pricing":          ["monetization", "subscriptions", "revenue model", "freemium", "billing"],
  "growth":           ["acquisition", "traction", "user growth", "customer acquisition", "distribution"],
  "acquisition":      ["growth", "traction", "customers", "signups", "leads"],
  "saas":             ["B2B software", "subscription software", "SaaS startup"],
  "outbound":         ["cold email", "cold outreach", "sales", "prospecting"],
  "inbound":          ["content marketing", "SEO", "organic", "referrals"],
  "retention":        ["churn", "engagement", "activation", "onboarding"],
  "funding":          ["venture capital", "investors", "seed round", "fundraising"],
};

function detectDomainSynonyms(query: string): string[] {
  const lower = query.toLowerCase();
  const synonyms: string[] = [];
  for (const [keyword, terms] of Object.entries(DOMAIN_SYNONYMS)) {
    if (lower.includes(keyword)) synonyms.push(...terms);
  }
  return [...new Set(synonyms)];
}

// ── HN Query Expansion ────────────────────────────────────────────────────────

const HN_EXPANSION_PROMPT = `You are a Hacker News search query generator.

Goal: Generate SHORT keyword-based queries that find HN discussions relevant to the user's question.

Critical rule: Algolia (the HN search engine) works best with SHORT queries of 2–5 words. Long sentence queries return zero or near-zero results. NEVER repeat the original question. NEVER generate queries longer than 6 words.

Generate 10–15 queries using:
- Core concept and intent keywords (noun phrases, not questions)
- Startup vocabulary: traction, PMF, founders, operators, distribution, outreach, referrals
- Action/outcome terms: what worked, channel, lessons, experience
- Synonyms and related terms: customers ↔ users ↔ signups, acquisition ↔ growth ↔ traction
- Practitioner phrasing (3–5 words max): "founder-led sales", "early traction", "startup growth"

Priority guidance:
- high: directly maps to the core concept (e.g. "first customers" for a customer-acquisition question)
- medium: adjacent or synonym queries

EXAMPLES:
User: "How do AI startups get their first 100 customers?"
Good queries: "first customers", "early traction", "customer acquisition", "founder-led sales", "getting first users", "startup distribution", "cold outreach", "referrals startup", "traction before PMF", "finding first users", "early stage growth", "startup sales lessons"
Bad queries: "How do AI startups get their first 100 customers?", "how did you get your first paying customers SaaS"

Return ONLY valid JSON:
{ "queries": [{ "query": "...", "priority": "high" | "medium" }] }`;

async function expandHNQueries(query: string): Promise<string[]> {
  try {
    const res = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.5,
      max_tokens: 1000,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: HN_EXPANSION_PROMPT },
        {
          role: "user",
          content: (() => {
            const hints = detectDomainSynonyms(query);
            return hints.length > 0
              ? `User question:\n${query}\n\nRelated startup terms to include: ${hints.join(", ")}`
              : `User question:\n${query}`;
          })(),
        },
      ],
    });

    type ExpandedQuery = { query?: string; priority?: string };
    const parsed = JSON.parse(res.choices[0]?.message?.content ?? "{}") as { queries?: ExpandedQuery[] };
    const queries = Array.isArray(parsed.queries) ? parsed.queries : [];
    // Take up to 6 high + 4 medium priority queries (previously took only 3+1)
    const high   = queries.filter(q => q.priority === "high"   && q.query).slice(0, 6).map(q => q.query!);
    const medium = queries.filter(q => q.priority !== "high"   && q.query).slice(0, 4).map(q => q.query!);
    return [...high, ...medium];
  } catch {
    return [];
  }
}

// ── SSE helpers ───────────────────────────────────────────────────────────────

type SSEPayload =
  | { type: "stage"; source?: string; agent?: string; message: string; count?: number; diagnostics?: Record<string, number> }
  | { type: "complete"; memo: IntelligenceMemo }
  | { type: "error"; message: string };

function makeStream() {
  let ctrl: ReadableStreamDefaultController<Uint8Array>;
  const enc = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({ start(c) { ctrl = c; } });
  const emit = (p: SSEPayload) => ctrl.enqueue(enc.encode(`data: ${JSON.stringify(p)}\n\n`));
  const close = () => ctrl.close();
  return { stream, emit, close };
}

// ── Route ─────────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });

  let query = "";
  try {
    const body = await req.json() as { query?: string };
    query = (body.query ?? "").trim();
  } catch { /* ignore */ }

  if (!query) return new Response(JSON.stringify({ error: "query required" }), { status: 400 });

  const { stream, emit, close } = makeStream();

  void (async () => {
    try {
      const keywords = extractKeywords(query);

      // Stage 1: YouTube — evidence retrieval + corpus count run in parallel (zero extra latency)
      emit({ type: "stage", source: "youtube", message: "Searching creator library…" });
      const [ytRows, corpusMatchCount] = await Promise.all([
        getDeepResearchEvidence(keywords, 50),
        countCreatorCorpusMatches(keywords),
      ]);
      console.log(`[CorpusAudit] keywords=${JSON.stringify(keywords)} corpusMatches=${corpusMatchCount} retrieved=${ytRows.length}`);
      emit({ type: "stage", source: "youtube", message: `Found ${ytRows.length} creator evidence points`, count: ytRows.length });

      // Stage 2: Community (HN + Reddit in parallel)
      // Domain classification needed for fallback queries — classify early
      const queryDomain = classifyQueryDomain(query);

      emit({ type: "stage", source: "reddit", message: "Expanding community queries…" });
      let hnClaims: HNClaim[] = [];
      let redditDiag: IntelligenceMemo["reddit_diagnostics"] = null;
      try {
        // Query expansion with hardcoded domain fallback when LLM fails
        let expandedQueries: string[] = [];
        try {
          expandedQueries = await expandHNQueries(query);
          console.log(`[Community] HN expansion: ${expandedQueries.length} queries → ${JSON.stringify(expandedQueries)}`);
        } catch {
          console.warn("[Community] HN expansion threw — using domain fallbacks");
        }
        // Fallback when expansion returns too few (< 3) short-form queries
        if (expandedQueries.length < 3) {
          const fallbacks = DOMAIN_HN_FALLBACKS[queryDomain];
          expandedQueries = [...expandedQueries, ...fallbacks].slice(0, 8);
          console.log(`[Community] Fallback queries injected: ${JSON.stringify(expandedQueries)}`);
        }

        // Use at most 5 short-form queries. Never include the literal sentence (400s from Algolia).
        // More than 5 queries × (1 story + 1 comment + 4 items) = too many parallel requests.
        const queriesToRun = expandedQueries.slice(0, 5);
        console.log("[Community] queries to run:", JSON.stringify(queriesToRun));
        emit({ type: "stage", source: "reddit", message: `Running ${queriesToRun.length} community queries…` });

        // HN always runs. Reddit only runs when OAuth credentials are configured —
        // without them, searchReddit hits the public www.reddit.com API which is
        // blocked by Reddit on AWS/Vercel IP ranges (returns connection refused).
        const hasRedditCreds = !!(process.env.REDDIT_CLIENT_ID && process.env.REDDIT_CLIENT_SECRET);
        const redditQuery = expandedQueries.slice(0, 3).join(" ") || query;
        const [hnPostSets, redditResult] = await Promise.allSettled([
          Promise.allSettled(
            queriesToRun.map(q => searchHN(q, { limit: 10, fetchComments: true, commentLimit: 8, commentedPostsLimit: 4, minPoints: 0 }))
          ),
          hasRedditCreds
            ? searchReddit(redditQuery, { limit: 15, fetchComments: true, commentLimit: 8, commentedPostsLimit: 6, time: "all" })
            : Promise.resolve([]),
        ]);
        if (!hasRedditCreds) console.log("[Reddit] skipped — no OAuth credentials configured");

        // Process HN results
        let hnPostCount = 0, hnCommentCount = 0, hnPostsRaw = 0;
        let submittedHNPosts: import("@/lib/hnSkill").HNPost[] = [];
        if (hnPostSets.status === "fulfilled") {
          hnPostSets.value.forEach((r, i) => {
            if (r.status === "fulfilled") {
              console.log(`[HN] query[${i}] "${queriesToRun[i]}": ${r.value.length} posts`);
            } else {
              console.warn(`[HN] query[${i}] failed:`, r.reason);
            }
          });
          const allHNPosts = hnPostSets.value.flatMap(r => r.status === "fulfilled" ? r.value : []);
          hnPostsRaw = allHNPosts.length;
          const seen = new Set<string>();
          const deduped = allHNPosts
            .filter(p => { if (seen.has(p.id)) return false; seen.add(p.id); return true; })
            .sort((a, b) => b.score - a.score);
          submittedHNPosts = deduped.slice(0, 20);
          hnPostCount = submittedHNPosts.length;
          hnCommentCount = submittedHNPosts.reduce((s, p) => s + p.top_comments.length, 0);
          console.log(`[HN] raw: ${hnPostsRaw} → dedup: ${deduped.length} → submit: ${hnPostCount} | comments: ${hnCommentCount}`);
        }
        emit({
          type: "stage", source: "reddit",
          message: `HN: ${hnPostCount} threads (${hnCommentCount} comments)`,
          count: hnPostCount,
          diagnostics: { raw_posts: hnPostsRaw, deduped: hnPostCount, comments: hnCommentCount },
        });

        // Process Reddit results
        let redditPosts: import("@/lib/redditSkill").RedditPost[] = [];
        if (redditResult.status === "fulfilled") {
          redditPosts = redditResult.value;
          const rComments = redditPosts.reduce((s, p) => s + p.top_comments.length, 0);
          console.log(`[Reddit] ${redditPosts.length} posts | ${rComments} comments`);
          emit({
            type: "stage", source: "reddit",
            message: `Reddit: ${redditPosts.length} posts (${rComments} comments)`,
            count: redditPosts.length,
          });
        } else {
          console.warn("[Reddit] search failed:", redditResult.reason);
          emit({ type: "stage", source: "reddit", message: "Reddit unavailable, HN only" });
        }

        // Claim extraction (parallel)
        const [hnExtracted, redditExtracted] = await Promise.allSettled([
          submittedHNPosts.length > 0 ? extractHNClaims(submittedHNPosts, query, openai) : Promise.resolve([] as HNClaim[]),
          redditPosts.length > 0 ? extractRedditClaims(redditPosts, query, openai) : Promise.resolve([]),
        ]);

        let hnClaimsRaw = hnExtracted.status === "fulfilled" ? hnExtracted.value : [];
        const redditClaimsRaw = redditExtracted.status === "fulfilled" ? redditExtracted.value : [];
        console.log(`[Community] claims: HN=${hnClaimsRaw.length} Reddit=${redditClaimsRaw.length}`);

        // Raw-comment fallback: if extraction returned 0 HN claims but posts have comments,
        // use comment texts directly. generatePerspectives will synthesize them into bullets.
        // This handles: extraction LLM too strict, off-topic comments, API issues.
        if (hnClaimsRaw.length === 0 && submittedHNPosts.length > 0) {
          const rawCommentClaims: HNClaim[] = submittedHNPosts
            .flatMap((p, pi) =>
              p.top_comments.slice(0, 3).map((c, ci): HNClaim => ({
                id: `hn_raw_${pi}_${ci}`,
                subreddit: "HN",
                post_score: p.score,
                text: c.text.slice(0, 250),
                evidence: c.text.slice(0, 200),
                source_type: "comment",
                support_count: 1,
                sentiment: "neutral",
                claim_type: "opinion",
                created_at: p.created_at,
                source_url: p.url,
                source_title: p.title,
              }))
            )
            .filter(c => c.text.length > 30)
            .slice(0, 12);
          if (rawCommentClaims.length > 0) {
            console.log(`[HN] LLM extraction returned 0 claims — raw-comment fallback: ${rawCommentClaims.length} comments`);
            hnClaimsRaw = rawCommentClaims;
          }
        }

        // Reddit claims are structurally identical to HNClaim — merge safely
        hnClaims = [...hnClaimsRaw, ...(redditClaimsRaw as unknown as HNClaim[])];

        const totalPosts = hnPostCount + redditPosts.length;
        const totalComments = hnCommentCount + redditPosts.reduce((s, p) => s + p.top_comments.length, 0);
        redditDiag = {
          queries_generated: queriesToRun.length,
          posts_retrieved: hnPostsRaw + redditPosts.length,
          posts_after_dedupe: hnPostCount + redditPosts.length,
          posts_submitted: totalPosts,
          comments_retrieved: totalComments,
          claims_extracted: hnClaims.length,
        };
        emit({
          type: "stage", source: "reddit",
          message: `Community: ${hnClaims.length} claims (${hnClaimsRaw.length} HN + ${redditClaimsRaw.length} Reddit)`,
          count: hnClaims.length,
          diagnostics: redditDiag,
        });
      } catch (err) {
        emit({ type: "stage", source: "reddit", message: `Community unavailable: ${err instanceof Error ? err.message : "error"}` });
      }

      // Stage 3: Web
      emit({ type: "stage", source: "web", message: "Searching web articles…" });
      let articles: IntelligenceArticle[] = [];
      try {
        articles = await intelligenceWebSearch(query, 8);
        emit({ type: "stage", source: "web", message: `Retrieved ${articles.length} articles`, count: articles.length });
      } catch (err) {
        emit({ type: "stage", source: "web", message: `Web search unavailable: ${err instanceof Error ? err.message : "error"}` });
      }

      // Classify intent (domain was already classified above for community fallbacks)
      const queryIntent = classifyQueryIntent(query);
      const intentThresholds = INTENT_THRESHOLDS[queryIntent];
      console.log(`[Intent] "${queryIntent}" domain="${queryDomain}" → relevanceGate=${intentThresholds.relevanceGate} qualityExclude=${intentThresholds.qualityExclude}`);

      // Normalize → add queryRelevance → reject only very weak claims (strength < 0.3)
      const addRelevance = (c: Omit<NormalizedClaim, "queryRelevance">): NormalizedClaim => ({
        ...c,
        queryRelevance: scoreClaimRelevance(c.claim, keywords),
      });
      const preFilter = [
        ...ytToNormalizedClaims(ytRows).map(addRelevance),
        ...hnToNormalizedClaims(hnClaims).map(addRelevance),
        ...webToNormalizedClaims(articles).map(addRelevance),
      ];
      const preFilterBySource = {
        youtube: preFilter.filter(c => c.source === "youtube").length,
        reddit:  preFilter.filter(c => c.source === "reddit").length,
        web:     preFilter.filter(c => c.source === "web").length,
      };
      const rawClaims: NormalizedClaim[] = preFilter.filter(c => computeClaimStrength(c) >= 0.3);

      const rawBySource = {
        youtube: rawClaims.filter(c => c.source === "youtube").length,
        reddit:  rawClaims.filter(c => c.source === "reddit").length,
        web:     rawClaims.filter(c => c.source === "web").length,
      };
      console.log(`[Normalize] pre-filter: YT=${preFilterBySource.youtube} Community=${preFilterBySource.reddit} Web=${preFilterBySource.web}`);
      console.log(`[Normalize] post-strength-filter (>=0.3): YT=${rawBySource.youtube} Community=${rawBySource.reddit} Web=${rawBySource.web}`);
      if (hnClaims.length > 0 && rawBySource.reddit === 0) {
        console.error(`[COMMUNITY LOSS] ${hnClaims.length} community claims extracted but 0 survived strength filter — check NaN in recency/engagement`);
        // Log strength sample for first 3 HN claims
        hnToNormalizedClaims(hnClaims.slice(0, 3)).forEach((c, i) => {
          const strength = computeClaimStrength(c as NormalizedClaim);
          console.error(`  claim[${i}] strength=${strength} specificity=${c.specificity} engagement=${c.engagement} recency=${c.recency}`);
        });
      }
      console.log(`[Raw] Total: ${rawClaims.length} | YT=${rawBySource.youtube} Community=${rawBySource.reddit} Web=${rawBySource.web}`);
      emit({
        type: "stage", agent: "Signal Pool",
        message: `${rawClaims.length} raw signals — Creator: ${rawBySource.youtube} | Community: ${rawBySource.reddit} | Web: ${rawBySource.web}`,
        count: rawClaims.length,
        diagnostics: rawBySource,
      });

      if (!rawClaims.length) {
        emit({ type: "error", message: "No evidence found. Analyze relevant creator content first or try a different query." });
        close();
        return;
      }

      // Relevance gate: only reject hard garbage (< intentThresholds.relevanceGate)
      // Creator claims use a lower dynamic gate — intent-based gate (up to 45 for research)
      // is too strict for YouTube content where 1-of-3 keyword match = 33.
      const oneKwPct = Math.floor(100 / Math.max(1, keywords.length));
      const creatorMainGate = Math.max(20, Math.min(intentThresholds.relevanceGate, oneKwPct));
      const relevantClaims = rawClaims.filter(c =>
        c.source === "youtube"
          ? c.queryRelevance >= creatorMainGate
          : c.queryRelevance >= intentThresholds.relevanceGate
      );
      const filteredOut = rawClaims.length - relevantClaims.length;
      const relBySource = {
        youtube: relevantClaims.filter(c => c.source === "youtube").length,
        reddit:  relevantClaims.filter(c => c.source === "reddit").length,
        web:     relevantClaims.filter(c => c.source === "web").length,
      };
      console.log(`[Relevance/${queryIntent}] ${rawClaims.length} → ${relevantClaims.length} (gate=${intentThresholds.relevanceGate}, ${filteredOut} off-topic)`);
      console.log(`[Relevance] by source: YT=${relBySource.youtube} Community=${relBySource.reddit} Web=${relBySource.web}`);
      emit({
        type: "stage", agent: "Relevance Gate",
        message: `${relevantClaims.length}/${rawClaims.length} passed — Creator: ${relBySource.youtube} | Community: ${relBySource.reddit} | Web: ${relBySource.web}`,
        count: relevantClaims.length,
        diagnostics: relBySource,
      });

      // Recovery L1: relevance gate eliminated everything but substantial raw evidence exists
      let workingClaims = relevantClaims;
      let isRecovery = false;
      if (!workingClaims.length && rawClaims.length >= 5) {
        workingClaims = [...rawClaims]
          .sort((a, b) => computeClaimStrength(b) - computeClaimStrength(a))
          .slice(0, 15);
        isRecovery = true;
        console.log(`[Recovery-L1] ${workingClaims.length} signals by strength (relevance gate bypassed)`);
        emit({ type: "stage", agent: "Recovery", message: "Evidence quality below threshold — using best-available signals for synthesis" });
      } else if (!workingClaims.length) {
        emit({ type: "error", message: "Insufficient evidence. Analyze relevant creator content first." });
        close();
        return;
      }
      // Snapshot YT claims at this stage — used in retrieval trace to pinpoint
      // where in the pipeline each creator segment was lost
      const workingYtClaims = workingClaims.filter(c => c.source === "youtube");

      // Stage 4: Source quality scoring (intent-adjusted exclusion threshold)
      const qualityScores = {
        youtube: scoreSourceQuality(workingClaims, "youtube", intentThresholds.qualityExclude),
        reddit:  scoreSourceQuality(workingClaims, "reddit",  intentThresholds.qualityExclude),
        web:     scoreSourceQuality(workingClaims, "web",     intentThresholds.qualityExclude),
      };
      let gatedClaims = workingClaims.filter(c => !qualityScores[c.source].excluded);
      const gatedSourceNames = (["youtube", "reddit", "web"] as const)
        .filter(s => !qualityScores[s].excluded)
        .map(s => SOURCE_FRIENDLY[s]);
      console.log(
        `[Quality/${queryIntent}] YT=${qualityScores.youtube.score}(${qualityScores.youtube.excluded ? "❌" : "✓"})`,
        `HN=${qualityScores.reddit.score}(${qualityScores.reddit.excluded ? "❌" : "✓"})`,
        `Web=${qualityScores.web.score}(${qualityScores.web.excluded ? "❌" : "✓"})`,
        `→ ${gatedClaims.length} accepted`,
      );
      emit({
        type: "stage", agent: "Quality Gate",
        message: gatedClaims.length > 0
          ? `Sources: ${gatedSourceNames.join(", ")} — ${gatedClaims.length} signals accepted`
          : `Quality gate: all sources below threshold — activating recovery`,
        count: gatedClaims.length,
      });

      // Recovery L2: quality gate eliminated everything — take top signals by quality × relevance
      if (!gatedClaims.length && workingClaims.length >= 5) {
        gatedClaims = [...workingClaims]
          .sort((a, b) =>
            (computeClaimStrength(b) * b.queryRelevance) -
            (computeClaimStrength(a) * a.queryRelevance),
          )
          .slice(0, 10);
        isRecovery = true;
        // Un-exclude any source that has recovery claims so claimIndex builds correctly
        const recoverySrcs = new Set(gatedClaims.map(c => c.source));
        (["youtube", "reddit", "web"] as const).forEach(s => {
          if (recoverySrcs.has(s)) qualityScores[s] = { ...qualityScores[s], excluded: false };
        });
        console.log(`[Recovery-L2] ${gatedClaims.length} signals by quality×relevance (quality gate bypassed)`);
        emit({ type: "stage", agent: "Recovery", message: `Best-effort synthesis from ${gatedClaims.length} signals — confidence will reflect evidence quality` });
      } else if (!gatedClaims.length) {
        emit({ type: "error", message: "Insufficient evidence. Analyze relevant creator content first." });
        close();
        return;
      }

      const qualityWarning = isRecovery
        ? "Evidence quality was lower than preferred. This is a best-effort synthesis — confidence reflects that."
        : null;

      const evidenceProcessing: IntelligenceMemo["evidence_processing"] = {
        retrieved: rawClaims.length,
        relevance_passed: relevantClaims.length,
        quality_accepted: gatedClaims.length,
        query_intent: queryIntent,
        query_domain: queryDomain,
        is_recovery: isRecovery,
        quality_warning: qualityWarning,
      };

      const evidenceMap = buildEvidenceMap(ytRows, hnClaims, articles);

      // Creator-specific topic gate — stricter than the general relevance gate.
      // Off-topic YT claims are tracked for coverage reporting but excluded from
      // clustering, confidence scoring, cross-source consensus, and decision drivers.
      // Scale with keyword count: with N keywords, 1 keyword match = floor(100/N).
      // This ensures short-concept queries (3+ keywords) allow 1-keyword matches through
      // while 2-keyword queries keep the 50% threshold. Floored at 25, capped at 50.
      const oneKeywordPct = Math.floor(100 / Math.max(1, keywords.length));
      const dynamicCreatorGate = Math.max(25, Math.min(CREATOR_TOPIC_GATE, oneKeywordPct));
      // Do NOT take max with intentThresholds.relevanceGate — intent filtering already ran above.
      // This gate is purely for topic contamination, not intent quality.
      const creatorTopicGate = dynamicCreatorGate;
      const ytOffTopicClaims = gatedClaims.filter(c => c.source === "youtube" && c.queryRelevance < creatorTopicGate);
      const pipelineClaims   = gatedClaims.filter(c => c.source !== "youtube" || c.queryRelevance >= creatorTopicGate);
      if (ytOffTopicClaims.length > 0) {
        const ytTotal = gatedClaims.filter(c => c.source === "youtube").length;
        const pct = Math.round((ytOffTopicClaims.length / ytTotal) * 100);
        console.log(`[CreatorGate/${queryIntent}] ${ytOffTopicClaims.length}/${ytTotal} (${pct}%) YT claims excluded as off-topic (gate=${creatorTopicGate})`);
        emit({ type: "stage", agent: "Creator Gate", message: `${ytOffTopicClaims.length} off-topic creator claim${ytOffTopicClaims.length !== 1 ? "s" : ""} excluded (${pct}% of YT pool)`, count: pipelineClaims.filter(c => c.source === "youtube").length });
      }

      // Theme-eligibility gate — YT claims below MIN_THEME_ALIGNMENT are excluded from the extractor
      // so they cannot steer theme generation. They remain in pipelineClaims for coverage tracking.
      const themeEligibleClaims = pipelineClaims.filter(c =>
        c.source !== "youtube" || computeQuestionAlignment(c.claim, keywords) >= MIN_THEME_ALIGNMENT
      );
      const ytAlignmentExcluded = pipelineClaims.filter(c =>
        c.source === "youtube" && computeQuestionAlignment(c.claim, keywords) < MIN_THEME_ALIGNMENT
      );
      if (ytAlignmentExcluded.length > 0) {
        const ytPipelineTotal = pipelineClaims.filter(c => c.source === "youtube").length;
        const pct = Math.round((ytAlignmentExcluded.length / ytPipelineTotal) * 100);
        console.log(`[AlignmentGate] ${ytAlignmentExcluded.length}/${ytPipelineTotal} (${pct}%) YT claims below MIN_THEME_ALIGNMENT=${MIN_THEME_ALIGNMENT} — excluded from theme synthesis`);
        emit({ type: "stage", agent: "Alignment Gate", message: `${ytAlignmentExcluded.length} low-alignment creator claim${ytAlignmentExcluded.length !== 1 ? "s" : ""} excluded from theme synthesis`, count: themeEligibleClaims.filter(c => c.source === "youtube").length });
      }

      // claimIndex covers all pipelineClaims — themeEligibleClaims ⊆ pipelineClaims, so all extractor IDs resolve
      const claimIndex = new Map(pipelineClaims.map(c => [c.id, c]));

      // Stage 5: Extract + cluster (domain-locked prompt) + domain safety filter
      emit({ type: "stage", agent: "Extractor", message: `Extracting and clustering ${themeEligibleClaims.length} signals [domain: ${queryDomain}]…` });
      const extractor = await runExtractor(query, queryDomain, themeEligibleClaims, evidenceMap);
      const rawClusters = buildClusters(extractor, claimIndex);
      const clusters = filterClustersByDomain(rawClusters, extractor, queryDomain);
      const offDomainRemoved = rawClusters.length - clusters.length;
      if (offDomainRemoved > 0) console.log(`[Domain] ${offDomainRemoved} off-domain cluster(s) removed`);
      emit({ type: "stage", agent: "Extractor", message: `Formed ${clusters.length} domain-scoped insight clusters${offDomainRemoved > 0 ? ` (${offDomainRemoved} off-domain removed)` : ""}` });

      // Stage 6: Score (deterministic; cap confidence in recovery mode)
      // Only hard contradictions (not tradeoffs) should penalise confidence
      const extractorHasContrad = extractor.contradictions.some(c => c.conflict_type !== "tradeoff");
      const sourceStates: Record<"youtube" | "reddit" | "web", SourceSignalState> = {
        youtube: computeSourceState("youtube", clusters, qualityScores),
        reddit:  computeSourceState("reddit",  clusters, qualityScores),
        web:     computeSourceState("web",     clusters, qualityScores),
      };
      let confidenceResult = computeFinalConfidence(clusters, qualityScores, extractorHasContrad, sourceStates);
      if (isRecovery) {
        confidenceResult = { ...confidenceResult, confidence: Math.min(0.60, confidenceResult.confidence) };
      }

      // Stage 7: Decision + Perspectives (parallel)
      emit({ type: "stage", agent: "Decision", message: "Generating decision intelligence…" });

      // Perspective evidence pool: keyword-relevant OR domain-vocabulary-matched claims.
      // workingClaims is keyword-only; for queries like "first 100 customers" that produces
      // keywords ["startups","first","customers"] — missing "distribution","outreach","sales".
      // Domain vocab fixes this: customer_acquisition includes those exact terms.
      const domainAllowed = DOMAIN_VOCABULARY[queryDomain].allowed;
      // Community claims (source: "reddit") bypass the vocab/relevance gate:
      // they were retrieved by domain-specific HN/Reddit search, so the extraction
      // LLM already filtered for topic relevance. Re-filtering here throws away
      // valid practitioner insights that use different vocabulary than the query.
      const perspectiveClaims = rawClaims.filter(c => {
        if (c.source === "reddit") return true;
        // Creator claims use the stricter topic gate — off-topic creator content
        // must not contribute to perspective generation either
        if (c.source === "youtube") return c.queryRelevance >= creatorTopicGate;
        return c.queryRelevance >= intentThresholds.relevanceGate ||
          domainAllowed.some(term => c.claim.toLowerCase().includes(term.toLowerCase()));
      });

      const sortByStrength = (cs: NormalizedClaim[]) =>
        [...cs].sort((a, b) => computeClaimStrength(b) - computeClaimStrength(a));
      const perspBySource = (src: NormalizedClaim["source"]) =>
        sortByStrength(perspectiveClaims.filter(c => c.source === src))
          .slice(0, 10)
          .map(c => ({ claim: c.claim, type: c.type }));

      const creatorRaw   = perspBySource("youtube");
      const communityRaw = perspBySource("reddit");
      const webRaw       = perspBySource("web");

      console.log(`[Perspective] raw_counts: creator=${creatorRaw.length} community=${communityRaw.length} web=${webRaw.length}`);

      const queryType = detectQueryType(query);

      const comparisonOptions = queryType === "COMPARATIVE" ? extractComparisonOptions(query) : [];

      // Run decision + perspective extraction + (optional) comparative verdict in parallel
      const [decision, perspResult, comparativeVerdict, strategyProfilesResult] = await Promise.all([
        generateDecision(query, clusters, extractor.stage_interpretation),
        generatePerspectives(query, creatorRaw, communityRaw, webRaw),
        queryType === "COMPARATIVE"
          ? generateComparativeVerdict(query, clusters, extractor.contradictions)
          : Promise.resolve(null),
        queryType === "COMPARATIVE" && comparisonOptions.length >= 2
          ? generateStrategyProfiles(query, comparisonOptions, pipelineClaims, clusters, qualityScores)
          : Promise.resolve(null),
      ]);

      // Instrument: log what was generated vs. what had evidence
      console.log(`[Perspective] generated: creator=${!!perspResult.perspectives.youtube?.bullets?.length} community=${!!perspResult.perspectives.reddit?.bullets?.length} web=${!!perspResult.perspectives.web?.bullets?.length}`);

      // Hard assertion + raw-claim fallback — guarantee perspective whenever evidence exists
      const PERSP_SRCS = ["youtube", "reddit", "web"] as const;
      for (const src of PERSP_SRCS) {
        const raw = src === "youtube" ? creatorRaw : src === "reddit" ? communityRaw : webRaw;
        if (raw.length > 0 && !perspResult.perspectives[src]?.bullets?.length) {
          console.error(`[SOURCE ATTRIBUTION FAILURE] ${src}: ${raw.length} raw signals — LLM dropped perspective. Applying raw-claim fallback.`);
          perspResult.perspectives[src] = {
            bullets: raw.slice(0, 4).map(c => c.claim),
            common_view: `Observed ${src === "youtube" ? "creator" : src === "reddit" ? "community" : "web"} themes — synthesis unavailable.`,
          };
        }
      }

      // perspRaw for compression audit in debug mode
      const perspRaw: Record<"youtube" | "reddit" | "web", string[]> = {
        youtube: creatorRaw.map(c => c.claim),
        reddit:  communityRaw.map(c => c.claim),
        web:     webRaw.map(c => c.claim),
      };

      const rawCounts = { youtube: ytRows.length, reddit: hnClaims.length, web: articles.length };
      const creatorIntelligence = buildCreatorIntelligence(ytRows, rawClaims, pipelineClaims, clusters, intentThresholds.relevanceGate, ytOffTopicClaims, corpusMatchCount, workingYtClaims, keywords, query);

      // Fire-and-forget gap logging — data becomes the creator corpus ingestion roadmap
      if (creatorIntelligence?.coverage.root_cause !== "None") {
        void logCreatorCoverageGap(
          query,
          keywords.join(" "),
          creatorIntelligence!.coverage.coverage_status,
          creatorIntelligence!.coverage.corpus_matches,
        ).catch(e => console.warn("[CoverageGap] log failed:", e));
      }

      // Fire-and-forget outcome logging — feeds Creator Health Dashboard analytics
      if (creatorIntelligence) {
        void logCreatorOutcome({
          query,
          outcome:               creatorIntelligence.creator_signal_outcome,
          corpus_matches:        creatorIntelligence.coverage.corpus_matches,
          retrieved:             creatorIntelligence.coverage.retrieved,
          accepted:              creatorIntelligence.coverage.accepted,
          high_alignment_claims: creatorIntelligence.debug.alignment.high_alignment_claims,
          themes_generated:      creatorIntelligence.themes_generated,
          alignment_percentage:  creatorIntelligence.alignment_percentage,
          primary_failure_stage: creatorIntelligence.coverage.primary_failure_stage,
        }).catch(e => console.warn("[OutcomeLog] failed:", e));
      }

      const rawMemo = assembleMemo(query, pipelineClaims, rawClaims, intentThresholds.relevanceGate, clusters, extractor, confidenceResult, decision, perspResult, rawCounts, redditDiag, qualityScores, evidenceProcessing, perspRaw, creatorIntelligence, sourceStates, queryType, comparativeVerdict, strategyProfilesResult);
      const memo = auditMemo(rawMemo);

      emit({ type: "complete", memo });

    } catch (err) {
      emit({ type: "error", message: err instanceof Error ? err.message : "Pipeline failed" });
    } finally {
      close();
    }
  })();

  return new Response(stream, {
    headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", "Connection": "keep-alive" },
  });
}
