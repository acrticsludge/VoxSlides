"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import toast from "react-hot-toast";

interface VoiceRecorderProps {
  onAudioReady: (base64: string) => void;
  disabled?: boolean;
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
}

export function VoiceRecorder({ onAudioReady, disabled }: VoiceRecorderProps) {
  const [recording, setRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval>>(null);
  const startTimeRef = useRef(0);

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      mediaRecorderRef.current.stop();
    }

    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }

    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }

    setRecording(false);
  }, []);

  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      chunksRef.current = [];
      const recorder = new MediaRecorder(stream, { mimeType: "audio/webm" });

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: "audio/webm" });
        chunksRef.current = [];

        const reader = new FileReader();
        reader.onload = () => {
          const dataUrl = reader.result as string;
          onAudioReady(dataUrl);
          toast.success("Voice recording captured");
        };
        reader.onerror = () => toast.error("Failed to process recording");
        reader.readAsDataURL(blob);
      };

      recorder.onerror = () => {
        toast.error("Recording failed");
        stopRecording();
      };

      mediaRecorderRef.current = recorder;
      recorder.start(250);

      startTimeRef.current = Date.now();
      setElapsed(0);
      setRecording(true);

      timerRef.current = setInterval(() => {
        const now = Date.now();
        const secs = Math.floor((now - startTimeRef.current) / 1000);
        setElapsed(secs);
        if (secs >= 60) {
          stopRecording();
        }
      }, 200);
    } catch (err) {
      if (err instanceof DOMException && err.name === "NotAllowedError") {
        toast.error("Microphone access denied. Allow mic access or upload a file.");
      } else {
        toast.error("Could not access microphone");
      }
    }
  }, [onAudioReady, stopRecording]);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
        mediaRecorderRef.current.stop();
      }
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
      }
    };
  }, []);

  if (recording) {
    return (
      <button
        onClick={stopRecording}
        className="flex-1 h-12 bg-surface text-xs font-bold uppercase border border-red-300 rounded hover:bg-surface-container transition-colors flex items-center justify-center gap-1.5 text-red-500"
      >
        <span className="material-symbols-outlined text-[16px]" style={{ fontVariationSettings: "'FILL' 1" }}>stop</span>
        Stop ({formatTime(elapsed)})
      </button>
    );
  }

  return (
    <button
      onClick={startRecording}
      disabled={disabled}
      className="flex-1 h-12 bg-primary text-on-primary rounded text-xs font-bold uppercase hover:opacity-90 transition-opacity flex items-center justify-center gap-2 disabled:opacity-40"
    >
      <span className="material-symbols-outlined text-[16px]">mic</span>
      Record
    </button>
  );
}
