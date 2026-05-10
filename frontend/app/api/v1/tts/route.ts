import { NextRequest, NextResponse } from "next/server";
import { MsEdgeTTS, OUTPUT_FORMAT } from "msedge-tts";
import { z } from "zod";

const RequestSchema = z.object({
  script: z.string().min(1, "Script is required").max(5000, "Script too long"),
});

// Map condition names to prosody attributes for expressive speech
const CONDITION_PROSODY: Record<string, { rate: string; pitch: string; volume?: string }> = {
  excited:         { rate: "1.5", pitch: "+200Hz" },
  whisper:         { rate: "0.6", pitch: "-150Hz", volume: "20" },
  "slow and dramatic": { rate: "0.3", pitch: "-100Hz" },
  fast:            { rate: "2.0", pitch: "+80Hz" },
  nervous:         { rate: "1.3", pitch: "+180Hz" },
  crying:          { rate: "0.5", pitch: "-250Hz" },
  angry:           { rate: "1.4", pitch: "-150Hz" },
  calm:            { rate: "0.7", pitch: "-50Hz" },
  laughing:        { rate: "1.2", pitch: "+180Hz" },
  sarcastic:       { rate: "0.9", pitch: "+250Hz" },
  storytelling:    { rate: "0.85", pitch: "+0Hz" },
  breathless:      { rate: "1.6", pitch: "+120Hz" },
};

const DEFAULT_PROSODY = { rate: "1.0", pitch: "+0Hz" };

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

/** Escape XML special characters for SSML safety */
function escapeXml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
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

    if (segments.length === 0) {
      return NextResponse.json({ error: "No text to synthesize" }, { status: 422 });
    }

    // Build SSML with per-segment prosody
    const voiceName = "en-US-AvaNeural";
    const voiceLang = "en-US";

    let ssmlBody = "";
    for (const seg of segments) {
      if (!seg.text.trim()) continue;
      const p = CONDITION_PROSODY[seg.condition ?? ""] ?? DEFAULT_PROSODY;
      const vol = p.volume ?? "100";
      ssmlBody += `<prosody rate="${p.rate}" pitch="${p.pitch}" volume="${vol}">${escapeXml(seg.text)}</prosody>`;
    }

    const ssml = `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xmlns:mstts="https://www.w3.org/2001/mstts" xml:lang="${voiceLang}"><voice name="${voiceName}">${ssmlBody}</voice></speak>`;

    const tts = new MsEdgeTTS();
    await tts.setMetadata(voiceName, OUTPUT_FORMAT.AUDIO_24KHZ_96KBITRATE_MONO_MP3);

    const { audioStream } = await tts.rawToStream(ssml);

    // Collect audio data
    const chunks: Buffer[] = [];
    await new Promise<void>((resolve, reject) => {
      audioStream.on("data", (d: Buffer) => chunks.push(d));
      audioStream.on("close", () => resolve());
      audioStream.on("error", (e: Error) => reject(e));
    });

    const fullAudio = Buffer.concat(chunks);

    if (fullAudio.length === 0) {
      return NextResponse.json({ error: "No audio generated" }, { status: 422 });
    }

    return new NextResponse(fullAudio, {
      status: 200,
      headers: {
        "Content-Type": "audio/mpeg",
        "Content-Disposition": 'inline; filename="voxslides-output.mp3"',
      },
    });
  } catch (err) {
    console.error("[tts] Error:", err);
    return NextResponse.json(
      { error: "Speech generation failed. Try again." },
      { status: 500 }
    );
  }
}
