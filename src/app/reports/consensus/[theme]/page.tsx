import Link from "next/link";
import OpenAI from "openai";
import { AudioPlayerTrigger } from "@/components/AudioPlayerTrigger";
import { RawEvidenceLog, type EvidenceItem } from "@/components/RawEvidenceLog";
import { ConsensusBriefingGrid } from "@/components/ConsensusBriefingGrid";
import { ElegantConsensusCard } from "@/components/ElegantConsensusCard";
import { listAnalyses, getAnalysesByIds } from "@/lib/db";
import {
  calcEvidenceStrength,
  hasHardData,
  STRENGTH_BADGE,
  STRENGTH_BAR_PCT,
  type EvidenceStrength,
} from "@/lib/evidence";
import type { SavedAnalysis } from "@/lib/db/schema";

export const dynamic = "force-dynamic";

// ── Types ──────────────────────────────────────────────────────────────────────

interface SupportingQuote {
  quote: string;
  source: string;
  timestamp?: string;
  ref?: string;
  analysisId?: string;
  youtubeUrl?: string;
  audioPath?: string;
}

interface InsightCluster {
  consensusStatement: string;
  whyItMatters: string;
  recommendedActions: string[];
  contrarianView: string | null;
  supportingQuotes: SupportingQuote[];
  supportingCreators: string[];
  creatorCount: number;
  videoCount: number;
  agreementPct: number;
}

interface SynthesizedReport {
  overallConsensus: string;
  clusters: InsightCluster[];
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function consensusBar(pct: number): string {
  const filled = Math.round(pct / 10);
  return "█".repeat(filled) + "░".repeat(10 - filled);
}

function clusterStrength(creatorCount: number, videoCount: number, quoteCount: number): EvidenceStrength {
  return calcEvidenceStrength(creatorCount, videoCount, quoteCount, 0);
}

function youtubeWatchUrl(videoId: string, time?: string): string {
  const base = `https://www.youtube.com/watch?v=${videoId}`;
  if (!time) return base;
  const parts = time.split(":").map(Number);
  let seconds = 0;
  if (parts.length === 2) seconds = parts[0]! * 60 + parts[1]!;
  else if (parts.length === 3) seconds = parts[0]! * 3600 + parts[1]! * 60 + parts[2]!;
  return `${base}&t=${seconds}`;
}

function wwScoreColor(score: number): string {
  if (score >= 8) return "var(--ok, #22c55e)";
  if (score >= 6) return "#84cc16";
  if (score >= 4) return "var(--warn, #f59e0b)";
  return "var(--danger, #ef4444)";
}

function wwScoreLabel(score: number): string {
  if (score >= 8) return "High";
  if (score >= 6) return "Above Average";
  if (score >= 4) return "Mixed";
  return "Low";
}

function wwBarColor(value: number, invert = false): string {
  const effective = invert ? 11 - value : value;
  if (effective >= 8) return "var(--ok, #22c55e)";
  if (effective >= 6) return "#84cc16";
  if (effective >= 4) return "var(--warn, #f59e0b)";
  return "var(--danger, #ef4444)";
}

// ── AI synthesis ───────────────────────────────────────────────────────────────

async function synthesizeReport(
  topicName: string,
  analyses: SavedAnalysis[],
): Promise<SynthesizedReport | null> {
  if (!analyses.length) return null;

  const rawEvidence: {
    ref: string; source: string; analysisId: string;
    youtubeUrl: string; audioPath: string;
    metric: string; quote: string; timestamp: string;
  }[] = [];

  for (const a of analyses) {
    for (const p of a.hard_data_points ?? []) {
      const pt = p as Record<string, unknown>;
      rawEvidence.push({
        ref: `REF:${a.id}`, source: a.channelName ?? "Unknown",
        analysisId: a.id, youtubeUrl: a.youtubeUrl ?? "", audioPath: a.audioPath ?? "",
        metric: (pt.metric_title as string) ?? "", quote: (pt.direct_quote as string) ?? "", timestamp: (pt.exact_timestamp as string) ?? "",
      });
    }
    for (const n of a.off_script_nuggets ?? []) {
      rawEvidence.push({
        ref: `REF:${a.id}`, source: a.channelName ?? "Unknown",
        analysisId: a.id, youtubeUrl: a.youtubeUrl ?? "", audioPath: a.audioPath ?? "",
        metric: "", quote: n, timestamp: "",
      });
    }
  }

  const refToAnalysisId = new Map(rawEvidence.map((e) => [e.ref, e.analysisId]));
  const refToYoutubeUrl = new Map(rawEvidence.map((e) => [e.ref, e.youtubeUrl]));
  const refToAudioPath  = new Map(rawEvidence.map((e) => [e.ref, e.audioPath]));

  const evidenceList = rawEvidence
    .map((e, i) => `[${i + 1}] ${e.ref} | Source: ${e.source}${e.metric ? ` | Metric: ${e.metric}` : ""}${e.quote ? ` | Quote: "${e.quote}"` : ""}${e.timestamp ? ` @ ${e.timestamp}` : ""}`)
    .join("\n");

  const totalCreators = new Set(analyses.map((a) => a.channelName)).size;
  const creatorList   = [...new Set(analyses.map((a) => a.channelName ?? "Unknown"))].join(", ");

  const prompt = `You are a private intelligence analyst writing a consensus intelligence report. You have ${rawEvidence.length} raw evidence items from ${analyses.length} videos by ${totalCreators} independent creators (${creatorList}) all covering: "${topicName}".

RAW EVIDENCE:
${evidenceList}

YOUR TASK:
Step 1 — Cluster by idea (2–4 clusters). Merge ruthlessly.
Step 2 — Synthesize ONE real insight per cluster (specific finding, not a label).
Step 3 — Write whyItMatters (2–3 sentences for a founder/operator/investor).
Step 4 — Write 3 specific verb-led recommendedActions.
Step 5 — List supportingCreators (exact channel names).
Step 6 — Estimate agreementPct (0–100).
Step 7 — Identify contrarianView (or null).
Step 8 — Write overallConsensus: one punchy cross-cluster sentence.

Return JSON:
{
  "overallConsensus": "string",
  "clusters": [{
    "consensusStatement": "string",
    "whyItMatters": "string",
    "recommendedActions": ["string"],
    "contrarianView": "string | null",
    "supportingQuotes": [{ "quote": "string", "source": "string", "timestamp": "string", "ref": "REF:id" }],
    "supportingCreators": ["string"],
    "creatorCount": 0,
    "videoCount": 0,
    "agreementPct": 0
  }]
}`;

  try {
    const openai = new OpenAI();
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: prompt }],
      response_format: { type: "json_object" },
      temperature: 0.3,
    });
    const parsed = JSON.parse(completion.choices[0].message.content ?? "{}") as SynthesizedReport;
    for (const cluster of parsed.clusters ?? []) {
      for (const q of cluster.supportingQuotes ?? []) {
        if (q.ref) {
          q.analysisId = refToAnalysisId.get(q.ref);
          q.youtubeUrl = refToYoutubeUrl.get(q.ref);
          q.audioPath  = refToAudioPath.get(q.ref);
        }
      }
    }
    return parsed;
  } catch {
    return null;
  }
}

// ── Page ───────────────────────────────────────────────────────────────────────

interface Props {
  params: Promise<{ theme: string }>;
}

export default async function ConsensusReportPage({ params }: Props) {
  const { theme }   = await params;
  const themeName   = decodeURIComponent(theme).replace(/-/g, " ");

  const summaries = await listAnalyses(100);
  const matched   = summaries.filter((s) => {
    const keywords = themeName.toLowerCase().split(/\s+/).filter((w) => w.length > 3);
    const subject  = (s.primarySubject ?? "").toLowerCase();
    const title    = (s.title ?? "").toLowerCase();
    return keywords.some((kw) => subject.includes(kw) || title.includes(kw));
  });

  const analyses: SavedAnalysis[] = matched.length > 0
    ? await getAnalysesByIds(matched.map((s) => s.id))
    : [];

  const creatorSet    = new Set(analyses.map((a) => a.channelName ?? "Unknown"));
  const creatorCount  = creatorSet.size;
  const videoCount    = analyses.length;
  const allPoints     = analyses.flatMap((a) => a.hard_data_points ?? []);
  const insightCount  = allPoints.length;
  const hardDataCount = allPoints.filter((p) => {
    const pt = p as Record<string, unknown>;
    return hasHardData((pt.direct_quote as string) ?? "") || hasHardData((pt.metric_title as string) ?? "");
  }).length;
  const evidenceStrength: EvidenceStrength = calcEvidenceStrength(creatorCount, videoCount, insightCount, hardDataCount);
  const report = analyses.length >= 2 ? await synthesizeReport(themeName, analyses) : null;

  type WW = { score: number; educational_value: number; uniqueness: number; practicality: number; fluff_ratio: number; time_sensitivity: number };
  const wwAnalyses = analyses.filter((a) => a.worth_watching != null);
  const avgWw: WW | null = wwAnalyses.length > 0 ? {
    score:             wwAnalyses.reduce((s, a) => s + (a.worth_watching as WW).score, 0) / wwAnalyses.length,
    educational_value: wwAnalyses.reduce((s, a) => s + (a.worth_watching as WW).educational_value, 0) / wwAnalyses.length,
    uniqueness:        wwAnalyses.reduce((s, a) => s + (a.worth_watching as WW).uniqueness, 0) / wwAnalyses.length,
    practicality:      wwAnalyses.reduce((s, a) => s + (a.worth_watching as WW).practicality, 0) / wwAnalyses.length,
    fluff_ratio:       wwAnalyses.reduce((s, a) => s + (a.worth_watching as WW).fluff_ratio, 0) / wwAnalyses.length,
    time_sensitivity:  wwAnalyses.reduce((s, a) => s + (a.worth_watching as WW).time_sensitivity, 0) / wwAnalyses.length,
  } : null;

const allQuotes  = report?.clusters.flatMap((c) => c.supportingQuotes ?? []) ?? [];
  const allActions = report?.clusters.flatMap((c) => c.recommendedActions ?? []) ?? [];

  const sans  = { fontFamily: "system-ui, sans-serif" } as const;
  const mono  = { fontFamily: "monospace" } as const;
  const serif = { fontFamily: "'Georgia', 'Times New Roman', serif" } as const;

  const WW_DIMS: { label: string; key: keyof WW; invert?: boolean }[] = [
    { label: "Educational", key: "educational_value" },
    { label: "Uniqueness",  key: "uniqueness" },
    { label: "Practical",   key: "practicality" },
    { label: "Fluff",       key: "fluff_ratio", invert: true },
    { label: "Urgency",     key: "time_sensitivity" },
  ];

  return (
    <div className="home-root" style={{ minHeight: "100vh" }}>

      {/* ── Header bar (matches briefings page shell) ── */}
      <div className="dash-deck-header">
        <div className="dash-deck-brand">
          <div className="flex items-center gap-2" style={sans}>
            <Link href="/" className="text-xs text-slate-400 hover:text-slate-200 transition-colors">← Feed</Link>
            <span className="text-slate-600">/</span>
            <span className="text-xs text-slate-300 capitalize font-semibold">{themeName}</span>
          </div>
        </div>
        <div className="flex items-center gap-3 flex-wrap" style={sans}>
          <span className={`text-[10px] font-bold px-2 py-0.5 rounded border ${STRENGTH_BADGE[evidenceStrength]}`}>
            {evidenceStrength} Evidence
          </span>
          <span className="text-xs text-slate-500">
            {creatorCount} creators · {videoCount} videos · {hardDataCount} data points
          </span>
        </div>
        <div className="dash-deck-sync">
          <span className="home-sync-dot" />
          Consensus Report
        </div>
      </div>

      {/* ── Content ── */}
      <div className="home-feed-section">

        {/* Tab label */}
        <div className="home-tabs-bar" style={{ ...sans, marginTop: "29px" }}>
          <div className="home-tabs">
            <span className="home-tab home-tab--active capitalize">
              Consensus Intelligence · {themeName}
            </span>
          </div>
          <div className="dash-tab-count">
            {videoCount} source{videoCount !== 1 ? "s" : ""} · {creatorCount} creator{creatorCount !== 1 ? "s" : ""}
          </div>
        </div>

        {/* No data */}
        {matched.length === 0 && (
          <div className="p-10 text-center space-y-3" style={sans}>
            <div className="text-3xl">🔍</div>
            <p className="text-sm font-bold text-slate-300">No analyses found for &ldquo;{themeName}&rdquo;</p>
            <p className="text-xs text-slate-500 max-w-sm mx-auto">Analyze videos on this topic to build a consensus report.</p>
            <Link href="/" className="inline-block mt-2 text-xs font-bold text-blue-400 border border-blue-500/30 bg-blue-500/10 px-4 py-1.5 rounded-lg hover:bg-blue-500/20 transition-colors">
              ← Analyze Videos
            </Link>
          </div>
        )}

        {matched.length > 0 && (
          <div className="px-6 pb-10 space-y-6">


            {/* ── 1. Executive Summary ── */}
            <div className="bg-[#141a27] border border-slate-800/60 rounded-2xl overflow-hidden">
              <div className="px-7 pt-6 pb-5 space-y-4">
                <div className="flex items-center gap-2 flex-wrap" style={sans}>
                  <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Executive Summary</span>
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded border ${STRENGTH_BADGE[evidenceStrength]}`}>
                    {evidenceStrength} Evidence
                  </span>
                </div>
                <h1 className="text-2xl font-black text-white tracking-tight capitalize" style={serif}>{themeName}</h1>
                <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-slate-500" style={sans}>
                  <span><strong className="text-slate-200">{creatorCount}</strong> creators</span>
                  <span className="text-slate-700">|</span>
                  <span><strong className="text-slate-200">{videoCount}</strong> videos</span>
                  <span className="text-slate-700">|</span>
                  <span><strong className="text-slate-200">{hardDataCount}</strong> data points</span>
                  <span className="text-slate-700">|</span>
                  <span><strong className="text-slate-200">{insightCount}</strong> insights</span>
                </div>
                <div style={sans}>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Evidence Strength</span>
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded border ${STRENGTH_BADGE[evidenceStrength]}`}>{evidenceStrength}</span>
                  </div>
                  <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
                    <div className="h-full bg-gradient-to-r from-purple-500 to-blue-500 rounded-full" style={{ width: `${STRENGTH_BAR_PCT[evidenceStrength]}%` }} />
                  </div>
                </div>
              </div>
            </div>

            {report && (
              <>
                {/* ── 2. Most Important Insight ── */}
                <section>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-2.5" style={sans}>💡 Most Important Insight</p>
                  <div className="bg-blue-950/50 border border-blue-500/20 rounded-2xl px-7 py-6">
                    <p className="text-xl font-bold text-slate-100 leading-9" style={serif}>{report.overallConsensus}</p>
                  </div>
                </section>

                {/* ── 3. Worth Watching? ── */}
                {avgWw && (
                  <section>
                    <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-2.5" style={sans}>🎯 Worth Watching?</p>
                    <div className="bg-[#141a27] border border-slate-800/60 rounded-2xl px-7 py-6 space-y-4">
                      <div className="flex items-baseline gap-2" style={sans}>
                        <span className="text-4xl font-black" style={{ color: wwScoreColor(avgWw.score) }} title="WatchFilter's own editorial read — not a YouTube metric">{wwScoreLabel(avgWw.score)}</span>
                        <span className="text-sm text-slate-500 ml-2">avg across {wwAnalyses.length} video{wwAnalyses.length !== 1 ? "s" : ""}</span>
                      </div>
                      <div className="space-y-2.5">
                        {WW_DIMS.map(({ label, key, invert }) => {
                          const val = avgWw[key] as number;
                          return (
                            <div key={label} className="flex items-center gap-3" style={sans}>
                              <span className="text-xs text-slate-500 w-20 shrink-0">{label}</span>
                              <div className="flex-1 h-1.5 bg-slate-800 rounded-full overflow-hidden">
                                <div className="h-full rounded-full" style={{ width: `${(val / 10) * 100}%`, background: wwBarColor(val, invert) }} />
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </section>
                )}

                {/* ── 4. Recommended Actions ── */}
                {allActions.length > 0 && (
                  <section>
                    <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-2.5" style={sans}>🚀 Recommended Actions</p>
                    <div className="bg-[#141a27] border border-slate-800/60 rounded-2xl overflow-hidden">
                      {allActions.map((action, i) => (
                        <div key={i} className="flex items-start gap-4 px-7 py-4 border-b border-slate-800/60 last:border-0 hover:bg-slate-800/30 transition-colors">
                          <span className="text-emerald-400 font-black shrink-0 mt-0.5" style={sans}>✓</span>
                          <p className="text-sm text-slate-300 leading-7">{action}</p>
                        </div>
                      ))}
                    </div>
                  </section>
                )}

                {/* ── 5. Consensus With Other Creators ── */}
                <section>
                  <div className="flex items-center justify-between mb-2.5">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500" style={sans}>🤝 Consensus With Other Creators</p>
                    {creatorCount < 3 && (
                      <Link href="/" className="text-[10px] text-amber-400 hover:text-amber-300 transition-colors font-medium" style={sans}>
                        ⚠️ Bring at least 3 different creators →
                      </Link>
                    )}
                  </div>
                  <div className="space-y-3">
                    {report.clusters.map((cluster, ci) => {
                      const cs = clusterStrength(cluster.creatorCount, cluster.videoCount, cluster.supportingQuotes?.length ?? 0);
                      const strength: "Low" | "Medium" | "High" =
                        cs === "Strong" || cs === "Very Strong" ? "High" :
                        cs === "Medium" ? "Medium" : "Low";

                      return (
                        <ElegantConsensusCard
                          key={ci}
                          rank={`#${ci + 1}`}
                          topic={cluster.consensusStatement}
                          evidenceStrength={strength}
                          creators={cluster.supportingCreators ?? []}
                          themeName={themeName}
                          sources={(cluster.supportingQuotes ?? []).map((q) => ({
                            title: q.quote,
                            channel: q.source,
                            timestamp: q.timestamp ?? "",
                            exactQuote: q.quote,
                            analysisId: q.analysisId,
                          }))}
                        />
                      );
                    })}
                  </div>
                </section>
              </>
            )}

            {/* ── 6. Source Briefings ── */}
            {matched.length > 0 && (
              <section>
                <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-2.5" style={sans}>📋 Source Briefings</p>
                <ConsensusBriefingGrid items={matched} />
              </section>
            )}

            {/* ── 7. Raw Evidence ── */}
            {insightCount > 0 && (
              <section>
                <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-2.5" style={sans}>📊 Raw Evidence</p>
                <RawEvidenceLog
                  items={analyses.flatMap((a) =>
                    (a.hard_data_points ?? []).map((pt, i): EvidenceItem => {
                      const p = pt as Record<string, unknown>;
                      return {
                        id: `${a.id}-${i}`,
                        metricLabel: (p.metric_title as string) ?? "(no data point)",
                        verbatimQuote: (p.direct_quote as string) ?? "",
                        sourceChannel: a.channelName ?? "Unknown",
                        timestampMark: (p.exact_timestamp as string) ?? "",
                        youtubeUrl: p.exact_timestamp ? youtubeWatchUrl(a.videoId, p.exact_timestamp as string) : undefined,
                        analysisId: a.id,
                      };
                    })
                  )}
                />
              </section>
            )}

            {/* ── 8. Supporting Quotes ── */}
            {allQuotes.length > 0 && (
              <section>
                <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-2.5" style={sans}>💬 Supporting Quotes</p>
                <div className="space-y-2.5">
                  {allQuotes.map((q, qi) => (
                    <div key={qi} className="bg-[#141a27] border border-slate-800/60 rounded-xl px-6 py-4 space-y-2">
                      <blockquote className="border-l-2 border-blue-500/40 pl-4 text-sm text-slate-300 italic leading-7">
                        &ldquo;{q.quote}&rdquo;
                      </blockquote>
                      <div className="flex items-center gap-3 pl-4 flex-wrap" style={sans}>
                        <span className="text-xs font-semibold text-slate-500">{q.source}</span>
                        {q.timestamp && (
                          <span className="text-[10px] border border-slate-700 text-slate-500 px-2 py-0.5 rounded" style={mono}>@ {q.timestamp}</span>
                        )}
                        {q.analysisId && (
                          <Link href={`/analyses/${q.analysisId}`} className="text-[10px] text-blue-400 hover:text-blue-300 transition-colors">Full report →</Link>
                        )}
                        {q.audioPath && q.analysisId && (
                          <AudioPlayerTrigger audioPath={q.audioPath} title={q.source} analysisId={q.analysisId} compact />
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            )}


            <div className="border-t border-slate-800/60 pt-4 flex items-center justify-between text-[10px] text-slate-600" style={sans}>
              <span>WatchFilter · Synthesized from real transcripts · No synthetic scores</span>
              <Link href="/" className="hover:text-slate-400 transition-colors">← Return to Feed</Link>
            </div>

          </div>
        )}
      </div>
    </div>
  );
}
