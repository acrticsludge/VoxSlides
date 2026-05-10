"use client";

import { useState, useCallback, useMemo, useRef } from "react";
import { Slot, Generation } from "@/types";
import { SlotEditor } from "@/components/slot-editor/SlotEditor";
import { AudioPlayer } from "@/components/audio-player/AudioPlayer";
import { HistorySheet, addToHistory } from "@/components/history/HistorySheet";
import { PRESET_CONDITIONS } from "@/lib/conditions";
import toast, { Toaster } from "react-hot-toast";
import { ShimmerButton } from "@/components/ui/shimmer-button";
import { BorderBeam } from "@/components/ui/border-beam";
import { Upload, Mic, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";

const CONDITION_COLORS: Record<string, string> = {
  amber:   "bg-amber-500/20 text-amber-200 border-l-2 border-amber-400",
  blue:    "bg-blue-500/20 text-blue-200 border-l-2 border-blue-400",
  purple:  "bg-purple-500/20 text-purple-200 border-l-2 border-purple-400",
  green:   "bg-green-500/20 text-green-200 border-l-2 border-green-400",
  yellow:  "bg-yellow-500/20 text-yellow-200 border-l-2 border-yellow-400",
  indigo:  "bg-indigo-500/20 text-indigo-200 border-l-2 border-indigo-400",
  red:     "bg-red-500/20 text-red-200 border-l-2 border-red-400",
  teal:    "bg-teal-500/20 text-teal-200 border-l-2 border-teal-400",
  orange:  "bg-orange-500/20 text-orange-200 border-l-2 border-orange-400",
  pink:    "bg-pink-500/20 text-pink-200 border-l-2 border-pink-400",
  brown:   "bg-amber-700/20 text-amber-300 border-l-2 border-amber-600",
  gray:    "bg-gray-500/20 text-gray-200 border-l-2 border-gray-400",
};

function getColorForCondition(condition: string): string {
  const preset = PRESET_CONDITIONS.find((p) => p.value === condition);
  return CONDITION_COLORS[preset?.color ?? ""] ?? "";
}

function ScriptPreview({ script }: { script: string }) {
  const segments = useMemo(() => {
    if (!script) return [];
    const regex = /\[([^\]]+)\]\s*/g;
    const parts: { text: string; condition: string | null }[] = [];
    let lastIndex = 0;
    let currentCondition: string | null = null;
    let match: RegExpExecArray | null;
    while ((match = regex.exec(script)) !== null) {
      const before = script.slice(lastIndex, match.index);
      if (before.trim()) parts.push({ text: before.trim(), condition: currentCondition });
      currentCondition = match[1].toLowerCase().trim();
      lastIndex = match.index + match[0].length;
    }
    const remaining = script.slice(lastIndex);
    if (remaining.trim()) parts.push({ text: remaining.trim(), condition: currentCondition });
    return parts;
  }, [script]);

  if (!script) {
    return <div className="w-full h-32 p-3 font-mono text-xs leading-relaxed bg-black/20 border border-border rounded-lg text-muted-foreground overflow-y-auto">Your compiled script will appear here...</div>;
  }

  return (
    <div data-testid="compiled-preview" className="w-full h-32 p-3 font-mono text-xs leading-relaxed bg-black/20 border border-border rounded-lg overflow-y-auto whitespace-pre-wrap break-words" style={{ fontFamily: "var(--font-mono)" }}>
      {segments.map((seg, i) => {
        if (seg.condition) {
          return <span key={i} className={`inline-block my-0.5 pl-1 pr-1.5 py-0.5 rounded-sm ${getColorForCondition(seg.condition)}`} title={seg.condition}><span className="font-bold opacity-80">[{seg.condition}]</span> {seg.text}</span>;
        }
        return <span key={i} className="mr-1">{seg.text}</span>;
      })}
    </div>
  );
}

export default function Home() {
  const [text, setText] = useState("");
  const [slots, setSlots] = useState<Slot[]>([]);
  const [compiledScript, setCompiledScript] = useState("");
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [loadingState, setLoadingState] = useState<"idle" | "warming" | "generating">("idle");
  const [speakerAudio, setSpeakerAudio] = useState<string | null>(null);
  const [speakerFileName, setSpeakerFileName] = useState<string>("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate format
    if (!file.type.startsWith("audio/")) {
      toast.error("Please upload an audio file");
      return;
    }

    // Read as base64
    const reader = new FileReader();
    reader.onload = () => {
      const data = reader.result as string;
      setSpeakerAudio(data);
      setSpeakerFileName(file.name);
      toast.success("Voice sample uploaded");
    };
    reader.onerror = () => toast.error("Failed to read audio file");
    reader.readAsDataURL(file);
  }, []);

  const clearAudio = useCallback(() => {
    setSpeakerAudio(null);
    setSpeakerFileName("");
    if (fileInputRef.current) fileInputRef.current.value = "";
  }, []);

  const handleGenerate = useCallback(async () => {
    if (!compiledScript.trim()) {
      toast.error("Type a script before generating.");
      return;
    }
    if (!speakerAudio) {
      toast.error("Upload a voice sample first.");
      return;
    }

    setGenerating(true);
    setLoadingState("warming");
    setAudioUrl(null);

    try {
      const res = await fetch("/api/v1/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          script: compiledScript,
          speakerAudio,
        }),
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
        timestamp: Date.now(),
        slots,
      };
      addToHistory(generation);

      toast.success("Cloned voice audio ready");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setGenerating(false);
      setLoadingState("idle");
    }
  }, [compiledScript, slots, speakerAudio]);

  const handleReplay = useCallback((gen: Generation) => {
    setCompiledScript(gen.script);
    toast("Select the generation to replay");
  }, []);

  const loadingLabel = loadingState === "warming" ? "Uploading voice sample..." : "Cloning voice with emotion...";

  return (
    <div className="min-h-screen bg-background">
      <Toaster position="top-center" toastOptions={{ style: { background: "#111113", color: "#fafafa", border: "1px solid #27272a" } }} />

      <header className="flex items-center justify-between px-6 py-4 border-b border-border">
        <h1 className="text-xl font-extrabold tracking-tight" style={{ fontFamily: "var(--font-syne)" }}>VoxSlides</h1>
        <HistorySheet onReplay={handleReplay} />
      </header>

      <main className="max-w-7xl mx-auto px-6 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_380px] gap-8">
          {/* Left: Editor */}
          <div className="space-y-4">
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Your Script</h2>
            <SlotEditor text={text} slots={slots} compiledScript={compiledScript} onTextChange={setText} onSlotsChange={setSlots} onCompiledChange={setCompiledScript} />
          </div>

          {/* Right: Settings */}
          <aside className="space-y-6">
            {/* Voice Sample */}
            <div className="p-4 rounded-lg border border-border bg-card">
              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">Voice Sample</h3>
              <p className="text-xs text-muted-foreground mb-3">Upload a 10-30 second audio clip of the voice you want to clone.</p>

              {speakerAudio ? (
                <div className="flex items-center justify-between gap-2 p-2 rounded bg-white/[0.03] border border-border">
                  <span className="text-xs text-foreground truncate flex-1">{speakerFileName}</span>
                  <button onClick={clearAudio} className="text-muted-foreground hover:text-foreground transition-colors">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              ) : (
                <div className="space-y-2">
                  <input ref={fileInputRef} type="file" accept="audio/*" onChange={handleFileUpload} className="hidden" />
                  <Button variant="outline" size="sm" onClick={() => fileInputRef.current?.click()} className="w-full">
                    <Upload className="h-3.5 w-3.5 mr-2" />
                    Upload Audio
                  </Button>
                </div>
              )}
            </div>

            {/* Conditions Guide */}
            <div className="p-4 rounded-lg border border-border bg-card">
              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">Conditions Guide</h3>
              <div className="space-y-1.5">
                {PRESET_CONDITIONS.map((preset) => (
                  <div key={preset.value} className="flex items-center gap-2 text-sm">
                    <span>{preset.emoji}</span>
                    <span className="text-muted-foreground">{preset.label}</span>
                    <span className="text-xs text-muted-foreground/50 ml-auto">[{preset.value}]</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Compiled Preview */}
            <div className="p-4 rounded-lg border border-border bg-card">
              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">Compiled Preview</h3>
              <ScriptPreview script={compiledScript} />
            </div>
          </aside>
        </div>

        <div className="mt-8 max-w-md mx-auto relative">
          <ShimmerButton data-testid="generate-btn" onClick={handleGenerate} disabled={generating || !speakerAudio} className="w-full h-12 text-base font-semibold" background="#f5a623">
            {generating ? loadingLabel : speakerAudio ? "Clone Voice & Generate" : "Upload a voice sample first"}
          </ShimmerButton>
          {generating && <BorderBeam />}
        </div>

        {audioUrl && <AudioPlayer audioUrl={audioUrl} />}
      </main>
    </div>
  );
}
