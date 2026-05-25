"use client";

import { useState } from "react";
import { ConsensusDropdownDrawer } from "./ConsensusDropdownDrawer";
import type { EvidenceStrength } from "@/lib/evidence";

export interface ConsensusNode {
  id: string;
  rank: number;
  themeName: string;
  consensus?: string;
  confidence?: number;
  creatorCount: number;
  videoCount: number;
  evidenceStrength: EvidenceStrength;
  insightCount: number;
  hardDataCount: number;
  featuredCreators: string[];
  insights: string[];
  trendDirection?: "growing" | "stable" | "declining";
  opportunitySignal?: "High" | "Medium" | "Low";
  opportunityTopics?: string[];
  whyItMatters?: string;
  recommendedActions?: string[];
  contrarianView?: string;
  sources: {
    videoSnapId: string;
    title: string;
    channelName: string;
    duration: string;
    savedTime: string;
    thumbnail: string;
  }[];
}

interface Props {
  consensusCards: ConsensusNode[];
  onAnalyzeVideo?: (videoId: string) => void;
}

const CONSENSUS_THRESHOLD = { creators: 3, videos: 5 };

const MEDALS = ["🥇", "🥈", "🥉"];

function consensusStrengthLabel(confidence?: number): { label: string; cls: string } {
  if (!confidence) return { label: "Emerging", cls: "text-[#6b8a99] bg-slate-500/10 border-[#a8bfcb]" };
  if (confidence >= 83) return { label: "Very Strong", cls: "text-[#0a7a4a] bg-emerald-500/10 border-emerald-500/30" };
  if (confidence >= 71) return { label: "Strong",      cls: "text-[#4a6fa5] bg-blue-500/10 border-blue-500/60/40" };
  if (confidence >= 56) return { label: "Moderate",    cls: "text-[#b45309] bg-amber-500/10 border-amber-500/30" };
  return { label: "Weak", cls: "text-[#6b8a99] bg-slate-500/10 border-[#a8bfcb]" };
}

function TrendBadge({ direction }: { direction?: "growing" | "stable" | "declining" }) {
  if (!direction) return null;
  const map = {
    growing:   { icon: "↑", label: "Growing Consensus",  cls: "text-[#0a7a4a]" },
    stable:    { icon: "→", label: "Stable Consensus",   cls: "text-[#4a6fa5]" },
    declining: { icon: "↓", label: "Losing Momentum",    cls: "text-[#b45309]" },
  };
  const { icon, label, cls } = map[direction];
  return (
    <span className={`text-[10px] font-mono font-bold ${cls} flex items-center gap-1`}>
      <span>{icon}</span>
      <span>{label}</span>
    </span>
  );
}

function OpportunityBadge({ signal }: { signal?: "High" | "Medium" | "Low" }) {
  if (!signal) return null;
  const map = {
    High:   "text-[#0a7a4a] bg-emerald-500/10 border-emerald-500/30",
    Medium: "text-[#b45309] bg-amber-500/10 border-amber-500/30",
    Low:    "text-[#6b8a99] bg-slate-500/10 border-[#a8bfcb]",
  };
  return (
    <span className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded border ${map[signal]}`}>
      Opportunity: {signal}
    </span>
  );
}

function ConsensusCard({
  node,
  isExpanded,
  onToggle,
  onAnalyzeVideo,
}: {
  node: ConsensusNode;
  isExpanded: boolean;
  onToggle: () => void;
  onAnalyzeVideo?: (id: string) => void;
}) {
  const strength = consensusStrengthLabel(node.confidence);

  return (
    <div className="contents">
      <div
        onClick={onToggle}
        className={`relative rounded-2xl border cursor-pointer select-none transition-all duration-200 overflow-hidden ${
          isExpanded
            ? "bg-white border-blue-500/60 shadow-[0_4px_24px_rgba(59,130,246,0.12)] ring-1 ring-[#4a6fa5]/20"
            : "bg-white border-[#c0d6df] hover:border-[#a8bfcb] hover:bg-[#f8fafc]"
        }`}
      >
        {/* Top stripe: rank + strength badge */}
        <div className="flex items-center justify-between px-4 pt-4 pb-2">
          <span className="text-[9px] font-mono text-[#4f6d7a] font-bold">#{node.rank}</span>
          <span className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded border ${strength.cls}`}>
            {strength.label}
          </span>
        </div>

        {/* Topic Name */}
        <div className="px-4 pb-1">
          <h4 className="text-base font-black text-[#0f2535] tracking-tight uppercase font-mono leading-tight">
            {node.themeName}
          </h4>
        </div>

        {/* Supporting Evidence row */}
        <div className="px-4 py-1.5 flex items-center gap-2 border-y border-[#c0d6df] bg-[#dbe9ee]/30">
          <span className="text-[10px] font-mono text-[#6b8a99]">
            <span className="font-bold text-[#0f2535]">{node.creatorCount}</span> creators
          </span>
          <span className="text-slate-700 text-[10px]">·</span>
          <span className="text-[10px] font-mono text-[#6b8a99]">
            <span className="font-bold text-[#0f2535]">{node.videoCount}</span> videos
          </span>
          <span className="text-slate-700 text-[10px]">·</span>
          <span className="text-[10px] font-mono text-[#6b8a99]">
            <span className="font-bold text-[#0f2535]">{node.insightCount}</span> signals
          </span>
          {node.hardDataCount > 0 && (
            <>
              <span className="text-slate-700 text-[10px]">·</span>
              <span className="text-[10px] font-mono text-[#6b4fbb] font-bold">
                {node.hardDataCount} hard data
              </span>
            </>
          )}
        </div>

        {/* Consensus Summary */}
        {(node.consensus || node.insights[0]) && (
          <div className="px-4 pt-3 pb-2">
            <p className="text-xs font-mono text-[#6b8a99] italic leading-relaxed line-clamp-2">
              &ldquo;{node.consensus || node.insights[0]}&rdquo;
            </p>
          </div>
        )}

        {/* Trend + Opportunity row */}
        <div className="px-4 py-2 flex items-center justify-between">
          <TrendBadge direction={node.trendDirection} />
          <OpportunityBadge signal={node.opportunitySignal} />
        </div>

        {/* Top Contributors */}
        {node.featuredCreators.length > 0 && (
          <div className="px-4 pt-1 pb-3">
            <p className="text-[9px] font-mono font-bold uppercase tracking-widest text-[#4f6d7a] mb-2">
              Top Contributors
            </p>
            <div className="flex flex-col gap-1">
              {node.featuredCreators.slice(0, 3).map((creator, i) => (
                <div key={creator} className="flex items-center gap-2">
                  <span className="text-sm">{MEDALS[i] ?? "·"}</span>
                  <span className="text-xs font-mono font-semibold text-[#1a2e3b]">{creator}</span>
                </div>
              ))}
              {node.featuredCreators.length > 3 && (
                <p className="text-[9px] font-mono text-[#4f6d7a] pl-6">
                  +{node.featuredCreators.length - 3} more
                </p>
              )}
            </div>
          </div>
        )}

        {/* Expand chevron */}
        <div className={`absolute bottom-2.5 right-3.5 text-[10px] transition-transform duration-200 ${
          isExpanded ? "rotate-180 text-[#4a6fa5]" : "text-[#4f6d7a]"
        }`}>
          ▼
        </div>
      </div>

      {/* Full-width drawer */}
      {isExpanded && (
        <div className="col-span-1 md:col-span-2 lg:col-span-3 animate-fadeIn">
          <ConsensusDropdownDrawer
            themeName={node.themeName}
            consensus={node.consensus}
            whyItMatters={node.whyItMatters}
            insights={node.insights}
            recommendedActions={node.recommendedActions}
            contrarianView={node.contrarianView}
            opportunityTopics={node.opportunityTopics}
            featuredCreators={node.featuredCreators}
            sources={node.sources}
            onAnalyzeVideo={onAnalyzeVideo}
          />
        </div>
      )}
    </div>
  );
}

function EmergingSignalCard({
  node,
  isExpanded,
  onToggle,
  onAnalyzeVideo,
}: {
  node: ConsensusNode;
  isExpanded: boolean;
  onToggle: () => void;
  onAnalyzeVideo?: (id: string) => void;
}) {
  return (
    <div className="contents">
      <div
        onClick={onToggle}
        className={`relative rounded-2xl border cursor-pointer select-none transition-all duration-200 overflow-hidden ${
          isExpanded
            ? "bg-white border-amber-500/40 shadow-[0_4px_24px_rgba(251,191,36,0.08)] ring-1 ring-[#b45309]/20"
            : "bg-white border-[#c0d6df] hover:border-[#a8bfcb] hover:bg-[#f8fafc]"
        }`}
      >
        {/* Top stripe: rank + EMERGING badge */}
        <div className="flex items-center justify-between px-4 pt-4 pb-2">
          <span className="text-[9px] font-mono text-[#4f6d7a] font-bold">#{node.rank}</span>
          <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded border text-[#b45309] bg-amber-500/10 border-amber-500/30">
            Emerging
          </span>
        </div>

        {/* Topic Name */}
        <div className="px-4 pb-1">
          <h4 className="text-base font-black text-[#0f2535] tracking-tight uppercase font-mono leading-tight">
            {node.themeName}
          </h4>
        </div>

        {/* Supporting Evidence row */}
        <div className="px-4 py-1.5 flex items-center gap-2 border-y border-[#c0d6df] bg-[#dbe9ee]/30">
          <span className="text-xs font-mono text-[#6b8a99]">
            <span className="font-bold text-[#0f2535]">{node.creatorCount}</span> creator{node.creatorCount !== 1 ? "s" : ""}
          </span>
          <span className="text-slate-700 text-xs">·</span>
          <span className="text-xs font-mono text-[#6b8a99]">
            <span className="font-bold text-[#0f2535]">{node.videoCount}</span> video{node.videoCount !== 1 ? "s" : ""}
          </span>
          <span className="text-slate-700 text-xs">·</span>
          <span className="text-xs font-mono text-[#6b8a99]">
            <span className="font-bold text-[#0f2535]">{node.insightCount}</span> signals
          </span>
          {node.hardDataCount > 0 && (
            <>
              <span className="text-slate-700 text-xs">·</span>
              <span className="text-xs font-mono text-[#6b4fbb] font-bold">
                {node.hardDataCount} hard data
              </span>
            </>
          )}
        </div>

        {/* Quote */}
        {(node.consensus || node.insights[0]) && (
          <div className="px-4 pt-3 pb-2">
            <p className="text-sm font-mono text-[#6b8a99] italic leading-relaxed line-clamp-2">
              &ldquo;{node.consensus || node.insights[0]}&rdquo;
            </p>
          </div>
        )}

        {/* Trend + Opportunity row */}
        <div className="px-4 py-2 flex items-center justify-between">
          <TrendBadge direction={node.trendDirection} />
          <OpportunityBadge signal={node.opportunitySignal} />
        </div>

        {/* Top Contributors */}
        {node.featuredCreators.length > 0 && (
          <div className="px-4 pt-1 pb-3">
            <p className="text-[11px] font-mono font-bold uppercase tracking-widest text-[#4f6d7a] mb-2">
              Top Contributors
            </p>
            <div className="flex flex-col gap-1">
              {node.featuredCreators.slice(0, 3).map((creator, i) => (
                <div key={creator} className="flex items-center gap-2">
                  <span className="text-sm">{MEDALS[i] ?? "·"}</span>
                  <span className="text-sm font-mono font-semibold text-[#1a2e3b]">{creator}</span>
                </div>
              ))}
              {node.featuredCreators.length > 3 && (
                <p className="text-[11px] font-mono text-[#4f6d7a] pl-6">
                  +{node.featuredCreators.length - 3} more
                </p>
              )}
            </div>
          </div>
        )}

        {/* Expand chevron */}
        <div className={`absolute bottom-2.5 right-3.5 text-[10px] transition-transform duration-200 ${
          isExpanded ? "rotate-180 text-[#b45309]" : "text-[#4f6d7a]"
        }`}>
          ▼
        </div>
      </div>

      {/* Full-width drawer */}
      {isExpanded && (
        <div className="col-span-1 md:col-span-2 lg:col-span-3 animate-fadeIn">
          <ConsensusDropdownDrawer
            themeName={node.themeName}
            consensus={node.consensus}
            whyItMatters={node.whyItMatters}
            insights={node.insights}
            recommendedActions={node.recommendedActions}
            contrarianView={node.contrarianView}
            opportunityTopics={node.opportunityTopics}
            featuredCreators={node.featuredCreators}
            sources={node.sources}
            onAnalyzeVideo={onAnalyzeVideo}
          />
        </div>
      )}
    </div>
  );
}

export function CreatorConsensusEngine({ consensusCards, onAnalyzeVideo }: Props) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  if (!consensusCards.length) return null;

  const confirmed = consensusCards.filter(
    (n) => n.creatorCount >= CONSENSUS_THRESHOLD.creators && n.videoCount >= CONSENSUS_THRESHOLD.videos,
  );
  const emerging = consensusCards.filter(
    (n) => n.creatorCount < CONSENSUS_THRESHOLD.creators || n.videoCount < CONSENSUS_THRESHOLD.videos,
  );

  const toggle = (id: string) => setExpandedId((prev) => (prev === id ? null : id));

  return (
    <div className="space-y-4 pt-6">

      {/* Section headers */}
      <div className="flex items-baseline justify-between px-1">
        <div className="flex items-baseline gap-3">
          {emerging.length > 0 && (
            <>
              <h3 className="text-xs font-black text-[#b45309] uppercase tracking-widest font-mono">
                Emerging Signals
              </h3>
              <span className="text-[10px] font-mono text-[#6b8a99]">
                Needs 3+ creators to qualify
              </span>
            </>
          )}
        </div>
        <div className="flex items-baseline gap-3">
          <h3 className="text-xs font-black text-[#0f2535] uppercase tracking-widest font-mono">
            Creator Consensus
          </h3>
          {confirmed.length > 0 && (
            <span className="text-[10px] font-mono text-[#6b8a99]">
              {confirmed.length} topic{confirmed.length !== 1 ? "s" : ""} with 3+ creators
            </span>
          )}
        </div>
      </div>

      {/* Unified grid — confirmed fill first, emerging flow into remaining slots */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {confirmed.map((node) => (
          <ConsensusCard
            key={node.id}
            node={node}
            isExpanded={expandedId === node.id}
            onToggle={() => toggle(node.id)}
            onAnalyzeVideo={onAnalyzeVideo}
          />
        ))}
        {emerging.map((node) => (
          <EmergingSignalCard
            key={node.id}
            node={node}
            isExpanded={expandedId === node.id}
            onToggle={() => toggle(node.id)}
            onAnalyzeVideo={onAnalyzeVideo}
          />
        ))}
      </div>
    </div>
  );
}
