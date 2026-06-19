import { NextRequest } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/options";
import OpenAI from "openai";
import { getDeepResearchEvidence, type DeepResearchRow } from "@/lib/db";
import { searchHN, extractHNClaims, type HNClaim } from "@/lib/hnSkill";
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
    const age = c.created_at
      ? clamp(1 - (Date.now() / 1000 - Number(c.created_at)) / (365 * 86400), 0, 1)
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
  source_perspectives: Partial<Record<"youtube" | "reddit" | "web", { bullets: string[]; common_view: string }>>;
  cross_source_synthesis: Partial<Record<"youtube" | "reddit" | "web", string>>;
};

async function generateDecision(
  query: string,
  clusters: ClaimCluster[],
  stageInterpretation: ExtractorOutput["stage_interpretation"],
  workingClaims: NormalizedClaim[],
): Promise<DecisionResult> {
  // Quality-gated claims (from clusters) → used for decision/actions
  const allFlat = clusters.flatMap(c => c.claims);
  const topBySource = (src: NormalizedClaim["source"]) =>
    allFlat
      .filter(c => c.source === src)
      .sort((a, b) => computeClaimStrength(b) - computeClaimStrength(a))
      .slice(0, 8)
      .map(c => ({ claim: c.claim, type: c.type }));

  // Perspective pool (passed in as workingClaims param): keyword-relevant OR domain-vocab matched.
  // Sort by strength only — queryRelevance is low for domain-vocab matches even when semantically
  // relevant (e.g. "distribution" or "outreach" don't keyword-match "first 100 customers")
  const perspBySource = (src: NormalizedClaim["source"]) =>
    workingClaims
      .filter(c => c.source === src)
      .sort((a, b) => computeClaimStrength(b) - computeClaimStrength(a))
      .slice(0, 10)
      .map(c => ({ claim: c.claim, type: c.type }));

  const input = {
    question: query,
    creator_signals:   topBySource("youtube"),
    community_signals: topBySource("reddit"),
    web_signals:       topBySource("web"),
    creator_raw:       perspBySource("youtube"),
    community_raw:     perspBySource("reddit"),
    web_raw:           perspBySource("web"),
    precomputed: { agreement_score: null, confidence: null },
    stage_observations: stageInterpretation,
  };

  const res = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    temperature: 0.3,
    max_tokens: 2800,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content: `You are the Decision Intelligence Synthesizer for WatchFilter.

Transform clustered evidence (Creator, Community, Web) into a structured decision intelligence report.
You do NOT browse, search, or invent facts. Work only from provided signals.

# HARD RULES

1. Never output confidence scores, agreement percentages, rankings, or numeric probabilities — computed externally.

2. Source agnosticism: do NOT name specific platforms (YouTube, Reddit, HN, Twitter) in your output. Refer only to signal content, not signal origin.

3. Consensus first: lead with what high-quality sources agree on. Only surface disagreements if they materially change the decision — do not manufacture conflict from framing differences.

4. Source fidelity: every insight must trace to at least one provided signal. No hallucinated synthesis.

5. Priority actions: generate 3–5 actions. Each action MUST be:
   - Immediately executable — specific verb + specific target (e.g. "reach out to 50 prospects this week", not "build relationships")
   - Grounded in evidence — derives from a specific signal, not general startup wisdom
   - Measurable — contains a number, frequency, or clear done/not-done criterion

   evidence_strength: "High" if 4+ signals support it, "Medium" if 2–3 signals, "Low" if 1 signal
   supporting_signals: count of distinct evidence signals backing this action

   GOOD action: "Reach out directly to 50 target prospects this week, focusing on the problem before the product"
   GOOD action: "Conduct 3 customer interviews per week to identify the single most painful problem"
   BAD action: "Develop clearly defined marketing campaigns"
   BAD action: "Create a community"
   BAD action: "Build a value proposition"

6. source_perspectives: Use the *_raw arrays (creator_raw, community_raw, web_raw) — NOT the main *_signals arrays.
   *_raw = signals that keyword-match the query OR match the domain topic vocabulary (e.g. "distribution", "outreach",
   "sales" for a customer-acquisition query). These catch semantically relevant content missed by keyword scoring.
   Minimum to generate a perspective: 2 entries in the *_raw array. If fewer than 2, OMIT that source key entirely.
   - creator_raw → youtube perspective: "What do experienced operators believe?" → mental models, tactical principles, recurring beliefs.
   - community_raw → reddit perspective: "What actually happened in practice?" → observed outcomes, tactics used, what worked or failed.
   - web_raw → web perspective: "What is generally recommended?" → published playbooks, research-backed strategies.
   Synthesize 3–5 bullets per source from patterns in the raw signals. Do NOT copy raw text verbatim.
   common_view: one sentence capturing that source's central conclusion.
   Even if signals are weak: extract the recurring theme. A useful imperfect synthesis beats an empty box.

7. cross_source_synthesis: One sentence per active source (one with 2+ raw signals) capturing their unique contribution.
   Enable direct comparison across perspectives. Omit sources with fewer than 2 raw signals.

8. Directional must be EXACTLY one of:
   "Strong YES (conditional)" | "Lean YES" | "Neutral / Tradeoff" | "Lean NO" | "Strong NO (conditional)"

# STYLE
- Precise, not conversational
- Preserve genuine uncertainty — do NOT smooth ambiguity
- Only name contradictions that materially change the decision
- Avoid motivational language and "best practice" framing

# OUTPUT

Return ONLY valid JSON:
{
  "directional": "one of the five allowed labels",
  "decision_summary": "2–3 sentences: what the evidence shows, what is genuinely disputed, what matters most for this decision.",
  "priority_actions": [
    { "action": "specific immediately executable action", "evidence_strength": "High|Medium|Low", "supporting_signals": 5 },
    { "action": "...", "evidence_strength": "...", "supporting_signals": 3 }
  ],
  "source_perspectives": {
    "youtube": { "bullets": ["3–5 synthesized operator beliefs"], "common_view": "One sentence" },
    "reddit":  { "bullets": ["3–5 practitioner observations"], "common_view": "One sentence" },
    "web":     { "bullets": ["3–5 synthesized recommendations"], "common_view": "One sentence" }
  },
  "cross_source_synthesis": {
    "youtube": "One sentence: what operators uniquely contribute to answering this question",
    "reddit":  "One sentence: what community experiences uniquely contribute",
    "web":     "One sentence: what established guidance uniquely contributes"
  }
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
      source_perspectives?: Record<string, { bullets?: unknown[]; common_view?: string }>;
      cross_source_synthesis?: Record<string, unknown>;
    };

    const VALID_SRCS = new Set(["youtube", "reddit", "web"]);

    const parsedPerspectives: DecisionResult["source_perspectives"] = {};
    if (p.source_perspectives && typeof p.source_perspectives === "object") {
      for (const [src, val] of Object.entries(p.source_perspectives)) {
        if (VALID_SRCS.has(src) && val && Array.isArray(val.bullets)) {
          parsedPerspectives[src as "youtube" | "reddit" | "web"] = {
            bullets: val.bullets.filter((b): b is string => typeof b === "string" && b.length > 5).slice(0, 6),
            common_view: typeof val.common_view === "string" ? val.common_view : "",
          };
        }
      }
    }

    const parsedSynthesis: DecisionResult["cross_source_synthesis"] = {};
    if (p.cross_source_synthesis && typeof p.cross_source_synthesis === "object") {
      for (const [src, val] of Object.entries(p.cross_source_synthesis)) {
        if (VALID_SRCS.has(src) && typeof val === "string" && val.length > 5) {
          parsedSynthesis[src as "youtube" | "reddit" | "web"] = val;
        }
      }
    }

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
      source_perspectives:    parsedPerspectives,
      cross_source_synthesis: parsedSynthesis,
    };
  } catch {
    return {
      directional:      "Neutral / Tradeoff",
      decision_summary: "Insufficient evidence to synthesize a decision.",
      priority_actions: [],
      source_perspectives:    {},
      cross_source_synthesis: {},
    };
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
  rawCounts:          { youtube: number; reddit: number; web: number },
  redditDiag:         IntelligenceMemo["reddit_diagnostics"],
  qualityScores:      Record<"youtube" | "reddit" | "web", SourceQualityResult>,
  evidenceProcessing: IntelligenceMemo["evidence_processing"],
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
    // source_perspective: not gated by quality exclusion — perspectives are synthesized from
    // the pre-quality-gate working pool so sources with 2+ relevant signals always contribute
    source_perspective: {
      youtube: !(decision.source_perspectives.youtube?.bullets?.length)
        ? null
        : {
            bullets:     decision.source_perspectives.youtube.bullets,
            common_view: decision.source_perspectives.youtube.common_view,
            confidence:  qualityScores.youtube.score >= 70 ? "High" : qualityScores.youtube.score >= 50 ? "Medium" : "Low",
            weak_signal: qualityScores.youtube.excluded,
          },
      reddit: !(decision.source_perspectives.reddit?.bullets?.length)
        ? null
        : {
            bullets:     decision.source_perspectives.reddit.bullets,
            common_view: decision.source_perspectives.reddit.common_view,
            confidence:  qualityScores.reddit.score >= 70 ? "High" : qualityScores.reddit.score >= 50 ? "Medium" : "Low",
            weak_signal: qualityScores.reddit.excluded,
          },
      web: !(decision.source_perspectives.web?.bullets?.length)
        ? null
        : {
            bullets:     decision.source_perspectives.web.bullets,
            common_view: decision.source_perspectives.web.common_view,
            confidence:  qualityScores.web.score >= 70 ? "High" : qualityScores.web.score >= 50 ? "Medium" : "Low",
            weak_signal: qualityScores.web.excluded,
          },
    },
    cross_source_synthesis: {
      youtube: qualityScores.youtube.excluded ? null : (decision.cross_source_synthesis.youtube ?? null),
      reddit:  qualityScores.reddit.excluded  ? null : (decision.cross_source_synthesis.reddit  ?? null),
      web:     qualityScores.web.excluded     ? null : (decision.cross_source_synthesis.web     ?? null),
    },
  };
}

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

const HN_EXPANSION_PROMPT = `You are a Hacker News retrieval optimization engine for WatchFilter.

Transform the user question into high-signal Hacker News search queries that maximize retrieval of founder experiences, startup lessons, and operator insights.

Hacker News users are technical founders, operators, and engineers. Generate queries that match how they write Ask HN threads and comments.

Rules:
1. Generate 10–15 queries.
2. Rewrite into founder language: "first customers", "first users", "traction", "paying customers", "growth", "customer acquisition"
3. Include synonyms: customers ↔ users ↔ clients ↔ signups, acquisition ↔ growth ↔ traction
4. Prefer question-style and experiential framing: "how did you", "what worked", "lessons from", "experience with"
5. Include tactical terms: cold email, outbound, content marketing, SEO, founder-led sales, referrals, communities
6. Avoid generic queries. BAD: "startup customers". GOOD: "how did you get your first paying customers"
7. Optimize for: Ask HN threads, YC founder discussions, technical founder experiences, Show HN posts

Return ONLY valid JSON:
{ "queries": [{ "query": "...", "intent": "customer_acquisition", "priority": "high" | "medium" }] }`;

async function expandHNQueries(query: string): Promise<string[]> {
  try {
    const res = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.4,
      max_tokens: 800,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: HN_EXPANSION_PROMPT },
        {
          role: "user",
          content: (() => {
            const hints = detectDomainSynonyms(query);
            return hints.length > 0
              ? `Question:\n${query}\n\nDomain synonyms to include in queries: ${hints.join(", ")}`
              : `Question:\n${query}`;
          })(),
        },
      ],
    });

    type ExpandedQuery = { query?: string; priority?: string };
    const parsed = JSON.parse(res.choices[0]?.message?.content ?? "{}") as { queries?: ExpandedQuery[] };
    const queries = Array.isArray(parsed.queries) ? parsed.queries : [];
    const high   = queries.filter(q => q.priority === "high"   && q.query).slice(0, 3).map(q => q.query!);
    const medium = queries.filter(q => q.priority !== "high"   && q.query).slice(0, 1).map(q => q.query!);
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

      // Stage 2: HN (query expansion + retrieval)
      emit({ type: "stage", source: "reddit", message: "Expanding query for HN retrieval…" });
      let hnClaims: HNClaim[] = [];
      let redditDiag: IntelligenceMemo["reddit_diagnostics"] = null;
      try {
        const expandedQueries = await expandHNQueries(query);
        const queriesToRun = [query, ...expandedQueries].slice(0, 4);
        console.log("[HN] expanded queries:", JSON.stringify({ original: query, expanded: expandedQueries }));
        emit({ type: "stage", source: "reddit", message: `Running ${queriesToRun.length} HN queries…` });

        const postSets = await Promise.allSettled(
          queriesToRun.map(q => searchHN(q, { limit: 10, fetchComments: true, commentLimit: 8, commentedPostsLimit: 5 }))
        );

        postSets.forEach((r, i) => {
          if (r.status === "fulfilled") {
            const posts = r.value;
            const totalComments = posts.reduce((s, p) => s + p.top_comments.length, 0);
            console.log(`[HN] query[${i}] "${queriesToRun[i]}": ${posts.length} posts | ${totalComments} comments`);
          } else {
            console.warn(`[HN] query[${i}] "${queriesToRun[i]}" FAILED:`, r.reason);
          }
        });

        const postsRetrieved = postSets.flatMap(r => r.status === "fulfilled" ? r.value : []);
        const seen = new Set<string>();
        const dedupedPosts = postsRetrieved
          .filter(p => { if (seen.has(p.id)) return false; seen.add(p.id); return true; })
          .sort((a, b) => b.score - a.score);
        const submittedPosts = dedupedPosts.slice(0, 20);
        const commentsRetrieved = submittedPosts.reduce((s, p) => s + p.top_comments.length, 0);
        console.log(`[HN] dedup: ${postsRetrieved.length} → ${dedupedPosts.length} | submitting: ${submittedPosts.length} | comments: ${commentsRetrieved}`);

        emit({ type: "stage", source: "reddit", message: `Found ${submittedPosts.length} HN threads (${commentsRetrieved} comments) — extracting claims…` });
        hnClaims = await extractHNClaims(submittedPosts, query, openai);
        console.log(`[HN] claims extracted: ${hnClaims.length}`);

        redditDiag = {
          queries_generated: queriesToRun.length,
          posts_retrieved: postsRetrieved.length,
          posts_after_dedupe: dedupedPosts.length,
          posts_submitted: submittedPosts.length,
          comments_retrieved: commentsRetrieved,
          claims_extracted: hnClaims.length,
        };
        emit({
          type: "stage", source: "reddit",
          message: `Extracted ${hnClaims.length} HN claims (${submittedPosts.length} threads, ${commentsRetrieved} comments)`,
          count: hnClaims.length,
          diagnostics: redditDiag,
        });
      } catch (err) {
        emit({ type: "stage", source: "reddit", message: `HN unavailable: ${err instanceof Error ? err.message : "error"}` });
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

      // Classify intent + domain (domain determines what counts as relevant content)
      const queryIntent = classifyQueryIntent(query);
      const queryDomain = classifyQueryDomain(query);
      const intentThresholds = INTENT_THRESHOLDS[queryIntent];
      console.log(`[Intent] "${queryIntent}" domain="${queryDomain}" → relevanceGate=${intentThresholds.relevanceGate} qualityExclude=${intentThresholds.qualityExclude}`);

      // Normalize → add queryRelevance → reject only very weak claims (strength < 0.3)
      const addRelevance = (c: Omit<NormalizedClaim, "queryRelevance">): NormalizedClaim => ({
        ...c,
        queryRelevance: scoreClaimRelevance(c.claim, keywords),
      });
      const rawClaims: NormalizedClaim[] = [
        ...ytToNormalizedClaims(ytRows).map(addRelevance),
        ...hnToNormalizedClaims(hnClaims).map(addRelevance),
        ...webToNormalizedClaims(articles).map(addRelevance),
      ].filter(c => computeClaimStrength(c) >= 0.3);

      if (!rawClaims.length) {
        emit({ type: "error", message: "No evidence found. Analyze relevant creator content first or try a different query." });
        close();
        return;
      }

      // Relevance gate: only reject hard garbage (< intentThresholds.relevanceGate)
      // For exploration: 20 — a claim matching 1 of 5 keywords passes
      const relevantClaims = rawClaims.filter(c => c.queryRelevance >= intentThresholds.relevanceGate);
      const filteredOut = rawClaims.length - relevantClaims.length;
      console.log(`[Relevance/${queryIntent}] ${rawClaims.length} → ${relevantClaims.length} (gate=${intentThresholds.relevanceGate}, ${filteredOut} off-topic)`);
      emit({
        type: "stage", agent: "Relevance Gate",
        message: `${relevantClaims.length}/${rawClaims.length} signals passed relevance gate (${filteredOut} off-topic)`,
        count: relevantClaims.length,
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

      // Stage 7: Decision
      emit({ type: "stage", agent: "Decision", message: "Generating decision intelligence…" });

      // Perspective evidence pool: keyword-relevant OR domain-vocabulary-matched claims.
      // workingClaims is keyword-only; for queries like "first 100 customers" that produces
      // keywords ["startups","first","customers"] — missing "distribution","outreach","sales".
      // Domain vocab fixes this: customer_acquisition includes those exact terms.
      const domainAllowed = DOMAIN_VOCABULARY[queryDomain].allowed;
      const perspectiveClaims = rawClaims.filter(c =>
        c.queryRelevance >= intentThresholds.relevanceGate ||
        domainAllowed.some(term => c.claim.toLowerCase().includes(term.toLowerCase()))
      );

      const decision = await generateDecision(query, clusters, extractor.stage_interpretation, perspectiveClaims);

      const rawCounts = { youtube: ytRows.length, reddit: hnClaims.length, web: articles.length };
      const memo = assembleMemo(query, gatedClaims, rawClaims, intentThresholds.relevanceGate, clusters, extractor, confidenceResult, decision, rawCounts, redditDiag, qualityScores, evidenceProcessing);

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
