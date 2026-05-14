import { Client } from "@gradio/client";

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
  referenceId: "",
  referenceText: "",
  maxNewTokens: 0,
  chunkLength: 300,
  topP: 0.8,
  repetitionPenalty: 1.1,
  temperature: 0.8,
  seed: 0,
  useMemoryCache: "off" as const,
};

/**
 * Collect the final output from a Gradio SSE or newline-delimited JSON stream.
 *
 * The streaming endpoint can return data in two formats:
 *   1. SSE:  event: complete\ndata: {...}\n\n
 *   2. NDJSON: {"type":"complete","output":{"data":[...]}}\n
 *
 * We handle both by reading all lines and looking for a "complete" event.
 */
async function collectSseResult(
  response: Response
): Promise<{ data: unknown[] }> {
  const text = await response.text();
  const lines = text.split(/\r?\n/);

  let currentEventType = "";
  let currentDataLine = "";

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    // Try parsing as a standalone JSON line (NDJSON format)
    if (trimmed.startsWith("{")) {
      try {
        const parsed = JSON.parse(trimmed);
        if (parsed?.type === "complete" && parsed?.output?.data) {
          return { data: parsed.output.data };
        }
        // For SSE-like structures embedded in JSON
        if (parsed?.output?.data) {
          return { data: parsed.output.data };
        }
      } catch {
        // Not JSON — continue to SSE parsing
      }
    }

    // SSE format: "event: <type>" and "data: <json>"
    if (trimmed.startsWith("event: ")) {
      currentEventType = trimmed.slice(7).trim();
    } else if (trimmed.startsWith("data: ")) {
      currentDataLine = trimmed.slice(6);
      if (currentEventType === "complete" && currentDataLine) {
        try {
          const parsed = JSON.parse(currentDataLine);
          const output = parsed?.output;
          if (output?.data) {
            return { data: output.data };
          }
        } catch {
          // malformed JSON, continue
        }
      }
    }
  }

  // Fallback: look for any line containing the output data
  for (const line of lines) {
    try {
      const parsed = JSON.parse(line.trim());
      if (parsed?.output?.data) {
        return { data: parsed.output.data };
      }
    } catch {
      continue;
    }
  }

  // Last resort: check if the raw text is itself a JSON response
  try {
    const parsed = JSON.parse(text.trim());
    const data = parsed?.data ?? parsed?.output?.data;
    if (data) {
      return { data: data as unknown[] };
    }
  } catch {
    // not JSON
  }

  throw new Error(
    `FishSpeech did not return a complete result. Raw response (first 500 chars): ${text.slice(0, 500)}`
  );
}

export function getFishSpeechBaseUrl(): string {
  const url = process.env.FISHSPEECH_BASE_URL;
  if (!url) {
    throw new Error("FISHSPEECH_BASE_URL not configured. Set it in .env.local");
  }
  return url.replace(/\/+$/, "");
}

/**
 * Call FishSpeech S2 Pro.
 *
 * Uses @gradio/client for correct path resolution (api_prefix from server
 * config), but uploads the reference audio explicitly so we can pass a
 * server-side file path — matching the working curl example's approach:
 *
 *   curl POST /gradio_api/call/partial
 *        data: { ..., { path: "/tmp/gradio/abc.wav", meta: {"_type":"gradio.FileData"} } }
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

  // Connect to get the server config (correct root + api_prefix)
  const client = await Client.connect(baseUrl);
  const root = client.config?.root ?? baseUrl;
  const apiPrefix = client.config?.api_prefix ?? "";

  try {
    // Decode base64 to bytes
    const raw = referenceAudioBase64.includes(",")
      ? referenceAudioBase64.split(",", 2)[1]
      : referenceAudioBase64;
    const audioBytes = Uint8Array.from(atob(raw), (c) => c.charCodeAt(0));

    // Step 1: Upload reference audio using the correct URL path
    const uploadUrl = `${root}${apiPrefix}/upload`;
    const formData = new FormData();
    formData.append("files", new Blob([audioBytes], { type: "audio/wav" }), "reference.wav");

    const uploadRes = await fetch(uploadUrl, { method: "POST", body: formData });
    if (!uploadRes.ok) {
      const errText = await uploadRes.text().catch(() => "");
      throw new Error(
        `Audio upload to ${uploadUrl} failed (${uploadRes.status}): ${errText}`
      );
    }
    const uploadBody: string[] = await uploadRes.json();
    const serverPath = uploadBody?.[0];
    if (!serverPath) {
      throw new Error("Audio upload returned empty file list");
    }

    // Step 2: Call the streaming API with the server-side file path
    const callUrl = `${root}${apiPrefix}/call/partial`;
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

    const submitRes = await fetch(callUrl, {
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

    // Step 3: Stream the SSE result
    const resultRes = await fetch(`${callUrl}/${eventId}`);
    if (!resultRes.ok) {
      const errText = await resultRes.text().catch(() => "");
      throw new Error(`FishSpeech result stream failed (${resultRes.status}): ${errText}`);
    }

    const { data } = await collectSseResult(resultRes);

    // Step 4: Parse output
    const errorHtml = data?.[1] as string | undefined;
    if (errorHtml && typeof errorHtml === "string" && errorHtml.trim() && errorHtml !== "<br>" && errorHtml !== "null") {
      const clean = errorHtml.replace(/<[^>]*>/g, "").trim();
      throw new Error(clean || "FishSpeech inference failed");
    }

    const audioOutput = data?.[0] as Record<string, unknown> | undefined;
    if (!audioOutput) throw new Error("No audio data returned from FishSpeech");

    if (audioOutput.b64) {
      return { audioBuffer: Buffer.from(audioOutput.b64 as string, "base64") };
    }

    const audioUrl =
      (audioOutput.url as string | undefined) ??
      (audioOutput.path
        ? `${root}/file=${(audioOutput.path as string).replace(/^\/?/, "")}`
        : null);

    if (audioUrl) {
      const dlRes = await fetch(audioUrl);
      if (!dlRes.ok) throw new Error(`Failed to download generated audio (${dlRes.status})`);
      return { audioBuffer: Buffer.from(await dlRes.arrayBuffer()) };
    }

    throw new Error("Cannot read audio output from FishSpeech response");
  } finally {
    client.close();
  }
}
