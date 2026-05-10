import { NextRequest, NextResponse } from "next/server";
import { DeepgramClient } from "@deepgram/sdk";
import { z } from "zod";

const RequestSchema = z.object({
  script: z.string().min(1, "Script is required").max(5000, "Script too long"),
});

// Fallback cues if Gemini is unavailable
const FALLBACK_CUES: Record<string, { prefix: string; suffix: string; casing: "normal" | "upper" }> = {
  excited:         { prefix: "I can not believe it! ", suffix: " This is amazing!", casing: "normal" },
  whisper:         { prefix: "listen... ",             suffix: "... do not tell anyone...", casing: "normal" },
  "slow and dramatic": { prefix: "nobody... knew... ", suffix: "... it was... too late...", casing: "normal" },
  fast:            { prefix: "",                       suffix: " hurry!", casing: "normal" },
  nervous:         { prefix: "well... I mean... ",     suffix: "... at least I think so...", casing: "normal" },
  crying:          { prefix: "I just... ",             suffix: "... I can not... believe it...", casing: "normal" },
  angry:           { prefix: "",                       suffix: " I have had it!", casing: "upper" },
  calm:            { prefix: "it is okay... ",         suffix: "... everything is fine...", casing: "normal" },
  laughing:        { prefix: "oh my god! ",            suffix: " that is too funny!", casing: "normal" },
  sarcastic:       { prefix: "oh really? ",            suffix: "... yeah right.", casing: "normal" },
  storytelling:    { prefix: "now... ",                suffix: "...", casing: "normal" },
  breathless:      { prefix: "I... I can't... ",       suffix: "... can barely... breathe...", casing: "normal" },
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

/** Call Gemini to add subtle emotional flavor to a sentence */
async function expressWithGemini(
  text: string,
  emotion: string,
  apiKey: string
): Promise<string | null> {
  const prompt = `Add subtle ${emotion} tone to this sentence. Keep it short — add at most a few words. Do not change the meaning. Do not repeat words. Do not add new topics. Return ONLY the enhanced sentence.

Sentence: "${text}"`;

  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0.5,
            maxOutputTokens: 80,
          },
        }),
      }
    );

    if (!res.ok) return null;

    const data = await res.json();
    const rewritten = data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
    if (!rewritten || rewritten.length > text.length * 2) return null;
    return rewritten;
  } catch {
    return null;
  }
}

/** Apply emotional expression to a segment — try Gemini first, fall back to hardcoded cues */
async function expressSegment(
  text: string,
  condition: string | null,
  geminiKey: string | undefined
): Promise<string> {
  if (!condition) return text;

  // Try Gemini
  if (geminiKey) {
    const aiResult = await expressWithGemini(text, condition, geminiKey);
    if (aiResult) return aiResult;
  }

  // Fallback to hardcoded cues
  const cues = FALLBACK_CUES[condition];
  if (!cues) return text;

  let result = text;
  if (cues.casing === "upper") result = result.toUpperCase();
  if (cues.prefix) result = cues.prefix + result;
  if (cues.suffix) result = result + cues.suffix;
  return result;
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

    const geminiKey = process.env.GEMINI_API_KEY;

    // Express each segment with AI-generated emotional phrasing
    const expressed = await Promise.all(
      segments.map((seg) => expressSegment(seg.text, seg.condition, geminiKey))
    );

    let fullText = expressed.filter(Boolean).join(" ").trim();
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
