"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import type { Slot, Generation } from "@/types";
import { SlotEditor } from "@/components/slot-editor/SlotEditor";
import { AudioPlayer } from "@/components/audio-player/AudioPlayer";
import { addToHistory, loadHistory, HISTORY_KEY } from "@/lib/history";
import { VoiceRecorder } from "@/components/voice-recorder/VoiceRecorder";
import { logError, logApiError } from "@/lib/errors";
import toast, { Toaster } from "react-hot-toast";

function formatTimeAgo(timestamp: number) {
  const d = new Date(timestamp);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return "Just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHrs = Math.floor(diffMin / 60);
  if (diffHrs < 24) return `${diffHrs}h ago`;
  return d.toLocaleDateString();
}

export default function Home() {
  const [text, setText] = useState("");
  const [slots, setSlots] = useState<Slot[]>([]);
  const [compiledScript, setCompiledScript] = useState("");
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [speakerAudio, setSpeakerAudio] = useState<string | null>(null);
  const [speakerFileName, setSpeakerFileName] = useState<string>("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [referenceText, setReferenceText] = useState("");
  const [temperature, setTemperature] = useState(0.8);
  const [repetitionPenalty, setRepetitionPenalty] = useState(1.1);
  const [topP, setTopP] = useState(0.8);
  const [chunkLength, setChunkLength] = useState(300);

  const [history, setHistory] = useState<Generation[]>([]);

  useEffect(() => {
    setHistory(loadHistory());
  }, []);

  const handleFileUpload = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      if (!file.type.startsWith("audio/")) {
        toast.error("Please upload an audio file");
        return;
      }
      const reader = new FileReader();
      reader.onload = () => {
        setSpeakerAudio(reader.result as string);
        setSpeakerFileName(file.name);
        toast.success("Voice sample uploaded");
      };
      reader.onerror = () => toast.error("Failed to read audio file");
      reader.readAsDataURL(file);
    },
    []
  );

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
      toast.error("Upload or record a voice sample first.");
      return;
    }

    setGenerating(true);
    setAudioUrl(null);

    try {
      const res = await fetch("/api/v1/tts/fishspeech", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          script: compiledScript,
          speakerAudio,
          referenceText: referenceText || undefined,
          temperature,
          repetitionPenalty,
          topP,
          chunkLength,
        }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({ error: "Generation failed" }));
        const msg = logApiError(res, body, { component: "page", action: "generate" });
        throw new Error(msg);
      }

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
      setHistory(loadHistory());

      toast.success("Audio ready");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Something went wrong";
      // Message is already sanitized by logApiError or logError above
      toast.error(msg);
    } finally {
      setGenerating(false);
    }
  }, [
    compiledScript, slots, speakerAudio, referenceText,
    temperature, repetitionPenalty, topP, chunkLength,
  ]);

  const handleReplay = useCallback((gen: Generation) => {
    setText("");
    setSlots([]);
    setCompiledScript(gen.script);
    toast("Loaded generation script");
  }, []);

  const wordCount = text.split(/\s+/).filter(Boolean).length;
  const charCount = text.length;

  return (
    <div className="bg-background text-on-surface min-h-screen flex flex-col overflow-hidden">
      <Toaster
        position="top-center"
        toastOptions={{
          style: {
            background: "#ffffff",
            color: "#1b1c1b",
            border: "1px solid #cfc4c5",
            borderRadius: "0.5rem",
            fontSize: "13px",
          },
        }}
      />

      {/* ═══ TopNavBar ═══ */}
      <header className="flex justify-between items-center w-full px-8 h-16 bg-surface border-b border-outline-variant shrink-0 z-10">
        <div className="flex items-center gap-4">
          <h1 className="text-2xl font-bold text-primary tracking-tight">VoxSlides</h1>
        </div>
        <div className="flex items-center gap-4">
          <div className="w-10 h-10 rounded-full bg-surface-container-highest border border-outline-variant overflow-hidden flex items-center justify-center text-on-surface-variant">
            <span className="material-symbols-outlined text-lg">person</span>
          </div>
          <button
            onClick={handleGenerate}
            disabled={generating || !compiledScript.trim()}
            className="bg-primary text-on-primary text-xs font-medium px-6 h-12 rounded hover:opacity-90 transition-opacity flex items-center gap-2 disabled:opacity-40"
          >
            <span className="material-symbols-outlined text-[18px]">bolt</span>
            {generating ? "Generating..." : "Generate"}
          </button>
        </div>
      </header>

      {/* ═══ Main Workspace ═══ */}
      <div className="flex flex-1 overflow-hidden">
        {/* ═══ Left Sidebar ═══ */}
        <aside className="flex flex-col h-full pt-8 bg-surface-container-low border-r border-outline-variant w-80 shrink-0">
          {/* Branding */}
          <div className="px-8 mb-8 flex items-center gap-4">
            <div className="w-10 h-10 rounded bg-primary flex items-center justify-center text-on-primary">
              <span className="material-symbols-outlined">graphic_eq</span>
            </div>
            <div>
              <h2 className="text-lg font-semibold text-primary">Expressive TTS</h2>
              <p className="text-xs text-on-surface-variant">Voice clone & script</p>
            </div>
          </div>

          <div className="h-px bg-outline-variant mx-8 mb-8"></div>

          {/* Scrollable middle */}
          <div className="flex-1 min-h-0 overflow-y-auto">
            {/* Voice Identity */}
            <div className="px-8 mb-8 flex flex-col gap-4">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-medium text-on-surface-variant uppercase tracking-widest">Voice Identity</h3>
                <span className="material-symbols-outlined text-on-surface-variant text-[16px] w-10 h-10 flex items-center justify-center cursor-pointer hover:text-primary transition-colors">info</span>
              </div>
              {speakerAudio ? (
                <div className="border border-outline-variant rounded-lg p-4 bg-surface flex items-center justify-between">
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <span className="material-symbols-outlined text-primary text-[20px] shrink-0">audio_file</span>
                    <span className="text-sm truncate">{speakerFileName}</span>
                  </div>
                <button onClick={clearAudio} className="w-10 h-10 flex items-center justify-center text-on-surface-variant hover:text-primary shrink-0">
                  <span className="material-symbols-outlined text-[16px]">close</span>
                </button>
                </div>
              ) : (
                <div className="border border-dashed border-outline-variant rounded-lg p-6 bg-surface flex flex-col items-center justify-center text-center gap-4">
                  <span className="material-symbols-outlined text-outline text-[32px]">graphic_eq</span>
                  <p className="text-sm text-on-surface-variant">No sample selected</p>
                  <div className="flex gap-2 w-full mt-2">
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="audio/*"
                      onChange={handleFileUpload}
                      className="hidden"
                    />
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="flex-1 h-12 border border-outline-variant rounded text-xs font-medium hover:bg-surface-container transition-colors flex items-center justify-center gap-2"
                  >
                      <span className="material-symbols-outlined text-[16px]">upload</span>
                      Upload
                    </button>
                    <VoiceRecorder
                      onAudioReady={(data) => {
                        setSpeakerAudio(data);
                        setSpeakerFileName("Recorded Audio");
                      }}
                      disabled={generating}
                    />
                  </div>
                </div>
              )}
            </div>

            <div className="h-px bg-outline-variant mx-8 mb-8"></div>

            {/* Voice Tuning */}
            <div className="px-8 flex flex-col gap-6">
              <h3 className="text-xs font-medium text-on-surface-variant uppercase tracking-widest">Voice Tuning</h3>
              <div className="flex flex-col gap-5">
                {[
                  { label: "Temperature", value: temperature, set: setTemperature, min: 0.1, max: 2, step: 0.1, display: temperature.toFixed(1) },
                  { label: "Repetition Penalty", value: repetitionPenalty, set: setRepetitionPenalty, min: 0.1, max: 5, step: 0.1, display: repetitionPenalty.toFixed(1) },
                  { label: "Top-P", value: topP, set: setTopP, min: 0, max: 1, step: 0.05, display: topP.toFixed(2) },
                  { label: "Chunk Length", value: chunkLength, set: setChunkLength, min: 0, max: 1000, step: 50, display: String(chunkLength) },
                ].map((slider) => (
                  <div key={slider.label} className="flex flex-col gap-2">
                    <div className="flex justify-between items-center text-xs">
                      <label className="text-on-surface">{slider.label}</label>
                      <span className="text-on-surface-variant bg-surface-container-highest px-2 py-0.5 rounded text-xs">{slider.display}</span>
                    </div>
                    <input
                      type="range"
                      min={slider.min}
                      max={slider.max}
                      step={slider.step}
                      value={slider.value}
                      onChange={(e) => slider.set(parseFloat(e.target.value))}
                    />
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Bottom Links */}
          <div className="shrink-0 pt-8 flex flex-col gap-2 px-8">
            {[
              { icon: "help", label: "Help" },
              { icon: "chat_bubble", label: "Feedback" },
            ].map((link) => (
              <button
                key={link.label}
                className="flex items-center gap-3 h-12 text-on-surface-variant hover:text-primary transition-colors text-xs"
              >
                <span className="material-symbols-outlined text-[18px]">{link.icon}</span>
                {link.label}
              </button>
            ))}
          </div>
        </aside>

        {/* ═══ Center Panel ═══ */}
        <main className="flex-1 flex flex-col relative bg-surface-bright p-8 overflow-hidden">
          {/* Editor Area */}
          <div className="flex-1 border border-outline-variant rounded-lg bg-surface flex flex-col relative shadow-sm overflow-hidden">
            <div className="flex-1 p-6 overflow-y-auto">
              <SlotEditor
                text={text}
                slots={slots}
                compiledScript={compiledScript}
                onTextChange={setText}
                onSlotsChange={setSlots}
                onCompiledChange={setCompiledScript}
              />
            </div>

            {/* Status Bar */}
            <div className="h-10 border-t border-outline-variant bg-surface-container-low rounded-b-lg flex items-center px-4 text-xs text-on-surface-variant justify-between shrink-0">
              <div className="flex gap-4">
                <span>Words: {wordCount}</span>
                <span>Chars: {charCount} / 5000</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-secondary-container animate-pulse"></div>
                <span>Cloud Sync Active</span>
              </div>
            </div>
          </div>

        </main>

        {/* ═══ Right Panel ═══ */}
        <aside className="w-80 border-l border-outline-variant bg-surface flex flex-col shrink-0 overflow-hidden">
          {/* Latest Render */}
          <div className="p-8 border-b border-outline-variant flex flex-col gap-4">
            <h3 className="text-xs font-medium text-on-surface-variant uppercase tracking-widest">Latest Render</h3>
            {audioUrl ? (
              <AudioPlayer audioUrl={audioUrl} />
            ) : (
              <div className="h-32 rounded-lg border border-outline-variant bg-surface-container-low flex flex-col items-center justify-center gap-2 relative overflow-hidden">
                <div className="absolute inset-0 opacity-5" style={{ backgroundImage: "radial-gradient(circle at 2px 2px, black 1px, transparent 0)", backgroundSize: "16px 16px" }}></div>
                <span className="material-symbols-outlined text-outline text-[32px] relative z-10">graphic_eq</span>
                <p className="text-sm text-on-surface-variant relative z-10">No render yet</p>
              </div>
            )}
          </div>

          {/* History */}
          <div className="flex-1 p-8 flex flex-col gap-4 overflow-y-auto">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-medium text-on-surface-variant uppercase tracking-widest">History</h3>
              {history.length > 0 && (
                <button
                  onClick={() => {
                    localStorage.removeItem(HISTORY_KEY);
                    setHistory([]);
                  }}
                  className="text-primary text-xs font-medium uppercase tracking-wider hover:opacity-70 transition-opacity"
                >
                  Clear
                </button>
              )}
            </div>

            {history.length === 0 ? (
              <div className="flex-1 flex flex-col items-center justify-center text-center gap-3 mt-8">
                <span className="material-symbols-outlined text-outline-variant text-[48px] font-extralight">history</span>
                <p className="text-sm text-on-surface-variant">No generations yet.</p>
                <p className="text-xs text-outline px-4">Your rendered clips will appear here.</p>
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                {history.map((gen) => (
                  <div
                    key={gen.id}
                    className="border border-outline-variant rounded-lg p-3 bg-surface-container-low cursor-pointer hover:border-primary transition-colors"
                    onClick={() => handleReplay(gen)}
                  >
                    <div className="flex justify-between items-center mb-1">
                      <span className="text-xs font-bold text-primary">
                        v{history.length - history.indexOf(gen)}.0
                      </span>
                      <span className="text-xs text-on-surface-variant">
                        {formatTimeAgo(gen.timestamp)}
                      </span>
                    </div>
                    <p className="text-sm text-on-surface-variant truncate">
                      {gen.script.slice(0, 40)}{gen.script.length > 40 ? "..." : ""}
                    </p>
                    <div className="flex items-center gap-3 mt-2 text-on-surface-variant">
                      <span className="text-xs">~30s</span>
                      <div className="flex-1" />
                      <button
                        onClick={(e) => { e.stopPropagation(); handleReplay(gen); }}
                        className="hover:text-primary transition-colors"
                      >
                        <span className="material-symbols-outlined text-lg">play_arrow</span>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}
