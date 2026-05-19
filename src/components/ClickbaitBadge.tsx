function tier(score: number): "low" | "mid" | "high" {
  if (score <= 3) return "low";
  if (score <= 6) return "mid";
  return "high";
}

export function ClickbaitBadge({ score }: { score: number }) {
  const t = tier(score);
  const label =
    t === "low" ? "Honest title" : t === "mid" ? "Some hype" : "Clickbait";

  return (
    <div
      className={`clickbait-badge clickbait-${t}`}
      title={`${score}/10 — how misleading the title is vs. actual content`}
    >
      <span className="clickbait-score">{score}</span>
      <span>{label}</span>
    </div>
  );
}
