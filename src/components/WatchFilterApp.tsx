"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { AnalysisView } from "./AnalysisView";
import { HistoryPanel } from "./HistoryPanel";
import type {
  AnalysisSummary,
  ApiErrorBody,
  HistoryResponse,
  SavedAnalysis,
} from "@/lib/client-types";

export function WatchFilterApp() {
  const [url, setUrl] = useState("");
  const [history, setHistory] = useState<AnalysisSummary[]>([]);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [analysis, setAnalysis] = useState<SavedAnalysis | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadHistory = useCallback(async () => {
    setHistoryLoading(true);
    try {
      const res = await fetch("/api/analyses");
      const data = (await res.json()) as HistoryResponse & ApiErrorBody;
      if (!res.ok) throw new Error(data.error ?? "Failed to load history");
      setHistory(data.analyses);
    } catch (err) {
      console.error(err);
    } finally {
      setHistoryLoading(false);
    }
  }, []);

  const loadAnalysis = useCallback(async (id: string) => {
    setLoadingDetail(true);
    setError(null);
    try {
      const res = await fetch(`/api/analyses/${id}`);
      const data = (await res.json()) as SavedAnalysis & ApiErrorBody;
      if (!res.ok) throw new Error(data.error ?? "Failed to load analysis");
      setAnalysis(data);
      setActiveId(id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load analysis");
    } finally {
      setLoadingDetail(false);
    }
  }, []);

  useEffect(() => {
    void loadHistory();
  }, [loadHistory]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const trimmed = url.trim();
    if (!trimmed) return;

    setAnalyzing(true);
    setError(null);

    try {
      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: trimmed }),
      });

      const data = (await res.json()) as SavedAnalysis & ApiErrorBody;

      if (!res.ok) {
        let message = data.error ?? "Analysis failed";
        if (data.attempts?.length) {
          message += ` (${data.attempts.length} transcript attempts)`;
        }
        throw new Error(message);
      }

      setAnalysis(data);
      setActiveId(data.id);
      setUrl("");
      await loadHistory();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Analysis failed");
    } finally {
      setAnalyzing(false);
    }
  }

  function handleSelectHistory(id: string) {
    if (id === activeId && analysis) return;
    void loadAnalysis(id);
  }

  const showLoading = analyzing || loadingDetail;

  return (
    <div className="app-shell">
      <HistoryPanel
        items={history}
        activeId={activeId}
        loading={historyLoading}
        onSelect={handleSelectHistory}
        onRefresh={() => void loadHistory()}
      />

      <main className="main-panel">
        <h1 className="brand">WatchFilter</h1>
        <p className="tagline">
          Paste a YouTube URL. Get facts, takeaways, and a clickbait score—saved
          automatically.
        </p>

        <form className="analyze-form" onSubmit={(e) => void handleSubmit(e)}>
          <input
            className="url-input"
            type="url"
            placeholder="https://www.youtube.com/watch?v=..."
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            disabled={analyzing}
            required
          />
          <button className="btn btn-primary" type="submit" disabled={analyzing}>
            {analyzing ? "Analyzing…" : "Analyze"}
          </button>
        </form>

        {showLoading && (
          <div className="status-box status-loading">
            <span className="spinner" />
            {analyzing
              ? "Fetching transcript and running GPT-4o…"
              : "Loading saved analysis…"}
          </div>
        )}

        {error && (
          <div className="status-box status-error" role="alert">
            {error}
          </div>
        )}

        {analysis && !loadingDetail && <AnalysisView analysis={analysis} />}
      </main>
    </div>
  );
}
