// Server component — sign-in handled by /signin redirect page

// Palette
// --alice-blue:  #dbe9ee  (page bg, lightest)
// --pale-sky:    #c0d6df  (alt section bg, cards)
// --blue-slate:  #4f6d7a  (secondary text, muted)
// --smart-blue:  #4a6fa5  (primary CTA, accents)
// --baltic-blue: #166088  (headings, dark CTA section)

import { WaitlistForm } from "@/components/WaitlistForm";

const FEATURES = [
  {
    icon: "🎯",
    title: "AI Relevance Scoring",
    desc: "Every video in your subscriptions gets scored 0–100 for business relevance. Podcasts, interviews, and deep dives surface first. Off-topic noise is filtered out automatically.",
  },
  {
    icon: "🧠",
    title: "Creator Consensus Engine",
    desc: "When 3+ creators independently cover the same topic, WatchFilter surfaces it as a confirmed signal — with confidence scores, trend direction, and recommended actions.",
  },
  {
    icon: "⚡",
    title: "Executive Intelligence Brief",
    desc: "Every session opens with a synthesised brief: the top opportunities, biggest risks, and 3 specific actions you can take today. No summaries — just conclusions.",
  },
  {
    icon: "🔬",
    title: "Fluff Analyser",
    desc: "One click reveals exactly how much of a video is filler, repetition, or sponsorship vs. actual insight. Get the key takeaways without watching the full episode.",
  },
  {
    icon: "📊",
    title: "Three Intelligence Modes",
    desc: "Switch between Business Intelligence (broad), Founder & Investing (startup and VC focus), and Finance (markets, personal finance, macro) to match your context.",
  },
  {
    icon: "🛡️",
    title: "Hard-Blocked Noise",
    desc: "Politics, sports, religion, breaking news, and entertainment are permanently removed — even from trusted channels. A Diary of a CEO UFO episode scores zero.",
  },
];

const STEPS = [
  {
    n: "01",
    title: "Connect your Google account",
    desc: "WatchFilter reads your existing YouTube subscriptions. No new channels to follow — it works with what you already watch.",
  },
  {
    n: "02",
    title: "Pick your intelligence mode",
    desc: "Select Business Intelligence, Founder & Investing, or Finance. The AI scans your feed and scores every video in seconds.",
  },
  {
    n: "03",
    title: "Read the brief, not the video",
    desc: "Your Executive Brief is ready. Open any card to see creator consensus, why it matters, and the exact actions to take.",
  },
];

const FOR_WHOM = [
  { label: "Founders", icon: "🚀" },
  { label: "Investors", icon: "📈" },
  { label: "Operators", icon: "⚙️" },
  { label: "Analysts", icon: "🔎" },
];

export default function LandingPage() {
  return (
    <div style={{ background: "#dbe9ee", color: "#1a2e3b", fontFamily: "'Segoe UI', system-ui, sans-serif", minHeight: "100vh" }}>

      {/* ── Nav ── */}
      <nav style={{ borderBottom: "1px solid #c0d6df", padding: "0 2rem", background: "#dbe9ee" }}>
        <div style={{ maxWidth: 1100, margin: "0 auto", display: "flex", alignItems: "center", justifyContent: "space-between", height: 60 }}>
          <img src="/logo.png" alt="WatchFilter" style={{ height: 144 }} />
          <a href="/signin" style={{ background: "transparent", border: "1px solid #a8bfcb", borderRadius: 8, color: "#4f6d7a", fontSize: "0.8rem", fontWeight: 600, padding: "0.4rem 1rem", textDecoration: "none", display: "inline-block" }}>
            Sign in
          </a>
        </div>
      </nav>

      {/* ── Hero ── */}
      <section style={{ maxWidth: 1100, margin: "0 auto", padding: "6rem 2rem 4rem", textAlign: "center" }}>
        <div style={{ display: "inline-flex", alignItems: "center", gap: "0.5rem", background: "rgba(74,111,165,0.10)", border: "1px solid rgba(74,111,165,0.30)", borderRadius: 999, padding: "0.3rem 1rem", marginBottom: "2rem" }}>
          <span style={{ width: 7, height: 7, background: "#4a6fa5", borderRadius: "50%", display: "inline-block" }} />
          <span style={{ fontSize: "0.72rem", fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: "#166088" }}>
            Private Beta — Limited Access
          </span>
        </div>

        <h1 style={{ fontSize: "clamp(2.2rem, 5vw, 3.8rem)", fontWeight: 900, lineHeight: 1.1, letterSpacing: "-0.03em", margin: "0 0 1.5rem", color: "#0f2535" }}>
          Your Personal Business<br />
          <span style={{ color: "#166088" }}>Intelligence Analyst for YouTube</span>
        </h1>

        <p style={{ fontSize: "clamp(1rem, 2vw, 1.2rem)", color: "#4f6d7a", lineHeight: 1.7, maxWidth: 620, margin: "0 auto 2.5rem", fontWeight: 400 }}>
          WatchFilter analyzes your subscriptions, identifies creator consensus, uncovers emerging opportunities, and delivers a daily intelligence brief — helping founders, investors, and operators stay informed without spending hours watching videos.
        </p>

        <WaitlistForm />

        <div style={{ marginTop: "1rem" }}>
          <a
            href="#how-it-works"
            style={{ display: "inline-flex", alignItems: "center", gap: "0.5rem", background: "transparent", color: "#4f6d7a", border: "1px solid #a8bfcb", borderRadius: 12, fontSize: "0.95rem", fontWeight: 600, padding: "0.85rem 1.75rem", textDecoration: "none" }}
          >
            See how it works ↓
          </a>
        </div>

        {/* Built for strip */}
        <p style={{ marginTop: "2.5rem", fontSize: "0.72rem", color: "#4f6d7a", fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase" }}>
          Built for
        </p>
        <div style={{ display: "flex", gap: "0.75rem", justifyContent: "center", flexWrap: "wrap", marginTop: "0.75rem" }}>
          {FOR_WHOM.map(({ label, icon }) => (
            <span key={label} style={{ display: "inline-flex", alignItems: "center", gap: "0.4rem", background: "#fff", border: "1px solid #c0d6df", borderRadius: 999, padding: "0.35rem 1rem", fontSize: "0.8rem", fontWeight: 600, color: "#1a2e3b" }}>
              {icon} {label}
            </span>
          ))}
        </div>
      </section>

      {/* ── Stat bar ── */}
      <section style={{ borderTop: "1px solid #b0c8d4", borderBottom: "1px solid #b0c8d4", background: "#c0d6df" }}>
        <div style={{ maxWidth: 1100, margin: "0 auto", padding: "2rem", display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "2rem", textAlign: "center" }}>
          {[
            { value: "40 min+", label: "Minimum video length filtered" },
            { value: "0–100", label: "AI relevance score per video" },
            { value: "3+", label: "Creators needed to confirm a signal" },
            { value: "~60%", label: "Average watch time saved" },
          ].map(({ value, label }) => (
            <div key={label}>
              <div style={{ fontSize: "2rem", fontWeight: 900, color: "#166088", letterSpacing: "-0.03em" }}>{value}</div>
              <div style={{ fontSize: "0.72rem", color: "#4f6d7a", fontWeight: 600, marginTop: "0.3rem", textTransform: "uppercase", letterSpacing: "0.05em" }}>{label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ── Features ── */}
      <section style={{ maxWidth: 1100, margin: "0 auto", padding: "5rem 2rem" }}>
        <div style={{ textAlign: "center", marginBottom: "3rem" }}>
          <p style={{ fontSize: "0.7rem", fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: "#4a6fa5", marginBottom: "0.75rem" }}>
            What it does
          </p>
          <h2 style={{ fontSize: "clamp(1.6rem, 3vw, 2.4rem)", fontWeight: 900, letterSpacing: "-0.02em", color: "#0f2535", margin: 0 }}>
            Signal, not volume
          </h2>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: "1.25rem" }}>
          {FEATURES.map(({ icon, title, desc }) => (
            <div key={title} style={{ background: "#fff", border: "1px solid #c0d6df", borderRadius: 16, padding: "1.75rem" }}>
              <div style={{ fontSize: "1.8rem", marginBottom: "1rem" }}>{icon}</div>
              <h3 style={{ fontSize: "1rem", fontWeight: 800, color: "#0f2535", margin: "0 0 0.6rem", letterSpacing: "-0.01em" }}>{title}</h3>
              <p style={{ fontSize: "0.85rem", color: "#4f6d7a", lineHeight: 1.65, margin: 0 }}>{desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── How it works ── */}
      <section id="how-it-works" style={{ background: "#c0d6df", borderTop: "1px solid #b0c8d4", borderBottom: "1px solid #b0c8d4" }}>
        <div style={{ maxWidth: 1100, margin: "0 auto", padding: "5rem 2rem" }}>
          <div style={{ textAlign: "center", marginBottom: "3.5rem" }}>
            <p style={{ fontSize: "0.7rem", fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: "#4a6fa5", marginBottom: "0.75rem" }}>
              How it works
            </p>
            <h2 style={{ fontSize: "clamp(1.6rem, 3vw, 2.4rem)", fontWeight: 900, letterSpacing: "-0.02em", color: "#0f2535", margin: 0 }}>
              Three steps to daily intelligence
            </h2>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "2rem" }}>
            {STEPS.map(({ n, title, desc }) => (
              <div key={n} style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
                <span style={{ fontSize: "2.5rem", fontWeight: 900, color: "#a8bfcb", letterSpacing: "-0.04em", fontFamily: "monospace" }}>{n}</span>
                <h3 style={{ fontSize: "1.05rem", fontWeight: 800, color: "#0f2535", margin: 0, letterSpacing: "-0.01em" }}>{title}</h3>
                <p style={{ fontSize: "0.85rem", color: "#4f6d7a", lineHeight: 1.65, margin: 0 }}>{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── What gets filtered ── */}
      <section style={{ maxWidth: 1100, margin: "0 auto", padding: "5rem 2rem" }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "2rem" }}>

          <div style={{ background: "#eaf6ef", border: "1px solid rgba(16,185,129,0.25)", borderRadius: 16, padding: "2rem" }}>
            <p style={{ fontSize: "0.68rem", fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: "#0a7a4a", marginBottom: "1rem" }}>
              ✓ Always surfaced
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: "0.65rem" }}>
              {["Founder interviews (40 min+)", "Market analysis & macro commentary", "VC & startup deep dives", "Business strategy breakdowns", "Personal finance & investing", "CEO/operator podcasts"].map(item => (
                <div key={item} style={{ display: "flex", gap: "0.75rem", alignItems: "flex-start" }}>
                  <span style={{ color: "#0a7a4a", fontSize: "0.8rem", marginTop: 2, flexShrink: 0 }}>›</span>
                  <span style={{ fontSize: "0.85rem", color: "#1f4b35", lineHeight: 1.5 }}>{item}</span>
                </div>
              ))}
            </div>
          </div>

          <div style={{ background: "#fef2f2", border: "1px solid rgba(239,68,68,0.20)", borderRadius: 16, padding: "2rem" }}>
            <p style={{ fontSize: "0.68rem", fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: "#c0392b", marginBottom: "1rem" }}>
              ✕ Always blocked
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: "0.65rem" }}>
              {["Politics, war & geopolitics", "Sports, gaming & entertainment", "Religion & spirituality", "Breaking news & live coverage", "UFOs, conspiracy & true crime", "Off-topic episodes from trusted channels"].map(item => (
                <div key={item} style={{ display: "flex", gap: "0.75rem", alignItems: "flex-start" }}>
                  <span style={{ color: "#c0392b", fontSize: "0.8rem", marginTop: 2, flexShrink: 0 }}>✕</span>
                  <span style={{ fontSize: "0.85rem", color: "#7f1d1d", lineHeight: 1.5 }}>{item}</span>
                </div>
              ))}
            </div>
          </div>

        </div>
      </section>

      {/* ── Bottom CTA ── */}
      <section style={{ borderTop: "1px solid #b0c8d4", background: "#166088" }}>
        <div style={{ maxWidth: 700, margin: "0 auto", padding: "6rem 2rem", textAlign: "center" }}>
          <h2 style={{ fontSize: "clamp(1.8rem, 4vw, 2.8rem)", fontWeight: 900, letterSpacing: "-0.03em", color: "#dbe9ee", margin: "0 0 1rem" }}>
            Stop watching.<br />
            <span style={{ color: "#c0d6df" }}>Start knowing.</span>
          </h2>
          <p style={{ fontSize: "1rem", color: "rgba(219,233,238,0.70)", lineHeight: 1.7, margin: "0 0 2.5rem" }}>
            Beta access is limited. Drop your email to join the waitlist and connect Google to activate when your spot opens.
          </p>
          <WaitlistForm />
          <p style={{ marginTop: "1.25rem", fontSize: "0.72rem", color: "rgba(192,214,223,0.65)", fontWeight: 500 }}>
            No credit card. Read-only YouTube access. Cancel anytime.
          </p>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer style={{ borderTop: "1px solid #c0d6df", padding: "1.5rem 2rem", background: "#dbe9ee" }}>
        <div style={{ maxWidth: 1100, margin: "0 auto", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "0.75rem" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem" }}>
            <img src="/logo.png" alt="WatchFilter" style={{ height: 104, mixBlendMode: "multiply" }} />
            <p style={{ fontSize: "0.72rem", color: "#4f6d7a", margin: 0, fontWeight: 500 }}>
              © {new Date().getFullYear()} WatchFilter. All rights reserved.
            </p>
          </div>
          <div style={{ display: "flex", gap: "1.5rem" }}>
            <a href="/privacy" style={{ fontSize: "0.75rem", color: "#4f6d7a", textDecoration: "none" }}>Privacy</a>
            <a href="/terms" style={{ fontSize: "0.75rem", color: "#4f6d7a", textDecoration: "none" }}>Terms</a>
          </div>
        </div>
      </footer>

    </div>
  );
}
