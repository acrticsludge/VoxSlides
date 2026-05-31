import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  parseScript,
  buildFullText,
} from "@/lib/script-utils";
import {
  synthesizeSpeech,
  getFishSpeechBaseUrl,
  FishSpeechParams,
} from "@/lib/fishspeech";

const RequestSchema = z.object({
  script: z.string().min(1, "Script is required").max(5000, "Script too long"),
  speakerAudio: z.string().min(1, "Voice sample is required"),

  // Optional FishSpeech inference overrides
  referenceId: z.string().optional(),
  referenceText: z.string().optional(),
  maxNewTokens: z.number().int().min(0).optional(),
  chunkLength: z.number().int().min(0).optional(),
  topP: z.number().min(0).max(1).optional(),
  repetitionPenalty: z.number().min(0.1).max(10).optional(),
  temperature: z.number().min(0).max(2).optional(),
  seed: z.number().int().optional(),
  useMemoryCache: z.enum(["on", "off"]).optional(),
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

    const { script, speakerAudio, ...overrides } = parsed.data;

    // Verify FishSpeech is configured
    try {
      getFishSpeechBaseUrl();
    } catch {
      return NextResponse.json(
        { error: "FishSpeech S2 Pro not configured. Set FISHSPEECH_BASE_URL in .env.local" },
        { status: 500 }
      );
    }

    // Parse emotion tags and apply text-level modifiers
    const segments = parseScript(script);

    if (segments.length === 0) {
      return NextResponse.json({ error: "No text to synthesize" }, { status: 422 });
    }

    const fullText = buildFullText(segments);

    if (!fullText) {
      return NextResponse.json({ error: "No text to synthesize" }, { status: 422 });
    }

    // Build FishSpeech params
    const fishParams: FishSpeechParams = {
      text: fullText,
      referenceAudioBase64: speakerAudio,
      referenceId: overrides.referenceId,
      referenceText: overrides.referenceText,
      maxNewTokens: overrides.maxNewTokens,
      chunkLength: overrides.chunkLength,
      topP: overrides.topP,
      repetitionPenalty: overrides.repetitionPenalty,
      temperature: overrides.temperature,
      seed: overrides.seed,
      useMemoryCache: overrides.useMemoryCache,
    };

    // Call FishSpeech — no fallback. If it fails, the user sees the error.
    const { audioBuffer } = await synthesizeSpeech(fishParams);

    return new NextResponse(new Uint8Array(audioBuffer), {
      status: 200,
      headers: {
        "Content-Type": "audio/wav",
        "Content-Disposition": 'inline; filename="voxslides-fishspeech.wav"',
      },
    });
  } catch (err) {
    console.error("[fishspeech] Error:", err);
    // Never leak internal error messages to the client
    return NextResponse.json(
      { error: "Speech generation failed" },
      { status: 500 }
    );
  }
}
