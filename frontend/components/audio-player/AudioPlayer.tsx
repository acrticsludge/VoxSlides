"use client";

import { useRef, useState, useEffect, useCallback } from "react";
import { Play, Pause, Download } from "lucide-react";
import { Slider } from "@/components/ui/slider";
import { Button } from "@/components/ui/button";
import { BlurFade } from "@/components/ui/blur-fade";

interface AudioPlayerProps {
  audioUrl: string;
}

function formatTime(seconds: number): string {
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

  const handleSeek = useCallback((value: number | readonly number[]) => {
    const audio = audioRef.current;
    if (!audio) return;
    const newTime = Array.isArray(value) ? value[0] : value;
    audio.currentTime = newTime;
    setCurrentTime(newTime);
  }, []);

  const bars = Array.from({ length: 20 }, (_, i) => i);

  return (
    <div data-testid="audio-player" className="mt-6">
      <BlurFade inView>
        <div className="p-4 rounded-lg border border-border bg-card">
          <audio ref={audioRef} src={audioUrl} preload="metadata" />

          {/* Waveform */}
          <div className="flex items-end justify-center gap-[3px] h-12 mb-4">
            {bars.map((i) => (
              <div
                key={i}
                className="w-[3px] rounded-full bg-accent transition-all"
                style={{
                  height: playing ? `${8 + Math.sin(i * 0.8) * 6 + 6}px` : "4px",
                  animation: playing
                    ? `waveform ${0.6 + (i % 5) * 0.1}s ease-in-out ${i * 0.06}s infinite alternate`
                    : "none",
                }}
              />
            ))}
          </div>

          {/* Controls */}
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="icon"
              onClick={togglePlay}
              className="h-9 w-9 rounded-full"
            >
              {playing ? (
                <Pause className="h-4 w-4" />
              ) : (
                <Play className="h-4 w-4 ml-0.5" />
              )}
            </Button>

            <span className="text-xs text-muted-foreground w-10 tabular-nums">
              {formatTime(currentTime)}
            </span>

            <Slider
              value={[currentTime]}
              max={duration || 100}
              step={0.1}
              onValueChange={handleSeek}
              className="flex-1"
            />

            <span className="text-xs text-muted-foreground w-10 tabular-nums text-right">
              {formatTime(duration)}
            </span>

            <a
              href={audioUrl}
              download="voxslides-output.webm"
              className="text-muted-foreground hover:text-foreground transition-colors"
            >
              <Download className="h-4 w-4" />
            </a>
          </div>
        </div>
      </BlurFade>
    </div>
  );
}
