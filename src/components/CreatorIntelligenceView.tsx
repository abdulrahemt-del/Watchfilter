"use client";

import { useEffect, useState, useCallback } from "react";
import type { CreatorProfile } from "@/lib/db";
import type { DebateEntry } from "@/app/api/creators/intelligence/route";
import { authorityTier } from "@/lib/creatorAuthority";

// ── Tier badge ────────────────────────────────────────────────────────────────

const TIER_STYLE: Record<string, { color: string; bg: string; border: string }> = {
  High:   { color: "#92400e", bg: "#fef3c7", border: "#f59e0b" },
  Medium: { color: "#1e40af", bg: "#dbeafe", border: "#3b82f6" },
  Low:    { color: "#374151", bg: "#f3f4f6", border: "#9ca3af" },
};

function TierBadge({ score }: { score: number }) {
  const tier = authorityTier(score);
  const s = TIER_STYLE[tier];
  return (
    <span
      style={{
        fontSize: "0.62rem",
        fontWeight: 800,
        letterSpacing: "0.07em",
        textTransform: "uppercase",
        padding: "2px 7px",
        borderRadius: 4,
        border: `1px solid ${s.border}`,
        color: s.color,
        background: s.bg,
        whiteSpace: "nowrap",
      }}
    >
      {tier}
    </span>
  );
}

// ── Stat chip ─────────────────────────────────────────────────────────────────

function StatChip({ value, label }: { value: number; label: string }) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        padding: "0.75rem 1.25rem",
        background: "white",
        border: "1px solid #e2e8f0",
        borderRadius: 10,
        minWidth: 100,
      }}
    >
      <span style={{ fontSize: "1.5rem", fontWeight: 800, color: "#0f172a", lineHeight: 1 }}>
        {value}
      </span>
      <span style={{ fontSize: "0.7rem", color: "#64748b", marginTop: 4, textTransform: "uppercase", letterSpacing: "0.05em", fontWeight: 600 }}>
        {label}
      </span>
    </div>
  );
}

// ── Debate card ───────────────────────────────────────────────────────────────

function DebateCard({ debate }: { debate: DebateEntry }) {
  const { category, supporters, challengers, nuanced } = debate;
  const hasChallengers = challengers.length > 0;

  return (
    <div
      style={{
        background: "white",
        border: "1px solid #e2e8f0",
        borderRadius: 10,
        overflow: "hidden",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "0.6rem 0.9rem",
          background: "#fafafa",
          borderBottom: "1px solid #e2e8f0",
        }}
      >
        <span style={{ fontSize: "0.78rem", fontWeight: 700, color: "#0f172a" }}>
          {category}
        </span>
        <span
          style={{
            fontSize: "0.67rem",
            fontWeight: 700,
            padding: "2px 8px",
            borderRadius: 20,
            background: hasChallengers ? "#fef3c7" : "#eff6ff",
            color: hasChallengers ? "#92400e" : "#1e40af",
            border: `1px solid ${hasChallengers ? "#f59e0b" : "#93c5fd"}`,
          }}
        >
          {hasChallengers ? `⚡ ${supporters.length} vs ${challengers.length + nuanced.length}` : `~ ${nuanced.length} nuanced`}
        </span>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 0 }}>
        <div style={{ padding: "0.55rem 0.9rem", borderRight: "1px solid #f1f5f9" }}>
          <p style={{ margin: "0 0 0.3rem", fontSize: "0.62rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "#16a34a" }}>
            Supporting
          </p>
          {supporters.map(name => (
            <p key={name} style={{ margin: "0.1rem 0", fontSize: "0.72rem", color: "#374151" }}>{name}</p>
          ))}
        </div>
        <div style={{ padding: "0.55rem 0.9rem" }}>
          <p style={{ margin: "0 0 0.3rem", fontSize: "0.62rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: hasChallengers ? "#b45309" : "#64748b" }}>
            {hasChallengers ? "Challenging" : "Nuanced"}
          </p>
          {(hasChallengers ? challengers : nuanced).map(name => (
            <p key={name} style={{ margin: "0.1rem 0", fontSize: "0.72rem", color: "#374151" }}>{name}</p>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Leaderboard row ───────────────────────────────────────────────────────────

function LeaderboardRow({ rank, profile }: { rank: number; profile: CreatorProfile }) {
  const { channel_name, video_count, data_point_count, authority_score, top_categories } = profile;

  return (
    <tr
      style={{
        borderBottom: "1px solid #f1f5f9",
        fontSize: "0.8rem",
        color: "#374151",
      }}
    >
      <td style={{ padding: "0.55rem 0.75rem", color: "#94a3b8", fontWeight: 700, fontVariantNumeric: "tabular-nums", width: 32 }}>
        {rank}
      </td>
      <td style={{ padding: "0.55rem 0.5rem", fontWeight: 600, color: "#0f172a", maxWidth: 180 }}>
        <span style={{ display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {channel_name}
        </span>
      </td>
      <td style={{ padding: "0.55rem 0.5rem" }}>
        <TierBadge score={authority_score} />
      </td>
      <td style={{ padding: "0.55rem 0.5rem", textAlign: "center", fontVariantNumeric: "tabular-nums" }}>
        {video_count}
      </td>
      <td style={{ padding: "0.55rem 0.5rem", textAlign: "center", fontVariantNumeric: "tabular-nums" }}>
        {data_point_count}
      </td>
      <td style={{ padding: "0.55rem 0.75rem" }}>
        <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
          {top_categories.slice(0, 2).map(cat => (
            <span
              key={cat}
              style={{
                fontSize: "0.6rem",
                padding: "1px 6px",
                background: "#f1f5f9",
                border: "1px solid #e2e8f0",
                borderRadius: 4,
                color: "#475569",
                whiteSpace: "nowrap",
                maxWidth: 120,
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
            >
              {cat}
            </span>
          ))}
        </div>
      </td>
    </tr>
  );
}

// ── Main view ─────────────────────────────────────────────────────────────────

export function CreatorIntelligenceView() {
  const [profiles, setProfiles] = useState<CreatorProfile[]>([]);
  const [debates, setDebates] = useState<DebateEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [syncMsg, setSyncMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/creators/intelligence");
      if (res.ok) {
        const data = (await res.json()) as { profiles: CreatorProfile[]; debates: DebateEntry[] };
        setProfiles(data.profiles ?? []);
        setDebates(data.debates ?? []);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function handleSync() {
    setSyncing(true);
    setSyncMsg(null);
    try {
      const res = await fetch("/api/creators/sync", { method: "POST" });
      if (res.ok) {
        const data = (await res.json()) as { creators: number; positions: number };
        setSyncMsg(`Synced ${data.creators} creators · ${data.positions} positions`);
        await load();
      } else {
        setSyncMsg("Sync failed — try again");
      }
    } finally {
      setSyncing(false);
    }
  }

  const totalEvidence = profiles.reduce((s, p) => s + p.data_point_count, 0);

  return (
    <div style={{ padding: "1.5rem", maxWidth: 900, margin: "0 auto", display: "flex", flexDirection: "column", gap: "1.5rem" }}>

      {/* Header */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", flexWrap: "wrap", gap: "0.75rem" }}>
        <div>
          <h1 style={{ margin: 0, fontSize: "1.25rem", fontWeight: 800, color: "#0f172a" }}>
            Creator Intelligence
          </h1>
          <p style={{ margin: "0.3rem 0 0", fontSize: "0.82rem", color: "#64748b" }}>
            Authority rankings, stances, and live debates across your library
          </p>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
          {syncMsg && (
            <span style={{ fontSize: "0.72rem", color: "#16a34a", fontWeight: 600 }}>
              ✓ {syncMsg}
            </span>
          )}
          <button
            type="button"
            onClick={() => void handleSync()}
            disabled={syncing || loading}
            style={{
              padding: "0.45rem 1rem",
              fontSize: "0.78rem",
              fontWeight: 700,
              borderRadius: 8,
              border: "1px solid #e2e8f0",
              background: syncing ? "#f1f5f9" : "white",
              color: "#374151",
              cursor: syncing ? "not-allowed" : "pointer",
              display: "flex",
              alignItems: "center",
              gap: "0.35rem",
            }}
          >
            {syncing ? (
              <>
                <span style={{ display: "inline-block", width: 10, height: 10, border: "2px solid #cbd5e1", borderTopColor: "#64748b", borderRadius: "50%", animation: "spin 0.7s linear infinite" }} />
                Syncing…
              </>
            ) : (
              <>↺ Sync Library</>
            )}
          </button>
        </div>
      </div>

      {/* Stats row */}
      {!loading && (
        <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
          <StatChip value={profiles.length} label="Creators" />
          <StatChip value={totalEvidence} label="Evidence Points" />
          <StatChip value={profiles.filter(p => authorityTier(p.authority_score) === "High").length} label="High Authority" />
          <StatChip value={debates.length} label="Active Debates" />
        </div>
      )}

      {loading ? (
        <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
          {[1, 2, 3].map(i => (
            <div key={i} style={{ height: 52, borderRadius: 10, background: "#f1f5f9", animation: "skeleton-pulse 1.4s ease-in-out infinite" }} />
          ))}
        </div>
      ) : profiles.length === 0 ? (
        <div
          style={{
            padding: "3rem 2rem",
            textAlign: "center",
            background: "white",
            border: "1px solid #e2e8f0",
            borderRadius: 12,
          }}
        >
          <p style={{ margin: 0, fontSize: "1.1rem", fontWeight: 700, color: "#0f172a" }}>
            No creator profiles yet
          </p>
          <p style={{ margin: "0.5rem 0 1.25rem", fontSize: "0.82rem", color: "#64748b" }}>
            Analyze at least one video, then click Sync Library to compute authority scores.
          </p>
          <button
            type="button"
            onClick={() => void handleSync()}
            disabled={syncing}
            style={{
              padding: "0.55rem 1.25rem",
              fontSize: "0.82rem",
              fontWeight: 700,
              borderRadius: 8,
              border: "none",
              background: "#0f172a",
              color: "white",
              cursor: syncing ? "not-allowed" : "pointer",
            }}
          >
            {syncing ? "Syncing…" : "↺ Sync Library"}
          </button>
        </div>
      ) : (
        <>
          {/* Creator Leaderboard */}
          <section>
            <h2 style={{ margin: "0 0 0.75rem", fontSize: "0.7rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.07em", color: "#64748b" }}>
              Creator Leaderboard
            </h2>
            <div
              style={{
                background: "white",
                border: "1px solid #e2e8f0",
                borderRadius: 12,
                overflow: "hidden",
                boxShadow: "0 1px 3px rgba(0,0,0,0.06)",
              }}
            >
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.8rem" }}>
                  <thead>
                    <tr style={{ background: "#f8fafc", borderBottom: "1px solid #e2e8f0" }}>
                      {["#", "Creator", "Tier", "Videos", "Evidence", "Topics"].map(h => (
                        <th
                          key={h}
                          style={{
                            padding: "0.5rem 0.75rem",
                            textAlign: h === "Score" ? "right" : h === "Videos" || h === "Evidence" ? "center" : "left",
                            fontSize: "0.63rem",
                            fontWeight: 700,
                            textTransform: "uppercase",
                            letterSpacing: "0.06em",
                            color: "#94a3b8",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {profiles.map((p, i) => (
                      <LeaderboardRow key={p.channel_name} rank={i + 1} profile={p} />
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </section>

          {/* Active Debates */}
          {debates.length > 0 && (
            <section>
              <h2 style={{ margin: "0 0 0.75rem", fontSize: "0.7rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.07em", color: "#64748b" }}>
                Active Debates
              </h2>
              <p style={{ margin: "0 0 0.75rem", fontSize: "0.78rem", color: "#64748b" }}>
                Topics where your creators hold opposing views — the most valuable signal in your library.
              </p>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: "0.75rem" }}>
                {debates.map(d => (
                  <DebateCard key={d.category} debate={d} />
                ))}
              </div>
            </section>
          )}

          {debates.length === 0 && (
            <section>
              <h2 style={{ margin: "0 0 0.5rem", fontSize: "0.7rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.07em", color: "#64748b" }}>
                Active Debates
              </h2>
              <div style={{ padding: "1.5rem", background: "white", border: "1px solid #e2e8f0", borderRadius: 10, textAlign: "center" }}>
                <p style={{ margin: 0, fontSize: "0.82rem", color: "#94a3b8" }}>
                  No active debates detected yet. More videos = richer contradiction detection.
                </p>
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}
