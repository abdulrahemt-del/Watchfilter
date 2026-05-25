"use client";

import { useState } from "react";
import type { AnalysisSummary } from "@/lib/client-types";

type Props = {
  items: AnalysisSummary[];
  activeId: string | null;
  loading: boolean;
  onSelect: (id: string) => void;
  onRefresh: () => void;
  onCompare: (ids: string[], sources: AnalysisSummary[]) => void;
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
  onCompare,
}: Props) {
  const [compareMode, setCompareMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  function toggleCompareMode() {
    setCompareMode((v) => !v);
    setSelected(new Set());
  }

  function toggleItem(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else if (next.size < 5) next.add(id);
      return next;
    });
  }

  function handleCompare() {
    const ids = Array.from(selected);
    const sources = items.filter((item) => ids.includes(item.id));
    onCompare(ids, sources);
    setCompareMode(false);
    setSelected(new Set());
  }

  return (
    <aside className="history-panel">
      <div className="history-header">
        <span>Saved Briefings</span>
        <div style={{ display: "flex", gap: "0.3rem", alignItems: "center" }}>
          <button
            type="button"
            className="history-compare-btn"
            onClick={toggleCompareMode}
            title={compareMode ? "Cancel comparison" : "Compare multiple videos"}
          >
            {compareMode ? "✕ Cancel" : "⊕ Compare"}
          </button>
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
      </div>

      <div className="history-list">
        {items.length === 0 ? (
          <p className="history-empty">
            {loading ? "Loading…" : "No saved analyses yet."}
          </p>
        ) : (
          items.map((item) => {
            const isSelected = selected.has(item.id);
            return (
              <button
                key={item.id}
                type="button"
                className={[
                  "history-item",
                  !compareMode && activeId === item.id ? "active" : "",
                  compareMode && isSelected ? "history-item--selected" : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
                onClick={() =>
                  compareMode ? toggleItem(item.id) : onSelect(item.id)
                }
              >
                {compareMode && (
                  <span
                    className={`history-item-check${isSelected ? " history-item-check--checked" : ""}`}
                  >
                    {isSelected && (
                      <svg width="8" height="6" viewBox="0 0 8 6" fill="none" aria-hidden>
                        <path
                          d="M1 3l2 2 4-4"
                          stroke="#fff"
                          strokeWidth="1.5"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    )}
                  </span>
                )}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="history-item-title">
                    {item.title ?? item.videoId}
                  </div>
                  <div className="history-item-meta">
                    {item.channelName && <span>{item.channelName} · </span>}
                    Score {item.clickbaitScore} · {formatRelative(item.createdAt)}
                  </div>
                </div>
              </button>
            );
          })
        )}
      </div>

      {compareMode && (
        <div className="history-compare-footer">
          <button
            type="button"
            className="history-compare-go"
            disabled={selected.size < 2}
            onClick={handleCompare}
          >
            {selected.size < 2
              ? `Select ${2 - selected.size} more`
              : `Compare ${selected.size} videos →`}
          </button>
        </div>
      )}
    </aside>
  );
}
