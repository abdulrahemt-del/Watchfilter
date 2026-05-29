"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AnalysisView } from "./AnalysisView";
import { GlobalAudioPlayer, type GlobalAudioPlayerHandle } from "./GlobalAudioPlayer";
import type { SavedAnalysis } from "@/lib/client-types";

export function AnalysisPageClient({ analysis: initial }: { analysis: SavedAnalysis }) {
  const router = useRouter();
  const [analysis, setAnalysis] = useState(initial);
  const [globalAudio, setGlobalAudio] = useState<{
    src: string; title: string; analysisId: string; autoPlay?: boolean;
  } | null>(null);
  const globalAudioRef = useRef(globalAudio);
  const playerRef = useRef<GlobalAudioPlayerHandle>(null);
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

  function handleRefresh() {
    // Re-fetch the updated analysis from the server after backfill/enhance
    fetch(`/api/analyses/${analysis.id}`)
      .then((r) => r.json())
      .then((data: SavedAnalysis) => setAnalysis(data))
      .catch(() => router.refresh());
  }

  function handlePlayAudio() {
    if (!analysis.audioPath) return;
    if (globalAudio?.analysisId === analysis.id) {
      // Player already mounted — call play() synchronously while still in user gesture context.
      // Using triggerPlay() avoids the gesture-context loss that occurs inside useEffect.
      playerRef.current?.triggerPlay();
    } else {
      setGlobalAudio({ src: analysis.audioPath, title: analysis.title ?? analysis.videoId, analysisId: analysis.id, autoPlay: true });
    }
  }

  return (
    <>
      <AnalysisView analysis={analysis} onRefresh={handleRefresh} onPlayAudio={handlePlayAudio} />
      {globalAudio && (
        <GlobalAudioPlayer
          ref={playerRef}
          src={globalAudio.src}
          title={globalAudio.title}
          analysisId={globalAudio.analysisId}
          autoPlay={globalAudio.autoPlay}
          onClose={() => setGlobalAudio(null)}
          onAudioPathUpdated={(newPath) => {
            setGlobalAudio(prev => prev ? { ...prev, src: newPath } : prev);
            setAnalysis(prev => ({ ...prev, audioPath: newPath }));
          }}
        />
      )}
    </>
  );
}
