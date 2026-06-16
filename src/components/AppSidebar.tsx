"use client";

import Link from "next/link";
import { useState, useEffect, useRef } from "react";

export type NavItem = "dashboard" | "analyze" | "library" | "trends" | "consensus-page" | "feed" | "workspace" | "research" | "deep-research" | "creators" | "upgrade";

interface Props {
  active: NavItem;
  onNav: (item: NavItem) => void;
  analysisCount: number;
}

const PRIMARY_NAV: { id: NavItem; icon: string; label: string; primary?: true }[] = [
  { id: "dashboard", icon: "📊", label: "Dashboard" },
  { id: "analyze",   icon: "🔍", label: "Analyze Video", primary: true },
  { id: "feed",      icon: "📺", label: "Subscription Feed" },
  { id: "library",   icon: "💾", label: "Saved Briefings" },
  { id: "research",       icon: "🔎", label: "Research Mode" },
  { id: "deep-research",  icon: "🔬", label: "Deep Research" },
  { id: "creators",       icon: "🧠", label: "Creator Intelligence" },
  { id: "trends",         icon: "📈", label: "Creator Trends" },
  { id: "consensus-page", icon: "🔗", label: "Cross-Channel Consensus" },
  { id: "workspace",      icon: "👥", label: "Team Workspace" },
];

type FeedbackType = "Bug Report" | "Feature Request" | "General Feedback";
type SubmitState = "idle" | "sending" | "sent" | "error";

function FeedbackModal({ onClose }: { onClose: () => void }) {
  const [type, setType] = useState<FeedbackType>("Bug Report");
  const [message, setMessage] = useState("");
  const [state, setState] = useState<SubmitState>("idle");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Close on Escape
  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") onClose(); }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Focus textarea on open
  useEffect(() => { setTimeout(() => textareaRef.current?.focus(), 60); }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!message.trim()) return;
    setState("sending");
    try {
      const res = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type, message: message.trim() }),
      });
      if (!res.ok) throw new Error("failed");
      setState("sent");
      setTimeout(onClose, 1800);
    } catch {
      setState("error");
      setTimeout(() => setState("idle"), 3000);
    }
  }

  return (
    <div className="fb-overlay" onClick={onClose}>
      <div className="fb-dialog" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal aria-label="Send feedback">
        <div className="fb-dialog__header">
          <div className="fb-dialog__title">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
            </svg>
            Send Feedback
          </div>
          <button onClick={onClose} className="fb-dialog__close" aria-label="Close">✕</button>
        </div>

        {state === "sent" ? (
          <div className="fb-dialog__sent">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
              <polyline points="22 4 12 14.01 9 11.01" />
            </svg>
            <p>Feedback received — thank you!</p>
          </div>
        ) : (
          <form onSubmit={(e) => void handleSubmit(e)} className="fb-dialog__body">
            <label className="fb-label">
              Type
              <select
                value={type}
                onChange={(e) => setType(e.target.value as FeedbackType)}
                className="fb-select"
              >
                <option>Bug Report</option>
                <option>Feature Request</option>
                <option>General Feedback</option>
              </select>
            </label>

            <label className="fb-label">
              Message
              <textarea
                ref={textareaRef}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Describe the bug, feature, or feedback…"
                rows={5}
                className="fb-textarea"
                required
                disabled={state === "sending"}
              />
            </label>

            {state === "error" && (
              <p className="fb-error">Something went wrong. Please try again.</p>
            )}

            <div className="fb-dialog__footer">
              <button type="button" onClick={onClose} className="btn btn-ghost" disabled={state === "sending"}>
                Cancel
              </button>
              <button
                type="submit"
                className="btn btn-primary"
                disabled={state === "sending" || !message.trim()}
              >
                {state === "sending" ? <><span className="spinner" /> Sending…</> : "Submit Feedback"}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

export function AppSidebar({ active, onNav, analysisCount }: Props) {
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  function handleNav(id: NavItem) {
    onNav(id);
    setMobileOpen(false);
  }

  return (
    <>
      {/* Mobile top bar */}
      <div className="mobile-topbar">
        <img src="/logo.png" alt="WatchFilter" className="mobile-topbar__logo" />
        <span className="mobile-topbar__brand">WatchFilter</span>
        <button
          type="button"
          className="mobile-topbar__hamburger"
          onClick={() => setMobileOpen(true)}
          aria-label="Open menu"
        >
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <line x1="3" y1="5" x2="17" y2="5" />
            <line x1="3" y1="10" x2="17" y2="10" />
            <line x1="3" y1="15" x2="17" y2="15" />
          </svg>
        </button>
      </div>

      {/* Backdrop */}
      {mobileOpen && (
        <div className="mobile-backdrop" onClick={() => setMobileOpen(false)} />
      )}

      <aside className={`app-sidebar${mobileOpen ? " app-sidebar--mobile-open" : ""}`}>
        <div className="app-sidebar__brand">
          <img src="/logo.png" alt="WatchFilter" className="app-sidebar__brand-icon" />
          <button
            type="button"
            className="mobile-sidebar-close"
            onClick={() => setMobileOpen(false)}
            aria-label="Close menu"
          >✕</button>
        </div>

        <nav className="app-sidebar__nav">
          {PRIMARY_NAV.map(({ id, icon, label, primary }) => (
            <button
              key={id}
              type="button"
              className={[
                "sidebar-nav-item",
                active === id ? "sidebar-nav-item--active" : "",
                primary && active === id ? "sidebar-nav-item--primary-active" : "",
                primary ? "sidebar-nav-item--primary" : "",
              ].filter(Boolean).join(" ")}
              onClick={() => handleNav(id)}
            >
              <span className="sidebar-nav-item__icon">{icon}</span>
              <span className="sidebar-nav-item__label">{label}</span>
              {id === "library" && analysisCount > 0 && (
                <span className="sidebar-nav-item__badge">{analysisCount}</span>
              )}
            </button>
          ))}
        </nav>

        <div className="sidebar-feedback-wrap">
          <button
            type="button"
            className="sidebar-feedback-btn"
            onClick={() => setFeedbackOpen(true)}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
            </svg>
            Send Feedback
          </button>
        </div>

        <div className="app-sidebar__footer">
          <button
            type="button"
            className={[
              "sidebar-nav-item",
              "sidebar-nav-item--upgrade",
              active === "upgrade" ? "sidebar-nav-item--active" : "",
            ].filter(Boolean).join(" ")}
            onClick={() => handleNav("upgrade")}
          >
            <span className="sidebar-nav-item__icon">👑</span>
            <span className="sidebar-nav-item__label">Upgrade to Pro</span>
          </button>
          <div className="sidebar-legal">
            <Link href="/privacy">Privacy</Link>
            <Link href="/terms">Terms</Link>
          </div>
          <p className="sidebar-copyright">© {new Date().getFullYear()} WatchFilter. All rights reserved.</p>
        </div>
      </aside>

      {feedbackOpen && <FeedbackModal onClose={() => setFeedbackOpen(false)} />}
    </>
  );
}
