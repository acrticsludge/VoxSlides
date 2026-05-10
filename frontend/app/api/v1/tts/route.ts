import { NextRequest, NextResponse } from "next/server";
import { DeepgramClient } from "@deepgram/sdk";
import { z } from "zod";

const RequestSchema = z.object({
  script: z.string().min(1, "Script is required").max(5000, "Script too long"),
});

// Modify text subtly — NO extra words, NO prefix/suffix phrases.
// Just change punctuation and casing on the user's existing words.
interface Modifier {
  /** Ensure text ends with this punctuation (add if missing) */
  punctuation?: string;
  /** Transform casing */
  casing?: "upper" | "lower" | "normal";
  /** Wrap text with pauses */
  pauses?: "before" | "after" | "both" | "none";
}

const MODIFIERS: Record<string, Modifier> = {
  excited:         { punctuation: "!", casing: "normal", pauses: "none" },
  whisper:         { punctuation: "...", casing: "normal", pauses: "both" },
  "slow and dramatic": { punctuation: "...", casing: "normal", pauses: "after" },
  fast:            { punctuation: "!", casing: "normal", pauses: "none" },
  nervous:         { punctuation: "...", casing: "normal", pauses: "after" },
  crying:          { punctuation: "...", casing: "normal", pauses: "after" },
  angry:           { punctuation: "!", casing: "upper", pauses: "none" },
  calm:            { punctuation: "...", casing: "lower", pauses: "both" },
  laughing:        { punctuation: "!", casing: "normal", pauses: "none" },
  sarcastic:       { punctuation: ".", casing: "normal", pauses: "none" },
  storytelling:    { punctuation: "...", casing: "normal", pauses: "after" },
  breathless:      { punctuation: "...", casing: "normal", pauses: "after" },
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

/** Apply subtle modifications to text — NO new phrases added */
function modifyText(text: string, condition: string | null): string {
  if (!condition) return text;

  const mod = MODIFIERS[condition];
  if (!mod) return text;

  let result = text;

  // Change casing
  if (mod.casing === "upper") result = result.toUpperCase();
  else if (mod.casing === "lower") result = result.toLowerCase();

  // Ensure punctuation (only add if missing, don't duplicate)
  if (mod.punctuation) {
    const last = result.trim().slice(-1);
    const isPunct = /[.!?…]/.test(last);
    if (!isPunct) {
      result = result.trim() + mod.punctuation;
    } else if (last !== mod.punctuation && mod.punctuation !== ".") {
      // Replace weak punctuation with stronger one
      result = result.trim().slice(0, -1) + mod.punctuation;
    }
  }

  // Add pauses
  if (mod.pauses === "both" || mod.pauses === "before") {
    result = "... " + result.trimStart();
  }
  if (mod.pauses === "both" || mod.pauses === "after") {
    result = result.trimEnd() + " ...";
  }

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

    // Build text by modifying each segment subtly
    let fullText = segments
      .map((seg) => modifyText(seg.text, seg.condition))
      .filter(Boolean)
      .join(" ")
      .trim();

    // Clean up extra spaces around punctuation
    fullText = fullText
      .replace(/\s+\.\.\./g, "...")
      .replace(/\.\.\.\s+/g, "... ")
      .replace(/\s+!/g, "!")
      .replace(/\s+\?/g, "?");

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
