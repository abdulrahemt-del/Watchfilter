"use client";

import { useState } from "react";

export function WaitlistForm() {
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "loading" | "done" | "error">("idle");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setState("loading");
    try {
      const res = await fetch("/api/waitlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      if (!res.ok) throw new Error("Failed");
      setState("done");
    } catch {
      setState("error");
    }
  }

  if (state === "done") {
    return (
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "1.25rem" }}>
        <div style={{ display: "inline-flex", alignItems: "center", gap: "0.5rem", background: "rgba(16,185,129,0.12)", border: "1px solid rgba(16,185,129,0.30)", borderRadius: 999, padding: "0.4rem 1.1rem" }}>
          <span style={{ color: "#10b981", fontSize: "0.78rem", fontWeight: 700 }}>✓ You&apos;re on the list</span>
        </div>
        <p style={{ color: "#4f6d7a", fontSize: "0.9rem", margin: 0 }}>
          Connect Google to activate your access now:
        </p>
        <a
          href="/signin"
          style={{ display: "inline-flex", alignItems: "center", gap: "0.6rem", background: "#4a6fa5", color: "#fff", borderRadius: 12, fontSize: "0.95rem", fontWeight: 700, padding: "0.85rem 2rem", textDecoration: "none", boxShadow: "0 4px 24px rgba(74,111,165,0.30)" }}
        >
          <GoogleIcon />
          Connect Google Account
        </a>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "0.75rem", width: "100%" }}>
      <div style={{ display: "flex", gap: "0.5rem", width: "100%", maxWidth: 440, flexWrap: "wrap", justifyContent: "center" }}>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="your@email.com"
          required
          style={{ flex: 1, minWidth: 200, border: "1px solid #a8bfcb", borderRadius: 10, padding: "0.8rem 1rem", fontSize: "0.9rem", color: "#1a2e3b", background: "#fff", outline: "none" }}
        />
        <button
          type="submit"
          disabled={state === "loading"}
          style={{ display: "inline-flex", alignItems: "center", gap: "0.5rem", background: "#4a6fa5", color: "#fff", border: "none", borderRadius: 10, fontSize: "0.9rem", fontWeight: 700, padding: "0.8rem 1.5rem", cursor: state === "loading" ? "not-allowed" : "pointer", opacity: state === "loading" ? 0.7 : 1, whiteSpace: "nowrap" }}
        >
          {state === "loading" ? "Joining…" : "Request Access →"}
        </button>
      </div>
      {state === "error" && (
        <p style={{ color: "#c0392b", fontSize: "0.78rem", margin: 0 }}>Something went wrong — try again.</p>
      )}
      <p style={{ color: "#7a9caa", fontSize: "0.72rem", margin: 0 }}>
        Already have access?{" "}
        <a href="/signin" style={{ color: "#4a6fa5", fontWeight: 600, textDecoration: "none" }}>Sign in with Google →</a>
      </p>
    </form>
  );
}

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
      <path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.716v2.259h2.908C16.658 13.814 17.64 11.506 17.64 9.2z" fill="#fff" fillOpacity=".9"/>
      <path d="M9 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332C2.438 15.983 5.482 18 9 18z" fill="#fff" fillOpacity=".75"/>
      <path d="M3.964 10.706A5.41 5.41 0 0 1 3.68 9c0-.59.102-1.163.284-1.706V4.962H.957A9.007 9.007 0 0 0 0 9c0 1.452.348 2.827.957 4.038l3.007-2.332z" fill="#fff" fillOpacity=".6"/>
      <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0 5.482 0 2.438 2.017.957 4.962L3.964 6.294C4.672 4.161 6.656 3.58 9 3.58z" fill="#fff" fillOpacity=".8"/>
    </svg>
  );
}
