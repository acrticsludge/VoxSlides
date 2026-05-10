import { NextRequest, NextResponse } from "next/server";
import { MsEdgeTTS, OUTPUT_FORMAT } from "msedge-tts";
import { z } from "zod";

const RequestSchema = z.object({
  script: z.string().min(1, "Script is required").max(5000, "Script too long"),
});

// Map condition names to prosody settings for expressive speech
const CONDITION_PROSODY: Record<string, { rate: number; pitch: string; volume?: string }> = {
  excited:         { rate: 1.5, pitch: "+200Hz" },
  whisper:         { rate: 0.6, pitch: "-150Hz", volume: "-60%" },
  "slow and dramatic": { rate: 0.3, pitch: "-100Hz" },
  fast:            { rate: 2.0, pitch: "+80Hz" },
  nervous:         { rate: 1.3, pitch: "+180Hz" },
  crying:          { rate: 0.5, pitch: "-250Hz" },
  angry:           { rate: 1.4, pitch: "-150Hz" },
  calm:            { rate: 0.7, pitch: "-50Hz" },
  laughing:        { rate: 1.2, pitch: "+180Hz" },
  sarcastic:       { rate: 0.9, pitch: "+250Hz" },
  storytelling:    { rate: 0.8, pitch: "+0Hz" },
  breathless:      { rate: 1.6, pitch: "+120Hz" },
};

const DEFAULT_PROSODY = { rate: 1.0, pitch: "+0Hz" };

interface Segment {
  text: string;
  condition: string | null;
}

/**
 * Parse compiled script into segments, splitting on [condition] markers.
 * Each condition applies to the text that follows it.
 */
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
      const fieldErrors = parsed.error.flatten().fieldErrors;
      return NextResponse.json(
        { error: "Validation failed", fields: fieldErrors },
        { status: 400 }
      );
    }

    const { script } = parsed.data;
    const segments = parseScript(script);

    // Generate audio for each segment with its prosody and concatenate
    const tts = new MsEdgeTTS();
    const chunks: Buffer[] = [];
    let voiceSet = false;

    for (const segment of segments) {
      if (!segment.text.trim()) continue;

      const prosody = CONDITION_PROSODY[segment.condition ?? ""] ?? DEFAULT_PROSODY;

      if (!voiceSet) {
        await tts.setMetadata("en-US-AvaNeural", OUTPUT_FORMAT.WEBM_24KHZ_16BIT_MONO_OPUS);
        voiceSet = true;
      }

      const { audioStream } = await tts.toStream(
        segment.text,
        { rate: prosody.rate, pitch: prosody.pitch, volume: prosody.volume ?? "+0%" }
      );

      const segmentChunks: Buffer[] = [];
      await new Promise<void>((resolve, reject) => {
        audioStream.on("data", (d: Buffer) => segmentChunks.push(d));
        audioStream.on("close", () => resolve());
        audioStream.on("error", (e: Error) => reject(e));
      });

      chunks.push(Buffer.concat(segmentChunks));
    }

    if (chunks.length === 0) {
      return NextResponse.json({ error: "No audio generated" }, { status: 422 });
    }

    // Concatenate all audio chunks
    const fullAudio = Buffer.concat(chunks);

    return new NextResponse(fullAudio, {
      status: 200,
      headers: {
        "Content-Type": "audio/webm",
        "Content-Disposition": 'inline; filename="voxslides-output.webm"',
      },
    });
  } catch (err) {
    console.error("[tts] Error:", err);
    return NextResponse.json(
      { error: "Speech generation failed" },
      { status: 500 }
    );
  }
}
