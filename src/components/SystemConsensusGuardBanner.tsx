"use client";

import { useRouter } from "next/navigation";

interface Props {
  currentSourceCount: number;
  requiredSourceCount: number;
  topicTag: string;
}

export function SystemConsensusGuardBanner({ currentSourceCount, requiredSourceCount, topicTag }: Props) {
  const router = useRouter();

  return (
    <div className="bg-[#1c1612] border border-amber-500/20 rounded-xl p-4 flex flex-col md:flex-row items-start md:items-center justify-between gap-4 shadow-sm">

      {/* Alert text */}
      <div className="flex gap-3 items-start">
        <span className="text-lg text-amber-500 shrink-0 select-none">⚠️</span>
        <div className="space-y-0.5">
          <h5 className="text-xs font-bold text-[#b45309] font-mono uppercase tracking-wider">
            Consensus Engine Constraints Active
          </h5>
          <p className="text-xs text-[#6b8a99] leading-relaxed max-w-2xl">
            This tracking view has isolated data parameters from{" "}
            <strong className="text-[#1a2e3b]">{currentSourceCount} creator channel</strong>. True market consensus
            compilation metrics require cross-examination validation from{" "}
            <strong className="text-[#1a2e3b]">{requiredSourceCount}+ independent channels</strong>.
          </p>
        </div>
      </div>

      {/* Action */}
      <div className="flex items-center gap-2 w-full md:w-auto shrink-0">
        <button
          onClick={() => router.push(`/?q=${encodeURIComponent(topicTag)}`)}
          className="w-full md:w-auto text-[11px] font-mono font-bold bg-amber-500/10 hover:bg-amber-500/20 text-[#b45309] border border-amber-500/30 px-3 py-2 rounded-lg transition-all"
        >
          🔍 Discover Co-Sourced Channels
        </button>
      </div>

    </div>
  );
}
