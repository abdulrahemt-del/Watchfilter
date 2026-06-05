import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/options";
import { Resend } from "resend";
import { getAnalysisById } from "@/lib/db";
import type { SavedAnalysis } from "@/lib/client-types";

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function youtubeWatchUrl(videoId: string, time?: string): string {
  const base = `https://www.youtube.com/watch?v=${videoId}`;
  if (!time) return base;
  const parts = time.split(":").map(Number);
  let seconds = 0;
  if (parts.length === 2) seconds = parts[0]! * 60 + parts[1]!;
  else if (parts.length === 3)
    seconds = parts[0]! * 3600 + parts[1]! * 60 + parts[2]!;
  return `${base}&t=${seconds}`;
}

function clickbaitColor(score: number): string {
  if (score <= 3) return "#22c55e";
  if (score <= 6) return "#f59e0b";
  return "#ef4444";
}

function clickbaitLabel(score: number): string {
  if (score <= 3) return "Accurate";
  if (score <= 6) return "Sensationalized";
  return "High Clickbait";
}

type SignalStrength = "Very High" | "High" | "Medium" | "Low";

const SIGNAL_RANK: Record<string, number> = { "Very High": 4, "High": 3, "Medium": 2, "Low": 1 };

const SIGNAL_LABEL: Record<string, string> = {
  "Very High": "HIGH SIGNAL",
  "High":      "HIGH SIGNAL",
  "Medium":    "MEDIUM SIGNAL",
  "Low":       "EMERGING SIGNAL",
};

const SIGNAL_COLOR: Record<string, string> = {
  "Very High": "#16a34a",
  "High":      "#16a34a",
  "Medium":    "#d97706",
  "Low":       "#6b7280",
};

const SIGNAL_BG: Record<string, string> = {
  "Very High": "#f0fdf4",
  "High":      "#f0fdf4",
  "Medium":    "#fffbeb",
  "Low":       "#f9fafb",
};

type ResolvedPoint = {
  title: string;
  speakerThesis: string | null;
  causalChain: string | null;
  quote: string | null;
  credibilityCheck: string | null;
  timestamp: string | null;
  secondOrderImplications: string | null;
  contrarianView: string | null;
  actionableTakeaway: string | null;
  evidenceStrength: string | null;
  evidenceFactors: string | null;
  signalStrength: SignalStrength | null;
  signalReason: string | null;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function resolvePoint(point: any): ResolvedPoint {
  if (typeof point === "string") {
    return { title: escapeHtml(point), speakerThesis: null, causalChain: null, quote: null, credibilityCheck: null, timestamp: null, secondOrderImplications: null, contrarianView: null, actionableTakeaway: null, evidenceStrength: null, evidenceFactors: null, signalStrength: null, signalReason: null };
  }
  if ("metric_title" in point) {
    const legacyEvMap: Record<string, string> = { "Verified": "Strong", "Partially Verified": "Moderate", "Unverified": "Weak", "Opinion": "Weak", "Speculation": "Weak" };
    return {
      title:                   escapeHtml(String(point.metric_title ?? "")),
      speakerThesis:           point.speaker_thesis ? escapeHtml(point.speaker_thesis) : null,
      causalChain:             point.causal_chain ? escapeHtml(point.causal_chain) : null,
      quote:                   point.direct_quote ? escapeHtml(point.direct_quote) : null,
      credibilityCheck:        point.credibility_check ? escapeHtml(point.credibility_check) : null,
      timestamp:               point.exact_timestamp ? escapeHtml(point.exact_timestamp) : null,
      secondOrderImplications: point.second_order_implications ? escapeHtml(point.second_order_implications) : null,
      contrarianView:          point.contrarian_view ? escapeHtml(point.contrarian_view) : null,
      actionableTakeaway:      point.actionable_takeaway ? escapeHtml(point.actionable_takeaway) : null,
      evidenceStrength:        point.evidence_strength ?? legacyEvMap[point.verification_status ?? ""] ?? null,
      evidenceFactors:         point.evidence_factors ?? point.verification_reason ?? null,
      signalStrength:          (point.signal_strength as SignalStrength | undefined) ?? null,
      signalReason:            point.signal_reason ?? null,
    };
  }
  if ("metric_context" in point) {
    return { title: escapeHtml(`${point.metric_context} — ${point.metric_value}`), speakerThesis: null, causalChain: escapeHtml(point.root_cause), quote: null, credibilityCheck: null, timestamp: null, secondOrderImplications: null, contrarianView: null, actionableTakeaway: null, evidenceStrength: null, evidenceFactors: null, signalStrength: null, signalReason: null };
  }
  return { title: escapeHtml(String(point.metric ?? "")), speakerThesis: null, causalChain: point.root_cause ? escapeHtml(point.root_cause) : null, quote: null, credibilityCheck: null, timestamp: null, secondOrderImplications: null, contrarianView: null, actionableTakeaway: null, evidenceStrength: null, evidenceFactors: null, signalStrength: null, signalReason: null };
}

function buildHtml(analysis: SavedAnalysis): string {
  const title = escapeHtml(analysis.title ?? `Video ${analysis.videoId}`);
  const scoreColor = clickbaitColor(analysis.clickbait_score);
  const scoreLabel = clickbaitLabel(analysis.clickbait_score);

  // Sort data points by signal strength, highest first
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sortedPoints = [...analysis.hard_data_points].sort((a: any, b: any) => {
    const ra = typeof a === "object" && a !== null ? SIGNAL_RANK[a.signal_strength as string] ?? 0 : 0;
    const rb = typeof b === "object" && b !== null ? SIGNAL_RANK[b.signal_strength as string] ?? 0 : 0;
    return rb - ra;
  });

  const dataPointsHtml = sortedPoints.length > 0
    ? sortedPoints.map((point, idx) => {
        const { title: ptTitle, speakerThesis, quote, secondOrderImplications, contrarianView, actionableTakeaway, evidenceStrength, evidenceFactors, signalStrength, timestamp } = resolvePoint(point);
        const rank = idx + 1;
        const sigLabel = signalStrength ? SIGNAL_LABEL[signalStrength] : null;
        const sigColor = signalStrength ? SIGNAL_COLOR[signalStrength] : null;
        const sigBg = signalStrength ? SIGNAL_BG[signalStrength] : null;
        const evColor = evidenceStrength === "Strong" ? "#16a34a" : evidenceStrength === "Moderate" ? "#d97706" : "#6b7280";
        const takeawayBullets = actionableTakeaway
          ? (() => {
              const byNewline = actionableTakeaway.split(/\n+/).map((s: string) => s.trim()).filter(Boolean);
              if (byNewline.length > 1) return byNewline;
              const sentences = actionableTakeaway.match(/[^.!?]*[.!?]+\s*/g)?.map((s: string) => s.trim()).filter((s: string) => s.length > 10) ?? [];
              return sentences.length > 1 ? sentences : [actionableTakeaway];
            })()
          : [];
        return `
          <tr>
            <td style="padding:16px 0;border-bottom:1px solid #e5e7eb;">
              <!-- Title row -->
              <div style="display:flex;align-items:flex-start;gap:8px;flex-wrap:wrap;margin-bottom:10px;">
                ${rank <= 3 ? `<span style="display:inline-block;background:#eff6ff;color:#2563eb;font-size:10px;font-weight:700;padding:2px 7px;border-radius:9999px;white-space:nowrap;">#${rank} Insight</span>` : ""}
                ${sigLabel && sigColor && sigBg ? `<span style="display:inline-block;background:${sigBg};color:${sigColor};border:1px solid ${sigColor}33;font-size:10px;font-weight:700;letter-spacing:0.06em;padding:2px 7px;border-radius:9999px;white-space:nowrap;">${sigLabel}</span>` : ""}
                ${timestamp ? `<a href="${youtubeWatchUrl(analysis.videoId, timestamp)}" style="display:inline-block;background:#eff6ff;color:#2563eb;font-size:11px;font-weight:600;padding:2px 8px;border-radius:9999px;text-decoration:none;white-space:nowrap;">▶ ${timestamp}</a>` : ""}
              </div>
              <p style="margin:0 0 12px;font-weight:700;color:#111827;font-size:15px;line-height:1.4;">${ptTitle}</p>

              ${quote ? `
              <div style="margin-bottom:12px;border-left:3px solid #5b8def;padding:10px 14px;background:#f0f4ff;border-radius:0 6px 6px 0;">
                <p style="margin:0 0 4px;font-size:10px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:#5b8def;">Direct Quote</p>
                <p style="margin:0;font-size:13px;color:#4b5563;font-style:italic;line-height:1.6;">&ldquo;${quote}&rdquo;</p>
              </div>` : ""}

              ${speakerThesis ? `
              <div style="margin-bottom:12px;padding:10px 14px;background:#f9fafb;border:1px solid #e5e7eb;border-radius:6px;">
                <p style="margin:0 0 4px;font-size:10px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:#6b7280;">Core Insight</p>
                <p style="margin:0;font-size:13px;color:#374151;line-height:1.7;">${speakerThesis}</p>
              </div>` : ""}

              ${secondOrderImplications ? `
              <div style="margin-bottom:12px;padding:10px 14px;background:#faf5ff;border:1px solid #d8b4fe;border-radius:6px;">
                <p style="margin:0 0 4px;font-size:10px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:#7c3aed;">⚡ Second-Order Implications</p>
                <p style="margin:0;font-size:13px;color:#374151;line-height:1.7;">${secondOrderImplications}</p>
              </div>` : ""}

              ${contrarianView ? `
              <div style="margin-bottom:12px;padding:10px 14px;background:#fffbeb;border:1px solid #fde68a;border-radius:6px;">
                <p style="margin:0 0 4px;font-size:10px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:#d97706;">⚡ Contrarian View</p>
                <p style="margin:0;font-size:13px;color:#374151;font-style:italic;line-height:1.7;">${contrarianView}</p>
              </div>` : ""}

              ${takeawayBullets.length > 0 ? `
              <div style="margin-bottom:12px;padding:10px 14px;background:#f0fdf4;border:1px solid #bbf7d0;border-radius:6px;">
                <p style="margin:0 0 6px;font-size:10px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:#16a34a;">✓ Actionable Takeaway</p>
                <ul style="margin:0;padding-left:18px;">
                  ${takeawayBullets.map((b: string) => `<li style="margin:3px 0;font-size:13px;color:#374151;line-height:1.5;">${b.replace(/^[✓•\-*]\s*/, "")}</li>`).join("")}
                </ul>
              </div>` : ""}

              ${evidenceStrength ? `
              <div style="display:inline-flex;align-items:center;gap:6px;">
                <span style="font-size:10px;font-weight:700;letter-spacing:0.06em;text-transform:uppercase;color:${evColor};">◎ ${evidenceStrength} Evidence</span>
                ${evidenceFactors ? `<span style="font-size:11px;color:#9ca3af;">· ${escapeHtml(String(evidenceFactors)).split("\n")[0] ?? ""}</span>` : ""}
              </div>` : ""}
            </td>
          </tr>`;
      }).join("")
    : `<tr><td style="padding:12px 0;color:#6b7280;font-size:13px;">No hard data points extracted.</td></tr>`;

  // Worth Watching verdict
  const ww = analysis.worth_watching;
  const wwColor = ww ? (ww.score >= 8 ? "#16a34a" : ww.score >= 6 ? "#84cc16" : ww.score >= 4 ? "#d97706" : "#ef4444") : null;
  const wwWorthIt = ww ? ww.score >= 6 : false;
  const wwVerdictColor = wwWorthIt ? "#16a34a" : "#ef4444";

  // Off-Script Golden Nuggets
  const nuggets = analysis.off_script_nuggets ?? [];

  // Who Should Care
  const whoShouldCare = analysis.who_should_care;

  // Timestamps
  const timestampsHtml = analysis.timestamps.map((ts) => {
    const takeaway = analysis.actionable_takeaways[ts.takeaway_index];
    const label = escapeHtml(ts.label || (typeof takeaway === "string" ? takeaway : takeaway?.strategy) || "");
    return `<a href="${youtubeWatchUrl(analysis.videoId, ts.time)}" style="display:inline-flex;align-items:center;gap:6px;margin:4px;padding:6px 14px;background:#eff6ff;border:1px solid #93c5fd;border-radius:999px;font-size:12px;font-weight:600;color:#2563eb;text-decoration:none;">▶ ${escapeHtml(ts.time)} <span style="font-weight:400;color:#4b5563;">${label}</span></a>`;
  }).join("");

  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>WatchFilter: ${title}</title></head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;padding:32px 16px;">
    <tr><td>
      <table width="100%" cellpadding="0" cellspacing="0" style="max-width:620px;margin:0 auto;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">

        <!-- Header -->
        <tr><td style="background:#0c0d10;padding:28px 32px;">
          <p style="margin:0 0 4px;font-size:11px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;color:#5b8def;">WatchFilter</p>
          <h1 style="margin:0 0 8px;font-size:18px;font-weight:700;color:#e8eaef;line-height:1.3;">
            <a href="${analysis.youtubeUrl}" style="color:#e8eaef;text-decoration:none;">${title}</a>
          </h1>
          ${analysis.channelName ? `<p style="margin:0;font-size:12px;color:#9ca3af;">${escapeHtml(analysis.channelName)}</p>` : ""}
        </td></tr>

        <!-- Executive Snapshot -->
        <tr><td style="padding:24px 32px 0;">
          <p style="margin:0 0 12px;font-size:10px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:#9ca3af;">Executive Snapshot</p>
          <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;">
            <tr>
              <td style="padding:14px 18px;border-right:1px solid #e5e7eb;text-align:center;width:90px;">
                <p style="margin:0 0 2px;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.06em;color:#9ca3af;">Clickbait</p>
                <p style="margin:0;font-size:24px;font-weight:700;color:${scoreColor};">${analysis.clickbait_score}/10</p>
                <p style="margin:0;font-size:10px;font-weight:600;color:${scoreColor};">${scoreLabel}</p>
              </td>
              <td style="padding:14px 18px;border-right:1px solid #e5e7eb;">
                <p style="margin:0 0 2px;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.06em;color:#9ca3af;">Primary Subject</p>
                <p style="margin:0;font-size:14px;font-weight:500;color:#111827;">${escapeHtml(analysis.primary_subject)}</p>
              </td>
              <td style="padding:14px 18px;text-align:center;white-space:nowrap;">
                <p style="margin:0 0 2px;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.06em;color:#9ca3af;">Data Density</p>
                <p style="margin:0;font-size:14px;font-weight:500;color:#111827;">${analysis.hard_data_points.length} metrics</p>
              </td>
            </tr>
          </table>
        </td></tr>

        ${ww ? `
        <!-- Worth Watching Verdict -->
        <tr><td style="padding:20px 32px 0;">
          <div style="border:2px solid ${wwVerdictColor};border-radius:10px;overflow:hidden;">
            <div style="background:${wwWorthIt ? "#f0fdf4" : "#fef2f2"};padding:16px 20px;display:flex;justify-content:space-between;align-items:center;">
              <div>
                <p style="margin:0 0 2px;font-size:10px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:#9ca3af;">WATCHFILTER VERDICT</p>
                <p style="margin:0;font-size:15px;font-weight:700;color:${wwVerdictColor};">Worth Watching: ${wwWorthIt ? "YES" : "NO"}</p>
              </div>
              <div style="text-align:right;">
                <p style="margin:0 0 2px;font-size:10px;font-weight:700;letter-spacing:0.06em;text-transform:uppercase;color:#9ca3af;">Score</p>
                <p style="margin:0;font-size:28px;font-weight:700;color:${wwColor};">${ww.score.toFixed(1)}<span style="font-size:14px;color:#9ca3af;">/10</span></p>
              </div>
            </div>
            <div style="padding:14px 20px;background:#fff;border-top:1px solid #e5e7eb;">
              <p style="margin:0;font-size:13px;color:#374151;line-height:1.6;">${escapeHtml(ww.verdict)}</p>
            </div>
          </div>
        </td></tr>` : ""}

        ${whoShouldCare && whoShouldCare.most_relevant_for.length > 0 ? `
        <!-- Who Should Care -->
        <tr><td style="padding:20px 32px 0;">
          <p style="margin:0 0 10px;font-size:10px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:#9ca3af;">Most Relevant For</p>
          <div style="display:flex;flex-wrap:wrap;gap:6px;">
            ${whoShouldCare.most_relevant_for.map(r => `<span style="display:inline-block;background:#eff6ff;color:#2563eb;border:1px solid #bfdbfe;font-size:12px;font-weight:600;padding:4px 10px;border-radius:9999px;">${escapeHtml(r)}</span>`).join("")}
          </div>
        </td></tr>` : ""}

        <!-- Intelligence — Ranked by Signal Priority -->
        <tr><td style="padding:24px 32px 0;">
          <p style="margin:0 0 12px;font-size:10px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:#9ca3af;">📊 Intelligence — Ranked by Signal Priority</p>
          <table width="100%" cellpadding="0" cellspacing="0">${dataPointsHtml}</table>
        </td></tr>

        ${nuggets.length > 0 ? `
        <!-- Off-Script Golden Nuggets -->
        <tr><td style="padding:24px 32px 0;">
          <p style="margin:0 0 12px;font-size:10px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:#9ca3af;">🧠 Off-Script Golden Nuggets</p>
          <div style="background:#faf5ff;border:1px solid #e9d5ff;border-radius:8px;padding:16px 20px;">
            <ul style="margin:0;padding-left:18px;">
              ${nuggets.map(n => `<li style="margin:6px 0;font-size:13px;color:#374151;line-height:1.6;">${escapeHtml(n)}</li>`).join("")}
            </ul>
          </div>
        </td></tr>` : ""}

        ${analysis.timestamps.length > 0 ? `
        <!-- Timestamps -->
        <tr><td style="padding:24px 32px 0;">
          <p style="margin:0 0 10px;font-size:10px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:#9ca3af;">⏱️ Timestamp Index</p>
          <div>${timestampsHtml}</div>
        </td></tr>` : ""}

        <!-- Footer -->
        <tr><td style="padding:20px 32px;background:#f9fafb;border-top:1px solid #e5e7eb;margin-top:24px;">
          <p style="margin:0;font-size:12px;color:#9ca3af;">Sent by WatchFilter · ${analysis.transcriptCharCount.toLocaleString()} transcript chars · Source: ${analysis.transcriptSource}</p>
        </td></tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey || apiKey === "re_your_resend_api_key_here") {
    return NextResponse.json({ error: "RESEND_API_KEY not configured." }, { status: 503 });
  }

  let body: { analysisId?: string; email?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const { analysisId, email } = body;
  if (!analysisId || !email) {
    return NextResponse.json({ error: "analysisId and email are required." }, { status: 400 });
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: "Invalid email address." }, { status: 400 });
  }

  const analysis = await getAnalysisById(analysisId);
  if (!analysis) {
    return NextResponse.json({ error: "Analysis not found." }, { status: 404 });
  }

  const resend = new Resend(apiKey);
  const from = process.env.RESEND_FROM_EMAIL ?? "hello@watchfilter.app";
  const title = analysis.title ?? `Video ${analysis.videoId}`;

  const { error } = await resend.emails.send({
    from,
    to: email,
    subject: `WatchFilter: ${title}`,
    html: buildHtml(analysis),
  });

  if (error) {
    console.error("Resend error:", error);
    return NextResponse.json({ error: error.message }, { status: 502 });
  }

  return NextResponse.json({ success: true });
}
