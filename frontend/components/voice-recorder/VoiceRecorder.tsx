"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Mic, Square } from "lucide-react";
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
    // Stop the MediaRecorder
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      mediaRecorderRef.current.stop();
    }

    // Stop all tracks
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }

    // Clear timer
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

        // Convert blob to base64 data URL
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
      recorder.start(250); // collect data every 250ms

      startTimeRef.current = Date.now();
      setElapsed(0);
      setRecording(true);

      // Update elapsed timer every second
      timerRef.current = setInterval(() => {
        const now = Date.now();
        const secs = Math.floor((now - startTimeRef.current) / 1000);
        setElapsed(secs);
        // Auto-stop at 60 seconds
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

  // Cleanup on unmount
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
      <Button
        variant="outline"
        size="sm"
        onClick={stopRecording}
        className="w-full border-red-500/50 text-red-400 hover:bg-red-500/10 hover:text-red-300"
      >
        <Square className="h-3.5 w-3.5 mr-2 fill-red-400" />
        Stop ({formatTime(elapsed)})
      </Button>
    );
  }

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={startRecording}
      disabled={disabled}
      className="w-full"
    >
      <Mic className="h-3.5 w-3.5 mr-2" />
      Record Audio
    </Button>
  );
}
