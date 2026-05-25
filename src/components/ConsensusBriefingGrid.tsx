"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { BriefingCard } from "./BriefingCard";
import { GlobalAudioPlayer } from "./GlobalAudioPlayer";
import type { AnalysisSummary } from "@/lib/client-types";

interface Props {
  items: AnalysisSummary[];
}

export function ConsensusBriefingGrid({ items }: Props) {
  const router = useRouter();
  const [audio, setAudio] = useState<{ src: string; title: string; analysisId: string } | null>(null);

  if (!items.length) return null;

  return (
    <>
      <div className="bc-grid">
        {items.map((item) => (
          <BriefingCard
            key={item.id}
            item={item}
            onSelect={() => router.push(`/analyses/${item.id}`)}
            onListenBrief={
              item.audioPath
                ? () => setAudio({ src: item.audioPath!, title: item.title ?? item.videoId, analysisId: item.id })
                : undefined
            }
          />
        ))}
      </div>

      {audio && (
        <GlobalAudioPlayer
          src={audio.src}
          title={audio.title}
          analysisId={audio.analysisId}
          autoPlay
          onClose={() => setAudio(null)}
        />
      )}
    </>
  );
}
