import { NextRequest, NextResponse } from "next/server";
import { DeepgramClient } from "@deepgram/sdk";
import { z } from "zod";

const RequestSchema = z.object({
  script: z.string().min(1, "Script is required").max(5000, "Script too long"),
});

// Map conditions to SSML prosody for expressive speech
const CONDITION_PROSODY: Record<string, { rate: string; pitch: string }> = {
  excited:         { rate: "fast",    pitch: "+200Hz" },
  whisper:         { rate: "slow",    pitch: "-150Hz" },
  "slow and dramatic": { rate: "x-slow", pitch: "-100Hz" },
  fast:            { rate: "x-fast",  pitch: "+80Hz" },
  nervous:         { rate: "fast",    pitch: "+180Hz" },
  crying:          { rate: "x-slow",  pitch: "-250Hz" },
  angry:           { rate: "fast",    pitch: "-150Hz" },
  calm:            { rate: "slow",    pitch: "-50Hz" },
  laughing:        { rate: "fast",    pitch: "+200Hz" },
  sarcastic:       { rate: "medium",  pitch: "+250Hz" },
  storytelling:    { rate: "slow",    pitch: "+0Hz" },
  breathless:      { rate: "x-fast",  pitch: "+120Hz" },
};

const DEFAULT = { rate: "medium", pitch: "+0Hz" };

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

function escapeXml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
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

    const { script } = parsed.data;
    const segments = parseScript(script);

    if (segments.length === 0) {
      return NextResponse.json({ error: "No text to synthesize" }, { status: 422 });
    }

    // Build text with SSML prosody per segment
    let ssmlBody = "";
    for (const seg of segments) {
      if (!seg.text.trim()) continue;
      const p = CONDITION_PROSODY[seg.condition ?? ""] ?? DEFAULT;
      ssmlBody += `<prosody rate="${p.rate}" pitch="${p.pitch}">${escapeXml(seg.text)}</prosody> `;
    }

    const ssml = `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis">${ssmlBody}</speak>`;

    const deepgramApiKey = process.env.DEEPGRAM_API_KEY;
    if (!deepgramApiKey) {
      return NextResponse.json({ error: "DEEPGRAM_API_KEY not configured" }, { status: 500 });
    }

    const deepgram = new DeepgramClient({ apiKey: deepgramApiKey });
    const result = await deepgram.speak.v1.audio.generate({
      text: ssml,
      model: "aura-2-thalia-en",
    });

    // Collect the audio stream using Web Streams API
    const audioStream = result.stream();
    if (!audioStream) {
      return NextResponse.json({ error: "No audio stream returned" }, { status: 422 });
    }
    const reader = audioStream.getReader();
    const chunks: Uint8Array[] = [];
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
    }

    if (chunks.length === 0) {
      return NextResponse.json({ error: "No audio generated" }, { status: 422 });
    }

    const fullAudio = Buffer.concat(chunks.map((c) => Buffer.from(c)));

    return new NextResponse(fullAudio, {
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
