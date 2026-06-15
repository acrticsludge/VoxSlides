import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { applyModifiers } from "@/lib/script-utils";
import {
  synthesizeSpeech,
  getVoxCPM2SpaceId,
  VoxCPM2Params,
} from "@/lib/voxcpm2";

const SegmentSchema = z.object({
  text: z.string(),
  emotion: z.string().nullable(),
});

const RequestSchema = z.object({
  segments: z.array(SegmentSchema).min(1),
  speakerAudio: z.string().optional(),
  controlInstruction: z.string().optional(),
  cfgValue: z.number().min(0).max(10).optional(),
  doNormalize: z.boolean().optional(),
  denoise: z.boolean().optional(),
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

    const { segments: rawSegments, speakerAudio, ...overrides } = parsed.data;

    try {
      getVoxCPM2SpaceId();
    } catch {
      return NextResponse.json(
        { error: "VoxCPM2 not configured. Set VOXCPM2_SPACE_ID in .env.local" },
        { status: 500 }
      );
    }

    // Build per-segment data with emotion-mapped control instructions
    const segmentData = rawSegments
      .filter((s) => s.text.trim())
      .map((seg) => ({
        text: applyModifiers(seg.text.trim(), seg.emotion),
        emotion: seg.emotion,
      }))
      .filter((s) => s.text.trim());

    if (segmentData.length === 0) {
      return NextResponse.json({ error: "No text to synthesize" }, { status: 422 });
    }

    console.log("[voxcpm2-route] Segments:");
    segmentData.forEach((s, i) => {
      console.log(`  ${i + 1}. text="${s.text.slice(0, 60)}" emotion=${s.emotion}`);
    });

    const voxParams: VoxCPM2Params = {
      segments: segmentData,
      referenceAudioBase64: speakerAudio ?? undefined,
      controlInstruction: overrides.controlInstruction,
      cfgValue: overrides.cfgValue,
      doNormalize: overrides.doNormalize,
      denoise: overrides.denoise,
    };

    const { audioBuffer } = await synthesizeSpeech(voxParams);

    return new NextResponse(new Uint8Array(audioBuffer), {
      status: 200,
      headers: {
        "Content-Type": "audio/wav",
        "Content-Disposition": 'inline; filename="voxslides-voxcpm2.wav"',
      },
    });
  } catch (err) {
    console.error("[voxcpm2] Error:", err);
    return NextResponse.json(
      { error: "Speech generation failed" },
      { status: 500 }
    );
  }
}
