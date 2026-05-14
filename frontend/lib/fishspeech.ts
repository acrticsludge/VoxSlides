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
 * Convert a base64 data URL to a data: URI for inline Gradio file input.
 * The `data` field in FileData accepts "data:{mime};name={name};base64,{raw}".
 */
function asDataUri(dataUrl: string): string {
  if (dataUrl.startsWith("data:")) {
    // Already a data URL — ensure it has a name segment
    if (!dataUrl.includes(";name=")) {
      return dataUrl.replace(";base64,", ";name=reference.wav;base64,");
    }
    return dataUrl;
  }
  // Raw base64 — wrap in data URI
  return `data:audio/wav;name=reference.wav;base64,${dataUrl}`;
}

/**
 * Parse SSE stream from the Gradio API and return the final output data.
 */
async function collectSseResult(
  response: Response
): Promise<{ data: unknown[] }> {
  const reader = response.body?.getReader();
  if (!reader) throw new Error("Response body is not readable");

  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });

      // SSE events are separated by double newlines
      const blocks = buffer.split("\n\n");
      // Keep the last incomplete block in the buffer
      buffer = blocks.pop() ?? "";

      for (const block of blocks) {
        const lines = block.split("\n");
        let eventType = "";
        let dataLine = "";

        for (const line of lines) {
          if (line.startsWith("event: ")) {
            eventType = line.slice(7).trim();
          } else if (line.startsWith("data: ")) {
            dataLine = line.slice(6);
          }
        }

        if (eventType === "complete" && dataLine) {
          const parsed = JSON.parse(dataLine);
          const output = parsed?.output;
          if (output?.data) {
            return { data: output.data };
          }
        }
      }
    }
  } finally {
    reader.releaseLock();
  }

  throw new Error("FishSpeech did not return a complete result");
}

/**
 * Call FishSpeech S2 Pro via the Gradio SSE streaming API.
 *
 * Uses the correct endpoint: /gradio_api/call/partial
 * (not /api/partial/ — that path does not exist on this server).
 *
 * Reference audio is sent inline as a data URI in the FileData dict,
 * matching what the Gradio web UI and the working curl example do.
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

  // Build the reference audio as a FileData with inline data URI.
  // This avoids needing the /upload endpoint entirely.
  const refAudioDataUri = asDataUri(referenceAudioBase64);

  const payload = {
    data: [
      text,
      referenceId,
      {
        data: refAudioDataUri,
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

  // Step 1: POST to the streaming API to get an event_id
  const submitRes = await fetch(`${baseUrl}/gradio_api/call/partial`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!submitRes.ok) {
    const errText = await submitRes.text().catch(() => "");
    throw new Error(`FishSpeech submit failed (${submitRes.status}): ${errText}`);
  }

  const submitBody = await submitRes.json();
  const eventId = submitBody.event_id as string | undefined;
  if (!eventId) {
    throw new Error("FishSpeech did not return an event_id");
  }

  // Step 2: Stream the result from the event endpoint
  const resultRes = await fetch(
    `${baseUrl}/gradio_api/call/partial/${eventId}`
  );

  if (!resultRes.ok) {
    const errText = await resultRes.text().catch(() => "");
    throw new Error(
      `FishSpeech result stream failed (${resultRes.status}): ${errText}`
    );
  }

  const { data } = await collectSseResult(resultRes);

  // Step 3: Parse the output
  // Output: [audio_data, error_html]
  const errorHtml = data?.[1] as string | undefined;
  if (
    errorHtml &&
    typeof errorHtml === "string" &&
    errorHtml.trim() &&
    errorHtml !== "<br>" &&
    errorHtml !== "null"
  ) {
    const clean = errorHtml.replace(/<[^>]*>/g, "").trim();
    throw new Error(clean || "FishSpeech inference failed");
  }

  const audioOutput = data?.[0] as Record<string, unknown> | undefined;
  if (!audioOutput) {
    throw new Error("No audio data returned from FishSpeech");
  }

  // Audio output can be:
  //   { url: "http://..." }   — download from URL
  //   { path: "/tmp/..." }    — read from server path
  //   { b64: "base64..." }    — base64 encoded
  if (audioOutput.b64) {
    return { audioBuffer: Buffer.from(audioOutput.b64 as string, "base64") };
  }

  const audioUrl =
    (audioOutput.url as string | undefined) ??
    (audioOutput.path
      ? `${baseUrl}/file=${(audioOutput.path as string).replace(/^\/?/, "")}`
      : null);

  if (audioUrl) {
    const dlRes = await fetch(audioUrl);
    if (!dlRes.ok) {
      throw new Error(`Failed to download generated audio (${dlRes.status})`);
    }
    return { audioBuffer: Buffer.from(await dlRes.arrayBuffer()) };
  }

  throw new Error("Cannot read audio output from FishSpeech response");
}
