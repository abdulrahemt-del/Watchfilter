"use client";

import { useEffect, useRef, useState } from "react";
import type { FeedVideo } from "@/app/api/youtube/feed/route";
import type { Insight, VideoType } from "@/app/api/youtube/insights/route";
import type { OutputStatus } from "@/app/api/youtube/auto-send/route";

type SendStatus = "idle" | "sending" | "sent" | "failed" | "skipped";

interface UIStatus { status: SendStatus; url?: string; error?: string; }

interface InsightState extends Insight {
  noteStatus:    UIStatus;
  taskStatus:    UIStatus;
  contentStatus: UIStatus;
}

interface LogEntry { id: number; ts: string; msg: string; ok?: boolean; }

// ── Client-side char code scanner (mirrors server findSuspiciousChars) ─────────
function clientCharScan(str: string): Array<{ i: number; code: number }> {
  const hits: Array<{ i: number; code: number }> = [];
  for (let i = 0; i < str.length; i++) {
    const c = str.charCodeAt(i);
    if (c > 127 || c === 0) hits.push({ i, code: c });
  }
  return hits;
}

function clientSanitize(str: string): string {
  return str
    .replace(/﻿/g, "")
    .replace(/​/g, "")
    .replace(/‌/g, "")
    .replace(/‍/g, "")
    .replace(/[^\x20-\x7E\n\r\t]/g, "")
    .trim();
}

// ── Debug panel for a failed asset ────────────────────────────────────────────
function DebugPanel({ label, raw }: { label: string; raw: string }) {
  const sanitized = clientSanitize(raw);
  const hits      = clientCharScan(raw);
  const [open, setOpen] = useState(false);

  if (!raw) return null;

  return (
    <div style={{ marginTop: 6, borderTop: "1px solid rgba(248,113,113,0.15)", paddingTop: 6 }}>
      <button
        onClick={() => setOpen(p => !p)}
        style={{ fontSize: 8, fontFamily: "monospace", color: "#7f1d1d", background: "none", border: "none", cursor: "pointer", padding: 0 }}
      >
        {open ? "▲" : "▼"} Debug: {label}
      </button>
      {open && (
        <div style={{ marginTop: 4, display: "flex", flexDirection: "column", gap: 4 }}>
          <div>
            <span style={{ fontSize: 8, color: "#7f1d1d", fontFamily: "monospace" }}>RAW:</span>
            <div style={{ fontSize: 8, fontFamily: "monospace", color: "#ef4444", wordBreak: "break-all", marginTop: 1 }}>{JSON.stringify(raw)}</div>
          </div>
          <div>
            <span style={{ fontSize: 8, color: "#334155", fontFamily: "monospace" }}>SANITIZED:</span>
            <div style={{ fontSize: 8, fontFamily: "monospace", color: "#64748b", wordBreak: "break-all", marginTop: 1 }}>{JSON.stringify(sanitized)}</div>
          </div>
          {hits.length > 0 ? (
            <div>
              <span style={{ fontSize: 8, color: "#f87171", fontFamily: "monospace" }}>SUSPICIOUS CHARS ({hits.length}):</span>
              <div style={{ fontSize: 8, fontFamily: "monospace", color: "#ef4444", marginTop: 1 }}>
                {hits.slice(0, 8).map(h => `index ${h.i}: code ${h.code}`).join(" | ")}
              </div>
            </div>
          ) : (
            <div style={{ fontSize: 8, fontFamily: "monospace", color: "#10b981" }}>No suspicious chars in this field</div>
          )}
        </div>
      )}
    </div>
  );
}

const CAT_COLOR: Record<string, string> = {
  Strategy: "#a5b4fc", Investing: "#6ee7b7", AI: "#67e8f9",
  Marketing: "#fda4af", Leadership: "#fde68a", Startup: "#c4b5fd",
  Productivity: "#86efac", Technology: "#93c5fd",
  "Content Creation": "#f9a8d4", Business: "#d9f99d",
};

function clockNow() {
  return new Date().toLocaleTimeString("en-US", { hour12: false });
}

function toUIStatus(s: OutputStatus): UIStatus {
  return { status: s.status as SendStatus, url: s.url, error: s.error };
}

// ── Asset row ──────────────────────────────────────────────────────────────────

function AssetRow({ icon, label, title, status, url, error, debugFields }: {
  icon: string; label: string; title: string;
  status: SendStatus; url?: string; error?: string;
  debugFields?: Record<string, string>;
}) {
  const isSent    = status === "sent";
  const isFailed  = status === "failed";
  const isSkipped = status === "skipped";
  const isSending = status === "sending";
  const isIdle    = status === "idle";

  const borderColor = isSent   ? "rgba(16,185,129,0.3)"
                    : isFailed ? "rgba(248,113,113,0.25)"
                    : "rgba(255,255,255,0.06)";
  const bgColor     = isSent   ? "rgba(16,185,129,0.05)"
                    : isFailed ? "rgba(248,113,113,0.03)"
                    : "rgba(255,255,255,0.015)";

  return (
    <div style={{
      border: `1px solid ${borderColor}`,
      background: bgColor,
      borderRadius: 9,
      padding: "9px 12px",
      display: "flex", alignItems: "flex-start", gap: 10,
      transition: "border-color 0.3s, background 0.3s",
    }}>
      <span style={{ fontSize: 14, flexShrink: 0, lineHeight: 1.4 }}>{icon}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontSize: 9, fontFamily: "monospace", fontWeight: 800,
          color: "#334155", textTransform: "uppercase", letterSpacing: "0.08em",
          marginBottom: 2,
        }}>
          {label}
        </div>
        {title && (
          <div style={{ fontSize: 12, fontWeight: 600, color: "#cbd5e1", marginBottom: 4, lineHeight: 1.35 }}>
            {title}
          </div>
        )}
        <div>
          {isIdle && (
            <span style={{ fontSize: 9, color: "#334155", fontFamily: "monospace" }}>Pending sync</span>
          )}
          {isSending && (
            <span style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 9, color: "#818cf8", fontFamily: "monospace" }}>
              <span className="spinner" style={{ width: 7, height: 7, borderWidth: 1.5 }} />
              Saving…
            </span>
          )}
          {isSent && (
            <span style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 9, color: "#10b981", fontFamily: "monospace", fontWeight: 700 }}>
              ✓ Delivered
              {url && (
                <a href={url} target="_blank" rel="noreferrer" style={{ color: "#334155", textDecoration: "none", marginLeft: 2 }}>↗</a>
              )}
            </span>
          )}
          {isFailed && (
            <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
              <span style={{ fontSize: 9, color: "#f87171", fontFamily: "monospace" }}>✕ Sync failed</span>
              {error && <span style={{ fontSize: 8, color: "#7f1d1d", fontFamily: "monospace", wordBreak: "break-word" }}>{error}</span>}
              {debugFields && Object.entries(debugFields).map(([k, v]) => (
                <DebugPanel key={k} label={k} raw={v} />
              ))}
            </div>
          )}
          {isSkipped && (
            <span style={{ fontSize: 9, color: "#1e293b", fontFamily: "monospace" }}>Not configured</span>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Insight card ───────────────────────────────────────────────────────────────

function InsightCard({ ins, index, autoSend, sending, onSend }: {
  ins:      InsightState;
  index:    number;
  autoSend: boolean;
  sending:  boolean;
  onSend:   () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const catColor = CAT_COLOR[ins.category] ?? "#94a3b8";

  const noteD    = ins.noteStatus.status;
  const taskD    = ins.taskStatus.status;
  const contentD = ins.contentStatus.status;

  const allDelivered = (noteD    === "sent" || noteD    === "skipped") &&
                       (taskD    === "sent" || taskD    === "skipped") &&
                       (contentD === "sent" || contentD === "skipped");
  const anyIdle      = noteD === "idle" || taskD === "idle" || contentD === "idle";

  return (
    <div style={{
      background: allDelivered ? "rgba(16,185,129,0.03)" : "rgba(255,255,255,0.018)",
      border: `1px solid ${allDelivered ? "rgba(16,185,129,0.2)" : "rgba(255,255,255,0.07)"}`,
      borderRadius: 12, overflow: "hidden",
      transition: "border-color 0.3s",
    }}>
      {/* Header */}
      <div style={{ padding: "12px 14px 10px", display: "flex", gap: 10, alignItems: "flex-start" }}>
        <div style={{
          flexShrink: 0, width: 22, height: 22, borderRadius: 6,
          background: allDelivered ? "rgba(16,185,129,0.12)" : "rgba(255,255,255,0.05)",
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 10, fontFamily: "monospace", fontWeight: 800,
          color: allDelivered ? "#10b981" : "#475569",
        }}>
          {allDelivered ? "✓" : index + 1}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 5, flexWrap: "wrap" }}>
            <span style={{
              fontSize: 9, fontFamily: "monospace", fontWeight: 700,
              padding: "1px 6px", borderRadius: 3,
              background: `${catColor}18`, color: catColor,
            }}>
              {ins.category}
            </span>
            <span style={{ fontSize: 9, color: "#475569", fontFamily: "monospace" }}>
              Signal {ins.importance}/10
            </span>
          </div>
          <p style={{ fontSize: 13, fontWeight: 700, color: "#f1f5f9", margin: "0 0 6px", lineHeight: 1.35 }}>
            {ins.title}
          </p>
          <p style={{ fontSize: 11, color: "#64748b", margin: 0, lineHeight: 1.55 }}>
            {ins.why_it_matters}
          </p>
        </div>
        <button
          onClick={() => setExpanded(p => !p)}
          style={{ flexShrink: 0, background: "none", border: "none", cursor: "pointer", fontSize: 9, color: "#1e293b", paddingTop: 4 }}
          title={expanded ? "Collapse" : "Expand"}
        >
          {expanded ? "▲" : "▼"}
        </button>
      </div>

      {/* Expanded: explanation */}
      {expanded && (
        <div style={{ padding: "0 14px 12px", borderTop: "1px solid rgba(255,255,255,0.04)" }}>
          <p style={{ fontSize: 9, fontFamily: "monospace", fontWeight: 800, color: "#334155", textTransform: "uppercase", letterSpacing: "0.08em", margin: "10px 0 4px" }}>
            What Was Said
          </p>
          <p style={{ fontSize: 11, color: "#64748b", margin: 0, lineHeight: 1.65 }}>
            {ins.explanation}
          </p>
        </div>
      )}

      {/* Assets section */}
      <div style={{ borderTop: "1px solid rgba(255,255,255,0.04)", padding: "6px 14px 3px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span style={{ fontSize: 9, fontFamily: "monospace", fontWeight: 800, color: "#1e3a2f", textTransform: "uppercase", letterSpacing: "0.12em" }}>
          Assets Created
        </span>
        {allDelivered && (
          <span style={{ fontSize: 9, fontFamily: "monospace", color: "#10b981", fontWeight: 700 }}>3 delivered</span>
        )}
      </div>
      <div style={{ padding: "4px 12px 12px", display: "flex", flexDirection: "column", gap: 5 }}>
        <AssetRow
          icon="N" label="Strategic Note -> Notion"
          title={ins.assets.note.title}
          status={noteD} url={ins.noteStatus.url} error={ins.noteStatus.error}
          debugFields={noteD === "failed" ? {
            "note.title":   ins.assets.note.title   ?? "",
            "note.content": ins.assets.note.content ?? "",
            "ins.title":    ins.title               ?? "",
          } : undefined}
        />
        <AssetRow
          icon="T" label="Action Task -> Todoist"
          title={ins.assets.task.title}
          status={taskD} url={ins.taskStatus.url} error={ins.taskStatus.error}
          debugFields={taskD === "failed" ? {
            "task.title":       ins.assets.task.title       ?? "",
            "task.description": ins.assets.task.description ?? "",
          } : undefined}
        />
        <AssetRow
          icon="C" label="Content Opportunity -> Queue"
          title={ins.assets.content.title}
          status={contentD} url={ins.contentStatus.url} error={ins.contentStatus.error}
          debugFields={contentD === "failed" ? {
            "content.title": ins.assets.content.title ?? "",
            "content.angle": ins.assets.content.angle ?? "",
          } : undefined}
        />
      </div>

      {/* Per-card send button (auto-send off) */}
      {!autoSend && anyIdle && !sending && (
        <div style={{ padding: "0 12px 12px" }}>
          <button
            onClick={(e) => { e.stopPropagation(); onSend(); }}
            style={{
              fontSize: 10, fontFamily: "monospace", fontWeight: 700,
              color: "#818cf8", background: "rgba(99,102,241,0.1)",
              border: "1px solid rgba(99,102,241,0.25)",
              borderRadius: 6, padding: "4px 12px", cursor: "pointer",
            }}
          >
            Send assets →
          </button>
        </div>
      )}
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

interface Props {
  isOpen:         boolean;
  video:          FeedVideo | null;
  videoType?:     string | null;
  cachedInsights: Insight[] | null;
  loading:        boolean;
  error:          string | null;
  onClose:        () => void;
  onFetch:        () => void;
}

export function InsightsDrawer({ isOpen, video, videoType, cachedInsights, loading, error, onClose, onFetch }: Props) {
  const [fetched,  setFetched]  = useState(false);
  const [autoSend, setAutoSend] = useState(() => {
    try { return localStorage.getItem("wf_auto_send") === "true"; } catch { return false; }
  });
  const [insights, setInsights] = useState<InsightState[]>([]);
  const [sending,  setSending]  = useState(false);
  const [log,      setLog]      = useState<LogEntry[]>([]);
  const [showLog,  setShowLog]  = useState(false);
  const [elapsed,  setElapsed]  = useState<number | null>(null);
  const logId   = useRef(0);
  const startT  = useRef<number | null>(null);

  function addLog(msg: string, ok?: boolean) {
    const entry: LogEntry = { id: logId.current++, ts: clockNow(), msg, ok };
    setLog(prev => [...prev, entry]);
  }

  // Initialise insights when AI returns them
  useEffect(() => {
    if (!cachedInsights) return;
    setInsights(cachedInsights.map(ins => ({
      ...ins,
      noteStatus:    { status: "idle" },
      taskStatus:    { status: "idle" },
      contentStatus: { status: "idle" },
    })));
    const n = cachedInsights.length;
    addLog(`${n} insight${n !== 1 ? "s" : ""} extracted`, true);
    if (autoSend) addLog("Auto-Send ON — routing assets…");
  }, [cachedInsights]); // eslint-disable-line react-hooks/exhaustive-deps

  // Trigger fetch on open
  useEffect(() => {
    if (isOpen && video && !cachedInsights && !loading && !fetched) {
      setFetched(true);
      startT.current = Date.now();
      addLog("Extracting insights…");
      onFetch();
    }
  }, [isOpen, video?.videoId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-send fires once when insights land and autoSend is ON
  useEffect(() => {
    if (autoSend && insights.length > 0 && insights.every(i => i.noteStatus.status === "idle") && !sending) {
      void runSend();
    }
  }, [autoSend, insights.length]); // eslint-disable-line react-hooks/exhaustive-deps

  // Reset on video change
  useEffect(() => {
    setFetched(false);
    setInsights([]);
    setLog([]);
    setElapsed(null);
    startT.current = null;
  }, [video?.videoId]);

  function toggleAutoSend() {
    const next = !autoSend;
    setAutoSend(next);
    try { localStorage.setItem("wf_auto_send", String(next)); } catch { /**/ }
  }

  async function runSend(targets?: number[]) {
    if (sending || insights.length === 0) return;
    setSending(true);
    const idxs = targets ?? insights.map((_, i) => i);

    // Mark as sending
    setInsights(prev => prev.map((ins, i) =>
      idxs.includes(i) ? { ...ins, noteStatus: { status: "sending" }, taskStatus: { status: "sending" }, contentStatus: { status: "sending" } } : ins
    ));
    addLog(`Routing ${idxs.length * 3} assets…`);

    try {
      addLog(`POST /api/youtube/auto-send — ${idxs.length} insights`);

      const res = await fetch("/api/youtube/auto-send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          insights:     idxs.map(i => insights[i]),
          videoTitle:   video?.title,
          channelTitle: video?.channelTitle,
          videoType,
        }),
      });

      addLog(`Response: HTTP ${res.status}`, res.ok);

      if (!res.ok) {
        const body = await res.text().catch(() => "(no body)");
        throw new Error(`HTTP ${res.status}: ${body}`);
      }

      const data = await res.json() as {
        results?: { index: number; noteStatus: OutputStatus; taskStatus: OutputStatus; contentStatus: OutputStatus }[];
      };

      if (data.results) {
        const updates: Record<number, Pick<InsightState, "noteStatus" | "taskStatus" | "contentStatus">> = {};

        data.results.forEach(r => {
          const realIdx  = idxs[r.index] ?? r.index;
          const insTitle = insights[realIdx]?.title ?? `Insight ${realIdx + 1}`;

          updates[realIdx] = {
            noteStatus:    toUIStatus(r.noteStatus),
            taskStatus:    toUIStatus(r.taskStatus),
            contentStatus: toUIStatus(r.contentStatus),
          };

          if (r.noteStatus.status    === "sent")    addLog(`Notion ✓  "${insTitle}"${r.noteStatus.url    ? " →" : ""}`, true);
          if (r.taskStatus.status    === "sent")    addLog(`Todoist ✓ "${insTitle}"`, true);
          if (r.contentStatus.status === "sent")    addLog(`Queue ✓   "${insTitle}"`, true);
          if (r.noteStatus.status    === "failed")  addLog(`Notion ✕  "${insTitle}": ${r.noteStatus.error    ?? "unknown"}`, false);
          if (r.taskStatus.status    === "failed")  addLog(`Todoist ✕ "${insTitle}": ${r.taskStatus.error    ?? "unknown"}`, false);
          if (r.contentStatus.status === "failed")  addLog(`Queue ✕   "${insTitle}": ${r.contentStatus.error ?? "unknown"}`, false);
          if (r.noteStatus.status    === "skipped") addLog(`Notion skipped: ${r.noteStatus.error    ?? "not configured"}`);
          if (r.contentStatus.status === "skipped") addLog(`Queue skipped: ${r.contentStatus.error  ?? "not configured"}`);
        });

        setInsights(prev => prev.map((ins, i) => updates[i] ? { ...ins, ...updates[i] } : ins));
        if (startT.current) setElapsed((Date.now() - startT.current) / 1000);
      }
    } catch (e) {
      // Pipeline-level failure — Notion/Todoist were never called. Reset to idle.
      const msg = e instanceof Error ? e.message : "Unknown error";
      setInsights(prev => prev.map((ins, i) =>
        idxs.includes(i) ? { ...ins, noteStatus: { status: "idle" }, taskStatus: { status: "idle" }, contentStatus: { status: "idle" } } : ins
      ));
      addLog(`Pipeline error (no sync attempted): ${msg}`, false);
    } finally {
      setSending(false);
    }
  }

  if (!isOpen || !video) return null;

  // Execution summary counts
  const totalInsights = insights.length;
  const sentNotes     = insights.filter(i => i.noteStatus.status    === "sent").length;
  const sentTasks     = insights.filter(i => i.taskStatus.status    === "sent").length;
  const sentContent   = insights.filter(i => i.contentStatus.status === "sent").length;
  const totalSent     = sentNotes + sentTasks + sentContent;
  const maxAssets     = totalInsights * 3;

  const anySending = insights.some(i =>
    i.noteStatus.status === "sending" || i.taskStatus.status === "sending" || i.contentStatus.status === "sending"
  );
  const allDelivered = totalInsights > 0 && insights.every(i => {
    const n = i.noteStatus.status;
    const t = i.taskStatus.status;
    const c = i.contentStatus.status;
    return (n === "sent" || n === "skipped") && (t === "sent" || t === "skipped") && (c === "sent" || c === "skipped");
  });
  const anyIdle = insights.some(i =>
    i.noteStatus.status === "idle" || i.taskStatus.status === "idle" || i.contentStatus.status === "idle"
  );

  return (
    <>
      <div className="fluff-drawer__overlay" onClick={onClose} />
      <div className="fluff-drawer">

        {/* Header */}
        <div className="fluff-drawer__header">
          <div>
            <span style={{ fontSize: 9, fontFamily: "monospace", fontWeight: 800, color: "#475569", textTransform: "uppercase", letterSpacing: "0.1em" }}>
              {videoType ?? "Key Insights"}
            </span>
            <h2 className="fluff-drawer__channel">{video.channelTitle}</h2>
          </div>
          <button onClick={onClose} className="fluff-drawer__close">✕</button>
        </div>

        <div className="fluff-drawer__body" style={{ padding: 0 }}>

          {/* Video title */}
          <div style={{ padding: "4px 16px 12px", borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
            <p style={{ fontSize: 11, color: "#475569", margin: 0, fontFamily: "monospace", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {video.title}
            </p>
          </div>

          {/* Auto-Send toggle */}
          <div style={{ padding: "12px 16px", borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
            <div
              onClick={toggleAutoSend}
              style={{
                display: "flex", alignItems: "center", gap: 10,
                padding: "10px 14px", borderRadius: 10, cursor: "pointer", userSelect: "none",
                background: autoSend ? "rgba(16,185,129,0.07)" : "rgba(255,255,255,0.03)",
                border: `1px solid ${autoSend ? "rgba(16,185,129,0.28)" : "rgba(255,255,255,0.08)"}`,
              }}
            >
              <div style={{
                width: 34, height: 19, borderRadius: 10, flexShrink: 0, position: "relative",
                background: autoSend ? "#10b981" : "#1e293b",
                border: "1px solid rgba(255,255,255,0.06)",
                transition: "background 0.2s",
              }}>
                <div style={{
                  position: "absolute", top: 2, left: autoSend ? 16 : 2,
                  width: 15, height: 15, borderRadius: "50%", background: "#fff",
                  boxShadow: "0 1px 3px rgba(0,0,0,0.4)", transition: "left 0.2s",
                }} />
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 11, fontFamily: "monospace", fontWeight: 800, color: autoSend ? "#10b981" : "#475569" }}>
                  AUTO-SEND {autoSend ? "ON" : "OFF"}
                </div>
                <div style={{ fontSize: 10, color: "#334155", fontFamily: "monospace", marginTop: 1 }}>
                  {autoSend
                    ? "Notes → Notion · Tasks → Todoist · Content → Queue"
                    : "Click to auto-route assets to your workspace"}
                </div>
              </div>
              {autoSend && anySending && <div className="spinner" style={{ width: 12, height: 12, borderWidth: 1.5 }} />}
            </div>
          </div>

          {/* Execution Complete banner */}
          {allDelivered && (
            <div style={{
              margin: "12px 14px",
              padding: "16px 18px",
              background: "linear-gradient(135deg, rgba(16,185,129,0.1), rgba(16,185,129,0.04))",
              border: "1px solid rgba(16,185,129,0.3)", borderRadius: 12,
            }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
                <span style={{ fontSize: 13, fontFamily: "monospace", fontWeight: 800, color: "#10b981" }}>
                  ⚡ EXECUTION COMPLETE
                </span>
                {elapsed !== null && (
                  <span style={{ fontSize: 9, color: "#334155", fontFamily: "monospace" }}>{elapsed.toFixed(1)}s</span>
                )}
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: "6px 14px", marginBottom: 10 }}>
                <span style={{ fontSize: 10, color: "#94a3b8", fontFamily: "monospace" }}>Insights Extracted</span>
                <span style={{ fontSize: 10, color: "#f1f5f9", fontFamily: "monospace", fontWeight: 700 }}>{totalInsights}</span>
                {sentNotes > 0 && <>
                  <span style={{ fontSize: 10, color: "#94a3b8", fontFamily: "monospace" }}>Notes → Notion</span>
                  <span style={{ fontSize: 10, color: "#6ee7b7", fontFamily: "monospace", fontWeight: 700 }}>{sentNotes}</span>
                </>}
                {sentTasks > 0 && <>
                  <span style={{ fontSize: 10, color: "#94a3b8", fontFamily: "monospace" }}>Tasks → Todoist</span>
                  <span style={{ fontSize: 10, color: "#a5b4fc", fontFamily: "monospace", fontWeight: 700 }}>{sentTasks}</span>
                </>}
                {sentContent > 0 && <>
                  <span style={{ fontSize: 10, color: "#94a3b8", fontFamily: "monospace" }}>Content → Queue</span>
                  <span style={{ fontSize: 10, color: "#f9a8d4", fontFamily: "monospace", fontWeight: 700 }}>{sentContent}</span>
                </>}
              </div>
              <div style={{ fontSize: 9, color: "#334155", fontFamily: "monospace", borderTop: "1px solid rgba(255,255,255,0.05)", paddingTop: 8 }}>
                {totalSent} of {maxAssets} assets delivered · workspace updated
              </div>
            </div>
          )}

          {/* In-progress executing banner */}
          {anySending && !allDelivered && (
            <div style={{
              margin: "12px 14px", padding: "12px 16px",
              background: "rgba(129,140,248,0.05)", border: "1px solid rgba(129,140,248,0.18)", borderRadius: 10,
              display: "flex", alignItems: "center", gap: 10,
            }}>
              <span className="spinner" style={{ width: 12, height: 12, borderWidth: 1.5 }} />
              <div>
                <div style={{ fontSize: 11, fontFamily: "monospace", fontWeight: 800, color: "#818cf8" }}>
                  ⚡ EXECUTING…
                </div>
                <div style={{ fontSize: 9, color: "#334155", fontFamily: "monospace", marginTop: 2 }}>
                  Routing assets to your workspace
                </div>
              </div>
            </div>
          )}

          {/* Loading */}
          {loading && (
            <div style={{ padding: "20px 16px", display: "flex", alignItems: "center", gap: 12 }}>
              <span className="spinner" style={{ width: 14, height: 14, borderWidth: 2 }} />
              <div>
                <div style={{ fontSize: 12, color: "#818cf8", fontFamily: "monospace", fontWeight: 700 }}>
                  Extracting insights…
                </div>
                <div style={{ fontSize: 10, color: "#334155", fontFamily: "monospace", marginTop: 2 }}>
                  Reading transcript · Classifying video
                </div>
              </div>
            </div>
          )}

          {/* Error */}
          {error && (
            <div style={{ margin: "12px 14px", padding: "10px 14px", background: "rgba(248,113,113,0.06)", border: "1px solid rgba(248,113,113,0.2)", borderRadius: 8 }}>
              <span style={{ fontSize: 11, color: "#f87171", fontFamily: "monospace" }}>{error}</span>
            </div>
          )}

          {/* Insights list */}
          {!loading && insights.length > 0 && (
            <div>
              <div style={{ padding: "8px 16px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <span style={{ fontSize: 9, fontFamily: "monospace", fontWeight: 800, color: "#334155", textTransform: "uppercase", letterSpacing: "0.1em" }}>
                  {totalInsights} Insight{totalInsights !== 1 ? "s" : ""}
                  {totalSent > 0 && !allDelivered && (
                    <span style={{ color: "#10b981", marginLeft: 8 }}>· {totalSent} assets delivered</span>
                  )}
                </span>
                {!autoSend && anyIdle && !sending && (
                  <button
                    onClick={() => void runSend()}
                    style={{
                      fontSize: 10, fontFamily: "monospace", fontWeight: 800,
                      color: "#818cf8", background: "rgba(99,102,241,0.1)",
                      border: "1px solid rgba(99,102,241,0.25)",
                      borderRadius: 6, padding: "3px 10px", cursor: "pointer",
                    }}
                  >
                    ⚡ Send all assets
                  </button>
                )}
              </div>

              <div style={{ padding: "0 12px 12px", display: "flex", flexDirection: "column", gap: 8 }}>
                {insights.map((ins, i) => (
                  <InsightCard
                    key={i}
                    ins={ins}
                    index={i}
                    autoSend={autoSend}
                    sending={sending}
                    onSend={() => void runSend([i])}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Activity Log */}
          {log.length > 0 && (
            <div style={{ borderTop: "1px solid rgba(255,255,255,0.04)", padding: "0 16px 16px" }}>
              <button
                onClick={() => setShowLog(p => !p)}
                style={{
                  width: "100%", textAlign: "left", padding: "8px 0",
                  fontSize: 9, fontFamily: "monospace", fontWeight: 800,
                  color: "#334155", textTransform: "uppercase", letterSpacing: "0.1em",
                  background: "none", border: "none", cursor: "pointer",
                  display: "flex", alignItems: "center", gap: 6,
                }}
              >
                Activity Log {showLog ? "▲" : "▼"}
                <span style={{ fontWeight: 400, textTransform: "none", letterSpacing: 0, color: "#1e293b" }}>
                  {log.length} events
                </span>
              </button>
              {showLog && (
                <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                  {log.map(e => (
                    <div key={e.id} style={{ display: "flex", gap: 8, alignItems: "baseline" }}>
                      <span style={{ fontSize: 9, color: "#1e293b", fontFamily: "monospace", flexShrink: 0, minWidth: 64 }}>{e.ts}</span>
                      <span style={{
                        fontSize: 10, fontFamily: "monospace",
                        color: e.ok === true ? "#10b981" : e.ok === false ? "#f87171" : "#475569",
                      }}>
                        {e.ok === true ? "✓" : e.ok === false ? "✕" : "·"} {e.msg}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

        </div>
      </div>
    </>
  );
}
