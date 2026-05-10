import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

const RequestSchema = z.object({
  script: z.string().min(1, "Script is required").max(5000, "Script too long"),
  speakerAudio: z.string().min(1, "Speaker audio is required"),
});

// Subtle text modifiers — just punctuation & casing, no extra words
// The cloned voice delivers these naturally
const MODIFIERS: Record<string, { punct: string; casing: "upper" | "lower" | "normal"; pause: string }> = {
  excited:         { punct: "!", casing: "normal", pause: "" },
  whisper:         { punct: "...", casing: "normal", pause: "..." },
  "slow and dramatic": { punct: "...", casing: "normal", pause: "..." },
  fast:            { punct: "!", casing: "normal", pause: "" },
  nervous:         { punct: "...", casing: "normal", pause: "..." },
  crying:          { punct: "...", casing: "normal", pause: "..." },
  angry:           { punct: "!", casing: "upper", pause: "" },
  calm:            { punct: "...", casing: "lower", pause: "..." },
  laughing:        { punct: "!", casing: "normal", pause: "" },
  sarcastic:       { punct: ".", casing: "normal", pause: "" },
  storytelling:    { punct: "...", casing: "normal", pause: "..." },
  breathless:      { punct: "...", casing: "normal", pause: "..." },
};

const REPLICATE_API = "https://api.replicate.com/v1";

async function uploadAudioToReplicate(
  base64Data: string,
  apiKey: string
): Promise<string> {
  // Convert base64 to buffer
  const raw = base64Data.split(",").pop() ?? base64Data;
  const buffer = Buffer.from(raw, "base64");

  // Determine content type from base64 header
  const mime = base64Data.startsWith("data:") 
    ? base64Data.split(",")[0].split(":")[1].split(";")[0]
    : "audio/wav";

  const ext = mime.includes("mp3") ? "mp3" : "wav";

  // Upload to Replicate's file storage
  const form = new FormData();
  const blob = new Blob([buffer], { type: mime });
  form.append("content", blob, `speaker.${ext}`);

  const res = await fetch(`${REPLICATE_API}/files`, {
    method: "POST",
    headers: { Authorization: `Token ${apiKey}` },
    body: form,
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Upload failed: ${err}`);
  }

  const data = await res.json();
  return data.urls?.get;
}

interface Segment {
  text: string;
  condition: string | null;
}

function parseScript(script: string): Segment[] {
  const regex = /\[([^\]]+)\]\s*/g;
  const segments: Segment[] = [];
  let lastIndex = 0;
  let currentCondition: string | null = null;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(script)) !== null) {
    const before = script.slice(lastIndex, match.index);
    if (before.trim()) {
      segments.push({ text: before.trim(), condition: currentCondition });
    }
    currentCondition = match[1].toLowerCase().trim();
    lastIndex = match.index + match[0].length;
  }

  const remaining = script.slice(lastIndex);
  if (remaining.trim()) {
    segments.push({ text: remaining.trim(), condition: currentCondition });
  }

  return segments;
}

function addEmotion(text: string, condition: string | null): string {
  if (!condition) return text;
  const mod = MODIFIERS[condition];
  if (!mod) return text;

  let t = text;
  if (mod.casing === "upper") t = t.toUpperCase();
  else if (mod.casing === "lower") t = t.toLowerCase();

  // Add punctuation if missing
  const last = t.trim().slice(-1);
  if (!/[.!?…]/.test(last)) {
    t = t.trim() + mod.punct;
  } else if (mod.punct === "!" && last === ".") {
    t = t.trim().slice(0, -1) + "!";
  }

  // Add pause markers
  if (mod.pause) {
    t = `... ${t.trim()} ...`;
  }

  return t;
}

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
    const apiKey = process.env.REPLICATE_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: "REPLICATE_API_KEY not configured" }, { status: 500 });
    }

    // Parse and add emotional expression to each segment
    const segments = parseScript(script);
    let fullText = segments
      .map((seg) => addEmotion(seg.text, seg.condition))
      .filter(Boolean)
      .join(" ")
      .trim()
      .replace(/\s+\.\.\./g, "...")
      .replace(/\.\.\.\s+/g, "... ");

    if (!fullText) {
      return NextResponse.json({ error: "No text to synthesize" }, { status: 422 });
    }

    // Upload the voice sample to Replicate storage
    let speakerUrl: string;
    try {
      speakerUrl = await uploadAudioToReplicate(speakerAudio, apiKey);
    } catch (err) {
      console.error("[tts] Upload failed:", err);
      return NextResponse.json({ error: "Voice sample upload failed" }, { status: 502 });
    }

    // Start Replicate prediction
    const predRes = await fetch(`${REPLICATE_API}/predictions`, {
      method: "POST",
      headers: {
        Authorization: `Token ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        version: "26a2b076e0b47af38a85a9c7f5c6b68b4eae8bb55190ce0a16e28adef4941e01",
        input: {
          text: fullText,
          speaker_audio: speakerUrl,
          language: "en",
        },
      }),
    });

    if (!predRes.ok) {
      const err = await predRes.text();
      console.error("[tts] Prediction start failed:", err);
      return NextResponse.json({ error: "Speech generation failed" }, { status: 502 });
    }

    const prediction = await predRes.json();
    const getUrl = prediction.urls?.get;
    if (!getUrl) {
      return NextResponse.json({ error: "No prediction URL returned" }, { status: 502 });
    }

    // Poll for completion (up to 2 minutes)
    let outputUrl: string | null = null;
    for (let i = 0; i < 40; i++) {
      await new Promise((r) => setTimeout(r, 3000));

      const statusRes = await fetch(getUrl, {
        headers: { Authorization: `Token ${apiKey}` },
      });
      if (!statusRes.ok) continue;

      const status = await statusRes.json();

      if (status.status === "succeeded") {
        outputUrl = status.output;
        break;
      }

      if (status.status === "failed") {
        console.error("[tts] Prediction failed:", status.error);
        return NextResponse.json({ error: "Speech generation failed" }, { status: 502 });
      }
    }

    if (!outputUrl) {
      return NextResponse.json({ error: "Speech generation timed out" }, { status: 504 });
    }

    // Handle output - might be a URL string or array of URLs
    const audioUrl = Array.isArray(outputUrl) ? outputUrl[0] : outputUrl;

    // Fetch the generated audio
    const audioRes = await fetch(audioUrl);
    if (!audioRes.ok) {
      return NextResponse.json({ error: "Failed to fetch generated audio" }, { status: 502 });
    }

    const audioBuffer = await audioRes.arrayBuffer();

    return new NextResponse(audioBuffer, {
      status: 200,
      headers: {
        "Content-Type": "audio/wav",
        "Content-Disposition": 'inline; filename="voxslides-output.wav"',
      },
    });
  } catch (err) {
    console.error("[tts] Error:", err);
    return NextResponse.json({ error: "Speech generation failed" }, { status: 500 });
  }
}
