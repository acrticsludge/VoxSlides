import { NextRequest, NextResponse } from "next/server";

/**
 * Diagnostic: test VoxCPM2 control_instruction directly via raw HTTP.
 * GET /api/v1/tts/voxcpm2/debug
 */
export async function GET(req: NextRequest) {
  const spaceId = process.env.VOXCPM2_SPACE_ID ?? "openbmb/VoxCPM-Demo";
  const logs: string[] = [];

  const log = (msg: string) => {
    logs.push(msg);
    console.log("[voxcpm2-debug]", msg);
  };

  try {
    // Step 1: Connect to get root URL
    log(`Connecting to ${spaceId}...`);
    const rootUrl = `https://${spaceId.replace("/", "-").toLowerCase()}.hf.space`;
    log(`Root URL: ${rootUrl}`);

    // Step 2: Upload a tiny test WAV (1 second of silence at 16kHz mono)
    const sampleRate = 16000;
    const durationSec = 1;
    const numSamples = sampleRate * durationSec;
    const dataSize = numSamples * 2; // 16-bit = 2 bytes per sample
    const wavBuffer = Buffer.alloc(44 + dataSize);
    wavBuffer.write("RIFF", 0);
    wavBuffer.writeUInt32LE(36 + dataSize, 4);
    wavBuffer.write("WAVE", 8);
    wavBuffer.write("fmt ", 12);
    wavBuffer.writeUInt32LE(16, 16);
    wavBuffer.writeUInt16LE(1, 20); // PCM
    wavBuffer.writeUInt16LE(1, 22); // mono
    wavBuffer.writeUInt32LE(sampleRate, 24);
    wavBuffer.writeUInt32LE(sampleRate * 2, 28); // byte rate
    wavBuffer.writeUInt16LE(2, 32); // block align
    wavBuffer.writeUInt16LE(16, 34); // bits per sample
    wavBuffer.write("data", 36);
    wavBuffer.writeUInt32LE(dataSize, 40);
    // Fill with silence (zeros) - that's fine for testing

    log(`Uploading test WAV (${wavBuffer.length} bytes)...`);
    const formData = new FormData();
    formData.append(
      "files",
      new Blob([wavBuffer], { type: "audio/wav" }),
      "test.wav"
    );

    const uploadRes = await fetch(`${rootUrl}/upload`, {
      method: "POST",
      body: formData,
    });
    log(`Upload status: ${uploadRes.status}`);
    const uploadBody: string[] = await uploadRes.json();
    const serverPath = uploadBody[0];
    log(`Server path: ${serverPath}`);

    const audioRef = { path: serverPath, meta: { _type: "gradio.FileData" } };

    // Step 3: Call generate WITHOUT control_instruction (baseline)
    log("\n--- Test 1: NO control_instruction ---");
    const payload1 = {
      data: [
        "Hello world, this is a test.",
        "",                        // control_instruction: empty
        audioRef,                  // reference audio
        false,                     // use_prompt_text
        "",                        // prompt_text_input
        2,                         // cfg_value_input
        false,                     // do_normalize
        false,                     // denoise
      ],
    };
    log(`Payload: ${JSON.stringify(payload1.data.slice(0, 3))}...`);

    const res1 = await fetch(`${rootUrl}/call/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload1),
    });
    log(`Call status: ${res1.status}`);
    if (!res1.ok) {
      log(`Error: ${await res1.text()}`);
    } else {
      const body1 = await res1.json();
      log(`Event ID 1: ${body1.event_id}`);
      const stream1 = await fetch(`${rootUrl}/call/generate/${body1.event_id}`);
      const text1 = await stream1.text();
      log(`Response length: ${text1.length}`);
      // Find audio size in response
      const match1 = text1.match(/"path"\s*:\s*"([^"]+)"/);
      log(`Audio path: ${match1?.[1] ?? "not found"}`);
    }

    // Step 4: Call generate WITH control_instruction
    log("\n--- Test 2: WITH control_instruction (excited) ---");
    const payload2 = {
      data: [
        "Hello world, this is a test.",
        "Energetic, enthusiastic, fast-paced, high pitch variation, excited tone",
        audioRef,
        false,
        "",
        2,
        false,
        false,
      ],
    };

    const res2 = await fetch(`${rootUrl}/call/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload2),
    });
    log(`Call status: ${res2.status}`);
    if (!res2.ok) {
      log(`Error: ${await res2.text()}`);
    } else {
      const body2 = await res2.json();
      log(`Event ID 2: ${body2.event_id}`);
      const stream2 = await fetch(`${rootUrl}/call/generate/${body2.event_id}`);
      const text2 = await stream2.text();
      log(`Response length: ${text2.length}`);
      const match2 = text2.match(/"path"\s*:\s*"([^"]+)"/);
      log(`Audio path: ${match2?.[1] ?? "not found"}`);
    }

    // Step 5: Call generate with control_instruction + HIGHER CFG
    log("\n--- Test 3: WITH control_instruction (whisper) + CFG 7 ---");
    const payload3 = {
      data: [
        "Hello world, this is a test.",
        "Soft whisper, breathy, quiet, intimate, close-mic",
        audioRef,
        false,
        "",
        7,
        false,
        false,
      ],
    };

    const res3 = await fetch(`${rootUrl}/call/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload3),
    });
    log(`Call status: ${res3.status}`);
    if (!res3.ok) {
      log(`Error: ${await res3.text()}`);
    } else {
      const body3 = await res3.json();
      log(`Event ID 3: ${body3.event_id}`);
      const stream3 = await fetch(`${rootUrl}/call/generate/${body3.event_id}`);
      const text3 = await stream3.text();
      log(`Response length: ${text3.length}`);
      const match3 = text3.match(/"path"\s*:\s*"([^"]+)"/);
      log(`Audio path: ${match3?.[1] ?? "not found"}`);
    }

    return NextResponse.json({ logs, success: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    log(`FATAL: ${msg}`);
    return NextResponse.json({ logs, error: msg }, { status: 500 });
  }
}
