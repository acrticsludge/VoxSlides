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
 * Call FishSpeech S2 Pro via raw Gradio HTTP API.
 *
 * We bypass the @gradio/client because its internal blob-serialization
 * pipeline doesn't reliably pass file references to the server in Node.js.
 * Instead we:
 *   1. Upload the audio file to the Gradio server's /upload endpoint
 *   2. Call the /api/partial/ endpoint directly with the server-side file path
 */
export async function synthesizeSpeech(
  params: FishSpeechParams
): Promise<FishSpeechResult> {
  const baseUrl = getFishSpeechBaseUrl();
  const {
    text,
    referenceAudioBase64,
    referenceId = FISHSPEECH_DEFAULTS.referenceId,
    referenceText = FISHSPEECH_DEFAULTS.referenceText,
    maxNewTokens = FISHSPEECH_DEFAULTS.maxNewTokens,
    chunkLength = FISHSPEECH_DEFAULTS.chunkLength,
    topP = FISHSPEECH_DEFAULTS.topP,
    repetitionPenalty = FISHSPEECH_DEFAULTS.repetitionPenalty,
    temperature = FISHSPEECH_DEFAULTS.temperature,
    seed = FISHSPEECH_DEFAULTS.seed,
    useMemoryCache = FISHSPEECH_DEFAULTS.useMemoryCache,
  } = params;

  // --- Step 1: Decode base64 audio to bytes ---
  const raw = referenceAudioBase64.includes(",")
    ? referenceAudioBase64.split(",", 2)[1]
    : referenceAudioBase64;

  const audioBytes = Uint8Array.from(atob(raw), (c) => c.charCodeAt(0));

  // --- Step 2: Upload reference audio to Gradio server ---
  const formData = new FormData();
  formData.append("files", new Blob([audioBytes], { type: "audio/wav" }), "reference.wav");

  const uploadRes = await fetch(`${baseUrl}/upload`, {
    method: "POST",
    body: formData,
  });

  if (!uploadRes.ok) {
    const errText = await uploadRes.text().catch(() => "");
    throw new Error(`Audio upload failed (${uploadRes.status}): ${errText}`);
  }

  const uploadBody: string[] = await uploadRes.json();
  const serverPath = uploadBody[0];
  if (!serverPath) {
    throw new Error("Audio upload returned empty file list");
  }

  // --- Step 3: Call the Gradio API function ---
  // The /partial endpoint accepts 11 parameters. The reference_audio
  // (index 2) is passed as a FileData dict with the server-side path.
  const payload = {
    data: [
      text,
      referenceId,
      {
        path: serverPath,
        meta: { _type: "gradio.FileData" },
      },
      referenceText,
      maxNewTokens,
      chunkLength,
      topP,
      repetitionPenalty,
      temperature,
      seed,
      useMemoryCache,
    ],
  };

  const apiRes = await fetch(`${baseUrl}/api/partial/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!apiRes.ok) {
    const errText = await apiRes.text().catch(() => "");
    throw new Error(`FishSpeech API error (${apiRes.status}): ${errText}`);
  }

  const apiBody = await apiRes.json();

  // --- Step 4: Parse response ---
  // Response shape: { data: [audio_data, error_html], ... }
  const errorHtml = apiBody.data?.[1];
  if (errorHtml && typeof errorHtml === "string" && errorHtml.trim() && errorHtml !== "<br>" && errorHtml !== "null") {
    const clean = errorHtml.replace(/<[^>]*>/g, "").trim();
    throw new Error(clean || "FishSpeech inference failed");
  }

  const audioOutput = apiBody.data?.[0];
  if (!audioOutput) {
    throw new Error("No audio data returned from FishSpeech");
  }

  // Audio output can be:
  //   { url: "http://..." }   — download from URL
  //   { path: "/tmp/..." }    — read from server path (download via /file=...)
  //   { b64: "base64..." }    — base64 encoded
  //   [sample_rate, floats]   — raw audio array (unlikely via /api endpoint)

  if (audioOutput.b64) {
    return { audioBuffer: Buffer.from(audioOutput.b64, "base64") };
  }

  const audioUrl = audioOutput.url ?? (audioOutput.path ? `${baseUrl}/file=${audioOutput.path}` : null);
  if (audioUrl) {
    const dlRes = await fetch(audioUrl);
    if (!dlRes.ok) {
      throw new Error(`Failed to download generated audio (${dlRes.status})`);
    }
    return { audioBuffer: Buffer.from(await dlRes.arrayBuffer()) };
  }

  throw new Error("Cannot read audio output from FishSpeech response");
}
