import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { parseScript, applyModifiers } from "@/lib/script-utils";
import {
  synthesizeSpeech,
  getVoxCPM2SpaceId,
  VoxCPM2Params,
} from "@/lib/voxcpm2";

const RequestSchema = z.object({
  script: z.string().min(1, "Script is required").max(5000, "Script too long"),
  speakerAudio: z.string().optional(),
  controlInstruction: z.string().optional(),
  usePromptText: z.boolean().optional(),
  promptText: z.string().optional(),
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

    const { script, speakerAudio, ...overrides } = parsed.data;

    try {
      getVoxCPM2SpaceId();
    } catch {
      return NextResponse.json(
        { error: "VoxCPM2 not configured. Set VOXCPM2_SPACE_ID in .env.local" },
        { status: 500 }
      );
    }

    const segments = parseScript(script);
    if (segments.length === 0) {
      return NextResponse.json({ error: "No text to synthesize" }, { status: 422 });
    }

    // Build per-segment data with emotion-mapped control instructions
    let segmentData = segments
      .filter((s) => s.text.trim())
      .map((seg) => ({
        text: applyModifiers(seg.text.trim(), seg.condition),
        emotion: seg.condition,
      }))
      .filter((s) => s.text.trim());

    // Fix mid-word splits: if segment starts with lowercase (e.g. "ut this"),
    // the previous segment ended mid-word — move the fragment back
    for (let i = segmentData.length - 1; i > 0; i--) {
      const firstChar = segmentData[i].text[0];
      if (firstChar && firstChar === firstChar.toLowerCase() && firstChar !== firstChar.toUpperCase()) {
        // Starts with lowercase → mid-word split, prepend to previous segment
        segmentData[i - 1].text += segmentData[i].text;
        segmentData.splice(i, 1);
      }
    }

    if (segmentData.length === 0) {
      return NextResponse.json({ error: "No text to synthesize" }, { status: 422 });
    }

    console.log("[voxcpm2-route] Parsed segments:");
    segmentData.forEach((s, i) => {
      console.log(`  ${i + 1}. text="${s.text.slice(0, 60)}" emotion=${s.emotion}`);
    });

    const voxParams: VoxCPM2Params = {
      segments: segmentData,
      referenceAudioBase64: speakerAudio ?? undefined,
      controlInstruction: overrides.controlInstruction,
      usePromptText: overrides.usePromptText,
      promptText: overrides.promptText,
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
