"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AnalysisView } from "./AnalysisView";
import { GlobalAudioPlayer } from "./GlobalAudioPlayer";
import type { SavedAnalysis } from "@/lib/client-types";

export function AnalysisPageClient({ analysis: initial }: { analysis: SavedAnalysis }) {
  const router = useRouter();
  const [analysis, setAnalysis] = useState(initial);
  const [globalAudio, setGlobalAudio] = useState<{
    src: string; title: string; analysisId: string; autoPlay?: boolean;
  } | null>(null);
  const globalAudioRef = useRef(globalAudio);
  useEffect(() => { globalAudioRef.current = globalAudio; }, [globalAudio]);

  // Surface audio player whenever analysis has an audioPath
  useEffect(() => {
    if (!analysis.audioPath) return;
    setGlobalAudio((prev) => {
      if (!prev) return { src: analysis.audioPath!, title: analysis.title ?? analysis.videoId, analysisId: analysis.id };
      if (prev.analysisId === analysis.id && prev.src !== analysis.audioPath) return { ...prev, src: analysis.audioPath! };
      return prev;
    });
  }, [analysis.audioPath, analysis.id, analysis.title, analysis.videoId]);

  // Poll for audioPath when it isn't set yet (TTS runs in background after analysis saves)
  useEffect(() => {
    if (analysis.audioPath) return;
    let tries = 0;
    const MAX_TRIES = 18; // ~90 seconds
    const id = setInterval(async () => {
      tries++;
      try {
        const res = await fetch(`/api/analyses/${analysis.id}`);
        if (!res.ok) return;
        const data = (await res.json()) as SavedAnalysis;
        if (data.audioPath) {
          setAnalysis((prev) => ({ ...prev, audioPath: data.audioPath }));
          clearInterval(id);
        }
      } catch { /* ignore, keep polling */ }
      if (tries >= MAX_TRIES) clearInterval(id);
    }, 5000);
    return () => clearInterval(id);
  }, [analysis.id, analysis.audioPath]);

  function handleRefresh() {
    // Re-fetch the updated analysis from the server after backfill/enhance
    fetch(`/api/analyses/${analysis.id}`)
      .then((r) => r.json())
      .then((data: SavedAnalysis) => setAnalysis(data))
      .catch(() => router.refresh());
  }

  return (
    <>
      <AnalysisView analysis={analysis} onRefresh={handleRefresh} />
      {globalAudio && (
        <GlobalAudioPlayer
          src={globalAudio.src}
          title={globalAudio.title}
          analysisId={globalAudio.analysisId}
          autoPlay={globalAudio.autoPlay}
          onClose={() => setGlobalAudio(null)}
        />
      )}
    </>
  );
}
