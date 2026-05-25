// Evidence-based intelligence helpers.
// Every function here derives from real data counts — no synthetic percentages.

export type EvidenceStrength = "Low" | "Medium" | "Strong" | "Very Strong";

// Detect numeric hard data in an AI-extracted insight string.
const HARD_DATA_RE = /\$[\d,.]+|\d+\s*[%x×]|\d{2,}|\d+\s*(million|billion|percent)/i;
export function hasHardData(text: string): boolean {
  return HARD_DATA_RE.test(text);
}

/**
 * Evidence strength is derived entirely from observable counts — never from
 * AI-generated confidence numbers. Thresholds are conservative by design.
 *
 * Very Strong : 4+ independent creators, 6+ videos, 3+ insights, 2+ with hard data
 * Strong      : 3+ independent creators, 4+ videos, 2+ insights
 * Medium      : 2+ independent creators, 2+ videos
 * Low         : anything below the above
 */
export function calcEvidenceStrength(
  creatorCount: number,
  videoCount: number,
  insightCount: number,
  hardDataCount: number,
): EvidenceStrength {
  if (creatorCount >= 4 && videoCount >= 6 && insightCount >= 3 && hardDataCount >= 2) return "Very Strong";
  if (creatorCount >= 3 && videoCount >= 4 && insightCount >= 2) return "Strong";
  if (creatorCount >= 2 && videoCount >= 2) return "Medium";
  return "Low";
}

/** Opportunity alert gate: requires 3 independent creators, 2+ videos, 1+ insight. */
export function meetsOpportunityThreshold(
  creatorCount: number,
  videoCount: number,
  insightCount: number,
): boolean {
  return creatorCount >= 3 && videoCount >= 2 && insightCount >= 1;
}

/** Risk alert gate: requires 2 independent creators who flagged the same concern + 2+ videos. */
export function meetsRiskThreshold(creatorCount: number, videoCount: number): boolean {
  return creatorCount >= 2 && videoCount >= 2;
}

// Tailwind colour classes per strength level — used by components.
export const STRENGTH_TEXT: Record<EvidenceStrength, string> = {
  "Low":         "text-slate-400",
  "Medium":      "text-amber-400",
  "Strong":      "text-emerald-400",
  "Very Strong": "text-violet-400",
};

export const STRENGTH_BADGE: Record<EvidenceStrength, string> = {
  "Low":         "bg-slate-500/10 border-slate-500/25 text-slate-400",
  "Medium":      "bg-amber-500/10 border-amber-500/25 text-amber-400",
  "Strong":      "bg-emerald-500/10 border-emerald-500/25 text-emerald-400",
  "Very Strong": "bg-violet-500/10 border-violet-500/25 text-violet-400",
};

// Bar fill width (0-100) keyed to strength, used for visual progress bars.
export const STRENGTH_BAR_PCT: Record<EvidenceStrength, number> = {
  "Low":         25,
  "Medium":      50,
  "Strong":      75,
  "Very Strong": 100,
};
