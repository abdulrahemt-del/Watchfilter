"use client";

import { useEffect, useRef, useState } from "react";
import type { FeedVideo } from "@/app/api/youtube/feed/route";
import type { Insight, VideoType } from "@/app/api/youtube/insights/route";

type SendStatus = "idle" | "sending" | "sent" | "failed" | "skipped";
interface OutputStatus { status: SendStatus; url?: string; error?: string; }

interface InsightState extends Insight {
  notionStatus: OutputStatus;
  taskStatus:   OutputStatus;
}

interface LogEntry { id: number; ts: string; msg: string; ok?: boolean; }

const CAT_COLOR: Record<string, string> = {
  Strategy: "#a5b4fc", Investing: "#6ee7b7", AI: "#67e8f9",
  Marketing: "#fda4af", Leadership: "#fde68a", Startup: "#c4b5fd",
  Productivity: "#86efac", Technology: "#93c5fd",
  "Content Creation": "#f9a8d4", Business: "#d9f99d",
};

const CONF_COLOR: Record<string, { text: string; bg: string }> = {
  High:   { text: "#10b981", bg: "rgba(16,185,129,0.12)"  },
  Medium: { text: "#f59e0b", bg: "rgba(245,158,11,0.12)"  },
  Low:    { text: "#64748b", bg: "rgba(100,116,139,0.12)" },
};

function clockNow(): string {
  return new Date().toLocaleTimeString("en-US", { hour12: false });
}

function isActionable(ins: Insight): ins is Insight & { actionability: { task: string; description: string } } {
  return typeof ins.actionability === "object" && ins.actionability !== null;
}

// ── Destination-specific verbs ─────────────────────────────────────────────────
function destVerbs(dest: string): { saving: string; saved: string; failed: string } {
  if (dest === "Todoist") return { saving: "Sending to Todoist…",   saved: "Sent to Todoist",   failed: "Todoist sync failed" };
  return                         { saving: `Saving to ${dest}…`,    saved: `Saved to ${dest}`,   failed: `${dest} sync failed` };
}

// ── Small output pill ──────────────────────────────────────────────────────────
function OutputPill({ icon, label, dest, status, url, error }: {
  icon: string; label: string; dest: string;
  status: SendStatus; url?: string; error?: string;
}) {
  const verbs = destVerbs(dest);
  return (
    <div style={{
      flex: "1 1 0", minWidth: 0,
      background: status === "sent" ? "rgba(16,185,129,0.07)" : status === "failed" ? "rgba(248,113,113,0.04)" : "rgba(255,255,255,0.025)",
      border: `1px solid ${status === "sent" ? "rgba(16,185,129,0.28)" : status === "failed" ? "rgba(248,113,113,0.2)" : "rgba(255,255,255,0.07)"}`,
      borderRadius: 10, padding: "10px 12px",
      display: "flex", flexDirection: "column", gap: 5,
      transition: "border-color 0.25s, background 0.25s",
    }}>
      <span style={{ fontSize: 9, fontFamily: "monospace", fontWeight: 800, color: "#475569", textTransform: "uppercase", letterSpacing: "0.1em" }}>
        {icon} {label}
      </span>
      <div style={{ marginTop: "auto" }}>
        {status === "idle" && (
          <span style={{ fontSize: 9, color: "#334155", fontFamily: "monospace" }}>Pending sync</span>
        )}
        {status === "sending" && (
          <span style={{ display: "flex", alignItems: "center", gap: 3, fontSize: 9, color: "#818cf8", fontFamily: "monospace" }}>
            <span className="spinner" style={{ width: 8, height: 8, borderWidth: 1.5 }} />{verbs.saving}
          </span>
        )}
        {status === "sent" && (
          <span style={{ fontSize: 9, color: "#10b981", fontFamily: "monospace", fontWeight: 700 }}>
            ✓ {verbs.saved}{url ? <a href={url} target="_blank" rel="noreferrer" style={{ marginLeft: 4, color: "#475569", textDecoration: "none" }}>↗</a> : null}
          </span>
        )}
        {status === "failed" && (
          <span style={{ fontSize: 9, color: "#f87171", fontFamily: "monospace", display: "flex", flexDirection: "column", gap: 2 }}>
            <span>✕ {verbs.failed}</span>
            {error && <span style={{ color: "#7f1d1d", fontSize: 8, wordBreak: "break-word" }}>{error}</span>}
          </span>
        )}
        {status === "skipped" && (
          <span style={{ fontSize: 9, color: "#334155", fontFamily: "monospace" }}>Informational Only</span>
        )}
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
  const conf     = CONF_COLOR[ins.confidence] ?? CONF_COLOR.Low;
  const actionable = isActionable(ins);
  const allSent  = ins.notionStatus.status === "sent" &&
                   (ins.taskStatus.status === "sent" || ins.taskStatus.status === "skipped");
  const anyIdle  = ins.notionStatus.status === "idle" ||
                   (actionable && ins.taskStatus.status === "idle");

  return (
    <div style={{
      background: allSent ? "rgba(16,185,129,0.035)" : "rgba(255,255,255,0.02)",
      border: `1px solid ${allSent ? "rgba(16,185,129,0.18)" : "rgba(255,255,255,0.07)"}`,
      borderRadius: 12, overflow: "hidden",
      transition: "border-color 0.25s",
    }}>
      {/* ── Header (always visible) ── */}
      <div style={{ padding: "12px 14px 10px", display: "flex", gap: 10, alignItems: "flex-start" }}>
        <div style={{
          flexShrink: 0, width: 22, height: 22, borderRadius: 6,
          background: "rgba(255,255,255,0.05)",
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 10, fontFamily: "monospace", fontWeight: 800, color: "#475569",
        }}>
          {index + 1}
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          {/* Badges */}
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 5, flexWrap: "wrap" }}>
            <span style={{ fontSize: 9, fontFamily: "monospace", fontWeight: 700, padding: "1px 7px", borderRadius: 3, background: conf.bg, color: conf.text }}>
              {ins.confidence}
            </span>
            <span style={{ fontSize: 9, fontFamily: "monospace", fontWeight: 700, padding: "1px 6px", borderRadius: 3, background: `${catColor}18`, color: catColor }}>
              {ins.category}
            </span>
            {actionable && (
              <span style={{ fontSize: 9, fontFamily: "monospace", fontWeight: 700, padding: "1px 6px", borderRadius: 3, background: "rgba(99,102,241,0.1)", color: "#a5b4fc" }}>
                Actionable
              </span>
            )}
          </div>

          {/* Title */}
          <p style={{ fontSize: 13, fontWeight: 700, color: "#f1f5f9", margin: "0 0 8px", lineHeight: 1.35 }}>
            {ins.title}
          </p>

          {/* Why it matters — always visible */}
          <p style={{ fontSize: 11, color: "#64748b", margin: 0, lineHeight: 1.55 }}>
            <span style={{ fontSize: 9, fontFamily: "monospace", fontWeight: 800, color: "#334155", textTransform: "uppercase", letterSpacing: "0.08em", marginRight: 6 }}>
              Why it matters
            </span>
            {ins.why_it_matters}
          </p>
        </div>

        {/* Expand toggle */}
        <button
          onClick={() => setExpanded(p => !p)}
          style={{ flexShrink: 0, background: "none", border: "none", cursor: "pointer", fontSize: 9, color: "#334155", paddingTop: 4 }}
        >
          {expanded ? "▲" : "▼"}
        </button>
      </div>

      {/* ── Expanded: What Was Said ── */}
      {expanded && (
        <div style={{ padding: "0 14px 12px", borderTop: "1px solid rgba(255,255,255,0.04)" }}>
          <p style={{ fontSize: 9, fontFamily: "monospace", fontWeight: 800, color: "#334155", textTransform: "uppercase", letterSpacing: "0.08em", margin: "10px 0 5px" }}>
            What Was Said
          </p>
          <p style={{ fontSize: 12, color: "#94a3b8", margin: "0 0 10px", lineHeight: 1.65 }}>
            {ins.what_was_said}
          </p>

          {actionable && (
            <>
              <p style={{ fontSize: 9, fontFamily: "monospace", fontWeight: 800, color: "#334155", textTransform: "uppercase", letterSpacing: "0.08em", margin: "0 0 5px" }}>
                Suggested Action
              </p>
              <div style={{ background: "rgba(99,102,241,0.06)", border: "1px solid rgba(99,102,241,0.18)", borderRadius: 7, padding: "8px 11px" }}>
                <p style={{ fontSize: 12, fontWeight: 600, color: "#a5b4fc", margin: "0 0 3px" }}>
                  {ins.actionability.task}
                </p>
                <p style={{ fontSize: 11, color: "#64748b", margin: 0, lineHeight: 1.5 }}>
                  {ins.actionability.description}
                </p>
              </div>
            </>
          )}
        </div>
      )}

      {/* ── Created for you ── */}
      <div style={{ borderTop: "1px solid rgba(255,255,255,0.04)", padding: "6px 14px 3px" }}>
        <span style={{ fontSize: 9, fontFamily: "monospace", fontWeight: 800, color: "#1e3a2f", textTransform: "uppercase", letterSpacing: "0.12em" }}>
          Created for you
        </span>
      </div>
      <div style={{ padding: "4px 12px 12px", display: "flex", gap: 7 }}>
        <OutputPill icon="📝" label="Insight Note" dest="Notion"  status={ins.notionStatus.status} url={ins.notionStatus.url} error={ins.notionStatus.error} />
        {actionable
          ? <OutputPill icon="☑"  label="Action Task" dest="Todoist" status={ins.taskStatus.status}   url={ins.taskStatus.url}   error={ins.taskStatus.error} />
          : <div style={{ flex: "1 1 0", display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(255,255,255,0.01)", border: "1px dashed rgba(255,255,255,0.06)", borderRadius: 10, padding: "10px 12px" }}>
              <span style={{ fontSize: 9, color: "#1e293b", fontFamily: "monospace", textAlign: "center" }}>
                Informational Only
              </span>
            </div>
        }
      </div>

      {/* ── Per-card send button (auto-send off) ── */}
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
            Save insight →
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
  const logId  = useRef(0);
  const startT = useRef<number | null>(null);

  function addLog(msg: string, ok?: boolean) {
    setLog(prev => [...prev, { id: logId.current++, ts: clockNow(), msg, ok }]);
  }

  useEffect(() => {
    if (!cachedInsights) return;
    setInsights(cachedInsights.map(ins => ({
      ...ins,
      notionStatus: { status: "idle" },
      taskStatus:   { status: isActionable(ins) ? "idle" : "skipped" },
    })));
    addLog(`${cachedInsights.length} insights extracted`, true);
    if (autoSend) addLog("Auto-Send ON — saving insights...");
  }, [cachedInsights]);

  useEffect(() => {
    if (isOpen && video && !cachedInsights && !loading && !fetched) {
      setFetched(true);
      startT.current = Date.now();
      addLog("Extracting insights...");
      onFetch();
    }
  }, [isOpen, video?.videoId]);

  useEffect(() => {
    if (autoSend && insights.length > 0 && insights.every(i => i.notionStatus.status === "idle") && !sending) {
      void runAutoSend();
    }
  }, [autoSend, insights.length]);

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

  async function runAutoSend(targets?: number[]) {
    if (sending || insights.length === 0) return;
    setSending(true);
    const idxs = targets ?? insights.map((_, i) => i);

    setInsights(prev => prev.map((ins, i) =>
      idxs.includes(i)
        ? {
            ...ins,
            notionStatus: { status: "sending" },
            taskStatus:   isActionable(ins) ? { status: "sending" } : ins.taskStatus,
          }
        : ins
    ));
    addLog("Saving insights...");

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
        results?: { index: number; notionStatus: OutputStatus; taskStatus: OutputStatus }[];
      };

      if (data.results) {
        const updates: Record<number, { notionStatus: OutputStatus; taskStatus: OutputStatus }> = {};
        data.results.forEach(r => {
          const realIdx = idxs[r.index] ?? r.index;
          updates[realIdx] = { notionStatus: r.notionStatus, taskStatus: r.taskStatus };
          const insightTitle = insights[realIdx]?.title ?? `Insight ${realIdx + 1}`;
          if (r.notionStatus.status === "sent")
            addLog(`Notion ✓ "${insightTitle}"${r.notionStatus.url ? ` → ${r.notionStatus.url}` : ""}`, true);
          if (r.taskStatus.status === "sent")
            addLog(`Todoist ✓ "${insightTitle}"`, true);
          if (r.notionStatus.status === "failed")
            addLog(`Notion ✕ "${insightTitle}": ${r.notionStatus.error ?? "unknown error"}`, false);
          if (r.taskStatus.status === "failed")
            addLog(`Todoist ✕ "${insightTitle}": ${r.taskStatus.error ?? "unknown error"}`, false);
          if (r.notionStatus.status === "skipped")
            addLog(`Notion skipped: ${r.notionStatus.error ?? "not configured"}`);
        });
        setInsights(prev => prev.map((ins, i) => updates[i] ? { ...ins, ...updates[i] } : ins));
        if (startT.current) setElapsed((Date.now() - startT.current) / 1000);
      }
    } catch (e) {
      // Pipeline-level failure (network error, auth, etc.) — Notion/Todoist were never called.
      // Reset to idle so UI shows "Pending sync" rather than false "X sync failed".
      const msg = e instanceof Error ? e.message : "Unknown error";
      setInsights(prev => prev.map((ins, i) =>
        idxs.includes(i) ? {
          ...ins,
          notionStatus: ins.notionStatus.status === "sending" ? { status: "idle" } : ins.notionStatus,
          taskStatus:   ins.taskStatus.status   === "sending" ? { status: isActionable(ins) ? "idle" : "skipped" } : ins.taskStatus,
        } : ins
      ));
      addLog(`Pipeline error (no sync attempted): ${msg}`, false);
    } finally {
      setSending(false);
    }
  }

  if (!isOpen || !video) return null;

  const allSent     = insights.length > 0 && insights.every(i =>
    i.notionStatus.status === "sent" &&
    (i.taskStatus.status === "sent" || i.taskStatus.status === "skipped")
  );
  const sentNotion  = insights.filter(i => i.notionStatus.status === "sent").length;
  const sentTasks   = insights.filter(i => i.taskStatus.status   === "sent").length;
  const totalAssets = sentNotion + sentTasks;
  const anySending  = insights.some(i => i.notionStatus.status === "sending" || i.taskStatus.status === "sending");
  const anyIdle     = insights.some(i => i.notionStatus.status === "idle");

  return (
    <>
      <div className="fluff-drawer__overlay" onClick={onClose} />
      <div className="fluff-drawer">

        {/* ── Header ── */}
        <div className="fluff-drawer__header">
          <div>
            <span className="fluff-drawer__label" style={{ textTransform: "uppercase", letterSpacing: "0.1em", fontSize: 9, color: "#475569" }}>
              {videoType ?? "Key Insights"}
            </span>
            <h2 className="fluff-drawer__channel">{video.channelTitle}</h2>
          </div>
          <button onClick={onClose} className="fluff-drawer__close">✕</button>
        </div>

        <div className="fluff-drawer__body" style={{ padding: 0 }}>

          {/* ── Video title ── */}
          <div style={{ padding: "4px 16px 12px", borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
            <p style={{ fontSize: 11, color: "#475569", margin: 0, fontFamily: "monospace", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {video.title}
            </p>
          </div>

          {/* ── Auto-Send toggle ── */}
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
                  {autoSend ? "Notes → Notion · Tasks → Todoist (when speaker recommends)" : "Click to auto-route insights"}
                </div>
              </div>
              {autoSend && anySending && <div className="spinner" style={{ width: 12, height: 12, borderWidth: 1.5 }} />}
            </div>
          </div>

          {/* ── Execution Complete banner ── */}
          {allSent && (
            <div style={{
              margin: "12px 14px", padding: "14px 16px",
              background: "linear-gradient(135deg, rgba(16,185,129,0.09), rgba(16,185,129,0.03))",
              border: "1px solid rgba(16,185,129,0.3)", borderRadius: 12,
            }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                <span style={{ fontSize: 12, fontFamily: "monospace", fontWeight: 800, color: "#10b981" }}>
                  ⚡ SAVED TO WORKSPACE
                </span>
                {elapsed !== null && (
                  <span style={{ fontSize: 9, color: "#334155", fontFamily: "monospace" }}>{elapsed.toFixed(1)}s</span>
                )}
              </div>
              <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
                <span style={{ fontSize: 10, color: "#6ee7b7", fontFamily: "monospace" }}>✓ {sentNotion} Notes → Notion</span>
                {sentTasks > 0 && <span style={{ fontSize: 10, color: "#a5b4fc", fontFamily: "monospace" }}>✓ {sentTasks} Tasks → Todoist</span>}
              </div>
              <div style={{ fontSize: 9, color: "#334155", fontFamily: "monospace", marginTop: 5 }}>
                {totalAssets} assets saved · {insights.filter(i => isActionable(i)).length} actionable insights
              </div>
            </div>
          )}

          {/* ── Loading ── */}
          {loading && (
            <div style={{ padding: "20px 16px", display: "flex", alignItems: "center", gap: 12 }}>
              <span className="spinner" style={{ width: 14, height: 14, borderWidth: 2 }} />
              <div>
                <div style={{ fontSize: 12, color: "#818cf8", fontFamily: "monospace", fontWeight: 700 }}>
                  Extracting insights...
                </div>
                <div style={{ fontSize: 10, color: "#334155", fontFamily: "monospace", marginTop: 2 }}>
                  Reading transcript · Classifying video
                </div>
              </div>
            </div>
          )}

          {/* ── Error ── */}
          {error && (
            <div style={{ margin: "12px 14px", padding: "10px 14px", background: "rgba(248,113,113,0.06)", border: "1px solid rgba(248,113,113,0.2)", borderRadius: 8 }}>
              <span style={{ fontSize: 11, color: "#f87171", fontFamily: "monospace" }}>{error}</span>
            </div>
          )}

          {/* ── Insights ── */}
          {!loading && insights.length > 0 && (
            <div>
              {!allSent && (
                <div style={{ padding: "8px 16px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <span style={{ fontSize: 9, fontFamily: "monospace", fontWeight: 800, color: "#334155", textTransform: "uppercase", letterSpacing: "0.1em" }}>
                    {insights.length} Insights
                    {totalAssets > 0 && <span style={{ color: "#10b981", marginLeft: 8 }}>· {totalAssets} saved</span>}
                  </span>
                  {!autoSend && anyIdle && !sending && (
                    <button
                      onClick={() => void runAutoSend()}
                      style={{
                        fontSize: 10, fontFamily: "monospace", fontWeight: 800,
                        color: "#818cf8", background: "rgba(99,102,241,0.1)",
                        border: "1px solid rgba(99,102,241,0.25)",
                        borderRadius: 6, padding: "3px 10px", cursor: "pointer",
                      }}
                    >
                      ⚡ Save all
                    </button>
                  )}
                </div>
              )}
              <div style={{ padding: "0 12px 12px", display: "flex", flexDirection: "column", gap: 8 }}>
                {insights.map((ins, i) => (
                  <InsightCard
                    key={i}
                    ins={ins}
                    index={i}
                    autoSend={autoSend}
                    sending={sending}
                    onSend={() => void runAutoSend([i])}
                  />
                ))}
              </div>
            </div>
          )}

          {/* ── Activity Log ── */}
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
                      <span style={{ fontSize: 10, fontFamily: "monospace", color: e.ok === true ? "#10b981" : e.ok === false ? "#f87171" : "#475569" }}>
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
