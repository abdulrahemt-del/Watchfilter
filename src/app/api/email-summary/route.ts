import { NextRequest, NextResponse } from "next/server";
import { Resend } from "resend";
import { getAnalysisById } from "@/lib/db";
import type { SavedAnalysis } from "@/lib/client-types";

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

function buildHtml(analysis: SavedAnalysis): string {
  const title = analysis.title ?? `Video ${analysis.videoId}`;
  const scoreColor = clickbaitColor(analysis.clickbait_score);
  const scoreLabel = clickbaitLabel(analysis.clickbait_score);

  const dataPointsHtml = analysis.hard_data_points.length > 0
    ? analysis.hard_data_points.map((point) => {
        let title: string, thesis: string | null, quote: string | null, ts: string | null;
        if (typeof point === "string") {
          title = point; thesis = null; quote = null; ts = null;
        } else if ("metric_title" in point) {
          title = point.metric_title; thesis = point.speaker_thesis; quote = point.direct_quote; ts = point.exact_timestamp;
        } else if ("metric_context" in point) {
          title = `${point.metric_context} — ${point.metric_value}`; thesis = point.root_cause; quote = null; ts = null;
        } else {
          title = point.metric; thesis = point.root_cause; quote = null; ts = null;
        }
        return `
          <tr>
            <td style="padding:14px 0;border-bottom:1px solid #e5e7eb;">
              <p style="margin:0 0 8px;font-weight:700;color:#111827;font-size:14px;line-height:1.4;">
                ${title}
                ${ts ? `<span style="margin-left:8px;display:inline-block;background:#eff6ff;color:#2563eb;font-size:11px;padding:2px 8px;border-radius:9999px;font-weight:600;">▶ ${ts}</span>` : ""}
              </p>
              ${thesis ? `
              <div style="margin-bottom:8px;">
                <p style="margin:0 0 4px;font-size:10px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:#5b8def;">Speaker Thesis</p>
                <p style="margin:0;font-size:13px;color:#374151;line-height:1.6;">${thesis}</p>
              </div>` : ""}
              ${quote ? `
              <div style="border-left:3px solid #5b8def;padding:8px 12px;background:#f0f4ff;border-radius:0 4px 4px 0;">
                <p style="margin:0 0 3px;font-size:10px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:#5b8def;">Transcript Anchor</p>
                <p style="margin:0;font-size:13px;color:#6b7280;font-style:italic;line-height:1.55;">"${quote}"</p>
              </div>` : ""}
            </td>
          </tr>`;
      }).join("")
    : `<tr><td style="padding:12px 0;color:#6b7280;font-size:13px;">No hard data points extracted.</td></tr>`;

  const takeawaysHtml = analysis.actionable_takeaways.map((takeaway, index) => {
    const strategy = typeof takeaway === "string" ? takeaway : takeaway.strategy;
    const steps = typeof takeaway === "string" ? [] : (takeaway.execution_steps ?? []);
    const ts = analysis.timestamps.find((t) => t.takeaway_index === index);
    const stepsHtml = steps.map((step) =>
      `<li style="margin:4px 0;color:#374151;font-size:13px;">${step}</li>`
    ).join("");
    const tsHtml = ts
      ? `<a href="${youtubeWatchUrl(analysis.videoId, ts.time)}" style="display:inline-block;margin-top:8px;padding:4px 12px;background:#eff6ff;border:1px solid #93c5fd;border-radius:999px;font-size:12px;font-weight:600;color:#2563eb;text-decoration:none;">▶ ${ts.time}${ts.label ? ` · ${ts.label}` : ""}</a>`
      : "";
    return `
      <tr>
        <td style="padding:14px 0;border-bottom:1px solid #e5e7eb;">
          <p style="margin:0 0 2px;font-size:10px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:#5b8def;">Priority ${index + 1}</p>
          <p style="margin:0 0 8px;font-weight:600;color:#111827;font-size:14px;line-height:1.4;">${strategy}</p>
          ${stepsHtml ? `<ul style="margin:0 0 6px;padding-left:18px;">${stepsHtml}</ul>` : ""}
          ${tsHtml}
        </td>
      </tr>`;
  }).join("");

  const timestampsHtml = analysis.timestamps.map((ts) => {
    const takeaway = analysis.actionable_takeaways[ts.takeaway_index];
    const label = ts.label || (typeof takeaway === "string" ? takeaway : takeaway?.strategy) || "";
    return `<a href="${youtubeWatchUrl(analysis.videoId, ts.time)}" style="display:inline-flex;align-items:center;gap:6px;margin:4px;padding:6px 14px;background:#eff6ff;border:1px solid #93c5fd;border-radius:999px;font-size:12px;font-weight:600;color:#2563eb;text-decoration:none;">▶ ${ts.time} <span style="font-weight:400;color:#4b5563;">${label}</span></a>`;
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
          <h1 style="margin:0;font-size:18px;font-weight:700;color:#e8eaef;line-height:1.3;">
            <a href="${analysis.youtubeUrl}" style="color:#e8eaef;text-decoration:none;">${title}</a>
          </h1>
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
                <p style="margin:0;font-size:14px;font-weight:500;color:#111827;">${analysis.primary_subject}</p>
              </td>
              <td style="padding:14px 18px;text-align:center;white-space:nowrap;">
                <p style="margin:0 0 2px;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.06em;color:#9ca3af;">Data Density</p>
                <p style="margin:0;font-size:14px;font-weight:500;color:#111827;">${analysis.hard_data_points.length} metrics</p>
              </td>
            </tr>
          </table>
        </td></tr>

        <!-- Hard Data -->
        <tr><td style="padding:24px 32px 0;">
          <p style="margin:0 0 12px;font-size:10px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:#9ca3af;">📊 Hard Data &amp; Root Causes</p>
          <table width="100%" cellpadding="0" cellspacing="0">${dataPointsHtml}</table>
        </td></tr>

        <!-- Playbook -->
        <tr><td style="padding:24px 32px 0;">
          <p style="margin:0 0 12px;font-size:10px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:#9ca3af;">🚀 Tactical Playbook</p>
          <table width="100%" cellpadding="0" cellspacing="0">${takeawaysHtml}</table>
        </td></tr>

        <!-- Timestamps -->
        <tr><td style="padding:24px 32px;">
          <p style="margin:0 0 10px;font-size:10px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:#9ca3af;">⏱️ Timestamp Index</p>
          <div>${timestampsHtml}</div>
        </td></tr>

        <!-- Footer -->
        <tr><td style="padding:20px 32px;background:#f9fafb;border-top:1px solid #e5e7eb;">
          <p style="margin:0;font-size:12px;color:#9ca3af;">Sent by WatchFilter · ${analysis.transcriptCharCount.toLocaleString()} transcript chars · Source: ${analysis.transcriptSource}</p>
        </td></tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

export async function POST(req: NextRequest) {
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

  const analysis = getAnalysisById(analysisId);
  if (!analysis) {
    return NextResponse.json({ error: "Analysis not found." }, { status: 404 });
  }

  const resend = new Resend(apiKey);
  const from = process.env.RESEND_FROM_EMAIL ?? "onboarding@resend.dev";
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
