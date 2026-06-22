import { NextRequest } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/options";
import OpenAI from "openai";
import { getDeepResearchEvidence, type DeepResearchRow } from "@/lib/db";
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
  directional: string;
  decision_summary: string;
  reddit_gap: boolean;
  confidence_score: number;
  confidence_breakdown: {
    agreement: number;       // 0-100
    sourceCoverage: number;  // 0-100
    contradictionPenalty: number; // 0-100
    signalDensity: number;   // 0-100
  };
  consensus: {
    agreement_score: number; // 0-100
    shared_insights: string[];
    disagreements: string[];
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
    conflict_type: "direct" | "partial" | "contextual";
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
    claims: Array<{
      theme: string;
      confidence: "High" | "Medium" | "Low";
      evidence_count: number;
      evidence: Array<{
        creator: string;
        video_title: string | null;
        video_id: string | null;
        timestamp: string | null;
        quote: string;
        relevance_score: number;
      }>;
    }>;
    coverage: {
      retrieved: number;
      accepted: number;
      rejected: number;
      coverage_score: number;
      level: "High" | "Medium" | "Low";
      top_rejections: Array<{ claim: string; relevance_score: number; reason: string }>;
    };
  } | null;
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
  };
};

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
    conflict_type: "direct" | "partial" | "contextual";
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

function computeFinalConfidence(
  clusters:            ClaimCluster[],
  qualityScores:       Record<string, SourceQualityResult>,
  extractorHasContrad: boolean,
): ConfidenceResult {
  if (!clusters.length) return {
    confidence: 0,
    breakdown: { agreement: 0, sourceCoverage: 0, contradictionPenalty: 0, signalDensity: 0 },
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

  return {
    confidence: clamp(
      agreement * 0.40 + sourceCoverage * 0.25 + signalDensity * 0.15 + qualityBonus - penalty * 0.10,
      0, 1,
    ),
    breakdown: {
      agreement:            agreementPct,
      sourceCoverage:       Math.round(sourceCoverage * 100),
      contradictionPenalty: Math.round(penalty * 100),
      signalDensity:        Math.round(signalDensity * 100),
    },
  };
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
      "conflict_type": "direct" | "partial" | "contextual",
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

# ⚖️ CONTRADICTION RULES

ONLY extract contradictions when:
- Two or more claims from HIGH-quality inputs directly oppose each other
- The disagreement would materially change the decision

DO NOT extract contradictions for:
- Wording differences
- Framing differences ("hard" vs "very hard")
- Context differences (different company stages)
- Weak-source disagreements

If sources largely agree: return an empty contradictions array.

Classify:
- direct → explicit contradiction
- partial → same theme, meaningfully different conditions
- contextual → differs by stage, scale, or audience

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

  const systemPrompt = EXTRACTOR_PROMPT + domainLock;

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
  priority_actions: PriorityAction[];
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
    max_tokens: 1600,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content: `You are the Decision Intelligence Synthesizer for WatchFilter.
Transform clustered evidence into a structured decision. Work only from provided signals — do not invent facts.

RULES:
1. Never output confidence scores or numeric probabilities.
2. Do NOT name platforms (YouTube, Reddit, HN). Refer to signal content only.
3. Lead with what sources agree on. Only surface disagreements if they materially change the decision.
4. Every insight must trace to at least one provided signal. No hallucinated synthesis.
5. priority_actions: Generate 3–5 IMMEDIATELY EXECUTABLE actions.
   Each MUST have: specific verb + specific target + measurable criterion (number/frequency/binary).
   evidence_strength: "High" if 4+ signals, "Medium" if 2–3, "Low" if 1.
   GOOD: "Reach out directly to 50 target prospects this week, focusing on the problem before the product"
   GOOD: "Conduct 3 customer interviews per week to identify the single most painful problem"
   BAD: "Build relationships" | "Develop marketing campaigns" | "Create a community" | "Build value propositions"
6. directional MUST be EXACTLY one of:
   "Strong YES (conditional)" | "Lean YES" | "Neutral / Tradeoff" | "Lean NO" | "Strong NO (conditional)"

Return ONLY valid JSON:
{
  "directional": "...",
  "decision_summary": "2–3 sentences: what the evidence shows, what is genuinely disputed, what matters most.",
  "priority_actions": [
    { "action": "specific immediately executable action", "evidence_strength": "High|Medium|Low", "supporting_signals": 5 }
  ]
}`,
      },
      { role: "user", content: JSON.stringify(input) },
    ],
  });

  const VALID_DIRECTIONALS = new Set([
    "Strong YES (conditional)", "Lean YES", "Neutral / Tradeoff", "Lean NO", "Strong NO (conditional)",
  ]);

  const VALID_STRENGTHS = new Set(["High", "Medium", "Low"]);

  try {
    const p = JSON.parse(res.choices[0]?.message?.content ?? "{}") as {
      directional?: string;
      decision_summary?: string;
      priority_actions?: Array<{ action?: string; evidence_strength?: string; supporting_signals?: number }>;
    };
    return {
      directional:      VALID_DIRECTIONALS.has(p.directional ?? "") ? p.directional! : "Neutral / Tradeoff",
      decision_summary: p.decision_summary ?? "Insufficient evidence to synthesize a decision.",
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
      directional:      "Neutral / Tradeoff",
      decision_summary: "Insufficient evidence to synthesize a decision.",
      priority_actions: [],
    };
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
        content: `You are a startup intelligence analyst. SINGLE TASK: extract source-specific perspectives from evidence.

For each source with 1+ evidence items, synthesize what that source reveals about the question:
- creator_evidence → "youtube": What do experienced operators and founders believe? Recurring mental models, tactical beliefs, strategic themes.
- community_evidence → "reddit": What actually happened in practice? Real outcomes, observed patterns, what worked or failed.
- web_evidence → "web": What is generally recommended? Published playbooks, frameworks, consensus advice.

RULES (CRITICAL):
1. Synthesize ONLY from that source's own evidence. Never cross-contaminate with another source.
2. Source has 0 items → OMIT that key entirely from output.
3. Source has 1+ items → ALWAYS generate. No exceptions. Even 1 signal produces a perspective.
4. PRESERVE specific startup vocabulary: "founder-led sales", "cold outreach", "narrow ICP", "customer interviews", "referrals", "distribution", "warm intros", "outbound", "inbound", "early adopters"
5. Do NOT replace tactics with abstractions:
   "founder-led sales" stays "founder-led sales" — NOT "build trust"
   "cold outreach" stays "cold outreach" — NOT "engage your audience"
   "customer interviews" stays "customer interviews" — NOT "understand your customers"
6. Bullets must answer: what specifically did they do or believe? (Not: what value did they express?)
7. 3–5 bullets per active source. common_view: one sentence capturing the central pattern.
8. cross_source_synthesis: for each active source (1+ items), one sentence capturing its unique contribution to answering the question.

Return ONLY valid JSON:
{
  "youtube": { "bullets": ["..."], "common_view": "..." },
  "reddit":  { "bullets": ["..."], "common_view": "..." },
  "web":     { "bullets": ["..."], "common_view": "..." },
  "cross_source_synthesis": {
    "youtube": "One sentence on creators' unique contribution",
    "reddit":  "One sentence on community's unique contribution",
    "web":     "One sentence on web's unique contribution"
  }
}
Omit source keys with 0 evidence. cross_source_synthesis only includes active sources.`,
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
  // Use key_themes — these are synthesized insight bullets, never raw excerpts
  const fromKeyThemes = extractor.insight_clusters
    .flatMap(c => c.key_themes ?? [])
    .filter(t => t && t.length > 10 && !t.startsWith("#"))
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
  ytRows:       DeepResearchRow[],
  rawClaims:    NormalizedClaim[],
  gatedClaims:  NormalizedClaim[],
  clusters:     ClaimCluster[],
  relevanceGate: number,
): IntelligenceMemo["creator_intelligence"] {
  if (ytRows.length === 0) return null;

  // yt-${i} maps 1-to-1 with ytRows[i]
  const rowByClaimId = new Map<string, DeepResearchRow>(
    ytRows.map((r, i) => [`yt-${i}`, r])
  );

  const gatedYtIds = new Set(gatedClaims.filter(c => c.source === "youtube").map(c => c.id));
  const rawYtClaims = rawClaims.filter(c => c.source === "youtube");

  const retrieved    = ytRows.length;
  const accepted     = gatedYtIds.size;
  const coverageScore = retrieved > 0 ? Math.round((accepted / retrieved) * 100) : 0;
  const coverageLevel: "High" | "Medium" | "Low" =
    coverageScore >= 50 ? "High" : coverageScore >= 20 ? "Medium" : "Low";

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

  // One evidence card per cluster — only clusters that have at least one YT claim
  const claims: NonNullable<IntelligenceMemo["creator_intelligence"]>["claims"] = [];
  for (const cluster of clusters) {
    const ytInCluster = cluster.claims.filter(c => c.source === "youtube");
    if (ytInCluster.length === 0) continue;

    // Build evidence items, deduped by creator (keep best relevance per creator)
    const byCreator = new Map<string, NonNullable<IntelligenceMemo["creator_intelligence"]>["claims"][0]["evidence"][0]>();
    for (const c of ytInCluster) {
      const row = rowByClaimId.get(c.id);
      const creator = row?.channel_name ?? "Unknown Creator";
      const existing = byCreator.get(creator);
      if (!existing || c.queryRelevance > existing.relevance_score) {
        byCreator.set(creator, {
          creator,
          video_title: row?.video_title ?? null,
          video_id:    row?.video_id    ?? null,
          timestamp:   row?.timestamp_str ?? null,
          quote:       (row?.quote ?? c.claim).slice(0, 300),
          relevance_score: c.queryRelevance,
        });
      }
    }

    const evidence = [...byCreator.values()];
    const confidence: "High" | "Medium" | "Low" =
      evidence.length >= 3 ? "High" : evidence.length >= 2 ? "Medium" : "Low";

    claims.push({ theme: cluster.theme, confidence, evidence_count: evidence.length, evidence });
  }

  return {
    claims,
    coverage: { retrieved, accepted, rejected: retrieved - accepted, coverage_score: coverageScore, level: coverageLevel, top_rejections: topRejections },
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

  // Suppress contradictions when sources are largely aligned
  const hasRealContrad = agreementScore < 70 && extractor.contradictions.length > 0;
  const filteredContradictions = hasRealContrad
    ? extractor.contradictions.slice(0, 3).map(c => ({
        claim_a: c.claim_a,
        claim_b: c.claim_b,
        why_it_matters: c.explanation,
        conflict_type: c.conflict_type ?? "direct" as const,
      }))
    : [];

  // Insight density: unique themes vs total signals
  const uniqueInsights = clusters.length;
  const totalSignals   = gatedClaims.length;

  // Primary themes for evidence_used
  const primaryThemes = clusters.slice(0, 5).map(c => c.theme);

  const bestEvidence = buildBestEvidenceRanking(gatedClaims, extractor);

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
    directional: decision.directional,
    decision_summary: decision.decision_summary,
    reddit_gap: qualityScores.reddit.excluded,
    confidence_score: Math.round(confidenceResult.confidence * 100),
    confidence_breakdown: {
      agreement:            agreementScore,
      sourceCoverage:       confidenceResult.breakdown.sourceCoverage,
      contradictionPenalty: confidenceResult.breakdown.contradictionPenalty,
      signalDensity:        confidenceResult.breakdown.signalDensity,
    },
    consensus: {
      agreement_score: agreementScore,
      shared_insights: sharedInsights,
      disagreements: hasRealContrad
        ? extractor.contradictions.slice(0, 3).map(c => c.explanation)
        : [],
    },
    source_breakdown: {
      youtube: { count: rawCounts.youtube, key_signals: bySource("youtube").slice(0, 4).map(c => c.claim) },
      reddit:  { count: rawCounts.reddit,  key_signals: bySource("reddit").slice(0, 4).map(c => c.claim) },
      web:     { count: rawCounts.web,     key_signals: bySource("web").slice(0, 4).map(c => c.claim) },
    },
    contradictions: filteredContradictions,
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

      // Stage 1: YouTube
      emit({ type: "stage", source: "youtube", message: "Searching creator library…" });
      const ytRows = await getDeepResearchEvidence(keywords, 50);
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
      // For exploration: 20 — a claim matching 1 of 5 keywords passes
      const relevantClaims = rawClaims.filter(c => c.queryRelevance >= intentThresholds.relevanceGate);
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
      const claimIndex = new Map(gatedClaims.map(c => [c.id, c]));

      // Stage 5: Extract + cluster (domain-locked prompt) + domain safety filter
      emit({ type: "stage", agent: "Extractor", message: `Extracting and clustering ${gatedClaims.length} signals [domain: ${queryDomain}]…` });
      const extractor = await runExtractor(query, queryDomain, gatedClaims, evidenceMap);
      const rawClusters = buildClusters(extractor, claimIndex);
      const clusters = filterClustersByDomain(rawClusters, extractor, queryDomain);
      const offDomainRemoved = rawClusters.length - clusters.length;
      if (offDomainRemoved > 0) console.log(`[Domain] ${offDomainRemoved} off-domain cluster(s) removed`);
      emit({ type: "stage", agent: "Extractor", message: `Formed ${clusters.length} domain-scoped insight clusters${offDomainRemoved > 0 ? ` (${offDomainRemoved} off-domain removed)` : ""}` });

      // Stage 6: Score (deterministic; cap confidence in recovery mode)
      const extractorHasContrad = extractor.contradictions.length > 0;
      let confidenceResult = computeFinalConfidence(clusters, qualityScores, extractorHasContrad);
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
      const perspectiveClaims = rawClaims.filter(c =>
        c.source === "reddit" ||
        c.queryRelevance >= intentThresholds.relevanceGate ||
        domainAllowed.some(term => c.claim.toLowerCase().includes(term.toLowerCase()))
      );

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

      // Run decision + perspective extraction in parallel (separated so each call has one focused job)
      const [decision, perspResult] = await Promise.all([
        generateDecision(query, clusters, extractor.stage_interpretation),
        generatePerspectives(query, creatorRaw, communityRaw, webRaw),
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
      const creatorIntelligence = buildCreatorIntelligence(ytRows, rawClaims, gatedClaims, clusters, intentThresholds.relevanceGate);
      const memo = assembleMemo(query, gatedClaims, rawClaims, intentThresholds.relevanceGate, clusters, extractor, confidenceResult, decision, perspResult, rawCounts, redditDiag, qualityScores, evidenceProcessing, perspRaw, creatorIntelligence);

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
