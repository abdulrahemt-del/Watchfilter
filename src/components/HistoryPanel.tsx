"use client";

import type { AnalysisSummary } from "@/lib/client-types";

type Props = {
  items: AnalysisSummary[];
  activeId: string | null;
  loading: boolean;
  onSelect: (id: string) => void;
  onRefresh: () => void;
};

function formatRelative(iso: string): string {
  const date = new Date(iso);
  const diffMs = Date.now() - date.getTime();
  const mins = Math.floor(diffMs / 60_000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return date.toLocaleDateString();
}

export function HistoryPanel({
  items,
  activeId,
  loading,
  onSelect,
  onRefresh,
}: Props) {
  return (
    <aside className="history-panel">
      <div
        className="history-header"
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <span>History</span>
        <button
          type="button"
          className="btn btn-ghost"
          style={{ padding: "0.25rem 0.5rem", fontSize: "0.7rem" }}
          onClick={onRefresh}
          disabled={loading}
          title="Refresh history"
        >
          ↻
        </button>
      </div>
      <div className="history-list">
        {items.length === 0 ? (
          <p className="history-empty">
            {loading ? "Loading…" : "No saved analyses yet."}
          </p>
        ) : (
          items.map((item) => (
            <button
              key={item.id}
              type="button"
              className={`history-item${activeId === item.id ? " active" : ""}`}
              onClick={() => onSelect(item.id)}
            >
              <div className="history-item-title">
                {item.title ?? item.videoId}
              </div>
              <div className="history-item-meta">
                Score {item.clickbaitScore} · {formatRelative(item.createdAt)}
              </div>
            </button>
          ))
        )}
      </div>
    </aside>
  );
}
