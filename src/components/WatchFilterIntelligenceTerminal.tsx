"use client";

import { useState } from "react";
import Link from "next/link";

export interface VideoProofSource {
  videoId: string;
  youtubeVideoId?: string;
  channelName: string;
  videoTitle: string;
  timestampMark: string;
  verbatimTranscriptQuote: string;
  fluffTimeSaved: string;
  analysisId?: string;
}

export interface ConsensusInsightNode {
  id: string;
  rankIndex: string;
  topicTitle: string;
  executiveSummary: string;
  consensusAgreementRate: number;
  evidenceStrength: "Low" | "Medium" | "High";
  contributingCreatorsCount: number;
  totalLinkedVideos: number;
  supportingCitations: VideoProofSource[];
}

interface Props {
  clusters: ConsensusInsightNode[];
  defaultActiveId?: string;
  lastUpdated?: string;
}

const EVIDENCE_COLOR: Record<ConsensusInsightNode["evidenceStrength"], string> = {
  High:   "text-emerald-400",
  Medium: "text-amber-400",
  Low:    "text-slate-500",
};

function timestampToSeconds(t: string): number {
  const parts = t.split(":").map(Number);
  if (parts.length === 3) return parts[0]! * 3600 + parts[1]! * 60 + parts[2]!;
  return (parts[0] ?? 0) * 60 + (parts[1] ?? 0);
}

export function WatchFilterIntelligenceTerminal({ clusters, defaultActiveId, lastUpdated }: Props) {
  const [selectedId, setSelectedId] = useState<string>(defaultActiveId ?? clusters[0]?.id ?? "");
  const active = clusters.find(c => c.id === selectedId) ?? clusters[0];

  if (!clusters.length || !active) return null;

  return (
    <div className="bg-[#0d1117] text-slate-100 rounded-2xl p-6 space-y-6">

      {/* Header */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between border-b border-slate-800 pb-5 gap-4">
        <div>
          <h1 className="text-xl font-black text-slate-100 tracking-tight font-mono uppercase">
            🕵️ WatchFilter Intelligence Terminal
          </h1>
          <p className="text-xs text-slate-500 font-mono mt-0.5">
            Consensus vectors synthesized from your active channel subscriptions
          </p>
        </div>

        <div className="flex items-center gap-3 bg-[#101520] border border-slate-800 px-4 py-2 rounded-xl text-xs font-mono">
          <div className="text-left">
            <span className="text-[10px] text-slate-500 uppercase block">Engine</span>
            <span className="text-emerald-400 font-bold">✓ Live</span>
          </div>
          <div className="w-px h-6 bg-slate-800" />
          <div className="text-right">
            <span className="text-[10px] text-slate-500 uppercase block">Last Updated</span>
            <span className="text-slate-400 font-bold">{lastUpdated ?? "—"}</span>
          </div>
        </div>
      </div>

      {/* Low-creator warning */}
      {active.contributingCreatorsCount < 5 && (
        <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-4 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div className="flex gap-3 items-start">
            <span className="text-base text-amber-400 pt-0.5 select-none">⚠️</span>
            <div className="space-y-0.5">
              <h5 className="text-xs font-bold text-amber-400 font-mono uppercase tracking-wider">
                Consensus Scope Restricted
              </h5>
              <p className="text-xs text-slate-400 leading-relaxed max-w-2xl">
                This theme is backed by{" "}
                <strong className="text-slate-200">{active.contributingCreatorsCount} creator channels</strong>.
                {" "}Strong consensus requires{" "}
                <strong className="text-slate-200">5+ independent sources</strong> before treating it as market signal.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Active synthesis panel */}
      <div className="bg-gradient-to-br from-[#0d1f3c] via-[#0d1520] to-[#130d2a] border border-blue-500/30 rounded-xl p-5 shadow-[0_0_24px_rgba(59,130,246,0.07)] space-y-2">
        <div className="flex items-center gap-2 text-[10px] font-mono text-blue-400 font-bold uppercase tracking-widest">
          <span>🎯</span> Active Synthesis — {active.topicTitle}
        </div>
        <h2 className="text-base font-bold tracking-tight text-slate-100 leading-relaxed">
          {active.executiveSummary}
        </h2>
      </div>

      {/* Two-column layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">

        {/* Left: cluster selector */}
        <div className="lg:col-span-1 space-y-3">
          <div className="px-1 flex justify-between items-center">
            <span className="text-[11px] font-mono text-slate-500 font-bold uppercase tracking-wider">
              Synthesized Trends
            </span>
            <span className="text-[10px] font-mono text-slate-600">Click to filter</span>
          </div>

          <div className="space-y-3">
            {clusters.map(cluster => {
              const isSelected = cluster.id === selectedId;
              return (
                <div
                  key={cluster.id}
                  onClick={() => setSelectedId(cluster.id)}
                  className={`p-4 rounded-xl border cursor-pointer transition-all select-none ${
                    isSelected
                      ? "bg-[#0d1f3c] border-blue-500/50 shadow-md ring-1 ring-blue-500/20"
                      : "bg-[#101520] border-slate-800 hover:border-slate-700 hover:bg-[#0d1520]"
                  }`}
                >
                  <div className="flex justify-between items-center text-[11px] font-mono text-slate-500 mb-1.5">
                    <span className="font-bold text-slate-400">{cluster.rankIndex}</span>
                    <span className={`font-bold ${EVIDENCE_COLOR[cluster.evidenceStrength]}`}>
                      {cluster.evidenceStrength} Signal
                    </span>
                  </div>

                  <h3 className="text-[15px] font-black font-mono tracking-tight text-slate-100 mb-1">
                    {cluster.topicTitle}
                  </h3>

                  <div className="flex items-center justify-between text-xs font-mono text-slate-500 pt-2 border-t border-slate-800 mt-3">
                    <span>{cluster.contributingCreatorsCount} creators · {cluster.totalLinkedVideos} videos</span>
                    <span className="text-blue-400 font-bold">{cluster.consensusAgreementRate}%</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Right: citation evidence trails */}
        <div className="lg:col-span-2 space-y-3">
          <div className="px-1 flex justify-between items-center">
            <span className="text-[11px] font-mono text-slate-300 font-bold uppercase tracking-wider">
              📋 Evidence Trails:{" "}
              <span className="text-blue-400">{active.topicTitle}</span>
            </span>
            <span className="text-[10px] font-mono text-slate-500">
              {active.supportingCitations.length} citations
            </span>
          </div>

          <div className="space-y-3">
            {active.supportingCitations.map((citation, index) => {
              const ytUrl = citation.youtubeVideoId
                ? `https://youtube.com/watch?v=${citation.youtubeVideoId}&t=${timestampToSeconds(citation.timestampMark)}`
                : undefined;

              const card = (
                <div className="bg-[#101520] border border-slate-800 rounded-xl p-4 space-y-3 hover:border-slate-700 transition-all group">
                  {/* Header row */}
                  <div className="flex items-start justify-between gap-4">
                    <div className="space-y-0.5 min-w-0">
                      <span className="text-[11px] font-mono text-blue-400 font-bold uppercase tracking-wider bg-blue-500/10 border border-blue-500/20 px-2 py-0.5 rounded">
                        Citation #{index + 1}
                      </span>
                      <h4 className="text-sm font-bold text-slate-200 tracking-tight leading-snug pt-1 group-hover:text-blue-300 transition-colors">
                        {citation.videoTitle}
                      </h4>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0 bg-slate-900 border border-slate-700 px-2 py-1 rounded-md">
                      <span className="text-xs font-mono text-slate-400 font-semibold">{citation.channelName}</span>
                      {ytUrl ? (
                        <a
                          href={ytUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={e => e.stopPropagation()}
                          className="text-[11px] font-mono bg-purple-500/10 text-purple-400 border border-purple-500/20 px-1.5 py-0.5 rounded font-bold hover:bg-purple-500/20 transition-colors"
                        >
                          ▶ {citation.timestampMark}
                        </a>
                      ) : (
                        <span className="text-[11px] font-mono bg-purple-500/10 text-purple-400 border border-purple-500/20 px-1.5 py-0.5 rounded font-bold">
                          {citation.timestampMark}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Verbatim quote */}
                  <div className="bg-slate-900/60 border-l-2 border-purple-500/40 rounded-r-lg p-3 group-hover:border-purple-400 transition-colors">
                    <p className="text-sm font-mono text-slate-400 group-hover:text-slate-300 leading-relaxed italic transition-colors">
                      &ldquo;{citation.verbatimTranscriptQuote}&rdquo;
                    </p>
                  </div>

                  {/* Footer row */}
                  <div className="flex items-center justify-between text-xs font-mono text-slate-500 pt-1 border-t border-slate-800">
                    <span className="text-emerald-400 font-bold bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
                      🛡️ {citation.fluffTimeSaved} fluff removed
                    </span>
                    {citation.analysisId && (
                      <Link
                        href={`/analyses/${citation.analysisId}`}
                        className="text-blue-400 font-bold uppercase tracking-wider text-[11px] hover:underline"
                        onClick={e => e.stopPropagation()}
                      >
                        Full Report ↗
                      </Link>
                    )}
                  </div>
                </div>
              );

              return <div key={citation.videoId}>{card}</div>;
            })}
          </div>
        </div>

      </div>
    </div>
  );
}
