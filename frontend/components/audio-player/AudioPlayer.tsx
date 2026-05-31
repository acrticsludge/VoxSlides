"use client";

import { useRef, useState, useEffect, useCallback } from "react";

interface AudioPlayerProps {
  audioUrl: string;
}

function formatTime(seconds: number): string {
  if (!isFinite(seconds) || seconds < 0) return "00:00";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
}

export function AudioPlayer({ audioUrl }: AudioPlayerProps) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const onTimeUpdate = () => setCurrentTime(audio.currentTime);
    const onLoadedMetadata = () => setDuration(audio.duration);
    const onEnded = () => setPlaying(false);

    audio.addEventListener("timeupdate", onTimeUpdate);
    audio.addEventListener("loadedmetadata", onLoadedMetadata);
    audio.addEventListener("ended", onEnded);

    return () => {
      audio.removeEventListener("timeupdate", onTimeUpdate);
      audio.removeEventListener("loadedmetadata", onLoadedMetadata);
      audio.removeEventListener("ended", onEnded);
    };
  }, [audioUrl]);

  const togglePlay = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    if (playing) {
      audio.pause();
    } else {
      audio.play();
    }
    setPlaying(!playing);
  }, [playing]);

  const handleSeek = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const audio = audioRef.current;
    if (!audio) return;
    const newTime = parseFloat(e.target.value);
    if (!isFinite(newTime) || newTime < 0) return;
    audio.currentTime = newTime;
    setCurrentTime(newTime);
  }, []);

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
    <div className="bg-primary-container rounded-lg p-4">
      <audio ref={audioRef} src={audioUrl} preload="metadata" />

      {/* Waveform bars */}
      <div className="flex items-end justify-between h-16 mb-4 gap-1">
        {Array.from({ length: 20 }, (_, i) => (
          <div
            key={i}
            className="w-1.5 bg-on-primary/60 rounded-full transition-all"
            style={{
              height: playing
                ? `${8 + Math.sin(i * 0.8) * 6 + 6}px`
                : "4px",
              animation: playing
                ? `waveform ${0.6 + (i % 5) * 0.1}s ease-in-out ${i * 0.06}s infinite alternate`
                : "none",
            }}
          />
        ))}
      </div>

      {/* Controls */}
      <div className="flex items-center gap-3">
        <button
          onClick={togglePlay}
          className="w-8 h-8 rounded-full bg-on-primary text-primary flex items-center justify-center shrink-0 hover:opacity-90 transition-opacity"
        >
          <span
            className="material-symbols-outlined text-[18px]"
            style={{ fontVariationSettings: "'FILL' 1" }}
          >
            {playing ? "pause" : "play_arrow"}
          </span>
        </button>

        <span className="text-code-sm text-on-primary/80 w-10 tabular-nums">
          {formatTime(currentTime)}
        </span>

        <input
          type="range"
          min={0}
          max={!isFinite(duration) || duration <= 0 ? 100 : duration}
          step={0.1}
          value={!isFinite(currentTime) ? 0 : currentTime}
          onChange={handleSeek}
          className="flex-1 h-1 appearance-none cursor-pointer rounded-full"
          style={{
            background: `linear-gradient(to right, #fea619 ${progress}%, rgba(255,255,255,0.2) ${progress}%)`,
            height: "4px",
            borderRadius: "2px",
          }}
        />

        <span className="text-code-sm text-on-primary/80 w-10 tabular-nums text-right">
          {formatTime(duration)}
        </span>

        <a
          href={audioUrl}
          download="voxslides-output.webm"
          className="text-on-primary/80 hover:text-on-primary transition-colors"
        >
          <span className="material-symbols-outlined text-lg">download</span>
        </a>
      </div>
    </div>
  );
}
