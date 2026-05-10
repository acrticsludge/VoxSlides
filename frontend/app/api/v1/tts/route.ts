import { NextRequest, NextResponse } from "next/server";
import { MsEdgeTTS, OUTPUT_FORMAT } from "msedge-tts";
import { z } from "zod";

const RequestSchema = z.object({
  script: z.string().min(1, "Script is required").max(5000, "Script too long"),
});

// Dramatic prosody mapping — extreme values for clearly noticeable emotion changes
const CONDITION_PROSODY: Record<string, { rate: number; pitch: string; volume: number }> = {
  excited:         { rate: 1.8, pitch: "+300Hz", volume: 100 },
  whisper:         { rate: 0.35, pitch: "-200Hz", volume: 10 },
  "slow and dramatic": { rate: 0.2, pitch: "-150Hz", volume: 100 },
  fast:            { rate: 2.5, pitch: "+150Hz", volume: 100 },
  nervous:         { rate: 1.5, pitch: "+300Hz", volume: 80 },
  crying:          { rate: 0.35, pitch: "-300Hz", volume: 60 },
  angry:           { rate: 1.6, pitch: "-200Hz", volume: 100 },
  calm:            { rate: 0.5, pitch: "-80Hz", volume: 70 },
  laughing:        { rate: 1.4, pitch: "+300Hz", volume: 100 },
  sarcastic:       { rate: 0.7, pitch: "+350Hz", volume: 95 },
  storytelling:    { rate: 0.7, pitch: "+0Hz", volume: 100 },
  breathless:      { rate: 1.8, pitch: "+200Hz", volume: 70 },
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

function escapeXml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}

/** Build SSML for a batch of segments (max 2 per batch — Edge API reliable limit) */
function buildBatchSSML(batch: Segment[], voiceName: string, voiceLang: string): string {
  let body = "";
  for (const seg of batch) {
    const p = CONDITION_PROSODY[seg.condition ?? ""] ?? DEFAULT;
    body += `<prosody rate="${p.rate}" pitch="${p.pitch}" volume="${p.volume}">${escapeXml(seg.text)}</prosody>`;
  }
  return `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xmlns:mstts="https://www.w3.org/2001/mstts" xml:lang="${voiceLang}"><voice name="${voiceName}">${body}</voice></speak>`;
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

    // Batch segments into groups of 2 (Edge API handles 2 prosody elements reliably)
    const voiceName = "en-US-AvaNeural";
    const voiceLang = "en-US";
    const batchSize = 2;
    const audioChunks: Buffer[] = [];

    for (let i = 0; i < segments.length; i += batchSize) {
      const batch = segments.slice(i, i + batchSize);
      const ssml = buildBatchSSML(batch, voiceName, voiceLang);

      const tts = new MsEdgeTTS();
      await tts.setMetadata(voiceName, OUTPUT_FORMAT.AUDIO_24KHZ_96KBITRATE_MONO_MP3);
      const { audioStream } = await tts.rawToStream(ssml);

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
