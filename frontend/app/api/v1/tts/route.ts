import { NextRequest, NextResponse } from "next/server";
import { MsEdgeTTS, OUTPUT_FORMAT } from "msedge-tts";
import { z } from "zod";

const RequestSchema = z.object({
  script: z.string().min(1, "Script is required").max(5000, "Script too long"),
  speakerAudio: z.string().optional(),
});

// ── Emotion text modifiers (punctuation & casing, no extra words) ──

const MODIFIERS: Record<
  string,
  { punct: string; casing: "upper" | "lower" | "normal" }
> = {
  excited:         { punct: "!", casing: "normal" },
  whisper:         { punct: "...", casing: "lower" },
  "slow and dramatic": { punct: "...", casing: "normal" },
  fast:            { punct: "!", casing: "normal" },
  nervous:         { punct: "...", casing: "normal" },
  crying:          { punct: "...", casing: "lower" },
  angry:           { punct: "!", casing: "upper" },
  calm:            { punct: "...", casing: "lower" },
  laughing:        { punct: "!", casing: "normal" },
  sarcastic:       { punct: ".", casing: "normal" },
  storytelling:    { punct: "...", casing: "normal" },
  breathless:      { punct: "...", casing: "lower" },
};

// Condition → speed multiplier for Chatterbox (cloned voice + speed = emotion cue)
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

// ── ElevenLabs helpers (fallback when Chatterbox not available) ──

const PRESET_VOICE_ID = "21m00Tcm4TlvDq8ikWAM"; // Rachel

async function tryCloneVoice(audioBase64: string, apiKey: string): Promise<string | null> {
  try {
    const raw = audioBase64.split(",").pop() ?? audioBase64;
    const buffer = Buffer.from(raw, "base64");
    const mime = audioBase64.startsWith("data:")
      ? audioBase64.split(",")[0].split(";")[0].split(":").pop() ?? "audio/wav"
      : "audio/wav";

    const form = new FormData();
    form.append("files", new Blob([buffer], { type: mime }), "voice.wav");
    form.append("name", "voxslides-clone");

    const res = await fetch("https://api.elevenlabs.io/v1/voices/add", {
      method: "POST",
      headers: { "xi-api-key": apiKey },
      body: form,
    });

    if (!res.ok) {
      const text = await res.text();
      if (text.includes("missing_permissions") || text.includes("401")) {
        console.warn("[tts] Voice cloning not available on this plan, using preset voice");
        return null;
      }
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

interface Segment {
  text: string;
  condition: string | null;
}

// ── Script utilities ──

function parseScript(fullScript: string): Segment[] {
  const regex = /\[([^\]]+)\]\s*/g;
  const segments: Segment[] = [];
  let lastIndex = 0;
  let currentCondition: string | null = null;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(fullScript)) !== null) {
    const before = fullScript.slice(lastIndex, match.index);
    if (before.trim()) {
      segments.push({ text: before.trim(), condition: currentCondition });
    }
    currentCondition = match[1].toLowerCase().trim();
    lastIndex = match.index + match[0].length;
  }

  const remaining = fullScript.slice(lastIndex);
  if (remaining.trim()) {
    segments.push({ text: remaining.trim(), condition: currentCondition });
  }

  return segments;
}

function applyModifiers(text: string, condition: string | null): string {
  if (!condition) return text;
  const mod = MODIFIERS[condition];
  if (!mod) return text;

  let t = text;
  if (mod.casing === "upper") t = t.toUpperCase();
  else if (mod.casing === "lower") t = t.toLowerCase();

  const last = t.trim().slice(-1);
  if (!/[.!?…]/.test(last)) {
    t = t.trim() + mod.punct;
  } else if (mod.punct === "!" && last === ".") {
    t = t.trim().slice(0, -1) + "!";
  }

  return t;
}

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

// ── Chatterbox TTS (local Colab) ──

function getChatterboxBaseUrl(): string | null {
  return process.env.CHATTERBOX_BASE_URL ?? null;
}

async function chatterboxHealth(baseUrl: string): Promise<boolean> {
  try {
    const res = await fetch(`${baseUrl}/health`, { signal: AbortSignal.timeout(5000) });
    return res.ok;
  } catch {
    return false;
  }
}

async function uploadToChatterbox(
  audioBase64: string,
  baseUrl: string,
  filename: string
): Promise<void> {
  const raw = audioBase64.split(",").pop() ?? audioBase64;
  const buffer = Buffer.from(raw, "base64");
  const mime = audioBase64.startsWith("data:")
    ? audioBase64.split(",")[0].split(";")[0].split(":").pop() ?? "audio/wav"
    : "audio/wav";

  const form = new FormData();
  const blob = new Blob([buffer], { type: mime });
  const ext = mime.includes("mp3") ? "mp3" : "wav";
  form.append("files", blob, filename ?? `voice.${ext}`);

  const res = await fetch(`${baseUrl}/upload_reference`, {
    method: "POST",
    body: form,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Chatterbox upload failed (${res.status}): ${text}`);
  }
}

interface ChatterboxTtsOptions {
  text: string;
  referenceAudioFilename: string;
  speed?: number;
  seed?: number;
  language?: string;
}

async function generateWithChatterbox(
  options: ChatterboxTtsOptions,
  baseUrl: string
): Promise<Buffer> {
  const res = await fetch(`${baseUrl}/tts`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      text: options.text,
      voice_mode: "clone",
      reference_audio_filename: options.referenceAudioFilename,
      split_text: true,
      speed: options.speed ?? 1.0,
      seed: options.seed,
      language: options.language ?? "en",
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Chatterbox TTS failed (${res.status}): ${text}`);
  }

  const arrayBuffer = await res.arrayBuffer();
  return Buffer.from(arrayBuffer);
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

    // ── Primary: Chatterbox (local Colab) with voice cloning ──
    if (speakerAudio) {
      const chatterboxUrl = getChatterboxBaseUrl();
      if (chatterboxUrl) {
        const alive = await chatterboxHealth(chatterboxUrl);
        if (alive) {
          try {
            const filename = "voxslides-speaker.wav";

            // Upload the reference audio
            await uploadToChatterbox(speakerAudio, chatterboxUrl, filename);

            // Build text with emotion modifiers + speed per condition
            // For simplicity, use average speed if multiple conditions, or the first
            const firstCondition = segments.find((s) => s.condition)?.condition ?? null;
            const speed = firstCondition
              ? CONDITION_SPEED[firstCondition] ?? 1.0
              : 1.0;

            const fullText = segments
              .map((seg) => applyModifiers(seg.text, seg.condition))
              .filter(Boolean)
              .join(" ")
              .trim()
              .replace(/\s+\.\.\./g, "...")
              .replace(/\.\.\.\s+/g, "... ");

            if (!fullText) {
              return NextResponse.json({ error: "No text to synthesize" }, { status: 422 });
            }

            const audio = await generateWithChatterbox(
              {
                text: fullText,
                referenceAudioFilename: filename,
                speed,
                seed: Math.floor(Math.random() * 2147483647),
              },
              chatterboxUrl
            );

            return new NextResponse(new Uint8Array(audio), {
              status: 200,
              headers: {
                "Content-Type": "audio/wav",
                "Content-Disposition": 'inline; filename="voxslides-output.wav"',
              },
            });
          } catch (err) {
            const msg = err instanceof Error ? err.message : "";
            console.warn("[tts] Chatterbox error, trying ElevenLabs:", msg);
          }
        } else {
          console.warn("[tts] Chatterbox not reachable, trying ElevenLabs");
        }
      }

      // ── Secondary: ElevenLabs (if Chatterbox unavailable or not configured) ──
      const elKey = process.env.ELEVENLABS_API_KEY;
      if (elKey) {
        try {
          const voiceId = (await tryCloneVoice(speakerAudio, elKey)) ?? PRESET_VOICE_ID;

          const fullText = segments
            .map((seg) => applyModifiers(seg.text, seg.condition))
            .filter(Boolean)
            .join(" ")
            .trim()
            .replace(/\s+\.\.\./g, "...")
            .replace(/\.\.\.\s+/g, "... ");

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
      } else {
        console.warn("[tts] No ElevenLabs key, falling back to msedge-tts");
      }
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
