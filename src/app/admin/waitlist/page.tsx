import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/options";
import { createClient } from "@libsql/client";

const ADMIN_EMAIL = "abdulrahemt@gmail.com";

function db() {
  return createClient({
    url:       process.env.TURSO_DATABASE_URL!,
    authToken: process.env.TURSO_AUTH_TOKEN,
  });
}

interface WaitlistRow   { email: string; created_at: string }
interface TeamRow       { email: string; company: string | null; team_size: string; created_at: string }
interface BetaEventRow  { event: string; n: number }

export default async function AdminWaitlistPage() {
  const session = await getServerSession(authOptions);
  if (session?.user?.email !== ADMIN_EMAIL) redirect("/");

  const c = db();
  const [waitlistRes, teamRes, betaRes] = await Promise.all([
    c.execute(`SELECT email, created_at FROM waitlist ORDER BY created_at DESC`),
    c.execute(`SELECT email, company, team_size, created_at FROM team_workspace_waitlist ORDER BY created_at DESC`),
    c.execute(`SELECT event, COUNT(*) as n FROM beta_events GROUP BY event`),
  ]);

  const waitlist  = waitlistRes.rows  as unknown as WaitlistRow[];
  const team      = teamRes.rows      as unknown as TeamRow[];
  const betaMap   = Object.fromEntries((betaRes.rows as unknown as BetaEventRow[]).map(r => [r.event, Number(r.n)]));

  function fmt(iso: string) {
    return new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
  }

  const statStyle = {
    background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)",
    borderRadius: 12, padding: "1.25rem 1.5rem",
  };

  return (
    <div style={{ minHeight: "100vh", background: "#080c14", color: "#f1f5f9", fontFamily: "system-ui, sans-serif", padding: "2rem" }}>
      <div style={{ maxWidth: 900, margin: "0 auto" }}>

        {/* Header */}
        <div style={{ marginBottom: "2rem" }}>
          <p style={{ fontSize: 11, fontFamily: "monospace", fontWeight: 800, color: "#475569", textTransform: "uppercase", letterSpacing: "0.1em", margin: "0 0 4px" }}>
            WatchFilter Admin
          </p>
          <h1 style={{ fontSize: 24, fontWeight: 800, margin: 0, color: "#f1f5f9" }}>Waitlist & Signups</h1>
        </div>

        {/* Stats row */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: "2rem" }}>
          {[
            { label: "Waitlist",    value: waitlist.length,              color: "#67e8f9" },
            { label: "Signups",     value: betaMap.signup ?? 0,          color: "#a5b4fc" },
            { label: "Activations", value: betaMap.activation ?? 0,      color: "#10b981" },
            { label: "Used App",    value: betaMap.first_analysis_generated ?? 0, color: "#fde68a" },
          ].map(s => (
            <div key={s.label} style={statStyle}>
              <div style={{ fontSize: 28, fontWeight: 800, color: s.color, lineHeight: 1 }}>{s.value}</div>
              <div style={{ fontSize: 11, color: "#475569", fontFamily: "monospace", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", marginTop: 6 }}>{s.label}</div>
            </div>
          ))}
        </div>

        {/* Waitlist table */}
        <div style={{ marginBottom: "2rem" }}>
          <h2 style={{ fontSize: 13, fontFamily: "monospace", fontWeight: 800, color: "#475569", textTransform: "uppercase", letterSpacing: "0.1em", margin: "0 0 12px" }}>
            Waitlist — {waitlist.length} {waitlist.length === 1 ? "person" : "people"}
          </h2>
          <div style={{ border: "1px solid rgba(255,255,255,0.08)", borderRadius: 12, overflow: "hidden" }}>
            {waitlist.length === 0 ? (
              <div style={{ padding: "2rem", textAlign: "center", color: "#334155", fontSize: 13, fontFamily: "monospace" }}>
                No waitlist signups yet
              </div>
            ) : (
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ background: "rgba(255,255,255,0.03)", borderBottom: "1px solid rgba(255,255,255,0.07)" }}>
                    <th style={{ padding: "10px 16px", textAlign: "left", fontSize: 10, fontFamily: "monospace", fontWeight: 800, color: "#475569", textTransform: "uppercase", letterSpacing: "0.1em" }}>Email</th>
                    <th style={{ padding: "10px 16px", textAlign: "right", fontSize: 10, fontFamily: "monospace", fontWeight: 800, color: "#475569", textTransform: "uppercase", letterSpacing: "0.1em" }}>Joined</th>
                  </tr>
                </thead>
                <tbody>
                  {waitlist.map((row, i) => (
                    <tr key={i} style={{ borderBottom: i < waitlist.length - 1 ? "1px solid rgba(255,255,255,0.05)" : "none" }}>
                      <td style={{ padding: "11px 16px", fontSize: 13, color: "#f1f5f9", fontFamily: "monospace" }}>{row.email}</td>
                      <td style={{ padding: "11px 16px", fontSize: 11, color: "#475569", fontFamily: "monospace", textAlign: "right" }}>{fmt(row.created_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {/* Team waitlist table */}
        {team.length > 0 && (
          <div style={{ marginBottom: "2rem" }}>
            <h2 style={{ fontSize: 13, fontFamily: "monospace", fontWeight: 800, color: "#475569", textTransform: "uppercase", letterSpacing: "0.1em", margin: "0 0 12px" }}>
              Team Waitlist — {team.length} {team.length === 1 ? "team" : "teams"}
            </h2>
            <div style={{ border: "1px solid rgba(255,255,255,0.08)", borderRadius: 12, overflow: "hidden" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ background: "rgba(255,255,255,0.03)", borderBottom: "1px solid rgba(255,255,255,0.07)" }}>
                    <th style={{ padding: "10px 16px", textAlign: "left", fontSize: 10, fontFamily: "monospace", fontWeight: 800, color: "#475569", textTransform: "uppercase", letterSpacing: "0.1em" }}>Email</th>
                    <th style={{ padding: "10px 16px", textAlign: "left", fontSize: 10, fontFamily: "monospace", fontWeight: 800, color: "#475569", textTransform: "uppercase", letterSpacing: "0.1em" }}>Company</th>
                    <th style={{ padding: "10px 16px", textAlign: "left", fontSize: 10, fontFamily: "monospace", fontWeight: 800, color: "#475569", textTransform: "uppercase", letterSpacing: "0.1em" }}>Team Size</th>
                    <th style={{ padding: "10px 16px", textAlign: "right", fontSize: 10, fontFamily: "monospace", fontWeight: 800, color: "#475569", textTransform: "uppercase", letterSpacing: "0.1em" }}>Joined</th>
                  </tr>
                </thead>
                <tbody>
                  {team.map((row, i) => (
                    <tr key={i} style={{ borderBottom: i < team.length - 1 ? "1px solid rgba(255,255,255,0.05)" : "none" }}>
                      <td style={{ padding: "11px 16px", fontSize: 13, color: "#f1f5f9", fontFamily: "monospace" }}>{row.email}</td>
                      <td style={{ padding: "11px 16px", fontSize: 12, color: "#94a3b8" }}>{row.company ?? "—"}</td>
                      <td style={{ padding: "11px 16px", fontSize: 12, color: "#94a3b8" }}>{row.team_size}</td>
                      <td style={{ padding: "11px 16px", fontSize: 11, color: "#475569", fontFamily: "monospace", textAlign: "right" }}>{fmt(row.created_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        <p style={{ fontSize: 10, color: "#1e293b", fontFamily: "monospace", textAlign: "center" }}>
          Only visible to abdulrahemt@gmail.com · <a href="/" style={{ color: "#334155" }}>← Back to app</a>
        </p>

      </div>
    </div>
  );
}
