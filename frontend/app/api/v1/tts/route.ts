import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

const RequestSchema = z.object({
  script: z.string().min(1, "Script is required").max(5000, "Script too long"),
});

const ELEVENLABS_VOICE_ID = "21m00Tcm4TlvDq8ikWAM"; // Rachel
const ELEVENLABS_MODEL_ID = "eleven_multilingual_v2";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const parsed = RequestSchema.safeParse(body);

    if (!parsed.success) {
      const fieldErrors = parsed.error.flatten().fieldErrors;
      return NextResponse.json(
        {
          error: "Validation failed",
          fields: fieldErrors,
        },
        { status: 400 }
      );
    }

    const { script } = parsed.data;

    const apiKey = process.env.ELEVENLABS_API_KEY;
    if (!apiKey) {
      console.error("[tts] ELEVENLABS_API_KEY not configured");
      return NextResponse.json(
        { error: "TTS service not configured" },
        { status: 500 }
      );
    }

    // Strip condition tags like [excited], [whisper] etc. for clean TTS
    const cleanText = script.replace(/\[.*?\]\s*/g, "").trim();

    const res = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${ELEVENLABS_VOICE_ID}`,
      {
        method: "POST",
        headers: {
          "xi-api-key": apiKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          text: cleanText,
          model_id: ELEVENLABS_MODEL_ID,
          voice_settings: {
            stability: 0.5,
            similarity_boost: 0.75,
          },
        }),
      }
    );

    if (res.status === 401) {
      return NextResponse.json(
        { error: "Invalid ElevenLabs API key" },
        { status: 500 }
      );
    }

    if (res.status === 429) {
      return NextResponse.json(
        { error: "Rate limit hit. Wait a moment and try again." },
        { status: 429 }
      );
    }

    if (!res.ok) {
      const errText = await res.text().catch(() => "Unknown error");
      console.error(`[tts] ElevenLabs error ${res.status}:`, errText);
      return NextResponse.json(
        { error: "Speech generation failed" },
        { status: res.status }
      );
    }

    const audioBuffer = await res.arrayBuffer();
    return new NextResponse(audioBuffer, {
      status: 200,
      headers: {
        "Content-Type": "audio/mpeg",
        "Content-Disposition": 'inline; filename="voxslides-output.mp3"',
      },
    });
  } catch (err) {
    console.error("[tts] Unexpected error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
