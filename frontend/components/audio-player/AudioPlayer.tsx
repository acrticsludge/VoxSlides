"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { Play, Pause, StopCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { BlurFade } from "@/components/ui/blur-fade";
import { speakScript } from "@/lib/speech";

interface AudioPlayerProps {
  text: string;
}

export function AudioPlayer({ text }: AudioPlayerProps) {
  const [speaking, setSpeaking] = useState(false);
  const [paused, setPaused] = useState(false);
  const cancelRef = useRef<(() => void) | null>(null);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      window.speechSynthesis?.cancel();
    };
  }, []);

  const speak = useCallback(() => {
    setSpeaking(true);
    setPaused(false);

    cancelRef.current = speakScript(
      text,
      () => {},
      () => {
        setSpeaking(false);
        setPaused(false);
        cancelRef.current = null;
      }
    );
  }, [text]);

  const pause = useCallback(() => {
    window.speechSynthesis.pause();
    setPaused(true);
  }, []);

  const resume = useCallback(() => {
    window.speechSynthesis.resume();
    setPaused(false);
  }, []);

  const stop = useCallback(() => {
    cancelRef.current?.();
    cancelRef.current = null;
    setSpeaking(false);
    setPaused(false);
  }, []);

  // Auto-speak when text changes
  useEffect(() => {
    if (text) speak();
  }, [text, speak]);

  const bars = Array.from({ length: 20 }, (_, i) => i);

  return (
    <div data-testid="audio-player" className="mt-6">
      <BlurFade inView>
        <div className="p-4 rounded-lg border border-border bg-card">
          {/* Waveform */}
          <div className="flex items-end justify-center gap-[3px] h-12 mb-4">
            {bars.map((i) => (
              <div
                key={i}
                className="w-[3px] rounded-full bg-accent transition-all"
                style={{
                  height: speaking ? `${8 + Math.sin(i * 0.8) * 6 + 6}px` : "4px",
                  animation: speaking
                    ? `waveform ${0.6 + (i % 5) * 0.1}s ease-in-out infinite alternate`
                    : "none",
                  animationDelay: `${i * 0.06}s`,
                }}
              />
            ))}
          </div>

          {/* Controls */}
          <div className="flex items-center justify-center gap-3">
            {speaking && !paused ? (
              <Button
                variant="ghost"
                size="icon"
                onClick={pause}
                className="h-9 w-9 rounded-full"
              >
                <Pause className="h-4 w-4" />
              </Button>
            ) : speaking && paused ? (
              <Button
                variant="ghost"
                size="icon"
                onClick={resume}
                className="h-9 w-9 rounded-full"
              >
                <Play className="h-4 w-4 ml-0.5" />
              </Button>
            ) : (
              <Button
                variant="ghost"
                size="icon"
                onClick={speak}
                className="h-9 w-9 rounded-full"
              >
                <Play className="h-4 w-4 ml-0.5" />
              </Button>
            )}

            {speaking && (
              <Button
                variant="ghost"
                size="icon"
                onClick={stop}
                className="h-9 w-9 rounded-full text-muted-foreground hover:text-foreground"
              >
                <StopCircle className="h-4 w-4" />
              </Button>
            )}
          </div>

          {speaking && (
            <p className="text-xs text-center text-muted-foreground mt-3">
              Speaking with expressive tone...
            </p>
          )}
        </div>
      </BlurFade>
    </div>
  );
}
