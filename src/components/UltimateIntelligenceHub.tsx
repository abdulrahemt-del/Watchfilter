"use client";

import { useState } from "react";
import Link from "next/link";

export interface VerifiedSource {
  videoId: string;
  channelName: string;
  videoTitle: string;
  durationText: string;
  fluffTimeSaved: string;
  analysisId?: string;
}

export interface ConsensusCluster {
  id: string;
  titleName: string;
  macroTakeaway: string;
  actionMetric: string;
  agreementRate: number;
  sourcesCount: number;
  evidenceWeight: "Low" | "Medium" | "High";
  verifiedVideoStreams: VerifiedSource[];
}

interface Props {
  clusters: ConsensusCluster[];
  defaultActiveId?: string;
}

const EVIDENCE_COLOR: Record<ConsensusCluster["evidenceWeight"], string> = {
  High:   "text-[#0a7a4a]",
  Medium: "text-[#b45309]",
  Low:    "text-[#6b8a99]",
};

export function UltimateIntelligenceHub({ clusters, defaultActiveId }: Props) {
  const [activeId, setActiveId] = useState<string>(defaultActiveId ?? clusters[0]?.id ?? "");
  const active = clusters.find(c => c.id === activeId) ?? clusters[0];

  if (!clusters.length || !active) return null;

  return (
    <div className="space-y-6">

      {/* 1. Active cluster macro banner */}
      <div className="bg-gradient-to-r from-[#f0f6f9] via-white to-[#f0f6f9] border border-[#c0d6df] rounded-xl p-5 shadow-sm">
        <div className="flex items-center gap-2 text-xs font-mono text-[#4a6fa5] font-bold uppercase tracking-wider mb-2">
          <span>⚡</span> Active System Synthesis
        </div>
        <p className="text-base font-semibold tracking-tight text-[#0f2535] leading-relaxed">
          {active.macroTakeaway}
        </p>
      </div>

      {/* 2. Cluster selector grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {clusters.map(cluster => {
          const isSelected = cluster.id === activeId;
          return (
            <div
              key={cluster.id}
              onClick={() => setActiveId(cluster.id)}
              className={`p-4 rounded-xl border cursor-pointer transition-all select-none ${
                isSelected
                  ? "bg-white border-[#4a6fa5] shadow-md ring-1 ring-[#4a6fa5]/20"
                  : "bg-white border-[#c0d6df] hover:border-[#a8bfcb] hover:bg-[#f8fafc]"
              }`}
            >
              <div className="flex justify-between items-center text-[10px] font-mono text-[#6b8a99] mb-2">
                <span>{cluster.sourcesCount} Audited Inputs</span>
                <span className={`font-bold ${EVIDENCE_COLOR[cluster.evidenceWeight]}`}>
                  {cluster.evidenceWeight} Signal
                </span>
              </div>

              <h3 className="text-sm font-black font-mono tracking-tight text-[#0f2535] mb-2">
                {cluster.titleName}
              </h3>
              <p className="text-xs text-[#6b8a99] line-clamp-2 leading-normal mb-3">
                {cluster.actionMetric}
              </p>

              <div className="w-full bg-[#dbe9ee] h-1 rounded-full overflow-hidden">
                <div
                  style={{ width: `${cluster.agreementRate}%` }}
                  className="bg-gradient-to-r from-[#4a6fa5] to-[#6b4fbb] h-full transition-all duration-500"
                />
              </div>
              <div className="text-[9px] font-mono text-[#6b8a99] mt-1 text-right">
                {cluster.agreementRate}% agreement
              </div>
            </div>
          );
        })}
      </div>

      {/* 3. Verified evidence trails */}
      <div className="border-t border-[#c0d6df] pt-5 space-y-4">
        <div className="flex justify-between items-center px-1">
          <div className="space-y-0.5">
            <h4 className="text-xs font-black font-mono text-[#0f2535] uppercase tracking-widest">
              Verified Evidence Trails: {active.titleName}
            </h4>
            <p className="text-[11px] text-[#6b8a99] font-mono">
              Verifiable source material — zero AI filler
            </p>
          </div>
          <span className="text-[10px] font-mono bg-[#f0f6f9] border border-[#c0d6df] px-2 py-0.5 rounded text-[#6b8a99]">
            {active.verifiedVideoStreams.length} verified clips
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {active.verifiedVideoStreams.map(vid => {
            const inner = (
              <div className="bg-white border border-[#c0d6df] hover:border-[#4a6fa5] rounded-xl p-4 flex flex-col justify-between h-36 transition-all group shadow-sm">
                <div className="space-y-1.5">
                  <div className="flex justify-between items-center text-[10px] font-mono text-[#6b8a99]">
                    <span className="font-bold text-[#4f6d7a] truncate max-w-[150px]">{vid.channelName}</span>
                    <span className="bg-[#f0f6f9] px-1.5 py-0.5 rounded border border-[#c0d6df] shrink-0">
                      {vid.durationText}
                    </span>
                  </div>
                  <h5 className="text-xs font-bold text-[#1a2e3b] line-clamp-2 tracking-tight leading-snug group-hover:text-[#4a6fa5] transition-colors">
                    {vid.videoTitle}
                  </h5>
                </div>

                <div className="flex items-center justify-between pt-2 border-t border-[#c0d6df] mt-auto">
                  <span className="text-[10px] font-mono font-bold bg-emerald-50 text-[#0a7a4a] border border-emerald-200 px-2 py-0.5 rounded">
                    🛡️ Saved {vid.fluffTimeSaved} fluff
                  </span>
                  <span className="text-[11px] text-[#4a6fa5] font-mono font-bold group-hover:underline">
                    Inspect →
                  </span>
                </div>
              </div>
            );

            if (vid.analysisId) {
              return (
                <Link key={vid.videoId} href={`/analyses/${vid.analysisId}`}>
                  {inner}
                </Link>
              );
            }
            return <div key={vid.videoId}>{inner}</div>;
          })}
        </div>
      </div>

    </div>
  );
}
