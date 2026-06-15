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
  cfgValue: 2,
  doNormalize: false,
  denoise: false,
};

// ── Emotion → natural control instruction ──

const EMOTION_INSTRUCTIONS: Record<string, string> = {
  excited:
    "Speak with high energy and enthusiasm, slightly faster pace, higher pitch variation, like sharing exciting news",
  whisper:
    "Speak in a soft whisper, very quiet and breathy, intimate and secretive tone, close to the microphone",
  "slow and dramatic":
    "Speak very slowly with dramatic pauses, deep serious tone, each word weighted with significance, like narrating a pivotal moment",
  fast:
    "Speak quickly and urgently, rapid-fire delivery, words flowing one into the next without pause",
  nervous:
    "Speak with a slight tremor in the voice, hesitant and uncertain, occasional stumbles, like speaking under pressure",
  crying:
    "Speak with a trembling, tearful voice, voice breaking with emotion, sniffles between phrases, deeply sad",
  angry:
    "Speak with controlled fury, sharp and forceful delivery, each word bitten off, jaw tight, rising intensity",
  calm:
    "Speak in a relaxed, soothing tone, gentle and unhurried, like talking to a friend on a quiet evening",
  laughing:
    "Speak with laughter woven into the words, voice bright and amused, chuckling between phrases, infectious joy",
  sarcastic:
    "Speak with a dry, knowing tone, drawl on key words, subtle eye-roll in the voice, thinly veiled mockery",
  storytelling:
    "Speak as a captivating storyteller, varied pace and tone, building suspense, painting vivid scenes with your voice",
  breathless:
    "Speak as if out of breath, panting slightly between words, urgent and winded, like you just ran up stairs",
};

function getControlInstruction(
  emotion: string | null,
  fallback: string
): string {
  if (!emotion) return fallback;
  const mapped = EMOTION_INSTRUCTIONS[emotion];
  if (mapped) return mapped;
  // Custom emotion: use it as-is
  return emotion;
}

// ── Text chunking ──

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

// ── Gradio helpers ──

async function uploadAudio(
  client: Client,
  audioBase64: string
): Promise<string> {
  const root = client.config?.root ?? "";
  const apiPrefix = client.config?.api_prefix ?? "";
  const raw = audioBase64.includes(",")
    ? audioBase64.split(",", 2)[1]
    : audioBase64;
  const audioBytes = Uint8Array.from(atob(raw), (c) => c.charCodeAt(0));

  const formData = new FormData();
  formData.append(
    "files",
    new Blob([audioBytes], { type: "audio/wav" }),
    "reference.wav"
  );

  const res = await fetch(`${root}${apiPrefix}/upload`, {
    method: "POST",
    body: formData,
  });
  if (!res.ok) throw new Error(`Audio upload failed (${res.status})`);

  const paths: string[] = await res.json();
  if (!paths?.[0]) throw new Error("Audio upload returned empty file list");
  return paths[0];
}

async function downloadAudio(
  client: Client,
  audioOutput: Record<string, unknown>
): Promise<Buffer> {
  const root = client.config?.root ?? "";

  if (audioOutput.b64) {
    return Buffer.from(audioOutput.b64 as string, "base64");
  }

  const audioUrl =
    (audioOutput.url as string | undefined) ??
    (audioOutput.path
      ? `${root}/file=${(audioOutput.path as string).replace(/^\/?/, "")}`
      : null);

  if (audioUrl) {
    const res = await fetch(audioUrl);
    if (!res.ok) throw new Error(`Failed to download audio (${res.status})`);
    return Buffer.from(await res.arrayBuffer());
  }

  throw new Error("Cannot read audio output");
}

async function generateOne(
  client: Client,
  text: string,
  controlInstruction: string,
  audioRef: { path: string; meta: { _type: string } } | null,
  useUltimate: boolean,
  finalPromptText: string,
  cfgValue: number,
  doNormalize: boolean,
  denoise: boolean
): Promise<Buffer> {
  const genResult = await client.predict("/generate", {
    text_input: text,
    control_instruction: controlInstruction,
    reference_wav_path_input: audioRef,
    use_prompt_text: useUltimate,
    prompt_text_input: finalPromptText,
    cfg_value_input: cfgValue,
    do_normalize: doNormalize,
    denoise: denoise,
  });

  const audioOutput = (genResult.data as unknown[])?.[0] as Record<
    string,
    unknown
  >;
  if (!audioOutput) throw new Error("No audio returned from VoxCPM2");

  return downloadAudio(client, audioOutput);
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
    // Upload reference audio
    let audioRef: {
      path: string;
      meta: { _type: string };
    } | null = null;
    let finalPromptText = promptText;

    if (referenceAudioBase64) {
      const serverPath = await uploadAudio(client, referenceAudioBase64);
      audioRef = { path: serverPath, meta: { _type: "gradio.FileData" } };

      if (!finalPromptText) {
        try {
          const asrResult = await client.predict("/_run_asr_if_needed", {
            checked: true,
            audio_path: audioRef,
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

    // Check if any segment has an emotion tag
    const hasEmotions = segments.some((s) => s.emotion && s.emotion !== "");

    // Ultimate Cloning disables control_instruction — only use when no emotions
    const useUltimate = !!audioRef && !!finalPromptText && !hasEmotions;

    // Build work items: each segment → chunked text items with emotion
    const workItems: { text: string; controlInstruction: string }[] = [];

    for (const seg of segments) {
      if (!seg.text.trim()) continue;
      const emotionInstruction = getControlInstruction(
        seg.emotion,
        controlInstruction
      );
      const textChunks = splitIntoChunks(seg.text);
      for (const chunk of textChunks) {
        workItems.push({ text: chunk, controlInstruction: emotionInstruction });
      }
    }

    console.log(
      `[voxcpm2] ${workItems.length} work items from ${segments.length} segment(s)`
    );
    console.log(
      `[voxcpm2] Mode: ${useUltimate ? "Ultimate Cloning (no emotions)" : hasEmotions ? "Controllable Cloning (emotions active)" : "Voice Design (no reference audio)"}`
    );

    const wavBuffers: Buffer[] = [];

    for (let i = 0; i < workItems.length; i++) {
      const item = workItems[i];
      console.log(
        `[voxcpm2] Generating ${i + 1}/${workItems.length} (${item.text.length} chars, emotion: "${item.controlInstruction.slice(0, 40)}...")`
      );

      const buf = await generateOne(
        client,
        item.text,
        item.controlInstruction,
        audioRef,
        useUltimate,
        finalPromptText,
        cfgValue,
        doNormalize,
        denoise
      );
      wavBuffers.push(buf);
    }

    const combined = concatWavBuffers(wavBuffers);
    console.log(
      `[voxcpm2] Combined ${wavBuffers.length} chunks → ${combined.length} bytes`
    );
    return { audioBuffer: combined };
  } finally {
    client.close();
  }
}
