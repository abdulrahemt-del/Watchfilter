import Link from "next/link";

export interface EvidenceItem {
  id: string;
  metricLabel: string;
  verbatimQuote: string;
  sourceChannel: string;
  timestampMark: string;
  youtubeUrl?: string;
  analysisId?: string;
}

interface Props {
  items: EvidenceItem[];
}

export function RawEvidenceLog({ items }: Props) {
  if (!items.length) return null;

  return (
    <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
      {items.map((item, i) => (
        <div
          key={item.id}
          className={`flex flex-col sm:flex-row sm:items-start justify-between gap-4 px-7 py-4 hover:bg-slate-50 transition-colors group ${
            i < items.length - 1 ? "border-b border-slate-100" : ""
          }`}
        >
          <div className="space-y-1.5 max-w-2xl">
            <h4 className="text-sm font-bold text-slate-800 tracking-tight group-hover:text-blue-600 transition-colors">
              {item.metricLabel}
            </h4>
            <div className="border-l-2 border-slate-200 group-hover:border-blue-400 pl-3 transition-all duration-200">
              {item.analysisId ? (
                <Link
                  href={`/analyses/${item.analysisId}`}
                  className="text-xs text-blue-500 hover:text-blue-700 font-medium transition-colors"
                >
                  View full report →
                </Link>
              ) : (
                <p className="text-xs font-mono text-[#6b8a99] leading-relaxed italic">
                  &ldquo;{item.verbatimQuote}&rdquo;
                </p>
              )}
            </div>
          </div>

          <div className="flex sm:flex-col items-center sm:items-end justify-between sm:justify-start gap-1.5 shrink-0">
            <span className="text-[11px] font-mono text-[#6b8a99] font-medium">
              {item.sourceChannel}
            </span>
            {item.timestampMark ? (
              item.youtubeUrl ? (
                <a
                  href={item.youtubeUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[10px] font-mono font-bold bg-slate-100 text-[#4f6d7a] border border-slate-200 px-2 py-0.5 rounded hover:bg-slate-200 transition-colors"
                >
                  ⏱ {item.timestampMark}
                </a>
              ) : (
                <span className="text-[10px] font-mono font-bold bg-slate-100 text-[#4f6d7a] border border-slate-200 px-2 py-0.5 rounded">
                  ⏱ {item.timestampMark}
                </span>
              )
            ) : null}
          </div>
        </div>
      ))}
    </div>
  );
}
