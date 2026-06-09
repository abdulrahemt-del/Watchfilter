"use client";

import { useEffect, useState } from "react";
import type { FeedVideo } from "@/app/api/youtube/feed/route";

export type ActionType = "TASK" | "NOTE" | "CONTENT" | "REMINDER" | "LEARNING";
export type Confidence = "low" | "medium" | "high";
export type SendStatus = "idle" | "sending" | "sent" | "failed" | "skipped";

export interface ActionCard {
  insight: string;
  action_type: ActionType;
  action_title: string;
  rationale: string;
  confidence: Confidence;
}

interface ActionState extends ActionCard {
  sendStatus: SendStatus;
  destination?: string;
  url?: string;
  error?: string;
}

const TYPE_BG: Record<ActionType, string> = {
  TASK:     "rgba(99,102,241,0.15)",
  NOTE:     "rgba(34,211,238,0.10)",
  CONTENT:  "rgba(52,211,153,0.10)",
  REMINDER: "rgba(251,191,36,0.12)",
  LEARNING: "rgba(168,85,247,0.12)",
};

const TYPE_COLOR: Record<ActionType, string> = {
  TASK:     "#a5b4fc",
  NOTE:     "#67e8f9",
  CONTENT:  "#6ee7b7",
  REMINDER: "#fde68a",
  LEARNING: "#d8b4fe",
};

const CONF_COLOR: Record<Confidence, string> = {
  high:   "#34d399",
  medium: "#fbbf24",
  low:    "#94a3b8",
};

const DEST_LABEL: Record<string, string> = {
  notion:   "→ Notion",
  todoist:  "→ Todoist",
  calendar: "→ Calendar",
};

interface Props {
  isOpen: boolean;
  video: FeedVideo | null;
  cachedActions: ActionCard[] | null;
  loading: boolean;
  error: string | null;
  onClose: () => void;
  onFetch: () => void;
}

export function ActionsDrawer({ isOpen, video, cachedActions, loading, error, onClose, onFetch }: Props) {
  const [fetched, setFetched]         = useState(false);
  const [autoSend, setAutoSend]       = useState(() => {
    try { return localStorage.getItem("wf_auto_send") === "true"; } catch { return false; }
  });
  const [actionStates, setActionStates] = useState<ActionState[]>([]);
  const [sending, setSending]           = useState(false);

  // Sync actionStates when cachedActions changes
  useEffect(() => {
    if (cachedActions) {
      setActionStates(cachedActions.map(a => ({ ...a, sendStatus: "idle" })));
    }
  }, [cachedActions]);

  // Fetch on open
  useEffect(() => {
    if (isOpen && video && !cachedActions && !loading && !fetched) {
      setFetched(true);
      onFetch();
    }
  }, [isOpen, video?.videoId]);

  // Auto-send when actions load + toggle is ON
  useEffect(() => {
    if (autoSend && actionStates.length > 0 && actionStates.every(a => a.sendStatus === "idle") && !sending) {
      void runAutoSend(actionStates);
    }
  }, [autoSend, actionStates.length]);

  // Reset per video
  useEffect(() => {
    setFetched(false);
    setActionStates([]);
  }, [video?.videoId]);

  function toggleAutoSend() {
    const next = !autoSend;
    setAutoSend(next);
    try { localStorage.setItem("wf_auto_send", String(next)); } catch { /* ignore */ }
  }

  async function runAutoSend(actions: ActionState[]) {
    if (sending) return;
    setSending(true);
    setActionStates(prev => prev.map(a => ({
      ...a,
      sendStatus: a.confidence === "low" ? "skipped" : "sending",
    })));

    try {
      const res  = await fetch("/api/youtube/auto-send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          actions,
          videoTitle:   video?.title,
          channelTitle: video?.channelTitle,
        }),
      });
      const data = await res.json() as {
        results?: { type: string; label: string; status: string; destination?: string; url?: string; error?: string }[];
      };

      if (data.results) {
        // Map results back: tasks match by label, brief marks all non-TASK as sent
        setActionStates(prev => prev.map(a => {
          if (a.confidence === "low") return { ...a, sendStatus: "skipped" };
          if (a.action_type === "TASK") {
            const r = data.results!.find(r => r.type === "task" && r.label === a.action_title);
            if (r) return { ...a, sendStatus: r.status as SendStatus, destination: r.destination, url: r.url, error: r.error };
          } else {
            const brief = data.results!.find(r => r.type === "brief");
            if (brief) return { ...a, sendStatus: brief.status as SendStatus, destination: "Notion", url: brief.url, error: brief.error };
          }
          return a;
        }));
      }
    } catch {
      setActionStates(prev => prev.map(a => ({ ...a, sendStatus: a.sendStatus === "sending" ? "failed" : a.sendStatus })));
    } finally {
      setSending(false);
    }
  }

  async function sendOne(action: ActionState) {
    setActionStates(prev => prev.map(a => a.action_title === action.action_title ? { ...a, sendStatus: "sending" } : a));
    try {
      const res  = await fetch("/api/youtube/auto-send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          actions: [action],
          videoTitle:   video?.title,
          channelTitle: video?.channelTitle,
        }),
      });
      const data = await res.json() as {
        results?: { type: string; label: string; status: string; destination?: string; url?: string; error?: string }[];
      };
      const r = data.results?.[0];
      setActionStates(prev => prev.map(a =>
        a.action_title === action.action_title
          ? { ...a, sendStatus: (r?.status ?? "failed") as SendStatus, destination: r?.destination, url: r?.url, error: r?.error }
          : a
      ));
    } catch {
      setActionStates(prev => prev.map(a => a.action_title === action.action_title ? { ...a, sendStatus: "failed" } : a));
    }
  }

  if (!isOpen || !video) return null;

  const sentCount = actionStates.filter(a => a.sendStatus === "sent").length;

  return (
    <>
      <div className="fluff-drawer__overlay" onClick={onClose} />
      <div className="fluff-drawer">
        <div className="fluff-drawer__header">
          <div>
            <span className="fluff-drawer__label">⚡ Action Layer</span>
            <h2 className="fluff-drawer__channel">{video.channelTitle}</h2>
          </div>
          <button onClick={onClose} className="fluff-drawer__close">✕ Close</button>
        </div>

        <div className="fluff-drawer__body">
          <p style={{ fontSize: "11px", color: "#64748b", fontFamily: "monospace", marginBottom: "1rem", lineHeight: 1.5 }}>
            {video.title}
          </p>

          {/* Auto-Send Toggle */}
          <div
            onClick={toggleAutoSend}
            style={{
              display: "flex", alignItems: "center", gap: "0.6rem",
              padding: "0.6rem 0.75rem", borderRadius: "8px", marginBottom: "1rem",
              cursor: "pointer", userSelect: "none",
              background: autoSend ? "rgba(52,211,153,0.08)" : "rgba(255,255,255,0.03)",
              border: `1px solid ${autoSend ? "rgba(52,211,153,0.3)" : "rgba(255,255,255,0.07)"}`,
            }}
          >
            <div style={{
              width: 32, height: 18, borderRadius: 9, position: "relative", flexShrink: 0,
              background: autoSend ? "#34d399" : "#334155", transition: "background 0.2s",
            }}>
              <div style={{
                position: "absolute", top: 2, left: autoSend ? 16 : 2,
                width: 14, height: 14, borderRadius: "50%", background: "#fff",
                transition: "left 0.2s",
              }} />
            </div>
            <span style={{ fontSize: "11px", fontFamily: "monospace", fontWeight: 700, color: autoSend ? "#34d399" : "#64748b" }}>
              AUTO-SEND {autoSend ? "ON" : "OFF"}
            </span>
            {autoSend && (
              <span style={{ fontSize: "10px", color: "#475569", fontFamily: "monospace", marginLeft: "auto" }}>
                routes to Notion &amp; Todoist automatically
              </span>
            )}
          </div>

          {loading && (
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", color: "#818cf8", fontSize: "13px", fontFamily: "monospace" }}>
              <span className="spinner" /> Fetching transcript &amp; extracting actions…
            </div>
          )}

          {error && (
            <div style={{ color: "#f87171", fontSize: "12px", fontFamily: "monospace", padding: "0.75rem", background: "rgba(248,113,113,0.08)", borderRadius: "8px", border: "1px solid rgba(248,113,113,0.2)" }}>
              {error}
            </div>
          )}

          {!loading && actionStates.length > 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "0.25rem" }}>
                <p style={{ fontSize: "10px", color: "#475569", fontFamily: "monospace", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", margin: 0 }}>
                  {actionStates.length} action{actionStates.length !== 1 ? "s" : ""}
                  {sentCount > 0 && <span style={{ color: "#34d399", marginLeft: "0.5rem" }}>· {sentCount} sent</span>}
                </p>
                {!autoSend && actionStates.some(a => a.sendStatus === "idle") && (
                  <button
                    onClick={() => void runAutoSend(actionStates)}
                    style={{ fontSize: "10px", fontFamily: "monospace", fontWeight: 700, color: "#a5b4fc", background: "rgba(99,102,241,0.12)", border: "1px solid rgba(99,102,241,0.3)", borderRadius: "5px", padding: "2px 8px", cursor: "pointer" }}
                  >
                    Send all
                  </button>
                )}
              </div>

              {actionStates.map((action, i) => (
                <div key={i} style={{
                  background: action.sendStatus === "sent" ? "rgba(52,211,153,0.05)" : "rgba(255,255,255,0.03)",
                  border: `1px solid ${action.sendStatus === "sent" ? "rgba(52,211,153,0.2)" : "rgba(255,255,255,0.07)"}`,
                  borderRadius: "10px", padding: "0.875rem 1rem",
                  display: "flex", flexDirection: "column", gap: "0.375rem",
                }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "0.5rem" }}>
                    <span style={{ fontSize: "10px", fontFamily: "monospace", fontWeight: 700, padding: "2px 8px", borderRadius: "4px", background: TYPE_BG[action.action_type], color: TYPE_COLOR[action.action_type] }}>
                      {action.action_type}
                    </span>
                    <span style={{ fontSize: "10px", fontFamily: "monospace", color: CONF_COLOR[action.confidence] }}>
                      {action.confidence}
                    </span>
                  </div>

                  <p style={{ fontSize: "13px", fontWeight: 600, color: "#f1f5f9", margin: 0, lineHeight: 1.4 }}>
                    {action.action_title}
                  </p>
                  <p style={{ fontSize: "11px", color: "#94a3b8", margin: 0, lineHeight: 1.55 }}>{action.insight}</p>
                  <p style={{ fontSize: "10px", color: "#64748b", fontStyle: "italic", margin: 0 }}>{action.rationale}</p>

                  {/* Status row */}
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: "0.25rem", paddingTop: "0.375rem", borderTop: "1px solid rgba(255,255,255,0.05)" }}>
                    {action.sendStatus === "idle" && !autoSend && (
                      <button
                        onClick={() => void sendOne(action)}
                        style={{ fontSize: "10px", fontFamily: "monospace", color: TYPE_COLOR[action.action_type], background: TYPE_BG[action.action_type], border: "none", borderRadius: "4px", padding: "2px 8px", cursor: "pointer" }}
                      >
                        {DEST_LABEL[action.action_type === "TASK" ? "todoist" : "notion"] ?? "→ Send"}
                      </button>
                    )}
                    {action.sendStatus === "sending" && (
                      <span style={{ fontSize: "10px", fontFamily: "monospace", color: "#818cf8", display: "flex", alignItems: "center", gap: "4px" }}>
                        <span className="spinner" style={{ width: 10, height: 10, borderWidth: 1.5 }} /> Sending…
                      </span>
                    )}
                    {action.sendStatus === "sent" && (
                      <span style={{ fontSize: "10px", fontFamily: "monospace", color: "#34d399" }}>
                        ✓ Sent to {action.destination}
                        {action.url && <a href={action.url} target="_blank" rel="noreferrer" style={{ marginLeft: "0.4rem", color: "#64748b", textDecoration: "underline" }}>↗</a>}
                      </span>
                    )}
                    {action.sendStatus === "failed" && (
                      <span style={{ fontSize: "10px", fontFamily: "monospace", color: "#f87171" }} title={action.error}>
                        ✗ Failed{action.error ? ` — ${action.error.slice(0, 40)}` : ""}
                      </span>
                    )}
                    {action.sendStatus === "skipped" && (
                      <span style={{ fontSize: "10px", fontFamily: "monospace", color: "#475569" }}>— Skipped (low confidence)</span>
                    )}
                    {action.sendStatus === "idle" && autoSend && (
                      <span style={{ fontSize: "10px", fontFamily: "monospace", color: "#475569" }}>Queued…</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
