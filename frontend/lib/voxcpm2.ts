import { Client } from "@gradio/client";

export interface SegmentData {
  text: string;
  emotion: string | null;
}

export interface VoxCPM2Params {
  segments: SegmentData[];
  referenceAudioBase64?: string;
  controlInstruction?: string;
  usePromptText?: boolean;
  promptText?: string;
  cfgValue?: number;
  doNormalize?: boolean;
  denoise?: boolean;
}

export interface VoxCPM2Result {
  audioBuffer: Buffer;
}

export const VOXCPM2_DEFAULTS = {
  controlInstruction: "",
  usePromptText: false,
  promptText: "",
  cfgValue: 3,
  doNormalize: false,
  denoise: false,
};

const EMOTION_INSTRUCTIONS: Record<string, string> = {
  excited:
    "Energetic, enthusiastic, fast-paced, high pitch variation, excited tone",
  whisper:
    "Soft whisper, breathy, quiet, intimate, close-mic, secretive tone",
  "slow and dramatic":
    "Very slow, dramatic pauses, deep serious tone, heavy emphasis on each word",
  fast:
    "Rapid, urgent, fast-paced delivery, words flowing quickly without pause",
  nervous:
    "Nervous, hesitant, slight tremor, uncertain tone, small voice, anxious",
  crying:
    "Tearful, trembling voice, breaking with emotion, sad, sniffles, choked up",
  angry:
    "Angry, sharp, forceful, biting each word, rising intensity, frustrated",
  calm:
    "Relaxed, calm, soothing, gentle, unhurried, peaceful tone",
  laughing:
    "Laughing, amused, bright voice, chuckling, joyful, smiling tone",
  sarcastic:
    "Dry, sarcastic, knowing tone, drawn-out words, mocking, sardonic",
  storytelling:
    "Narrator voice, varied pace, building suspense, dramatic, engaging storyteller",
  breathless:
    "Out of breath, panting, winded, urgent, catching breath between words",
};

function getControlInstruction(
  emotion: string | null,
  fallback: string
): string {
  if (!emotion) return fallback;
  return EMOTION_INSTRUCTIONS[emotion] ?? emotion;
}

// ── Emotion markers embedded in text (stronger signal alongside control_instruction) ──

const EMOTION_MARKERS: Record<string, string> = {
  excited: "(excitedly) ",
  whisper: "(whispering) ",
  "slow and dramatic": "(slowly, dramatically) ",
  fast: "(quickly) ",
  nervous: "(nervously) ",
  crying: "(crying) ",
  angry: "(angrily) ",
  calm: "(calmly) ",
  laughing: "(laughing) ",
  sarcastic: "(sarcastically) ",
  storytelling: "(storytelling) ",
  breathless: "(out of breath) ",
};

// ── Build text with emotion marker + control instruction ──

function buildEmotionText(text: string, emotion: string | null): {
  text: string;
  controlInstruction: string;
} {
  if (!emotion) {
    return { text, controlInstruction: getControlInstruction(null, "") };
  }

  const marker = EMOTION_MARKERS[emotion] ?? `(${emotion}) `;
  const controlInstruction = getControlInstruction(emotion, "");

  return {
    text: marker + text,
    controlInstruction,
  };
}

const MAX_CHUNK_CHARS = 150;

function splitIntoChunks(text: string): string[] {
  const chunks: string[] = [];
  let remaining = text;

  while (remaining.length > 0) {
    if (remaining.length <= MAX_CHUNK_CHARS) {
      chunks.push(remaining);
      break;
    }

    let cutAt = -1;

    for (let i = MAX_CHUNK_CHARS; i >= Math.floor(MAX_CHUNK_CHARS * 0.5); i--) {
      if (/[.!?]\s/.test(remaining[i - 1] + remaining[i])) {
        cutAt = i + 1;
        break;
      }
    }
    if (cutAt === -1) {
      for (let i = MAX_CHUNK_CHARS; i >= Math.floor(MAX_CHUNK_CHARS * 0.5); i--) {
        if (/[,;\u2014\u2013]\s?/.test(remaining[i - 1] + remaining[i])) {
          cutAt = i + 1;
          break;
        }
      }
    }
    if (cutAt === -1) {
      for (let i = MAX_CHUNK_CHARS; i >= Math.floor(MAX_CHUNK_CHARS * 0.5); i--) {
        if (remaining[i] === " " || remaining[i] === "\n") {
          cutAt = i + 1;
          break;
        }
      }
    }
    if (cutAt === -1) cutAt = MAX_CHUNK_CHARS;

    chunks.push(remaining.slice(0, cutAt));
    remaining = remaining.slice(cutAt);
  }

  return chunks;
}

// ── WAV utilities ──

function parseWav(buf: Buffer) {
  const channels = buf.readUInt16LE(22);
  const sampleRate = buf.readUInt32LE(24);
  const bitsPerSample = buf.readUInt16LE(34);
  const dataSize = buf.readUInt32LE(40);
  const rawData = buf.subarray(44, 44 + dataSize);
  return { channels, sampleRate, bitsPerSample, rawData };
}

function buildWavHeader(
  dataSize: number,
  channels: number,
  sampleRate: number,
  bitsPerSample: number
): Buffer {
  const header = Buffer.alloc(44);
  const byteRate = sampleRate * channels * (bitsPerSample / 8);
  const blockAlign = channels * (bitsPerSample / 8);

  header.write("RIFF", 0);
  header.writeUInt32LE(36 + dataSize, 4);
  header.write("WAVE", 8);
  header.write("fmt ", 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(channels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(bitsPerSample, 34);
  header.write("data", 36);
  header.writeUInt32LE(dataSize, 40);

  return header;
}

function concatWavBuffers(wavBuffers: Buffer[]): Buffer {
  if (wavBuffers.length === 0) throw new Error("No audio buffers");
  if (wavBuffers.length === 1) return wavBuffers[0];

  try {
    const first = parseWav(wavBuffers[0]);
    const { channels, sampleRate, bitsPerSample } = first;
    const bytesPerSample = bitsPerSample / 8;

    if (sampleRate > 200000 || bitsPerSample > 32 || channels > 8) {
      throw new Error("Invalid WAV params");
    }

    const allRaw: Buffer[] = [];
    const trimMs = 200;

    for (let i = 0; i < wavBuffers.length; i++) {
      const parsed = parseWav(wavBuffers[i]);
      const isLast = i === wavBuffers.length - 1;
      const trimBytes = isLast
        ? 0
        : Math.floor((sampleRate * trimMs) / 1000) * channels * bytesPerSample;
      const end = Math.max(0, parsed.rawData.length - trimBytes);
      allRaw.push(parsed.rawData.subarray(0, end));
    }

    const combinedData = Buffer.concat(allRaw);
    const header = buildWavHeader(
      combinedData.length,
      channels,
      sampleRate,
      bitsPerSample
    );
    return Buffer.concat([header, combinedData]);
  } catch {
    return Buffer.concat(wavBuffers);
  }
}

// ── Main ──

export function getVoxCPM2SpaceId(): string {
  const spaceId = process.env.VOXCPM2_SPACE_ID;
  if (!spaceId) throw new Error("VOXCPM2_SPACE_ID not configured");
  return spaceId;
}

export async function synthesizeSpeech(
  params: VoxCPM2Params
): Promise<VoxCPM2Result> {
  const spaceId = getVoxCPM2SpaceId();
  const {
    segments,
    referenceAudioBase64,
    controlInstruction = VOXCPM2_DEFAULTS.controlInstruction,
    promptText = VOXCPM2_DEFAULTS.promptText,
    cfgValue = VOXCPM2_DEFAULTS.cfgValue,
    doNormalize = VOXCPM2_DEFAULTS.doNormalize,
    denoise = VOXCPM2_DEFAULTS.denoise,
  } = params;

  const client = await Client.connect(spaceId);

  try {
    // Build audio blob from base64 for client.predict (matches official API example)
    let audioBlob: Blob | null = null;
    let finalPromptText = promptText;

    if (referenceAudioBase64) {
      const raw = referenceAudioBase64.includes(",")
        ? referenceAudioBase64.split(",", 2)[1]
        : referenceAudioBase64;
      const audioBytes = Uint8Array.from(atob(raw), (c) => c.charCodeAt(0));
      audioBlob = new Blob([audioBytes], { type: "audio/wav" });

      // Auto-transcribe
      if (!finalPromptText) {
        try {
          const asrResult = await client.predict("/_run_asr_if_needed", {
            checked: true,
            audio_path: audioBlob,
          });
          const asrData = (asrResult.data as unknown[])?.[0] as
            | Record<string, unknown>
            | string;
          finalPromptText =
            typeof asrData === "string"
              ? asrData
              : (asrData?.value as string) ?? "";
          console.log("[voxcpm2] ASR transcript:", finalPromptText);
        } catch (err) {
          console.warn("[voxcpm2] ASR failed:", err);
          finalPromptText = "";
        }
      }
    }

    const hasEmotions = segments.some((s) => s.emotion && s.emotion !== "");
    const hasControlInstruction = !!(controlInstruction || hasEmotions);
    // Ultimate Cloning disables control_instruction — only use when no emotions AND no sidebar instruction
    const useUltimate = !!audioBlob && !!finalPromptText && !hasControlInstruction;

    const workItems: { text: string; controlInstruction: string }[] = [];

    for (const seg of segments) {
      if (!seg.text.trim()) continue;
      // Dual signal: emotion marker embedded in text + control_instruction param
      const { text: emotionText, controlInstruction: ci } = buildEmotionText(
        seg.text,
        seg.emotion
      );
      // Use the user's fallback control instruction if no emotion
      const finalCI = seg.emotion ? ci : controlInstruction;
      const textChunks = splitIntoChunks(emotionText);
      for (const chunk of textChunks) {
        workItems.push({ text: chunk, controlInstruction: finalCI });
      }
    }

    console.log(`[voxcpm2] ${workItems.length} work items from ${segments.length} segment(s)`);
    console.log(`[voxcpm2] Mode: ${useUltimate ? "Ultimate Cloning" : hasEmotions ? "Controllable Cloning (emotion tags)" : hasControlInstruction ? "Controllable Cloning (sidebar instruction)" : "Controllable Cloning (no instruction)"}`);
    workItems.forEach((item, i) => {
      console.log(`  ${i + 1}. text="${item.text.slice(0, 60)}" control="${item.controlInstruction}"`);
    });

    const wavBuffers: Buffer[] = [];

    for (let i = 0; i < workItems.length; i++) {
      const item = workItems[i];
      console.log(`[voxcpm2] Generating ${i + 1}/${workItems.length} control="${item.controlInstruction.slice(0, 30)}"`);

      const genResult = await client.predict("/generate", {
        text_input: item.text,
        control_instruction: item.controlInstruction,
        reference_wav_path_input: audioBlob,
        use_prompt_text: useUltimate,
        prompt_text_input: useUltimate ? finalPromptText : "",
        cfg_value_input: cfgValue,
        do_normalize: doNormalize,
        denoise: denoise,
      });

      const audioOutput = (genResult.data as unknown[])?.[0] as Record<string, unknown>;
      if (!audioOutput) throw new Error(`No audio returned for chunk ${i + 1}`);

      const root = client.config?.root ?? "";
      let buf: Buffer;

      if (audioOutput.b64) {
        buf = Buffer.from(audioOutput.b64 as string, "base64");
      } else {
        const audioUrl =
          (audioOutput.url as string | undefined) ??
          (audioOutput.path
            ? `${root}/file=${(audioOutput.path as string).replace(/^\/?/, "")}`
            : null);
        if (!audioUrl) throw new Error(`Cannot read audio for chunk ${i + 1}`);
        const res = await fetch(audioUrl);
        if (!res.ok) throw new Error(`Failed to download chunk ${i + 1} (${res.status})`);
        buf = Buffer.from(await res.arrayBuffer());
      }

      wavBuffers.push(buf);
    }

    const combined = concatWavBuffers(wavBuffers);
    console.log(`[voxcpm2] Combined ${wavBuffers.length} chunks → ${combined.length} bytes`);
    return { audioBuffer: combined };
  } finally {
    client.close();
  }
}
