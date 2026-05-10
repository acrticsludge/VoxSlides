import { NextRequest, NextResponse } from "next/server";
import { MsEdgeTTS, OUTPUT_FORMAT } from "msedge-tts";
import { z } from "zod";

const RequestSchema = z.object({
  script: z.string().min(1, "Script is required").max(5000, "Script too long"),
});

// Map conditions to speech prosody for expressive voice
const CONDITION_PROSODY: Record<string, { rate: number; pitch: string; volume: number }> = {
  excited:         { rate: 1.5, pitch: "+200Hz", volume: 100 },
  whisper:         { rate: 0.6, pitch: "-150Hz", volume: 20 },
  "slow and dramatic": { rate: 0.3, pitch: "-100Hz", volume: 100 },
  fast:            { rate: 2.0, pitch: "+80Hz", volume: 100 },
  nervous:         { rate: 1.3, pitch: "+180Hz", volume: 90 },
  crying:          { rate: 0.5, pitch: "-250Hz", volume: 80 },
  angry:           { rate: 1.4, pitch: "-150Hz", volume: 100 },
  calm:            { rate: 0.7, pitch: "-50Hz", volume: 85 },
  laughing:        { rate: 1.2, pitch: "+180Hz", volume: 100 },
  sarcastic:       { rate: 0.9, pitch: "+250Hz", volume: 100 },
  storytelling:    { rate: 0.85, pitch: "+0Hz", volume: 100 },
  breathless:      { rate: 1.6, pitch: "+120Hz", volume: 80 },
};

const DEFAULT = { rate: 1.0, pitch: "+0Hz", volume: 100 };

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

    // Generate audio per segment with individual prosody settings
    const audioChunks: Buffer[] = [];
    const voiceName = "en-US-AvaNeural";

    for (const seg of segments) {
      const text = seg.text.trim();
      if (!text) continue;

      const p = CONDITION_PROSODY[seg.condition ?? ""] ?? DEFAULT;
      const tts = new MsEdgeTTS();
      await tts.setMetadata(voiceName, OUTPUT_FORMAT.AUDIO_24KHZ_96KBITRATE_MONO_MP3);
      const { audioStream } = await tts.toStream(text, {
        rate: p.rate,
        pitch: p.pitch,
        volume: p.volume,
      });

      const chunks: Buffer[] = [];
      await new Promise<void>((resolve, reject) => {
        audioStream.on("data", (d: Buffer) => chunks.push(d));
        audioStream.on("close", () => resolve());
        audioStream.on("error", (e: Error) => reject(e));
      });

      audioChunks.push(Buffer.concat(chunks));
    }

    if (audioChunks.length === 0) {
      return NextResponse.json({ error: "No audio generated" }, { status: 422 });
    }

    const fullAudio = Buffer.concat(audioChunks);

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
