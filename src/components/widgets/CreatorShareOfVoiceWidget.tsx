export interface CreatorVoice {
  name: string;
  share: number;
  count: number;
}

interface Props {
  creators: CreatorVoice[];
  loading?: boolean;
}

const BAR_COLORS = ["bg-[#a3cef1]", "bg-emerald-400", "bg-amber-400", "bg-pink-400", "bg-white/70", "bg-[#6096ba]"];

export function CreatorShareOfVoiceWidget({ creators, loading }: Props) {
  return (
    <>
      <div className="flex justify-between items-center border-b border-white/20 pb-2">
        <h3 className="text-xs font-bold text-white tracking-wider uppercase font-mono">
          🎙️ Creator Share of Voice
        </h3>
        <span className="text-[10px] text-[#a3cef1] font-mono font-bold">Signal Density</span>
      </div>

      {loading && !creators.length ? (
        <div className="space-y-3 pt-2">
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="space-y-1 animate-pulse">
              <div className="h-3 w-32 bg-white/20 rounded" />
              <div className="h-1.5 w-full bg-white/15 rounded-full" />
            </div>
          ))}
        </div>
      ) : creators.length === 0 ? (
        <p className="text-xs text-white/60 font-mono pt-4">No creator data yet.</p>
      ) : (
        <div className="space-y-3 pt-2">
          {creators.map((creator, i) => (
            <div key={i} className="space-y-1">
              <div className="flex justify-between items-center text-xs">
                <span className="font-medium text-white truncate max-w-[70%]">{creator.name}</span>
                <span className="font-mono text-[11px] text-white/60 shrink-0">{creator.share}%</span>
              </div>
              <div className="w-full h-1.5 bg-white/15 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-700 ${BAR_COLORS[i % BAR_COLORS.length]}`}
                  style={{ width: `${creator.share}%` }}
                />
              </div>
              <p className="text-[9px] text-white/50 font-mono text-right">
                {creator.count} video{creator.count !== 1 ? "s" : ""}
              </p>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
