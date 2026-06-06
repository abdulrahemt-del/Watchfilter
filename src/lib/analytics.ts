// Lightweight client-side analytics. No external SDK required.
// Events are buffered in sessionStorage for debugging and forwarded to
// window.gtag / window.plausible if configured on the page.

export type AnalyticsEvent =
  | "video_analyzed"
  | "audio_played"
  | "consensus_opened"
  | "opportunity_clicked"
  | "dashboard_viewed"
  | "feedback_submitted"
  | "team_workspace_page_viewed"
  | "team_workspace_request_clicked"
  | "team_workspace_waitlist_joined";

export interface TrackPayload {
  event: AnalyticsEvent;
  videoId?: string;
  analysisId?: string;
  label?: string;
  value?: number;
}

declare global {
  interface Window {
    gtag?: (...args: unknown[]) => void;
    plausible?: (event: string, opts?: { props?: Record<string, string | number> }) => void;
  }
}

const SESSION_KEY = "wf_analytics_session";

function flush(payload: TrackPayload): void {
  // Forward to Google Analytics (gtag) if configured
  if (typeof window.gtag === "function") {
    window.gtag("event", payload.event, {
      event_category: "WatchFilter",
      event_label: payload.label,
      value: payload.value,
      video_id: payload.videoId,
      analysis_id: payload.analysisId,
    });
  }

  // Forward to Plausible if configured
  if (typeof window.plausible === "function") {
    window.plausible(payload.event, {
      props: {
        ...(payload.videoId   && { videoId:    payload.videoId }),
        ...(payload.analysisId && { analysisId: payload.analysisId }),
        ...(payload.label     && { label:       payload.label }),
      },
    });
  }
}

export function track(event: AnalyticsEvent, extra?: Omit<TrackPayload, "event">): void {
  if (typeof window === "undefined") return;

  const payload: TrackPayload = { event, ...extra };

  // Append to session log (capped at 200 entries)
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    const log: TrackPayload[] = raw ? (JSON.parse(raw) as TrackPayload[]) : [];
    log.push({ ...payload, value: Date.now() });
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(log.slice(-200)));
  } catch {
    // sessionStorage unavailable — fine
  }

  flush(payload);
}
