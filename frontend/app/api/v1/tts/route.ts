import { NextRequest, NextResponse } from "next/server";

const MODEL_URL =
  "https://api-inference.huggingface.co/models/microsoft/VibeVoice-1.5B";
const MAX_ATTEMPTS = 10;
const POLL_INTERVAL = 3000;

export async function POST(req: NextRequest) {
  const { script } = await req.json();

  if (!script?.trim()) {
    return NextResponse.json({ error: "Script is required" }, { status: 400 });
  }

  const HF_TOKEN = process.env.HF_TOKEN;
  if (!HF_TOKEN) {
    return NextResponse.json(
      { error: "HF_TOKEN not configured" },
      { status: 500 }
    );
  }

  let attempts = 0;

  while (attempts < MAX_ATTEMPTS) {
    const res = await fetch(MODEL_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${HF_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ inputs: script }),
    });

    if (res.status === 503) {
      attempts++;
      await new Promise((r) => setTimeout(r, POLL_INTERVAL));
      continue;
    }

    if (res.status === 429) {
      return NextResponse.json(
        { error: "HF rate limit hit. Wait a moment and try again." },
        { status: 429 }
      );
    }

    if (!res.ok) {
      const err = await res.text();
      return NextResponse.json({ error: err }, { status: res.status });
    }

    const audioBuffer = await res.arrayBuffer();
    return new NextResponse(audioBuffer, {
      status: 200,
      headers: {
        "Content-Type": "audio/wav",
        "Content-Disposition": 'inline; filename="voxeslides-output.wav"',
      },
    });
  }

  return NextResponse.json(
    { error: "Model still warming up. Try again in 30 seconds." },
    { status: 503 }
  );
}
