"use client";

import { Play, FileText, BrainCircuit, ShieldCheck } from "lucide-react";
import { useState } from "react";
import type { AnalysisSummary } from "@/lib/client-types";

interface Props {
  item: AnalysisSummary;
  active?: boolean;
  compareMode?: boolean;
  compareSelected?: boolean;
  onSelect: () => void;
  onListenBrief?: () => void;
  onToggleCompare?: () => void;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatDurationSecs(secs: number | null): string {
  if (!secs || secs < 60) return "";
  const m = Math.floor(secs / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60), mm = m % 60;
  return mm > 0 ? `${h}h ${mm}m` : `${h}h`;
}

function timeSavedText(secs: number | null): string | null {
  if (!secs) return null;
  const savedMins = Math.floor((secs - 5 * 60) / 60);
  if (savedMins <= 0) return null;
  if (savedMins < 60) return `${savedMins}m`;
  const h = Math.floor(savedMins / 60), m = savedMins % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

function formatTimeAgo(iso: string): string {
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60_000);
  if (mins < 1) return "JUST NOW";
  if (mins < 60) return `${mins}M AGO`;
  const h = Math.floor(mins / 60);
  if (h < 24) return `${h}H AGO`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}D AGO`;
  return new Date(iso)
    .toLocaleDateString("en-GB", { day: "numeric", month: "short" })
    .toUpperCase();
}

function channelAbbr(name: string): string {
  const initials = name
    .split(/\s+/)
    .filter((w) => w.length >= 3)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
  return (initials || name.slice(0, 4)).toUpperCase().slice(0, 4);
}

function deriveTags(subject: string): [string, string | null] {
  const parts = subject
    .split(/[,·—\-–]|(?:\s(?:and|via|through|by|with|for)\s)/i)
    .map((p) => p.trim())
    .filter((p) => p.length > 2 && p.length < 50);
  if (parts.length >= 2) return [parts[0], parts[1]];
  const words = subject.split(" ");
  if (words.length <= 3) return [subject, null];
  const mid = Math.ceil(words.length / 2);
  return [words.slice(0, mid).join(" "), words.slice(mid).join(" ")];
}

function highlightNumbers(text: string): React.ReactNode[] {
  const parts = text.split(
    /(\$[\d,.]+[BMKTbmkt]?(?:\s*(?:billion|million|trillion|thousand))?|\d+(?:[.,]\d+)*(?:x|%|[BMKbmk]|\+|\s*(?:billion|million|trillion|thousand|years?|months?|weeks?|days?))?)/gi,
  );
  return parts.map((part, i) =>
    /^\$|\d/.test(part) ? (
      <span key={i} className="bc-anchor-num">{part}</span>
    ) : (
      part
    ),
  );
}

// ── Component ─────────────────────────────────────────────────────────────────

export function BriefingCard({
  item,
  active,
  compareMode,
  compareSelected,
  onSelect,
  onListenBrief,
  onToggleCompare,
}: Props) {
  const [thumbErr, setThumbErr] = useState(false);
  const thumbUrl = `https://img.youtube.com/vi/${item.videoId}/hqdefault.jpg`;


  const channelDisplay = item.channelName ?? "Unknown Channel";
  const duration = formatDurationSecs(item.durationSeconds);
  const saved = timeSavedText(item.durationSeconds);
  const [categoryTag, subCategoryTag] = deriveTags(item.primarySubject);

  function handleCardClick() {
    if (compareMode) onToggleCompare?.();
    else onSelect();
  }

  return (
    <div
      className={[
        "bc-card",
        active ? "bc-card--active" : "",
        compareSelected ? "bc-card--selected" : "",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {/* ── 1. Header ── */}
      <div className="bc-v2-header">
        <div className="bc-v2-channel">
          <div className="bc-v2-avatar">{channelDisplay[0]?.toUpperCase()}</div>
          <span className="bc-v2-channel-name">{channelDisplay}</span>
        </div>
      </div>

      {/* ── 2. Title ── */}
      <button type="button" className="bc-v2-title" onClick={handleCardClick}>
        {item.title ?? item.videoId}
      </button>

      {/* ── 3. Meta row ── */}
      <div className="bc-v2-meta">
        <span>{channelDisplay}</span>
        {duration && (
          <>
            <span className="bc-v2-dot">•</span>
            <span>{duration} duration</span>
          </>
        )}
        {saved && (
          <>
            <span className="bc-v2-dot">•</span>
            <span className="bc-v2-saved">⏱️ Saved {saved}</span>
          </>
        )}
      </div>

      {/* ── 4. Thumbnail ── */}
      {!thumbErr && (
        <div className="bc-v2-thumb-wrap" onClick={handleCardClick}>
          <img
            src={thumbUrl}
            alt=""
            className="bc-v2-thumb"
            loading="lazy"
            onError={() => setThumbErr(true)}
          />
          <div className="bc-v2-thumb-label">{channelAbbr(channelDisplay)}</div>
        </div>
      )}

      {/* ── 5. Body ── */}
      <div className="bc-v2-body">
        <div>
          {/* Category pills */}
          <div className="bc-v2-tags">
            <span className="bc-v2-tag bc-v2-tag--cat">{categoryTag}</span>
            {subCategoryTag && (
              <>
                <span className="bc-v2-tag-arrow">→</span>
                <span className="bc-v2-tag bc-v2-tag--sub">{subCategoryTag}</span>
              </>
            )}
          </div>

          {/* Metric count */}
          {item.dataPointsCount > 0 && (
            <div className="bc-v2-metric-count">
              <span>📊</span>
              <span>{item.dataPointsCount} Key Data Points Extracted</span>
            </div>
          )}

          {/* Key Anchor + Context pane */}
          {(item.keyAnchorPreview || item.contextExamplePreview) && (
            <div className="bc-v2-anchor-pane">
              {item.keyAnchorPreview && (
                <>
                  <div className="bc-v2-anchor-label">Key Anchor</div>
                  <p className="bc-v2-anchor-text">
                    {highlightNumbers(item.keyAnchorPreview)}
                  </p>
                </>
              )}
              {item.contextExamplePreview && (
                <div className="bc-v2-context-section">
                  <div className="bc-v2-anchor-label">💡 Context &amp; Example</div>
                  <p className="bc-v2-context-text">{item.contextExamplePreview}</p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* ── Action layer ── */}
        <div className="bc-v2-actions-wrap">
          {(item.dataPointsCount > 0 || item.audioPath) && (
            <div className="bc-v2-signals">
              {item.dataPointsCount > 0 && (
                <span className="bc-v2-signal">
                  <BrainCircuit size={13} color="#a855f7" />
                  Strategic Intent Logged
                </span>
              )}
              {item.dataPointsCount > 0 && item.audioPath && (
                <span className="bc-v2-signal-dot">•</span>
              )}
              {item.audioPath && (
                <span className="bc-v2-signal">
                  <ShieldCheck size={13} color="#22c55e" />
                  Audio Briefing
                </span>
              )}
            </div>
          )}

          <div className="bc-v2-timestamp">{formatTimeAgo(item.createdAt)}</div>

          <div className="bc-v2-btns">
            <button
              type="button"
              className="bc-v2-btn bc-v2-btn--listen"
              onClick={onListenBrief ?? onSelect}
              disabled={!item.audioPath}
            >
              <Play size={11} fill="white" strokeWidth={0} />
              Listen Brief
            </button>
            <button
              type="button"
              className="bc-v2-btn bc-v2-btn--report"
              onClick={onSelect}
            >
              <FileText size={11} />
              Open Full Report
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
