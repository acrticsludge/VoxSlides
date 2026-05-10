"use client";

import { useState, useCallback } from "react";
import { Slot, Generation } from "@/types";
import { SlotEditor } from "@/components/slot-editor/SlotEditor";
import { AudioPlayer } from "@/components/audio-player/AudioPlayer";
import { HistorySheet, addToHistory } from "@/components/history/HistorySheet";
import { PRESET_CONDITIONS } from "@/lib/conditions";
import toast, { Toaster } from "react-hot-toast";
import { ShimmerButton } from "@/components/ui/shimmer-button";
import { BorderBeam } from "@/components/ui/border-beam";

export default function Home() {
  const [text, setText] = useState("");
  const [slots, setSlots] = useState<Slot[]>([]);
  const [compiledScript, setCompiledScript] = useState("");
  const [activeScript, setActiveScript] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);

  const handleGenerate = useCallback(() => {
    if (!compiledScript.trim()) {
      toast.error("Type a script before generating.");
      return;
    }

    setGenerating(true);
    setActiveScript(null);

    // Small delay so the shimmer animation shows
    setTimeout(() => {
      setActiveScript(compiledScript);

      const generation: Generation = {
        id: crypto.randomUUID(),
        script: compiledScript,
        timestamp: Date.now(),
        slots,
      };
      addToHistory(generation);

      setGenerating(false);
      toast.success("Speaking your script...");
    }, 600);
  }, [compiledScript, slots]);

  const handleReplay = useCallback((gen: Generation) => {
    setActiveScript(gen.script);
  }, []);

  return (
    <div className="min-h-screen bg-background">
      <Toaster
        position="top-center"
        toastOptions={{
          style: {
            background: "#111113",
            color: "#fafafa",
            border: "1px solid #27272a",
          },
        }}
      />

      <header className="flex items-center justify-between px-6 py-4 border-b border-border">
        <h1
          className="text-xl font-extrabold tracking-tight"
          style={{ fontFamily: "var(--font-syne)" }}
        >
          VoxSlides
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
            {generating ? "Generating..." : "Generate Speech"}
          </ShimmerButton>
          {generating && <BorderBeam />}
        </div>

        {activeScript && <AudioPlayer text={activeScript} />}
      </main>
    </div>
  );
}
