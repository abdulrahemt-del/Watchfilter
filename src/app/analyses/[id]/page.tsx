import Link from "next/link";
import { notFound } from "next/navigation";
import { getAnalysisById } from "@/lib/db";
import { AnalysisPageClient } from "@/components/AnalysisPageClient";
import { calcEvidenceStrength, hasHardData, STRENGTH_BADGE } from "@/lib/evidence";

export const revalidate = 0;

interface Props {
  params: Promise<{ id: string }>;
}

export default async function AnalysisPage({ params }: Props) {
  const { id } = await params;
  const analysis = await getAnalysisById(id);
  if (!analysis) notFound();

  const allPoints     = analysis.hard_data_points ?? [];
  const hardDataCount = allPoints.filter((p) => {
    const pt = p as Record<string, string>;
    return hasHardData(pt.direct_quote ?? "") || hasHardData(pt.metric_title ?? "");
  }).length;
  const evidenceStrength = calcEvidenceStrength(1, 1, allPoints.length, hardDataCount);
  const topicSlug = encodeURIComponent((analysis.primary_subject ?? "").toLowerCase().replace(/\s+/g, "-"));

  return (
    <div className="min-h-screen bg-[#f8f9fa]">

      {/* ── Breadcrumb header bar ── */}
      <div className="dash-deck-header" style={{ fontFamily: "system-ui, sans-serif" }}>
        <div className="flex items-center gap-2 text-xs">
          <Link href="/" className="text-slate-400 hover:text-slate-200 transition-colors">← Feed</Link>
          <span className="text-slate-600">/</span>
          <span className="text-blue-400 font-semibold capitalize">
            {analysis.primary_subject ?? analysis.channelName ?? "Analysis"}
          </span>
          <span className={`text-[10px] font-bold px-2 py-0.5 rounded border ml-1 ${STRENGTH_BADGE[evidenceStrength]}`}>
            {evidenceStrength}
          </span>
        </div>

        <div className="text-xs text-slate-500">
          1 creator · 1 video · {allPoints.length} data point{allPoints.length !== 1 ? "s" : ""}
        </div>

        <Link
          href={`/reports/consensus/${topicSlug}`}
          className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-emerald-400 hover:text-emerald-300 transition-colors"
        >
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 inline-block" />
          Consensus Report
        </Link>
      </div>

      <div className="max-w-6xl mx-auto px-4 py-6">
        <AnalysisPageClient analysis={analysis} />
      </div>
    </div>
  );
}
