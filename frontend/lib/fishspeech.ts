import { Client, FileData } from "@gradio/client";

export interface FishSpeechParams {
  /** The text to synthesize */
  text: string;
  /** Base64-encoded reference audio (data URL or raw) */
  referenceAudioBase64: string;
  /** Label for the voice reference */
  referenceId?: string;
  /** Transcription of the reference audio */
  referenceText?: string;
  /** Max tokens per batch (0 = no limit) */
  maxNewTokens?: number;
  /** Iterative prompt length (0 = off) */
  chunkLength?: number;
  /** Nucleus sampling threshold */
  topP?: number;
  /** Repetition penalty */
  repetitionPenalty?: number;
  /** Sampling temperature */
  temperature?: number;
  /** Random seed (0 = random) */
  seed?: number;
  /** Whether to cache model in memory between calls ("on" | "off") */
  useMemoryCache?: "on" | "off";
}

export interface FishSpeechResult {
  /** Generated audio as a Buffer */
  audioBuffer: Buffer;
}

export const FISHSPEECH_DEFAULTS = {
  referenceId: "voxslides_speaker",
  referenceText: "",
  maxNewTokens: 0,
  chunkLength: 300,
  topP: 0.8,
  repetitionPenalty: 1.1,
  temperature: 0.8,
  seed: 0,
  useMemoryCache: "on" as const,
};

/**
 * Get the FishSpeech Gradio server base URL from environment.
 * Throws if not configured.
 */
export function getFishSpeechBaseUrl(): string {
  const url = process.env.FISHSPEECH_BASE_URL;
  if (!url) {
    throw new Error(
      "FISHSPEECH_BASE_URL not configured. Set it in .env.local"
    );
  }
  return url.replace(/\/+$/, "");
}

/**
 * Convert a base64 data URL (e.g. "data:audio/wav;base64,...") into a Blob
 * suitable for upload to the Gradio server.
 */
function base64ToBlob(dataUrl: string): Blob {
  const [header, raw] = dataUrl.includes(",")
    ? dataUrl.split(",", 2)
    : ["audio/wav", dataUrl];

  const mime = header.replace(/^data:/, "").split(";")[0].trim() || "audio/wav";
  const binaryStr = atob(raw);
  const bytes = new Uint8Array(binaryStr.length);
  for (let i = 0; i < binaryStr.length; i++) {
    bytes[i] = binaryStr.charCodeAt(i);
  }
  return new Blob([bytes], { type: mime });
}

/**
 * Call FishSpeech S2 Pro via Gradio `/partial` endpoint.
 *
 * No fallback providers — if FishSpeech fails, the error is thrown and
 * the caller should surface it to the user.
 */
export async function synthesizeSpeech(
  params: FishSpeechParams
): Promise<FishSpeechResult> {
  const baseUrl = getFishSpeechBaseUrl();

  // Convert reference audio to a Blob for Gradio upload
  const audioBlob = base64ToBlob(params.referenceAudioBase64);

  const client = await Client.connect(baseUrl);

  try {
    const result = await client.predict<unknown[]>("/partial", {
      text: params.text,
      reference_id: params.referenceId ?? FISHSPEECH_DEFAULTS.referenceId,
      reference_audio: audioBlob,
      reference_text: params.referenceText ?? FISHSPEECH_DEFAULTS.referenceText,
      max_new_tokens: params.maxNewTokens ?? FISHSPEECH_DEFAULTS.maxNewTokens,
      chunk_length: params.chunkLength ?? FISHSPEECH_DEFAULTS.chunkLength,
      top_p: params.topP ?? FISHSPEECH_DEFAULTS.topP,
      repetition_penalty:
        params.repetitionPenalty ?? FISHSPEECH_DEFAULTS.repetitionPenalty,
      temperature: params.temperature ?? FISHSPEECH_DEFAULTS.temperature,
      seed: params.seed ?? FISHSPEECH_DEFAULTS.seed,
      use_memory_cache: params.useMemoryCache ?? FISHSPEECH_DEFAULTS.useMemoryCache,
    });

    // Fishery returns [audio: FileData, error: string]
    const errorMsg = result.data[1] as string | undefined;
    if (errorMsg && errorMsg.trim() && errorMsg !== "<br>" && errorMsg !== "null") {
      // Strip any HTML tags for a clean message
      const clean = errorMsg.replace(/<[^>]*>/g, "").trim();
      throw new Error(clean || "FishSpeech inference failed");
    }

    const audioFile = result.data[0] as FileData | undefined;
    if (!audioFile) {
      throw new Error("No audio data returned from FishSpeech");
    }

    // Prefer base64-encoded data (most efficient)
    if (audioFile.b64) {
      return { audioBuffer: Buffer.from(audioFile.b64, "base64") };
    }

    // Fallback: download from the server URL
    if (audioFile.url) {
      const response = await fetch(audioFile.url);
      if (!response.ok) {
        throw new Error(
          `Failed to download generated audio (${response.status})`
        );
      }
      return { audioBuffer: Buffer.from(await response.arrayBuffer()) };
    }

    throw new Error("Cannot read audio output from FishSpeech response");
  } finally {
    client.close();
  }
}
