"use client";

import { useState } from "react";
import Link from "next/link";

interface ProofVideo {
  title: string;
  channel: string;
  timestamp: string;
  exactQuote: string;
  analysisId?: string;
}

interface ConsensusCardProps {
  rank: string;
  topic: string;
  evidenceStrength: "Low" | "Medium" | "High";
  creators: string[];
  sources: ProofVideo[];
  themeName?: string;
}

export function ElegantConsensusCard({ rank, topic, evidenceStrength, creators, sources, themeName }: ConsensusCardProps) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="border border-slate-200 rounded-xl bg-white shadow-sm overflow-hidden transition-all duration-200">

      {/* Trigger row */}
      <div
        onClick={() => setIsOpen(!isOpen)}
        className="p-4 flex items-center justify-between cursor-pointer hover:bg-slate-50 select-none"
      >
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="text-xs font-mono text-[#6b8a99] font-bold">{rank}</span>
            <h4 className="text-sm font-bold text-slate-900 tracking-tight">{topic}</h4>
          </div>
          <p className="text-xs font-mono text-[#6b8a99]">{creators.join(", ")}</p>
        </div>

        <div className="flex items-center gap-4">
          <div className="text-right">
            <span className="text-[10px] font-mono text-[#6b8a99] uppercase block">Evidence</span>
            <span className={`text-xs font-bold font-mono ${
              evidenceStrength === "High" ? "text-emerald-600" : evidenceStrength === "Medium" ? "text-blue-600" : "text-amber-600"
            }`}>
              {evidenceStrength}
            </span>
          </div>
          <span className={`text-xs text-[#6b8a99] transition-transform duration-200 inline-block ${isOpen ? "rotate-180" : ""}`}>
            ▼
          </span>
        </div>
      </div>

      {/* Expandable drawer */}
      {isOpen && (
        <div className="bg-slate-50/80 border-t border-slate-100 p-4 space-y-3 animate-fadeIn">
          <div className="flex justify-between items-center">
            <span className="text-[10px] font-mono uppercase tracking-wider text-[#6b8a99] font-bold">
              Verified Source Citations ({sources.length})
            </span>
            {themeName && (
              <Link
                href={`/reports/consensus/${encodeURIComponent(themeName.toLowerCase().replace(/\s+/g, "-"))}`}
                className="text-[11px] font-mono text-blue-600 hover:underline"
              >
                Full Transcript Audit →
              </Link>
            )}
          </div>

          <div className="space-y-2.5">
            {sources.map((src, i) => (
              <div key={i} className="bg-white border border-slate-200 rounded-lg p-3 space-y-2 shadow-sm">
                <div className="flex justify-between items-center text-xs font-mono">
                  <span className="font-bold text-slate-700">{src.channel}</span>
                  <span className="bg-blue-50 text-blue-600 px-1.5 py-0.5 rounded font-bold">@{src.timestamp}</span>
                </div>
                <p className="text-xs font-medium text-slate-900 leading-snug">&ldquo;{src.title}&rdquo;</p>
                <p className="text-[11px] font-mono text-[#6b8a99] bg-slate-50 p-2 rounded border-l-2 border-purple-400 italic">
                  {src.exactQuote}
                </p>
                {src.analysisId && (
                  <Link
                    href={`/analyses/${src.analysisId}`}
                    className="text-[10px] font-mono text-blue-500 hover:text-blue-700 transition-colors"
                  >
                    View full report →
                  </Link>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
