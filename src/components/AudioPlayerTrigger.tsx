"use client";

import { useRef, useState } from "react";
import { GlobalAudioPlayer, type GlobalAudioPlayerHandle } from "./GlobalAudioPlayer";

interface Props {
  audioPath: string;
  title: string;
  analysisId: string;
  compact?: boolean;
}

export function AudioPlayerTrigger({ audioPath, title, analysisId, compact }: Props) {
  const [open, setOpen] = useState(false);
  const playerRef = useRef<GlobalAudioPlayerHandle>(null);

  function handleClick() {
    setOpen(true);
    // triggerPlay() calls audio.play() synchronously — user gesture context is preserved.
    // The player is always mounted (just hidden) so audioRef is ready when button is clicked.
    playerRef.current?.triggerPlay();
  }

  return (
    <>
      <button
        onClick={handleClick}
        className={compact
          ? "inline-flex items-center gap-1 text-[10px] text-[#6b8a99] hover:text-[#1a2e3b] transition-colors"
          : "inline-flex items-center gap-2 text-[11px] font-bold bg-[#c0d6df] hover:bg-slate-700 text-[#0f2535] px-3 py-1.5 rounded-lg border border-[#a8bfcb] transition-all"
        }
        style={{ fontFamily: "system-ui, sans-serif" }}
      >
        🎙 {compact ? "Listen" : "Play Audio Briefing"}
      </button>

      {/* Always mounted so audio.play() can be called synchronously on the first click */}
      <div style={{ display: open ? "contents" : "none" }}>
        <GlobalAudioPlayer
          ref={playerRef}
          src={audioPath}
          title={title}
          analysisId={analysisId}
          onClose={() => setOpen(false)}
        />
      </div>
    </>
  );
}
