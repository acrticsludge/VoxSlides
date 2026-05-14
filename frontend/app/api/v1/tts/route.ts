import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { spawnSync } from "child_process";
import { writeFileSync, unlinkSync, mkdtempSync, readFileSync, existsSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { resolve } from "path";
import { parseScript, applyModifiers, buildFullText, Segment } from "@/lib/script-utils";
import { MsEdgeTTS, OUTPUT_FORMAT } from "msedge-tts";

// ffmpeg-static path gets mangled by Turbopack, resolve manually
const FFMPEG_PATH = (() => {
  try {
    // Try direct import first
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const p = require("ffmpeg-static") as string;
    if (p && p.length > 5) return p;
  } catch {
    // fallback: hardcoded path relative to project
  }
  return resolve(process.cwd(), "node_modules/ffmpeg-static/ffmpeg.exe");
})();
console.log("[tts] ffmpeg path:", FFMPEG_PATH);

const NGROK_HEADERS = { "ngrok-skip-browser-warning": "1" };

const RequestSchema = z.object({
  script: z.string().min(1, "Script is required").max(5000, "Script too long"),
  speakerAudio: z.string().min(1, "Voice sample is required"),
});

// Condition → speed multiplier for Chatterbox
const CONDITION_SPEED: Record<string, number> = {
  excited:         1.15,
  whisper:         0.7,
  "slow and dramatic": 0.5,
  fast:            1.6,
  nervous:         1.2,
  crying:          0.6,
  angry:           1.25,
  calm:            0.75,
  laughing:        1.1,
  sarcastic:       0.9,
  storytelling:    0.85,
  breathless:      1.4,
};
const ELEVENLABS_PRESET_VOICE_ID = "21m00Tcm4TlvDq8ikWAM"; // Rachel

async function tryCloneVoice(audioBase64: string, apiKey: string): Promise<string | null> {
  const raw = audioBase64.split(",").pop() ?? audioBase64;
  const buffer = Buffer.from(raw, "base64");
  const blob = new Blob([buffer], { type: "audio/wav" });
  const form = new FormData();
  form.append("name", "voxslides-clone");
  form.append("files", blob, "voice-sample.wav");

  try {
    const res = await fetch("https://api.elevenlabs.io/v1/voices/add", {
      method: "POST",
      headers: { "xi-api-key": apiKey },
      body: form,
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`ElevenLabs clone failed (${res.status}): ${text}`);
    }

    const data = await res.json();
    return data.voice_id;
  } catch (err) {
    if (err instanceof Error && (err.message.includes("missing_permissions") || err.message.includes("401"))) {
      console.warn("[tts] Voice cloning not available on this plan, using preset voice");
      return null;
    }
    throw err;
  }
}

async function generateWithElevenLabs(
  text: string,
  voiceId: string,
  apiKey: string
): Promise<Buffer> {
  const res = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}?output_format=mp3_44100_128`,
    {
      method: "POST",
      headers: {
        "xi-api-key": apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        text,
        model_id: "eleven_multilingual_v2",
        voice_settings: {
          stability: 0.35,
          similarity_boost: 0.8,
        },
      }),
    }
  );

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`ElevenLabs TTS failed (${res.status}): ${text}`);
  }

  const arrayBuffer = await res.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

// ── SSML prosody (for msedge-tts fallback) ──

const CONDITION_PROSODY: Record<
  string,
  { rate: string; pitch: string; volume: number }
> = {
  excited:         { rate: "1.4",  pitch: "+150Hz", volume: 100 },
  whisper:         { rate: "0.6",  pitch: "-200Hz", volume: 20 },
  "slow and dramatic": { rate: "0.35", pitch: "-80Hz",  volume: 100 },
  fast:            { rate: "1.8",  pitch: "+60Hz",  volume: 100 },
  nervous:         { rate: "1.3",  pitch: "+200Hz", volume: 90 },
  crying:          { rate: "0.5",  pitch: "-300Hz", volume: 85 },
  angry:           { rate: "1.3",  pitch: "-180Hz", volume: 100 },
  calm:            { rate: "0.7",  pitch: "-30Hz",  volume: 80 },
  laughing:        { rate: "1.2",  pitch: "+200Hz", volume: 100 },
  sarcastic:       { rate: "0.9",  pitch: "+250Hz", volume: 100 },
  storytelling:    { rate: "0.8",  pitch: "+0Hz",   volume: 100 },
  breathless:      { rate: "1.5",  pitch: "+150Hz", volume: 75 },
};

const DEFAULT_PROSODY = { rate: "1.0", pitch: "+0Hz", volume: 100 };

function escapeXml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function buildSsml(segments: Segment[]): string {
  const parts = segments.map((seg) => {
    const p = CONDITION_PROSODY[seg.condition ?? ""] ?? DEFAULT_PROSODY;
    const text = escapeXml(seg.text);
    return `<prosody rate="${p.rate}" pitch="${p.pitch}" volume="${p.volume}">${text}</prosody>`;
  });

  return `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="en-US">
  <voice name="en-US-AvaNeural">
    ${parts.join("\n    ")}
  </voice>
</speak>`;
}

// ── msedge-tts (free fallback) ──

async function synthesizeWithEdge(segments: Segment[]): Promise<Buffer> {
  const ssml = buildSsml(segments);
  const tts = new MsEdgeTTS();
  await tts.setMetadata(
    "en-US-AvaNeural",
    OUTPUT_FORMAT.AUDIO_24KHZ_96KBITRATE_MONO_MP3
  );

    const { audioStream } = await tts.rawToStream(ssml);

  const chunks: Buffer[] = [];
  await new Promise<void>((resolve, reject) => {
    audioStream.on("data", (d: Buffer) => chunks.push(d));
    audioStream.on("close", () => resolve());
    audioStream.on("error", (e: Error) => reject(e));
  });

  if (chunks.length === 0) throw new Error("No audio from msedge-tts");
  return Buffer.concat(chunks);
}

// ── Route ──

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const parsed = RequestSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", fields: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const { script, speakerAudio } = parsed.data;
    const segments = parseScript(script);

    if (segments.length === 0) {
      return NextResponse.json({ error: "No text to synthesize" }, { status: 422 });
    }

    // ── Route: ElevenLabs premium TTS (uses voice cloning if available, otherwise preset voice) ──
    if (speakerAudio) {
      const elKey = process.env.ELEVENLABS_API_KEY;
      if (!elKey) {
        console.warn("[tts] No ElevenLabs key, falling back to msedge-tts");
      } else {
        try {
        // Try voice clone (paid plans) — falls back to preset voice (free tier)
        const voiceId = (await tryCloneVoice(speakerAudio, elKey)) ?? ELEVENLABS_PRESET_VOICE_ID;

        // Build plain text with emotion modifiers
        const fullText = buildFullText(segments);

        if (!fullText) {
          return NextResponse.json({ error: "No text to synthesize" }, { status: 422 });
        }

        const audio = await generateWithElevenLabs(fullText, voiceId, elKey);

        return new NextResponse(new Uint8Array(audio), {
          status: 200,
          headers: {
            "Content-Type": "audio/mpeg",
            "Content-Disposition": 'inline; filename="voxslides-output.mp3"',
          },
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : "";
        console.warn("[tts] ElevenLabs error, falling back to msedge-tts:", msg);
      }
      } // closes else
    }

    // ── Fallback: msedge-tts (free, no voice cloning, SSML emotion) ──
    const audio = await synthesizeWithEdge(segments);

    return new NextResponse(new Uint8Array(audio), {
      status: 200,
      headers: {
        "Content-Type": "audio/mpeg",
        "Content-Disposition": 'inline; filename="voxslides-output.mp3"',
      },
    });
  } catch (err) {
    console.error("[tts] Error:", err);
    return NextResponse.json({ error: "Speech generation failed" }, { status: 500 });
  }
}
