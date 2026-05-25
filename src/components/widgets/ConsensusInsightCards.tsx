export interface InsightCard {
  topic: string;
  consensus: string | null;
  confidence: number | null;
  creators: number;
  videoCount: number;
  channelNames: string[];
  deltaPercent: number | null;
  isNew: boolean;
}

interface Props {
  cards: InsightCard[];
  loading?: boolean;
}

function Card({ card }: { card: InsightCard }) {
  const surge = card.deltaPercent !== null && card.deltaPercent > 0;
  const drop  = card.deltaPercent !== null && card.deltaPercent < 0;
  const confColor =
    card.confidence === null   ? "text-[#6b8a99]"
    : card.confidence >= 80   ? "text-[#0a7a4a]"
    : card.confidence >= 60   ? "text-[#b45309]"
    : "text-[#6b8a99]";

  return (
    <div className="bg-[#101520] border border-slate-700/60 rounded-xl p-4 space-y-3 hover:border-slate-600/80 transition-colors">

      {/* Topic + delta badge */}
      <div className="flex items-start justify-between gap-3">
        <h3 className="text-sm font-black text-white leading-tight">{card.topic}</h3>
        <span className="shrink-0 mt-0.5">
          {card.isNew ? (
            <span className="text-[9px] font-mono font-black px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-400 border border-blue-500/20">
              NEW
            </span>
          ) : surge ? (
            <span className="text-[10px] font-mono font-black text-emerald-400">
              +{card.deltaPercent}% ↑
            </span>
          ) : drop ? (
            <span className="text-[10px] font-mono font-black text-red-400">
              {card.deltaPercent}% ↓
            </span>
          ) : null}
        </span>
      </div>

      {/* Consensus statement — the insight */}
      {card.consensus ? (
        <p className="text-xs text-slate-300 leading-relaxed pl-3 border-l-2 border-blue-500/50">
          {card.consensus}
        </p>
      ) : (
        <p className="text-[10px] text-slate-500 italic pl-3 border-l-2 border-slate-700 font-mono">
          Synthesizing consensus…
        </p>
      )}

      {/* Evidence row */}
      <div className="flex items-center gap-3 flex-wrap text-[10px] font-mono">
        {card.confidence !== null && (
          <span className={`font-bold ${confColor}`}>{card.confidence}% agreement</span>
        )}
        <span className="text-slate-500">{card.creators} creator{card.creators !== 1 ? "s" : ""}</span>
        <span className="text-slate-500">{card.videoCount} video{card.videoCount !== 1 ? "s" : ""}</span>
      </div>

      {/* Channel pills */}
      {card.channelNames.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {card.channelNames.map((ch, i) => (
            <span key={i} className="text-[9px] font-mono bg-slate-800 text-slate-400 px-2 py-0.5 rounded border border-slate-700">
              {ch}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

export function ConsensusInsightCards({ cards, loading }: Props) {
  if (loading && !cards.length) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {[1, 2, 3, 4].map(i => (
          <div key={i} className="bg-[#101520] border border-[#c0d6df] rounded-xl p-4 space-y-3 animate-pulse h-36">
            <div className="h-3 w-32 bg-[#c0d6df] rounded" />
            <div className="h-8 w-full bg-[#c0d6df] rounded" />
            <div className="h-2.5 w-48 bg-[#c0d6df] rounded" />
          </div>
        ))}
      </div>
    );
  }

  if (!cards.length) {
    return <p className="text-xs text-[#6b8a99] font-mono">No consensus data yet.</p>;
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {cards.map((card, i) => <Card key={i} card={card} />)}
    </div>
  );
}
