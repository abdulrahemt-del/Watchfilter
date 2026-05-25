interface Props {
  title: string;
  channel: string;
  duration: string;
  savedTime: string;
  analysisId?: string;
}

export function DocumentedSourceCard({ title, channel, duration, savedTime, analysisId }: Props) {
  const content = (
    <div className="bg-white border border-slate-200 hover:border-blue-400 rounded-xl p-3 flex flex-col justify-between min-w-[260px] max-w-[260px] h-32 transition-all group shadow-sm">
      <div className="space-y-1">
        <div className="flex justify-between items-center text-[10px] font-mono text-[#6b8a99]">
          <span className="truncate max-w-[140px] font-bold text-[#6b8a99]">{channel}</span>
          <span>{duration}</span>
        </div>
        <h5 className="text-xs font-bold text-slate-800 line-clamp-2 leading-snug tracking-tight group-hover:text-blue-600 transition-colors">
          {title}
        </h5>
      </div>

      <div className="flex items-center justify-between pt-2 border-t border-slate-100 mt-auto">
        <span className="text-[10px] font-mono font-black text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded">
          -{savedTime} Fluff
        </span>
        <span className="text-[11px] text-[#6b8a99] group-hover:text-blue-500 transition-colors font-bold font-mono">
          Inspect →
        </span>
      </div>
    </div>
  );

  if (analysisId) {
    return <a href={`/analyses/${analysisId}`}>{content}</a>;
  }
  return content;
}
