import { NextRequest, NextResponse } from "next/server";
import { MsEdgeTTS, OUTPUT_FORMAT } from "msedge-tts";
import { z } from "zod";

const RequestSchema = z.object({
  script: z.string().min(1, "Script is required").max(5000, "Script too long"),
});

// SSML prosody values per emotion condition
const CONDITION_PROSODY: Record<string, { rate: string; pitch: string; volume: number }> = {
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

const DEFAULT = { rate: "1.0", pitch: "+0Hz", volume: 100 };

interface Segment {
  text: string;
  condition: string | null;
}

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
    const p = CONDITION_PROSODY[seg.condition ?? ""] ?? DEFAULT;
    const text = escapeXml(seg.text);
    return `<prosody rate="${p.rate}" pitch="${p.pitch}" volume="${p.volume}">${text}</prosody>`;
  });

  return `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="en-US">
  <voice name="en-US-AvaNeural">
    ${parts.join("\n    ")}
  </voice>
</speak>`;
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

    // Build a single SSML document with all segments
    const ssml = buildSsml(segments);

    // Synthesize in one request
    const tts = new MsEdgeTTS();
    await tts.setMetadata("en-US-AvaNeural", OUTPUT_FORMAT.AUDIO_24KHZ_96KBITRATE_MONO_MP3);

    const { audioStream } = await tts.toStream(ssml);

    const chunks: Buffer[] = [];
    await new Promise<void>((resolve, reject) => {
      audioStream.on("data", (d: Buffer) => chunks.push(d));
      audioStream.on("close", () => resolve());
      audioStream.on("error", (e: Error) => reject(e));
    });

    if (chunks.length === 0) {
      return NextResponse.json({ error: "No audio generated" }, { status: 422 });
    }

    const fullAudio = Buffer.concat(chunks);

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
