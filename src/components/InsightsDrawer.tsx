"use client";

import { useEffect, useRef, useState } from "react";
import type { FeedVideo } from "@/app/api/youtube/feed/route";
import type { Insight, InsightTask, VideoType, ActionType, ImpactArea } from "@/app/api/youtube/insights/route";
import type { OutputStatus } from "@/app/api/youtube/auto-send/route";

type SendStatus = "idle" | "sending" | "sent" | "failed" | "skipped";

interface UIStatus { status: SendStatus; url?: string; error?: string; }

interface InsightState extends Insight {
  noteStatus:     UIStatus;
  taskStatus:     UIStatus;
  contentStatus:  UIStatus;
  decisionStatus: UIStatus;
}

interface LogEntry { id: number; ts: string; msg: string; ok?: boolean; }

function clientCharScan(str: string): Array<{ i: number; code: number }> {
  const hits: Array<{ i: number; code: number }> = [];
  for (let i = 0; i < str.length; i++) {
    const c = str.charCodeAt(i);
    if (c > 127 || c === 0) hits.push({ i, code: c });
  }
  return hits;
}

function clientSanitize(str: string): string {
  return str.replace(/﻿/g, "").replace(/​/g, "").replace(/‌/g, "").replace(/‍/g, "").replace(/[^\x20-\x7E\n\r\t]/g, "").trim();
}

function DebugPanel({ label, raw }: { label: string; raw: string }) {
  const sanitized = clientSanitize(raw);
  const hits      = clientCharScan(raw);
  const [open, setOpen] = useState(false);
  if (!raw) return null;
  return (
    <div style={{ marginTop: 6, borderTop: "1px solid rgba(248,113,113,0.15)", paddingTop: 6 }}>
      <button onClick={() => setOpen(p => !p)} style={{ fontSize: 8, fontFamily: "monospace", color: "#7f1d1d", background: "none", border: "none", cursor: "pointer", padding: 0 }}>
        {open ? "▲" : "▼"} Debug: {label}
      </button>
      {open && (
        <div style={{ marginTop: 4, display: "flex", flexDirection: "column", gap: 4 }}>
          <div style={{ fontSize: 8, fontFamily: "monospace", color: "#ef4444", wordBreak: "break-all" }}>{JSON.stringify(raw)}</div>
          <div style={{ fontSize: 8, fontFamily: "monospace", color: "#1e293b", wordBreak: "break-all" }}>sanitized: {JSON.stringify(sanitized)}</div>
          {hits.length > 0
            ? <div style={{ fontSize: 8, fontFamily: "monospace", color: "#ef4444" }}>Suspicious: {hits.slice(0, 5).map(h => `i=${h.i} code=${h.code}`).join(", ")}</div>
            : <div style={{ fontSize: 8, fontFamily: "monospace", color: "#10b981" }}>No suspicious chars</div>
          }
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

const SCORE_LABEL: Record<number, string> = {
  0: "Informational", 1: "Observation", 2: "Interesting fact",
  3: "Strategic implication", 4: "Decision recommended", 5: "Decision strongly recommended",
  6: "Action implied", 7: "Action recommended", 8: "High-value task", 9: "High-priority task", 10: "Immediate action",
};

// VideoType / ImpactArea used via imported types only — suppress lint
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _Unused = VideoType | ImpactArea;

function clockNow() { return new Date().toLocaleTimeString("en-US", { hour12: false }); }
function toUIStatus(s: OutputStatus): UIStatus { return { status: s.status as SendStatus, url: s.url, error: s.error }; }

function ConfidencePill({ value, size = 11 }: { value: number; size?: number }) {
  const color = value >= 85 ? "#10b981" : value >= 70 ? "#f59e0b" : "#94a3b8";
  return (
    <span style={{ fontSize: size, fontFamily: "monospace", fontWeight: 700, color, background: `${color}18`, padding: "1px 6px", borderRadius: 4 }}>
      {value}% conf
    </span>
  );
}

// ── Asset row ──────────────────────────────────────────────────────────────────

function AssetRow({ icon, label, title, subtitle, status, url, error, debugFields, children }: {
  icon: string; label: string; title: string; subtitle?: string;
  status: SendStatus; url?: string; error?: string;
  debugFields?: Record<string, string>;
  children?: React.ReactNode;
}) {
  const isSent    = status === "sent";
  const isFailed  = status === "failed";
  const isSkipped = status === "skipped";
  const isSending = status === "sending";
  const isIdle    = status === "idle";

  const borderColor = isSent ? "rgba(16,185,129,0.3)" : isFailed ? "rgba(248,113,113,0.25)" : "rgba(0,0,0,0.08)";
  const bgColor     = isSent ? "rgba(16,185,129,0.04)" : isFailed ? "rgba(248,113,113,0.03)" : "rgba(0,0,0,0.02)";

  return (
    <div style={{ border: `1px solid ${borderColor}`, background: bgColor, borderRadius: 9, padding: "10px 14px", display: "flex", alignItems: "flex-start", gap: 10, transition: "border-color 0.3s" }}>
      <span style={{ fontSize: 15, flexShrink: 0, lineHeight: 1.4 }}>{icon}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 11, fontFamily: "monospace", fontWeight: 800, color: "#475569", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 3 }}>
          {label}
        </div>
        {title && (
          <div style={{ fontSize: 14, fontWeight: 600, color: "#0f172a", marginBottom: 4, lineHeight: 1.4 }}>
            {title}
          </div>
        )}
        {subtitle && (
          <div style={{ fontSize: 12, color: "#374151", marginBottom: 5, lineHeight: 1.55, fontStyle: "italic" }}>
            {subtitle}
          </div>
        )}
        {children}
        <div style={{ marginTop: 5 }}>
          {isIdle    && <span style={{ fontSize: 11, color: "#94a3b8", fontFamily: "monospace" }}>Pending sync</span>}
          {isSending && <span style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11, color: "#818cf8", fontFamily: "monospace" }}><span className="spinner" style={{ width: 7, height: 7, borderWidth: 1.5 }} />Saving…</span>}
          {isSent && (
            <span style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11, color: "#10b981", fontFamily: "monospace", fontWeight: 700 }}>
              ✓ Delivered
              {url && <a href={url} target="_blank" rel="noreferrer" style={{ color: "#64748b", textDecoration: "none", marginLeft: 2 }}>↗</a>}
            </span>
          )}
          {isFailed && (
            <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
              <span style={{ fontSize: 11, color: "#f87171", fontFamily: "monospace" }}>✕ Sync failed</span>
              {error && <span style={{ fontSize: 8, color: "#7f1d1d", fontFamily: "monospace", wordBreak: "break-word" }}>{error}</span>}
              {debugFields && Object.entries(debugFields).map(([k, v]) => <DebugPanel key={k} label={k} raw={v} />)}
            </div>
          )}
          {isSkipped && (
            <span style={{ fontSize: 11, color: "#94a3b8", fontFamily: "monospace" }}>
              {error?.includes("below threshold") || error?.includes("Informational")
                ? "Not applicable"
                : error?.includes("not configured") ? "Not configured"
                : "Skipped"}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

// ── "Did we miss?" panel ───────────────────────────────────────────────────────

function MissedActionPanel({ ins, onAlternativeTask }: {
  ins: InsightState;
  onAlternativeTask: (task: InsightTask) => void;
}) {
  const [state, setState] = useState<"idle" | "loading" | "done" | "positive">("idle");
  const [altTask, setAltTask] = useState<InsightTask | null>(null);

  async function generateAlternative() {
    setState("loading");
    try {
      const res = await fetch("/api/youtube/insights/regenerate-task", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ insight: ins, currentTaskTitle: ins.assets.task?.title ?? "" }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json() as { task?: InsightTask };
      if (data.task) {
        setAltTask(data.task);
        setState("done");
        onAlternativeTask(data.task);
      } else {
        setState("idle");
      }
    } catch {
      setState("idle");
    }
  }

  if (state === "positive") {
    return <div style={{ fontSize: 11, fontFamily: "monospace", color: "#10b981" }}>✓ Good to go</div>;
  }

  return (
    <div style={{ padding: "8px 12px", background: "rgba(0,0,0,0.02)", borderRadius: 7, border: "1px solid rgba(0,0,0,0.06)" }}>
      {state === "idle" && (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
          <span style={{ fontSize: 12, color: "#6b7280", fontFamily: "monospace" }}>Did we miss a useful action?</span>
          <div style={{ display: "flex", gap: 6 }}>
            <button onClick={generateAlternative} style={{ fontSize: 11, fontFamily: "monospace", fontWeight: 700, color: "#818cf8", background: "rgba(99,102,241,0.08)", border: "1px solid rgba(99,102,241,0.2)", borderRadius: 5, padding: "3px 10px", cursor: "pointer" }}>
              Generate another task
            </button>
            <button onClick={() => setState("positive")} style={{ fontSize: 11, fontFamily: "monospace", color: "#6b7280", background: "none", border: "1px solid rgba(0,0,0,0.12)", borderRadius: 5, padding: "3px 10px", cursor: "pointer" }}>
              Looks good
            </button>
          </div>
        </div>
      )}
      {state === "loading" && (
        <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "#818cf8", fontFamily: "monospace" }}>
          <span className="spinner" style={{ width: 8, height: 8, borderWidth: 1.5 }} />
          Generating alternative task…
        </div>
      )}
      {state === "done" && altTask && (
        <div>
          <div style={{ fontSize: 11, fontFamily: "monospace", fontWeight: 800, color: "#818cf8", marginBottom: 5 }}>Alternative task:</div>
          <div style={{ fontSize: 13, fontWeight: 600, color: "#0f172a", marginBottom: 4, lineHeight: 1.4 }}>{altTask.title}</div>
          {altTask.description && (
            <div style={{ fontSize: 12, color: "#374151", marginBottom: 6, lineHeight: 1.5 }}>{altTask.description}</div>
          )}
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <ConfidencePill value={altTask.confidence ?? 70} />
            <button onClick={generateAlternative} style={{ fontSize: 11, fontFamily: "monospace", color: "#6b7280", background: "none", border: "none", cursor: "pointer", textDecoration: "underline", padding: 0 }}>
              Try another
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Insight card ───────────────────────────────────────────────────────────────

function InsightCard({ ins, index, autoSend, sending, onSend, onGenerateTask }: {
  ins:      InsightState;
  index:    number;
  autoSend: boolean;
  sending:  boolean;
  onSend:   () => void;
  onGenerateTask: (task: InsightTask) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const catColor    = CAT_COLOR[ins.category] ?? "#94a3b8";
  const taskSent    = ins.taskStatus.status === "sent";
  const taskSkipped = ins.taskStatus.status === "skipped";

  const noteD     = ins.noteStatus.status;
  const taskD     = ins.taskStatus.status;
  const contentD  = ins.contentStatus.status;
  const decisionD = ins.decisionStatus.status;

  const delivered  = [noteD, taskD, contentD, decisionD].filter(s => s === "sent" || s === "skipped").length;
  const allDone    = delivered === 4;
  const anyIdle    = [noteD, taskD, contentD, decisionD].some(s => s === "idle");
  const actConf    = ins.action_confidence ?? 0;

  const actionType  = ins.action_type ?? "no_action";
  const impactArea  = ins.impact_area ?? "none";

  const ACTION_TYPE_META: Record<ActionType, { label: string; color: string; bg: string }> = {
    inferred_action: { label: "INFERRED ACTION",  color: "#f59e0b", bg: "rgba(245,158,11,0.08)" },
    strategic_move:  { label: "STRATEGIC MOVE",   color: "#818cf8", bg: "rgba(129,140,248,0.08)" },
    no_action:       { label: "INFORMATIONAL",    color: "#94a3b8", bg: "rgba(0,0,0,0.03)" },
  };
  const IMPACT_COLOR: Record<string, string> = {
    revenue: "#10b981", growth: "#6ee7b7", product: "#93c5fd",
    efficiency: "#fde68a", strategy: "#a5b4fc", none: "#94a3b8",
  };
  const EFFORT_COLOR: Record<string, string> = { low: "#10b981", medium: "#f59e0b", high: "#f87171" };
  const HORIZON_COLOR: Record<string, string> = { immediate: "#f87171", "short-term": "#f59e0b", "long-term": "#818cf8" };

  const atMeta = ACTION_TYPE_META[actionType];

  return (
    <div style={{
      background: allDone ? "rgba(16,185,129,0.02)" : "#fff",
      border: `1px solid ${allDone ? "rgba(16,185,129,0.2)" : "rgba(0,0,0,0.1)"}`,
      borderRadius: 12, overflow: "hidden", transition: "border-color 0.3s",
      boxShadow: "0 1px 4px rgba(0,0,0,0.06)",
    }}>

      {/* Header */}
      <div style={{ padding: "14px 16px 12px", display: "flex", gap: 12, alignItems: "flex-start" }}>
        <div style={{
          flexShrink: 0, width: 24, height: 24, borderRadius: 6,
          background: allDone ? "rgba(16,185,129,0.12)" : "rgba(0,0,0,0.05)",
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 12, fontFamily: "monospace", fontWeight: 800,
          color: allDone ? "#10b981" : "#64748b",
        }}>
          {allDone ? "✓" : index + 1}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 5, marginBottom: 6, flexWrap: "wrap" }}>
            <span style={{ fontSize: 11, fontFamily: "monospace", fontWeight: 700, padding: "2px 7px", borderRadius: 4, background: `${catColor}20`, color: catColor }}>
              {ins.category}
            </span>
            {impactArea !== "none" && (
              <span style={{ fontSize: 11, fontFamily: "monospace", fontWeight: 700, padding: "2px 7px", borderRadius: 4, background: `${IMPACT_COLOR[impactArea]}20`, color: IMPACT_COLOR[impactArea] }}>
                {impactArea}
              </span>
            )}
            <span style={{ fontSize: 11, fontFamily: "monospace", fontWeight: 800, padding: "2px 7px", borderRadius: 4, background: atMeta.bg, color: atMeta.color }}>
              {atMeta.label}
            </span>
            <span style={{ fontSize: 11, color: "#94a3b8", fontFamily: "monospace" }}>rel {ins.relevance_score}/10</span>
          </div>
          <p style={{ fontSize: 15, fontWeight: 700, color: "#0f172a", margin: "0 0 7px", lineHeight: 1.35 }}>{ins.title}</p>
          <p style={{ fontSize: 13, color: "#374151", margin: 0, lineHeight: 1.6 }}>{ins.why_it_matters}</p>
        </div>
        <button onClick={() => setExpanded(p => !p)} style={{ flexShrink: 0, background: "none", border: "none", cursor: "pointer", fontSize: 11, color: "#94a3b8", paddingTop: 4 }}>
          {expanded ? "▲" : "▼"}
        </button>
      </div>

      {/* Expanded detail */}
      {expanded && (
        <div style={{ padding: "0 16px 14px", borderTop: "1px solid rgba(0,0,0,0.05)" }}>
          <p style={{ fontSize: 11, fontFamily: "monospace", fontWeight: 800, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.08em", margin: "12px 0 5px" }}>What Was Said</p>
          <p style={{ fontSize: 13, color: "#374151", margin: 0, lineHeight: 1.7 }}>{ins.what_was_discussed}</p>
          {ins.key_quote && (
            <blockquote style={{ margin: "10px 0 0", padding: "8px 12px", borderLeft: "3px solid #e5e7eb", color: "#6b7280", fontSize: 13, fontStyle: "italic", lineHeight: 1.6 }}>
              "{ins.key_quote}"
            </blockquote>
          )}
          {ins.supporting_points?.length > 0 && (
            <>
              <p style={{ fontSize: 11, fontFamily: "monospace", fontWeight: 800, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.08em", margin: "12px 0 5px" }}>Supporting Evidence</p>
              <ul style={{ margin: 0, paddingLeft: 18, display: "flex", flexDirection: "column", gap: 4 }}>
                {ins.supporting_points.map((pt, i) => (
                  <li key={i} style={{ fontSize: 13, color: "#374151", lineHeight: 1.55 }}>{pt}</li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}

      {/* Action Assessment */}
      <div style={{ margin: "0 16px 12px", padding: "10px 14px", background: atMeta.bg, borderRadius: 8, border: `1px solid ${atMeta.color}25` }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 5, flexWrap: "wrap", gap: 4 }}>
          <span style={{ fontSize: 11, fontFamily: "monospace", fontWeight: 800, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.08em" }}>Action Potential</span>
          {actConf > 0 && <ConfidencePill value={actConf * 10} />}
        </div>
        <p style={{ fontSize: 12, color: "#374151", margin: "0 0 6px", lineHeight: 1.55 }}>{ins.action_description || ins.actionability_reason}</p>
        <div style={{ display: "flex", gap: 10, fontSize: 11, fontFamily: "monospace", flexWrap: "wrap" }}>
          <span style={{ color: noteD === "sent" ? "#10b981" : "#94a3b8" }}>{noteD === "sent" ? "✓" : "·"} Note (always)</span>
          <span style={{ color: taskD === "sent" ? "#10b981" : "#94a3b8" }}>
            {taskD === "sent" ? "✓" : actionType === "inferred_action" ? "·" : "—"}
            {" "}Task {actionType === "inferred_action" ? "(inferred action)" : "(not applicable)"}
          </span>
          <span style={{ color: decisionD === "sent" ? "#10b981" : "#94a3b8" }}>
            {decisionD === "sent" ? "✓" : actionType === "strategic_move" ? "·" : "—"}
            {" "}Decision {actionType === "strategic_move" ? "(strategic move)" : "(not applicable)"}
          </span>
        </div>
      </div>

      {/* Assets */}
      <div style={{ borderTop: "1px solid rgba(0,0,0,0.05)", padding: "8px 16px 4px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span style={{ fontSize: 11, fontFamily: "monospace", fontWeight: 800, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.1em" }}>Assets Created</span>
        {allDone && (
          <span style={{ fontSize: 11, fontFamily: "monospace", color: "#10b981", fontWeight: 700 }}>
            {[noteD, taskD, contentD, decisionD].filter(s => s === "sent").length} delivered
          </span>
        )}
      </div>
      <div style={{ padding: "4px 14px 10px", display: "flex", flexDirection: "column", gap: 6 }}>

        <AssetRow
          icon="📝" label="Strategic Note → Notion"
          title={ins.assets.note.title}
          status={noteD} url={ins.noteStatus.url} error={ins.noteStatus.error}
          debugFields={noteD === "failed" ? { "note.title": ins.assets.note.title ?? "", "note.content": ins.assets.note.content ?? "" } : undefined}
        >
          {ins.assets.note.confidence > 0 && <ConfidencePill value={ins.assets.note.confidence} />}
        </AssetRow>

        {ins.assets.task ? (
          <AssetRow
            icon="☑" label="Action Task → Todoist"
            title={ins.assets.task.title}
            subtitle={ins.assets.task.reason || undefined}
            status={taskD} url={ins.taskStatus.url} error={ins.taskStatus.error}
            debugFields={taskD === "failed" ? { "task.title": ins.assets.task.title ?? "", "task.description": ins.assets.task.description ?? "" } : undefined}
          >
            <div style={{ display: "flex", gap: 5, marginBottom: 4, flexWrap: "wrap" }}>
              {ins.assets.task.effort && (
                <span style={{ fontSize: 10, fontFamily: "monospace", fontWeight: 700, padding: "1px 5px", borderRadius: 3, background: `${EFFORT_COLOR[ins.assets.task.effort]}20`, color: EFFORT_COLOR[ins.assets.task.effort] }}>
                  {ins.assets.task.effort.toUpperCase()} EFFORT
                </span>
              )}
              {ins.assets.task.time_horizon && (
                <span style={{ fontSize: 10, fontFamily: "monospace", fontWeight: 700, padding: "1px 5px", borderRadius: 3, background: `${HORIZON_COLOR[ins.assets.task.time_horizon]}20`, color: HORIZON_COLOR[ins.assets.task.time_horizon] }}>
                  {ins.assets.task.time_horizon.toUpperCase()}
                </span>
              )}
              {ins.assets.task.confidence > 0 && <ConfidencePill value={ins.assets.task.confidence} size={10} />}
            </div>
            {expanded && ins.assets.task.steps?.length > 0 && (
              <div style={{ marginTop: 4 }}>
                <div style={{ fontSize: 10, fontFamily: "monospace", fontWeight: 800, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 3 }}>Steps</div>
                {ins.assets.task.steps.map((step, i) => (
                  <div key={i} style={{ display: "flex", gap: 6, marginBottom: 3, alignItems: "flex-start" }}>
                    <span style={{ fontSize: 11, fontFamily: "monospace", color: "#94a3b8", flexShrink: 0, minWidth: 14 }}>{i + 1}.</span>
                    <span style={{ fontSize: 12, color: "#374151", lineHeight: 1.45 }}>{step}</span>
                  </div>
                ))}
              </div>
            )}
          </AssetRow>
        ) : (
          <div style={{ padding: "6px 10px", background: "rgba(0,0,0,0.02)", borderRadius: 7, border: "1px solid rgba(0,0,0,0.06)", fontSize: 12, color: "#94a3b8", fontFamily: "monospace" }}>
            ☑ No task — {actionType === "strategic_move" ? "strategic move (decision record created instead)" : actionType === "no_action" ? "no action implied" : "below confidence threshold"}
          </div>
        )}

        <AssetRow
          icon="🚀" label="Content Opportunity → Queue"
          title={ins.assets.content.title}
          subtitle={ins.assets.content.hook || undefined}
          status={contentD} url={ins.contentStatus.url} error={ins.contentStatus.error}
          debugFields={contentD === "failed" ? { "content.title": ins.assets.content.title ?? "", "content.angle": ins.assets.content.angle ?? "" } : undefined}
        >
          {expanded && ins.assets.content.outline?.length > 0 && (
            <div style={{ marginTop: 6, marginBottom: 2 }}>
              <div style={{ fontSize: 10, fontFamily: "monospace", fontWeight: 800, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 4 }}>Outline</div>
              {ins.assets.content.outline.map((item, i) => (
                <div key={i} style={{ fontSize: 12, color: "#374151", marginBottom: 2, lineHeight: 1.4 }}>{i + 1}. {item}</div>
              ))}
              {ins.assets.content.audience && (
                <div style={{ marginTop: 5, fontSize: 11, fontFamily: "monospace", color: "#6b7280" }}>Audience: {ins.assets.content.audience}</div>
              )}
            </div>
          )}
        </AssetRow>

        {ins.assets.decision && (
          <AssetRow
            icon="🧭" label="Decision Record → Notion"
            title={ins.assets.decision.title}
            subtitle={ins.assets.decision.risks ? `Risk: ${ins.assets.decision.risks}` : undefined}
            status={decisionD} url={ins.decisionStatus.url} error={ins.decisionStatus.error}
          >
            {ins.assets.decision.confidence > 0 && <ConfidencePill value={ins.assets.decision.confidence} />}
          </AssetRow>
        )}
      </div>

      {/* Missed action detection */}
      {(taskSent || taskSkipped) && (
        <div style={{ padding: "0 14px 12px" }}>
          <MissedActionPanel ins={ins} onAlternativeTask={onGenerateTask} />
        </div>
      )}

      {/* Per-card send (auto-send off) */}
      {!autoSend && anyIdle && !sending && (
        <div style={{ padding: "0 14px 14px" }}>
          <button
            onClick={(e) => { e.stopPropagation(); onSend(); }}
            style={{ fontSize: 12, fontFamily: "monospace", fontWeight: 700, color: "#818cf8", background: "rgba(99,102,241,0.08)", border: "1px solid rgba(99,102,241,0.25)", borderRadius: 6, padding: "5px 14px", cursor: "pointer" }}
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
  const logId  = useRef(0);
  const startT = useRef<number | null>(null);

  function addLog(msg: string, ok?: boolean) {
    setLog(prev => [...prev, { id: logId.current++, ts: clockNow(), msg, ok }]);
  }

  useEffect(() => {
    if (!cachedInsights) return;
    setInsights(cachedInsights.map(ins => ({
      ...ins,
      noteStatus:     { status: "idle" },
      taskStatus:     { status: "idle" },
      contentStatus:  { status: "idle" },
      decisionStatus: { status: "idle" },
    })));
    addLog(`${cachedInsights.length} insight${cachedInsights.length !== 1 ? "s" : ""} extracted`, true);
    if (autoSend) addLog("Auto-Send ON — routing assets…");
  }, [cachedInsights]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (isOpen && video && !cachedInsights && !loading && !fetched) {
      setFetched(true);
      startT.current = Date.now();
      addLog("Extracting insights…");
      onFetch();
    }
  }, [isOpen, video?.videoId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (autoSend && insights.length > 0 && insights.every(i => i.noteStatus.status === "idle") && !sending) {
      void runSend();
    }
  }, [autoSend, insights.length]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    setFetched(false); setInsights([]); setLog([]); setElapsed(null); startT.current = null;
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

    setInsights(prev => prev.map((ins, i) =>
      idxs.includes(i) ? { ...ins, noteStatus: { status: "sending" }, taskStatus: { status: "sending" }, contentStatus: { status: "sending" }, decisionStatus: { status: "sending" } } : ins
    ));
    addLog(`Routing assets for ${idxs.length} insight${idxs.length !== 1 ? "s" : ""}…`);

    try {
      const res = await fetch("/api/youtube/auto-send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ insights: idxs.map(i => insights[i]), videoTitle: video?.title, channelTitle: video?.channelTitle, videoType }),
      });
      addLog(`Response: HTTP ${res.status}`, res.ok);
      if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text().catch(() => "(no body)")}`);

      const data = await res.json() as {
        results?: { index: number; noteStatus: OutputStatus; taskStatus: OutputStatus; contentStatus: OutputStatus; decisionStatus: OutputStatus }[];
      };

      if (data.results) {
        const updates: Record<number, Pick<InsightState, "noteStatus" | "taskStatus" | "contentStatus" | "decisionStatus">> = {};
        data.results.forEach(r => {
          const realIdx  = idxs[r.index] ?? r.index;
          const insTitle = insights[realIdx]?.title ?? `Insight ${realIdx + 1}`;
          updates[realIdx] = {
            noteStatus:     toUIStatus(r.noteStatus),
            taskStatus:     toUIStatus(r.taskStatus),
            contentStatus:  toUIStatus(r.contentStatus),
            decisionStatus: toUIStatus(r.decisionStatus),
          };
          if (r.noteStatus.status     === "sent") addLog(`📝 Note ✓     "${insTitle}"`, true);
          if (r.taskStatus.status     === "sent") addLog(`☑ Task ✓      "${insTitle}"`, true);
          if (r.contentStatus.status  === "sent") addLog(`🚀 Content ✓  "${insTitle}"`, true);
          if (r.decisionStatus.status === "sent") addLog(`🧭 Decision ✓ "${insTitle}"`, true);
          if (r.noteStatus.status     === "failed") addLog(`Note ✕ "${insTitle}": ${r.noteStatus.error ?? "?"}`, false);
          if (r.taskStatus.status     === "failed") addLog(`Task ✕ "${insTitle}": ${r.taskStatus.error ?? "?"}`, false);
          if (r.contentStatus.status  === "failed") addLog(`Content ✕ "${insTitle}": ${r.contentStatus.error ?? "?"}`, false);
        });
        setInsights(prev => prev.map((ins, i) => updates[i] ? { ...ins, ...updates[i] } : ins));
        if (startT.current) setElapsed((Date.now() - startT.current) / 1000);
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Unknown error";
      setInsights(prev => prev.map((ins, i) =>
        idxs.includes(i) ? { ...ins, noteStatus: { status: "idle" }, taskStatus: { status: "idle" }, contentStatus: { status: "idle" }, decisionStatus: { status: "idle" } } : ins
      ));
      addLog(`Pipeline error: ${msg}`, false);
    } finally {
      setSending(false);
    }
  }

  function handleAlternativeTask(insightIdx: number, task: InsightTask) {
    setInsights(prev => prev.map((ins, i) =>
      i === insightIdx ? { ...ins, assets: { ...ins.assets, task } } : ins
    ));
  }

  if (!isOpen || !video) return null;

  const totalInsights = insights.length;
  const sentNotes     = insights.filter(i => i.noteStatus.status    === "sent").length;
  const sentTasks     = insights.filter(i => i.taskStatus.status    === "sent").length;
  const sentContent   = insights.filter(i => i.contentStatus.status === "sent").length;
  const sentDecisions = insights.filter(i => i.decisionStatus.status === "sent").length;
  const totalSent     = sentNotes + sentTasks + sentContent + sentDecisions;

  const anySending = insights.some(i =>
    i.noteStatus.status === "sending" || i.taskStatus.status === "sending" ||
    i.contentStatus.status === "sending" || i.decisionStatus.status === "sending"
  );
  const allDelivered = totalInsights > 0 && insights.every(i =>
    [i.noteStatus.status, i.taskStatus.status, i.contentStatus.status, i.decisionStatus.status].every(s => s === "sent" || s === "skipped")
  );
  const anyIdle = insights.some(i =>
    i.noteStatus.status === "idle" || i.taskStatus.status === "idle" ||
    i.contentStatus.status === "idle" || i.decisionStatus.status === "idle"
  );

  return (
    <>
      <div className="fluff-drawer__overlay" onClick={onClose} />
      <div className="fluff-drawer">

        <div className="fluff-drawer__header">
          <div>
            <span style={{ fontSize: 11, fontFamily: "monospace", fontWeight: 800, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.1em" }}>
              {videoType ?? "Key Insights"}
            </span>
            <h2 className="fluff-drawer__channel">{video.channelTitle}</h2>
          </div>
          <button onClick={onClose} className="fluff-drawer__close">✕</button>
        </div>

        <div className="fluff-drawer__body" style={{ padding: 0 }}>

          <div style={{ padding: "4px 16px 12px", borderBottom: "1px solid rgba(0,0,0,0.06)" }}>
            <p style={{ fontSize: 13, color: "#374151", margin: 0, fontFamily: "monospace", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {video.title}
            </p>
          </div>

          {/* Auto-Send toggle */}
          <div style={{ padding: "12px 16px", borderBottom: "1px solid rgba(0,0,0,0.06)" }}>
            <div onClick={toggleAutoSend} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", borderRadius: 10, cursor: "pointer", userSelect: "none", background: autoSend ? "rgba(16,185,129,0.07)" : "rgba(0,0,0,0.02)", border: `1px solid ${autoSend ? "rgba(16,185,129,0.28)" : "rgba(0,0,0,0.08)"}` }}>
              <div style={{ width: 34, height: 19, borderRadius: 10, flexShrink: 0, position: "relative", background: autoSend ? "#10b981" : "#cbd5e1", border: "1px solid rgba(0,0,0,0.06)", transition: "background 0.2s" }}>
                <div style={{ position: "absolute", top: 2, left: autoSend ? 16 : 2, width: 15, height: 15, borderRadius: "50%", background: "#fff", boxShadow: "0 1px 3px rgba(0,0,0,0.3)", transition: "left 0.2s" }} />
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontFamily: "monospace", fontWeight: 800, color: autoSend ? "#10b981" : "#64748b" }}>AUTO-SEND {autoSend ? "ON" : "OFF"}</div>
                <div style={{ fontSize: 12, color: "#6b7280", fontFamily: "monospace", marginTop: 1 }}>
                  {autoSend ? "Notes · Tasks (score ≥ 6) · Content · Decisions (score ≥ 4)" : "Click to auto-route assets to your workspace"}
                </div>
              </div>
              {autoSend && anySending && <div className="spinner" style={{ width: 12, height: 12, borderWidth: 1.5 }} />}
            </div>
          </div>

          {/* Execution Complete */}
          {allDelivered && (
            <div style={{ margin: "12px 14px", padding: "18px 20px", background: "linear-gradient(135deg, rgba(16,185,129,0.08), rgba(16,185,129,0.03))", border: "1px solid rgba(16,185,129,0.25)", borderRadius: 12 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
                <span style={{ fontSize: 15, fontFamily: "monospace", fontWeight: 800, color: "#10b981" }}>⚡ EXECUTION COMPLETE</span>
                {elapsed !== null && <span style={{ fontSize: 11, color: "#6b7280", fontFamily: "monospace" }}>{elapsed.toFixed(1)}s</span>}
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: "5px 20px", marginBottom: 12 }}>
                <span style={{ fontSize: 13, color: "#374151", fontFamily: "monospace" }}>Insights Extracted</span>
                <span style={{ fontSize: 13, color: "#0f172a", fontFamily: "monospace", fontWeight: 700 }}>{totalInsights}</span>
                {sentNotes > 0     && <><span style={{ fontSize: 13, color: "#374151", fontFamily: "monospace" }}>Strategic Notes → Notion</span><span style={{ fontSize: 13, color: "#6ee7b7", fontFamily: "monospace", fontWeight: 700 }}>{sentNotes}</span></>}
                {sentTasks > 0     && <><span style={{ fontSize: 13, color: "#374151", fontFamily: "monospace" }}>Tasks → Todoist</span><span style={{ fontSize: 13, color: "#a5b4fc", fontFamily: "monospace", fontWeight: 700 }}>{sentTasks}</span></>}
                {sentContent > 0   && <><span style={{ fontSize: 13, color: "#374151", fontFamily: "monospace" }}>Content → Queue</span><span style={{ fontSize: 13, color: "#f9a8d4", fontFamily: "monospace", fontWeight: 700 }}>{sentContent}</span></>}
                {sentDecisions > 0 && <><span style={{ fontSize: 13, color: "#374151", fontFamily: "monospace" }}>Decision Records → Notion</span><span style={{ fontSize: 13, color: "#fde68a", fontFamily: "monospace", fontWeight: 700 }}>{sentDecisions}</span></>}
              </div>
              <div style={{ fontSize: 12, color: "#6b7280", fontFamily: "monospace", borderTop: "1px solid rgba(16,185,129,0.15)", paddingTop: 10 }}>
                {totalSent} assets delivered · workspace updated
              </div>
            </div>
          )}

          {/* In-progress */}
          {anySending && !allDelivered && (
            <div style={{ margin: "12px 14px", padding: "12px 16px", background: "rgba(129,140,248,0.05)", border: "1px solid rgba(129,140,248,0.15)", borderRadius: 10, display: "flex", alignItems: "center", gap: 10 }}>
              <span className="spinner" style={{ width: 12, height: 12, borderWidth: 1.5 }} />
              <div>
                <div style={{ fontSize: 13, fontFamily: "monospace", fontWeight: 800, color: "#818cf8" }}>⚡ EXECUTING…</div>
                <div style={{ fontSize: 11, color: "#6b7280", fontFamily: "monospace", marginTop: 2 }}>Routing assets to your workspace</div>
              </div>
            </div>
          )}

          {loading && (
            <div style={{ padding: "20px 16px", display: "flex", alignItems: "center", gap: 12 }}>
              <span className="spinner" style={{ width: 14, height: 14, borderWidth: 2 }} />
              <div>
                <div style={{ fontSize: 14, color: "#818cf8", fontFamily: "monospace", fontWeight: 700 }}>Extracting insights…</div>
                <div style={{ fontSize: 12, color: "#6b7280", fontFamily: "monospace", marginTop: 2 }}>Reading transcript · Scoring actionability</div>
              </div>
            </div>
          )}

          {error && (
            <div style={{ margin: "12px 14px", padding: "10px 14px", background: "rgba(248,113,113,0.06)", border: "1px solid rgba(248,113,113,0.2)", borderRadius: 8 }}>
              <span style={{ fontSize: 13, color: "#f87171", fontFamily: "monospace" }}>{error}</span>
            </div>
          )}

          {!loading && insights.length > 0 && (
            <div>
              <div style={{ padding: "10px 16px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <span style={{ fontSize: 11, fontFamily: "monospace", fontWeight: 800, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.1em" }}>
                  {totalInsights} Insight{totalInsights !== 1 ? "s" : ""}
                  {totalSent > 0 && !allDelivered && <span style={{ color: "#10b981", marginLeft: 8 }}>· {totalSent} assets delivered</span>}
                </span>
                {!autoSend && anyIdle && !sending && (
                  <button onClick={() => void runSend()} style={{ fontSize: 12, fontFamily: "monospace", fontWeight: 800, color: "#818cf8", background: "rgba(99,102,241,0.08)", border: "1px solid rgba(99,102,241,0.2)", borderRadius: 6, padding: "3px 10px", cursor: "pointer" }}>
                    ⚡ Send all assets
                  </button>
                )}
              </div>
              <div style={{ padding: "0 12px 12px", display: "flex", flexDirection: "column", gap: 10 }}>
                {insights.map((ins, i) => (
                  <InsightCard key={i} ins={ins} index={i} autoSend={autoSend} sending={sending}
                    onSend={() => void runSend([i])}
                    onGenerateTask={(task) => handleAlternativeTask(i, task)}
                  />
                ))}
              </div>
            </div>
          )}

          {log.length > 0 && (
            <div style={{ borderTop: "1px solid rgba(0,0,0,0.06)", padding: "0 16px 16px" }}>
              <button onClick={() => setShowLog(p => !p)} style={{ width: "100%", textAlign: "left", padding: "8px 0", fontSize: 11, fontFamily: "monospace", fontWeight: 800, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.1em", background: "none", border: "none", cursor: "pointer", display: "flex", alignItems: "center", gap: 6 }}>
                Activity Log {showLog ? "▲" : "▼"}
                <span style={{ fontWeight: 400, textTransform: "none", letterSpacing: 0, color: "#94a3b8" }}>{log.length} events</span>
              </button>
              {showLog && (
                <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                  {log.map(e => (
                    <div key={e.id} style={{ display: "flex", gap: 8, alignItems: "baseline" }}>
                      <span style={{ fontSize: 11, color: "#94a3b8", fontFamily: "monospace", flexShrink: 0, minWidth: 64 }}>{e.ts}</span>
                      <span style={{ fontSize: 12, fontFamily: "monospace", color: e.ok === true ? "#10b981" : e.ok === false ? "#f87171" : "#64748b" }}>
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
