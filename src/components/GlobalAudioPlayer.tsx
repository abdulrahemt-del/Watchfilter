"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { track } from "@/lib/analytics";

const SPEEDS = [0.75, 1, 1.25, 1.5, 1.75, 2];

// Average TTS-1 speaking rate constants
const MS_PER_CHAR = 65;
const MS_PER_WORD_GAP = 40;
const MS_SENTENCE_PAUSE = 350;
const MS_COMMA_PAUSE = 150;
const MS_LINE_PAUSE = 120;
const MS_BLANK_PAUSE = 450;

interface WordTiming {
  word: string;
  start: number; // seconds (estimated)
  end: number;
}

function buildWordTimings(script: string): WordTiming[] {
  const timings: WordTiming[] = [];
  let t = 0;
  const lines = script.split("\n");

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      t += MS_BLANK_PAUSE / 1000;
      continue;
    }
    const words = trimmed.split(/\s+/).filter(Boolean);
    for (const word of words) {
      const clean = word.replace(/[.,!?;:"""]/g, "");
      const charDuration = Math.max(clean.length * MS_PER_CHAR, 120) / 1000;
      const start = t;
      t += charDuration + MS_PER_WORD_GAP / 1000;
      timings.push({ word, start, end: t });

      if (/[.!?]$/.test(word)) t += MS_SENTENCE_PAUSE / 1000;
      else if (/[,;:]$/.test(word)) t += MS_COMMA_PAUSE / 1000;
    }
    t += MS_LINE_PAUSE / 1000;
  }

  return timings;
}

function findActiveWord(timings: WordTiming[], scaledTime: number): number {
  if (!timings.length) return -1;
  let lo = 0, hi = timings.length - 1, idx = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (timings[mid]!.start <= scaledTime) { idx = mid; lo = mid + 1; }
    else hi = mid - 1;
  }
  return idx;
}

interface Props {
  src: string;
  title: string;
  analysisId: string;
  autoPlay?: boolean;
  onClose: () => void;
}

export function GlobalAudioPlayer({ src, title, analysisId, autoPlay, onClose }: Props) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const playerRef = useRef<HTMLDivElement>(null);
  const transcriptRef = useRef<HTMLDivElement>(null);

  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [speed, setSpeed] = useState(1);
  const [volume, setVolume] = useState(1);
  const [minimized, setMinimized] = useState(false);
  const [showTranscript, setShowTranscript] = useState(false);
  const [currentSrc, setCurrentSrc] = useState(src);
  const [regenVoice, setRegenVoice] = useState<"onyx" | "nova" | null>(null);
  const [activeVoice, setActiveVoice] = useState<"onyx" | "nova">("onyx");
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const [dragging, setDragging] = useState(false);
  const dragOrigin = useRef<{ mouseX: number; mouseY: number; elemX: number; elemY: number } | null>(null);

  const [audioError, setAudioError] = useState<string | null>(null);
  const [wordTimings, setWordTimings] = useState<WordTiming[]>([]);
  const [activeWordIdx, setActiveWordIdx] = useState(-1);
  // Scale estimated timings to actual audio duration for accurate sync
  const [timingScale, setTimingScale] = useState(1);

  // When source prop changes, reload
  useEffect(() => {
    setCurrentSrc(src);
  }, [src]);

  // Reload audio element when currentSrc changes
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.pause();
    setPlaying(false);
    setProgress(0);
    setCurrentTime(0);
    setDuration(0);
    setTimingScale(1);
    setAudioError(null);
    audio.load();
  }, [currentSrc]);

  // Fetch script for word-level karaoke tracking
  const fetchScript = useCallback(async () => {
    if (!analysisId || wordTimings.length > 0) return;
    try {
      const res = await fetch(`/api/audio-script?analysisId=${encodeURIComponent(analysisId)}`);
      const data = (await res.json()) as { script?: string; error?: string };
      if (data.script) setWordTimings(buildWordTimings(data.script));
    } catch {
      // audio still works without word tracking
    }
  }, [analysisId, wordTimings.length]);

  useEffect(() => { void fetchScript(); }, [fetchScript]);

  // Reset script state when analysisId changes
  useEffect(() => {
    setWordTimings([]);
    setActiveWordIdx(-1);
    setTimingScale(1);
    hasTrackedPlay.current = false;
  }, [analysisId]);

  // Calibrate timing scale once we have both actual duration and estimated timings
  useEffect(() => {
    if (duration <= 0 || wordTimings.length === 0) return;
    const estimatedEnd = wordTimings[wordTimings.length - 1]!.end;
    if (estimatedEnd > 0) setTimingScale(estimatedEnd / duration);
  }, [duration, wordTimings]);

  // Play immediately when autoPlay becomes true on an already-loaded player.
  // onLoadedMetadata only fires on load — if the prop changes after mount (e.g., user
  // clicks Audio Briefing while the player is already visible), this handles it.
  useEffect(() => {
    if (!autoPlay) return;
    const audio = audioRef.current;
    if (!audio) return;
    void audio.play().then(() => setPlaying(true)).catch(() => {});
  }, [autoPlay]);

  // Auto-scroll active word into view in transcript panel
  useEffect(() => {
    if (!showTranscript || activeWordIdx < 0 || !transcriptRef.current) return;
    const el = transcriptRef.current.querySelector<HTMLElement>(`[data-idx="${activeWordIdx}"]`);
    if (el) el.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [activeWordIdx, showTranscript]);

  // Drag listeners
  useEffect(() => {
    if (!dragging) return;
    function onMove(e: MouseEvent) {
      if (!dragOrigin.current) return;
      setPos({
        x: dragOrigin.current.elemX + (e.clientX - dragOrigin.current.mouseX),
        y: dragOrigin.current.elemY + (e.clientY - dragOrigin.current.mouseY),
      });
    }
    function onUp() { setDragging(false); dragOrigin.current = null; }
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => { window.removeEventListener("mousemove", onMove); window.removeEventListener("mouseup", onUp); };
  }, [dragging]);

  function onDragStart(e: React.MouseEvent<HTMLDivElement>) {
    const tag = (e.target as HTMLElement).tagName;
    if (["BUTTON", "INPUT", "A", "SVG", "PATH", "RECT", "POLYGON"].includes(tag)) return;
    e.preventDefault();
    const rect = playerRef.current!.getBoundingClientRect();
    dragOrigin.current = { mouseX: e.clientX, mouseY: e.clientY, elemX: rect.left, elemY: rect.top };
    setDragging(true);
  }

  const hasTrackedPlay = useRef(false);

  function togglePlay() {
    const audio = audioRef.current;
    if (!audio) return;
    if (playing) {
      audio.pause();
      setPlaying(false);
    } else {
      void audio.play();
      setPlaying(true);
      if (!hasTrackedPlay.current) {
        hasTrackedPlay.current = true;
        track("audio_played", { analysisId, label: title });
      }
    }
  }

  function onTimeUpdate() {
    const audio = audioRef.current;
    if (!audio) return;
    const ct = audio.currentTime;
    setCurrentTime(ct);
    setProgress(audio.duration ? (ct / audio.duration) * 100 : 0);
    if (wordTimings.length > 0) {
      // Divide by timingScale to map actual playback time → estimated time space
      setActiveWordIdx(findActiveWord(wordTimings, ct * timingScale));
    }
  }

  function onLoadedMetadata() {
    const audio = audioRef.current;
    if (!audio) return;
    setAudioError(null);
    setDuration(audio.duration);
    if (autoPlay) {
      void audio.play().then(() => setPlaying(true)).catch(() => {});
    }
  }

  function onAudioError() {
    const audio = audioRef.current;
    const code = audio?.error?.code;
    const msg =
      code === 1 ? "Playback aborted" :
      code === 2 ? "Network error loading audio" :
      code === 3 ? "Audio decoding failed" :
      code === 4 ? "Audio format not supported" :
      "Failed to load audio";
    setAudioError(msg);
    setPlaying(false);
    console.error("[GlobalAudioPlayer] audio error", code, audio?.error?.message, currentSrc);
  }

  function onEnded() {
    setPlaying(false);
    setProgress(0);
    setCurrentTime(0);
    setActiveWordIdx(-1);
  }

  function seek(e: React.ChangeEvent<HTMLInputElement>) {
    const audio = audioRef.current;
    if (!audio || !audio.duration) return;
    const pct = Number(e.target.value);
    audio.currentTime = (pct / 100) * audio.duration;
    setProgress(pct);
  }

  function setPlaybackSpeed(s: number) {
    setSpeed(s);
    if (audioRef.current) audioRef.current.playbackRate = s;
  }

  function onVolumeChange(e: React.ChangeEvent<HTMLInputElement>) {
    const v = Number(e.target.value);
    setVolume(v);
    if (audioRef.current) audioRef.current.volume = v;
  }

  async function switchVoice(voice: "onyx" | "nova") {
    setRegenVoice(voice);
    try {
      const res = await fetch("/api/regenerate-audio", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ analysisId, voice }),
      });
      const data = (await res.json()) as { audioPath?: string; error?: string };
      if (!res.ok || !data.audioPath) throw new Error(data.error ?? "Failed");
      if (audioRef.current) { audioRef.current.pause(); setPlaying(false); }
      setCurrentSrc(data.audioPath + "?t=" + Date.now());
      setActiveVoice(voice);
      setProgress(0); setCurrentTime(0); setDuration(0);
      setActiveWordIdx(-1);
      setWordTimings([]);
      setTimingScale(1);
    } catch (err) {
      console.error("Voice switch failed:", err);
    } finally {
      setRegenVoice(null);
    }
  }

  function fmt(s: number) {
    if (!isFinite(s) || isNaN(s)) return "0:00";
    return `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
  }

  const downloadName = `watchfilter-${title.slice(0, 40).replace(/[^a-z0-9]+/gi, "-").toLowerCase()}.mp3`;
  const playerStyle = pos ? { left: pos.x, top: pos.y, right: "auto", bottom: "auto" } : undefined;
  const hasTranscript = wordTimings.length > 0;

  return (
    <div
      ref={playerRef}
      className={`audio-player${minimized ? " audio-player--minimized" : ""}${dragging ? " audio-player--dragging" : ""}${showTranscript && !minimized ? " audio-player--wide" : ""}`}
      style={playerStyle}
    >
      <audio
        ref={audioRef} src={currentSrc} preload="metadata"
        onTimeUpdate={onTimeUpdate} onLoadedMetadata={onLoadedMetadata} onEnded={onEnded}
        onError={onAudioError}
      />

      <div className="audio-player__header" onMouseDown={onDragStart}>
        <span className="audio-player__drag-handle">⠿</span>
        <span className="audio-player__label">🎙 Audio Briefing</span>
        {!minimized && (
          audioError
            ? <span className="audio-player__title" style={{ color: "#f87171" }}>⚠ {audioError}</span>
            : <span className="audio-player__title">{title}</span>
        )}
        <div className="audio-player__header-actions">
          <button onClick={togglePlay} className="audio-player__btn" aria-label={playing ? "Pause" : "Play"}>
            {playing ? (
              <svg width="10" height="12" viewBox="0 0 10 12" fill="currentColor" aria-hidden>
                <rect x="0" y="0" width="3.5" height="12" rx="1" />
                <rect x="6.5" y="0" width="3.5" height="12" rx="1" />
              </svg>
            ) : (
              <svg width="10" height="12" viewBox="0 0 10 12" fill="currentColor" aria-hidden>
                <path d="M0 0l10 6-10 6z" />
              </svg>
            )}
          </button>
          {!minimized && (
            <button
              onClick={() => setShowTranscript(t => !t)}
              className={`audio-player__minimize${showTranscript ? " audio-player__transcript-btn--active" : ""}`}
              aria-label={showTranscript ? "Hide transcript" : "Show word-by-word transcript"}
              title={showTranscript ? "Hide transcript" : "Karaoke / word highlight"}
            >≡</button>
          )}
          <button onClick={() => setMinimized(m => !m)} className="audio-player__minimize" aria-label={minimized ? "Expand" : "Minimize"}>
            {minimized ? "▲" : "▼"}
          </button>
          <button onClick={onClose} className="audio-player__minimize" aria-label="Close player" title="Close">✕</button>
        </div>
      </div>

      {!minimized && (
        <>
          <div className="audio-player__controls">
            <span className="audio-player__time">{fmt(currentTime)} / {fmt(duration)}</span>
            <input type="range" min="0" max="100" step="0.1" value={progress}
              onChange={seek} className="audio-player__progress" aria-label="Seek" />
            <button
              onClick={() => { const a = audioRef.current; if (a) a.currentTime = Math.max(a.currentTime - 15, 0); }}
              className="audio-player__skip-btn" aria-label="Rewind 15 seconds"
            >−15s</button>
            <button
              onClick={() => { const a = audioRef.current; if (a) a.currentTime = Math.min(a.currentTime + 15, a.duration || 0); }}
              className="audio-player__skip-btn" aria-label="Skip forward 15 seconds"
            >+15s</button>
          </div>

          {/* Karaoke transcript panel */}
          {showTranscript && (
            <div
              ref={transcriptRef}
              className="audio-player__transcript"
              aria-label="Word-by-word transcript"
            >
              {hasTranscript ? (
                wordTimings.map((wt, i) => (
                  <span
                    key={i}
                    data-idx={i}
                    className={`audio-player__word${i === activeWordIdx ? " audio-player__word--active" : i < activeWordIdx ? " audio-player__word--past" : ""}`}
                  >{wt.word} </span>
                ))
              ) : (
                <span className="audio-player__transcript-loading">Loading transcript…</span>
              )}
            </div>
          )}

          <div className="audio-player__bottom">
            <div className="audio-player__vol">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
                {volume > 0.5 && <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />}
                {volume > 0 && <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />}
              </svg>
              <input type="range" min="0" max="1" step="0.01" value={volume}
                onChange={onVolumeChange} className="audio-player__volume" aria-label="Volume" />
            </div>
            <div className="audio-player__speeds">
              {SPEEDS.map(s => (
                <button key={s} onClick={() => setPlaybackSpeed(s)}
                  className={`audio-player__speed-btn${speed === s ? " audio-player__speed-btn--active" : ""}`}
                  aria-label={`${s}x speed`}
                >{s === 1 ? "1×" : `${s}×`}</button>
              ))}
            </div>
            <div className="audio-player__voices">
              <button
                onClick={() => void switchVoice("onyx")}
                disabled={regenVoice !== null}
                className={`audio-player__voice-btn${activeVoice === "onyx" ? " audio-player__voice-btn--active" : ""}`}
                title="Male voice (Onyx)"
              >
                {regenVoice === "onyx" ? "…" : "♂"}
              </button>
              <button
                onClick={() => void switchVoice("nova")}
                disabled={regenVoice !== null}
                className={`audio-player__voice-btn${activeVoice === "nova" ? " audio-player__voice-btn--active" : ""}`}
                title="Female voice (Nova)"
              >
                {regenVoice === "nova" ? "…" : "♀"}
              </button>
            </div>
            <a href={currentSrc} download={downloadName} className="audio-player__download">⬇ MP3</a>
          </div>

        </>
      )}
    </div>
  );
}
