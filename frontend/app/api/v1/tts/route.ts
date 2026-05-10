import { NextRequest, NextResponse } from "next/server";
import { DeepgramClient } from "@deepgram/sdk";
import { z } from "zod";

const RequestSchema = z.object({
  script: z.string().min(1, "Script is required").max(5000, "Script too long"),
});

// Text-level emotional cues — each condition has a UNIQUE speaking pattern
// so Deepgram's neural voice reads them with naturally different delivery
const EMOTION_CUES: Record<string, { prefix: string; suffix: string; casing: "normal" | "upper" }> = {
  excited:         { prefix: "Wow! ",                 suffix: "! Incredible!", casing: "normal" },
  whisper:         { prefix: "... pssst... ",          suffix: "... shhh...",   casing: "normal" },
  "slow and dramatic": { prefix: "... ... ... ",       suffix: "... ...",       casing: "normal" },
  fast:            { prefix: "",                      suffix: "! Right now!",  casing: "normal" },
  nervous:         { prefix: "Uhh... well... ",        suffix: "... I think...", casing: "normal" },
  crying:          { prefix: "sniff... ",              suffix: "... sob...",    casing: "normal" },
  angry:           { prefix: "Grrr! ",                suffix: "! Enough!",     casing: "upper" },
  calm:            { prefix: "Ahh... ",                suffix: "... mmh...",    casing: "normal" },
  laughing:        { prefix: "Ha ha! ",               suffix: "... hee hee!",  casing: "normal" },
  sarcastic:       { prefix: "Ohhh... really? ",      suffix: "... sure.",     casing: "normal" },
  storytelling:    { prefix: "Once upon a time... ",   suffix: "...",           casing: "normal" },
  breathless:      { prefix: "*gasp*... ",            suffix: "... *huff*...", casing: "normal" },
};

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

    // Build naturally expressive text from segments using text-level cues only
    let fullText = "";
    for (const seg of segments) {
      let text = seg.text.trim();
      if (!text) continue;

      const cues = EMOTION_CUES[seg.condition ?? ""];
      if (cues) {
        if (cues.casing === "upper") text = text.toUpperCase();
        if (cues.prefix) text = cues.prefix + text;
        if (cues.suffix && !text.endsWith(cues.suffix)) text = text + cues.suffix;
      }
      fullText += text + " ";
    }

    fullText = fullText.trim();
    if (!fullText) {
      return NextResponse.json({ error: "No text to synthesize" }, { status: 422 });
    }

    const deepgramApiKey = process.env.DEEPGRAM_API_KEY;
    if (!deepgramApiKey) {
      return NextResponse.json({ error: "DEEPGRAM_API_KEY not configured" }, { status: 500 });
    }

    const deepgram = new DeepgramClient({ apiKey: deepgramApiKey });
    const result = await deepgram.speak.v1.audio.generate({
      text: fullText,
      model: "aura-2-thalia-en",
    });

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
