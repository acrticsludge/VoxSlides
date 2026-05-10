import { NextRequest, NextResponse } from "next/server";
import { DeepgramClient } from "@deepgram/sdk";
import { z } from "zod";

const RequestSchema = z.object({
  script: z.string().min(1, "Script is required").max(5000, "Script too long"),
});

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

    // Strip condition tags entirely — just send clean text
    // Deepgram Aura is a naturally expressive neural voice.
    // The user's own words + punctuation carry the emotion.
    const cleanText = script.replace(/\[.*?\]\s*/g, "").trim();

    if (!cleanText) {
      return NextResponse.json({ error: "No text to synthesize" }, { status: 422 });
    }

    const deepgramApiKey = process.env.DEEPGRAM_API_KEY;
    if (!deepgramApiKey) {
      return NextResponse.json({ error: "DEEPGRAM_API_KEY not configured" }, { status: 500 });
    }

    const deepgram = new DeepgramClient({ apiKey: deepgramApiKey });
    const result = await deepgram.speak.v1.audio.generate({
      text: cleanText,
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
