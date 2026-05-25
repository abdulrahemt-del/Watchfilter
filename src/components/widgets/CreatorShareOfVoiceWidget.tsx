export interface CreatorVoice {
  name: string;
  share: number;   // 0–100
  count: number;   // video count
}

interface Props {
  creators: CreatorVoice[];
  loading?: boolean;
}

const BAR_COLORS = ["bg-blue-500", "bg-purple-500", "bg-emerald-500", "bg-amber-500", "bg-pink-500", "bg-cyan-500"];

export function CreatorShareOfVoiceWidget({ creators, loading }: Props) {
  return (
    <>
      <div className="flex justify-between items-center border-b border-[#c0d6df] pb-2">
        <h3 className="text-xs font-bold text-[#6b8a99] tracking-wider uppercase font-mono">
          🎙️ Creator Share of Voice
        </h3>
        <span className="text-[10px] text-[#6b4fbb] font-mono">Signal Density</span>
      </div>

      {loading && !creators.length ? (
        <div className="space-y-3 pt-2">
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="space-y-1 animate-pulse">
              <div className="h-3 w-32 bg-[#c0d6df] rounded" />
              <div className="h-1.5 w-full bg-[#f0f6f9] rounded-full" />
            </div>
          ))}
        </div>
      ) : creators.length === 0 ? (
        <p className="text-xs text-[#6b8a99] font-mono pt-4">No creator data yet.</p>
      ) : (
        <div className="space-y-3 pt-2">
          {creators.map((creator, i) => (
            <div key={i} className="space-y-1">
              <div className="flex justify-between items-center text-xs">
                <span className="font-medium text-[#6b8a99] truncate max-w-[70%]">{creator.name}</span>
                <span className="font-mono text-[11px] text-[#6b8a99] shrink-0">{creator.share}%</span>
              </div>
              <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-700 ${BAR_COLORS[i % BAR_COLORS.length]}`}
                  style={{ width: `${creator.share}%` }}
                />
              </div>
              <p className="text-[9px] text-[#6b8a99] font-mono text-right">
                {creator.count} video{creator.count !== 1 ? "s" : ""}
              </p>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
