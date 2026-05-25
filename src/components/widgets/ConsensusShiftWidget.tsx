export interface ShiftItem {
  topic: string;
  direction: "SURGING" | "DEFLATING" | "STABLE" | "NEW";
  change: string;
}

interface Props {
  shifts: ShiftItem[];
  loading?: boolean;
}

const DIR_STYLE: Record<ShiftItem["direction"], string> = {
  SURGING:   "bg-emerald-500/10 text-[#0a7a4a] border-emerald-500/20",
  DEFLATING: "bg-amber-500/10 text-[#b45309] border-amber-500/20",
  STABLE:    "bg-[#c0d6df] text-[#6b8a99] border-[#a8bfcb]",
  NEW:       "bg-blue-500/10 text-[#4a6fa5] border-blue-500/20",
};

export function ConsensusShiftWidget({ shifts, loading }: Props) {
  return (
    <>
      <div className="flex justify-between items-center border-b border-[#c0d6df] pb-2">
        <h3 className="text-xs font-bold text-[#6b8a99] tracking-wider uppercase font-mono">
          📈 Weekly Consensus Shifts
        </h3>
        <span className="text-[10px] text-[#6b8a99] font-mono">Macro Trends</span>
      </div>

      {loading && !shifts.length ? (
        <div className="space-y-2.5 pt-2">
          {[1, 2, 3].map(i => (
            <div key={i} className="bg-[#131924] p-3 rounded-lg border border-[#c0d6df] animate-pulse h-14" />
          ))}
        </div>
      ) : shifts.length === 0 ? (
        <p className="text-xs text-[#6b8a99] font-mono pt-4">Visit again tomorrow for shift tracking.</p>
      ) : (
        <div className="space-y-2.5 pt-2">
          {shifts.map((shift, idx) => (
            <div key={idx} className="bg-[#131924] p-3 rounded-lg border border-[#c0d6df] flex items-center justify-between">
              <div className="space-y-1 min-w-0 flex-1">
                <p className="text-xs font-bold text-[#1a2e3b] truncate">{shift.topic}</p>
                <span className="text-[10px] font-mono text-[#6b8a99]">{shift.change}</span>
              </div>
              <span className={`text-[9px] font-mono font-black px-2 py-0.5 rounded border shrink-0 ml-3 ${DIR_STYLE[shift.direction]}`}>
                {shift.direction}
              </span>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
