export interface Segment {
  text: string;
  condition: string | null;
}

// Emotion → punctuation & casing modifications (applied at text level)
const MODIFIERS: Record<string, { punct: string; casing: "upper" | "lower" | "normal" }> = {
  excited: { punct: "!", casing: "normal" },
  whisper: { punct: "...", casing: "lower" },
  "slow and dramatic": { punct: "...", casing: "normal" },
  fast: { punct: "!", casing: "normal" },
  nervous: { punct: "...", casing: "normal" },
  crying: { punct: "...", casing: "lower" },
  angry: { punct: "!", casing: "upper" },
  calm: { punct: "...", casing: "lower" },
  laughing: { punct: "!", casing: "normal" },
  sarcastic: { punct: ".", casing: "normal" },
  storytelling: { punct: "...", casing: "normal" },
  breathless: { punct: "...", casing: "lower" },
};

export function parseScript(fullScript: string): Segment[] {
  const regex = /\[([^\]]+)\]\s*/g;
  const segments: Segment[] = [];
  let lastIndex = 0;
  let currentCondition: string | null = null;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(fullScript)) !== null) {
    const before = fullScript.slice(lastIndex, match.index);
    if (before.trim()) {
      segments.push({ text: before.trim(), condition: currentCondition });
    }
    currentCondition = match[1].toLowerCase().trim();
    lastIndex = match.index + match[0].length;
  }

  const remaining = fullScript.slice(lastIndex);
  if (remaining.trim()) {
    segments.push({ text: remaining.trim(), condition: currentCondition });
  }

  return segments;
}

export function applyModifiers(text: string, condition: string | null): string {
  if (!condition) return text;
  const mod = MODIFIERS[condition];
  if (!mod) return text;

  let t = text;
  if (mod.casing === "upper") t = t.toUpperCase();
  else if (mod.casing === "lower") t = t.toLowerCase();

  const last = t.trim().slice(-1);
  if (!/[.!?…]/.test(last)) {
    t = t.trim() + mod.punct;
  } else if (mod.punct === "!" && last === ".") {
    t = t.trim().slice(0, -1) + "!";
  }

  return t;
}

export function buildFullText(segments: Segment[]): string {
  return segments
    .map((seg) => applyModifiers(seg.text, seg.condition))
    .filter(Boolean)
    .join(" ")
    .trim()
    .replace(/\s+\.\.\./g, "...")
    .replace(/\.\.\.\s+/g, "... ");
}
