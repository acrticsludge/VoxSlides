import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { execSync } from "child_process";
import { writeFileSync, unlinkSync, mkdtempSync, readFileSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import ffmpeg from "ffmpeg-static";

const NGROK_HEADERS = { "ngrok-skip-browser-warning": "1" };

const RequestSchema = z.object({
  script: z.string().min(1, "Script is required").max(5000, "Script too long"),
  speakerAudio: z.string().min(1, "Voice sample is required"),
});

// ── Emotion text modifiers (punctuation & casing, no extra words) ──

const MODIFIERS: Record<string, { punct: string; casing: "upper" | "lower" | "normal" }> = {
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

// ── Chatterbox TTS ──

function getChatterboxBaseUrl(): string {
  const url = process.env.CHATTERBOX_BASE_URL;
  if (!url) throw new Error("CHATTERBOX_BASE_URL not configured");
  return url;
}

async function convertToWav(inputBuffer: Buffer, inputExt: string): Promise<Buffer> {
  if (!ffmpeg) {
    console.warn("[tts] ffmpeg not available, uploading as-is");
    return inputBuffer;
  }

  const tmpDir = mkdtempSync(join(tmpdir(), "voxslides-"));
  const inPath = join(tmpDir, `input.${inputExt}`);
  const outPath = join(tmpDir, "output.wav");

  try {
    writeFileSync(inPath, inputBuffer);

    execSync(
      `"${ffmpeg}" -y -i "${inPath}" -acodec pcm_s16le -ar 44100 -ac 1 "${outPath}"`,
      { stdio: "pipe", timeout: 30000 }
    );

    const wavBuffer = readFileSync(outPath);
    console.log(`[tts] Converted ${inputExt} → wav (${inputBuffer.length} → ${wavBuffer.length} bytes)`);
    return Buffer.from(wavBuffer.buffer, wavBuffer.byteOffset, wavBuffer.byteLength);
  } finally {
    try { unlinkSync(inPath) } catch {}
    try { unlinkSync(outPath) } catch {}
    try { unlinkSync(tmpDir) } catch {}
  }
}

async function uploadToChatterbox(
  audioBase64: string,
  baseUrl: string
): Promise<string> {
  const raw = audioBase64.split(",").pop() ?? audioBase64;
  let buffer: Buffer = Buffer.from(raw, "base64");
  const mime = audioBase64.startsWith("data:")
    ? audioBase64.split(",")[0].split(";")[0].split(":").pop() ?? "audio/wav"
    : "audio/wav";

  // Determine input format
  const inputExt = mime.includes("mp3") ? "mp3" : mime.includes("webm") ? "webm" : "wav";

  // Convert non-WAV to WAV (Chatterbox expects WAV/MP3)
  if (inputExt !== "wav") {
    buffer = await convertToWav(buffer, inputExt);
  }

  const filename = "voxslides-speaker.wav";

  const form = new FormData();
  form.append("files", new Blob([new Uint8Array(buffer)], { type: "audio/wav" }), filename);

  const res = await fetch(`${baseUrl}/upload_reference`, {
    method: "POST",
    headers: NGROK_HEADERS,
    body: form,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Chatterbox upload failed (${res.status}): ${text}`);
  }

  const responseBody = await res.text().catch(() => "");
  console.log(`[tts] Uploaded ${filename} (${buffer.length} bytes): ${responseBody}`);

  return filename;
}

async function generateWithChatterbox(
  text: string,
  referenceAudioFilename: string,
  baseUrl: string,
  speed: number
): Promise<Buffer> {
  const res = await fetch(`${baseUrl}/tts`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...NGROK_HEADERS },
    body: JSON.stringify({
      text,
      voice_mode: "clone",
      reference_audio_filename: referenceAudioFilename,
      split_text: false,  // keep as one chunk for consistent voice
      speed,
      temperature: 0.3,   // lower = more accurate cloning
      top_k: 30,
      top_p: 0.85,
      language: "en",
      seed: Math.floor(Math.random() * 2147483647),
    }),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => "unknown error");
    throw new Error(`Chatterbox TTS failed (${res.status}): ${errText}`);
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

    // Check Chatterbox is configured
    let chatterboxUrl: string;
    try {
      chatterboxUrl = getChatterboxBaseUrl();
    } catch {
      return NextResponse.json(
        { error: "Chatterbox TTS not configured. Set CHATTERBOX_BASE_URL in .env.local" },
        { status: 500 }
      );
    }

    // Upload reference audio (returns the filename with correct extension)
    const filename = await uploadToChatterbox(speakerAudio, chatterboxUrl);

    // Build text with emotion modifiers
    const firstCondition = segments.find((s) => s.condition)?.condition ?? null;
    const speed = firstCondition ? CONDITION_SPEED[firstCondition] ?? 1.0 : 1.0;

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

    // Generate speech with cloned voice
    const audio = await generateWithChatterbox(fullText, filename, chatterboxUrl, speed);

    return new NextResponse(new Uint8Array(audio), {
      status: 200,
      headers: {
        "Content-Type": "audio/wav",
        "Content-Disposition": 'inline; filename="voxslides-output.wav"',
      },
    });
  } catch (err) {
    console.error("[tts] Error:", err);
    const message = err instanceof Error ? err.message : "Speech generation failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
