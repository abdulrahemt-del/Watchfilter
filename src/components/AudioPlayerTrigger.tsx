"use client";

import { useState } from "react";
import { GlobalAudioPlayer } from "./GlobalAudioPlayer";

interface Props {
  audioPath: string;
  title: string;
  analysisId: string;
  compact?: boolean;
}

export function AudioPlayerTrigger({ audioPath, title, analysisId, compact }: Props) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className={compact
          ? "inline-flex items-center gap-1 text-[10px] text-[#6b8a99] hover:text-[#1a2e3b] transition-colors"
          : "inline-flex items-center gap-2 text-[11px] font-bold bg-[#c0d6df] hover:bg-slate-700 text-[#0f2535] px-3 py-1.5 rounded-lg border border-[#a8bfcb] transition-all"
        }
        style={{ fontFamily: "system-ui, sans-serif" }}
      >
        🎙 {compact ? "Listen" : "Play Audio Briefing"}
      </button>

      {open && (
        <GlobalAudioPlayer
          src={audioPath}
          title={title}
          analysisId={analysisId}
          autoPlay
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}
