"use client";

import { useState, useCallback } from "react";
import { Slot, Generation } from "@/types";
import { SlotEditor } from "@/components/slot-editor/SlotEditor";
import { AudioPlayer } from "@/components/audio-player/AudioPlayer";
import { HistorySheet, addToHistory } from "@/components/history/HistorySheet";
import { PRESET_CONDITIONS } from "@/lib/conditions";
import { Toaster } from "@/components/ui/sonner";
import { toast } from "sonner";
import { ShimmerButton } from "@/components/ui/shimmer-button";
import { BorderBeam } from "@/components/ui/border-beam";

export default function Home() {
  const [text, setText] = useState("");
  const [slots, setSlots] = useState<Slot[]>([]);
  const [compiledScript, setCompiledScript] = useState("");
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [loadingState, setLoadingState] = useState<"idle" | "warming" | "generating">("idle");

  const handleGenerate = useCallback(async () => {
    if (!compiledScript.trim()) {
      toast.error("Script required", {
        description: "Type a script before generating.",
      });
      return;
    }

    setGenerating(true);
    setLoadingState("warming");
    setAudioUrl(null);

    try {
      const res = await fetch("/api/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ script: compiledScript }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Generation failed" }));
        throw new Error(err.error || `HTTP ${res.status}`);
      }

      setLoadingState("generating");

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      setAudioUrl(url);

      const generation: Generation = {
        id: crypto.randomUUID(),
        script: compiledScript,
        audioUrl: url,
        timestamp: Date.now(),
        slots,
      };
      addToHistory(generation);

      toast.success("Generation complete", {
        description: "Your audio is ready to play.",
      });
    } catch (err) {
      toast.error("Generation failed", {
        description: err instanceof Error ? err.message : "Something went wrong",
      });
    } finally {
      setGenerating(false);
      setLoadingState("idle");
    }
  }, [compiledScript, slots]);

  const handleReplay = useCallback((gen: Generation) => {
    setAudioUrl(gen.audioUrl);
  }, []);

  const loadingLabel =
    loadingState === "warming" ? "Warming up model..." : "Generating...";

  return (
    <div className="min-h-screen bg-background">
      <Toaster position="top-center" />

      <header className="flex items-center justify-between px-6 py-4 border-b border-border">
        <h1
          className="text-xl font-extrabold tracking-tight"
          style={{ fontFamily: "var(--font-syne)" }}
        >
          VoxeSlides
        </h1>
        <HistorySheet onReplay={handleReplay} />
      </header>

      <main className="max-w-7xl mx-auto px-6 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_380px] gap-8">
          <div className="space-y-4">
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
              Your Script
            </h2>
            <SlotEditor
              text={text}
              slots={slots}
              compiledScript={compiledScript}
              onTextChange={setText}
              onSlotsChange={setSlots}
              onCompiledChange={setCompiledScript}
            />
          </div>

          <aside className="space-y-6">
            <div className="p-4 rounded-lg border border-border bg-card">
              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">
                Conditions Guide
              </h3>
              <div className="space-y-1.5">
                {PRESET_CONDITIONS.map((preset) => (
                  <div key={preset.value} className="flex items-center gap-2 text-sm">
                    <span>{preset.emoji}</span>
                    <span className="text-muted-foreground">{preset.label}</span>
                    <span className="text-xs text-muted-foreground/50 ml-auto">
                      [{preset.value}]
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <div className="p-4 rounded-lg border border-border bg-card">
              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">
                Compiled Preview
              </h3>
              <textarea
                data-testid="compiled-preview"
                readOnly
                value={compiledScript}
                placeholder="Your compiled script will appear here..."
                className="w-full h-32 p-3 font-mono text-xs leading-relaxed bg-black/20 border border-border rounded-lg text-muted-foreground resize-none focus:outline-none"
                style={{ fontFamily: "var(--font-mono)" }}
              />
            </div>
          </aside>
        </div>

        <div className="mt-8 max-w-md mx-auto relative">
          <ShimmerButton
            data-testid="generate-btn"
            onClick={handleGenerate}
            disabled={generating}
            className="w-full h-12 text-base font-semibold"
            background="#f5a623"
          >
            {generating ? loadingLabel : "Generate Speech"}
          </ShimmerButton>
          {generating && <BorderBeam />}
        </div>

        {audioUrl && <AudioPlayer audioUrl={audioUrl} />}
      </main>
    </div>
  );
}
