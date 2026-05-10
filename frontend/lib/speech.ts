export interface SpeechSegment {
  text: string;
  condition: string | null;
}

export interface SpeechParams {
  rate: number;
  pitch: number;
  volume: number;
}

const CONDITION_PARAMS: Record<string, SpeechParams> = {
  excited:         { rate: 1.3, pitch: 1.4, volume: 1.0 },
  whisper:         { rate: 0.8, pitch: 0.7, volume: 0.25 },
  "slow and dramatic": { rate: 0.55, pitch: 0.75, volume: 1.0 },
  fast:            { rate: 1.6, pitch: 1.1, volume: 1.0 },
  nervous:         { rate: 1.2, pitch: 1.3, volume: 0.9 },
  crying:          { rate: 0.65, pitch: 0.6, volume: 0.8 },
  angry:           { rate: 1.2, pitch: 0.65, volume: 1.0 },
  calm:            { rate: 0.75, pitch: 0.85, volume: 0.85 },
  laughing:        { rate: 1.15, pitch: 1.2, volume: 1.0 },
  sarcastic:       { rate: 0.9, pitch: 1.35, volume: 1.0 },
  storytelling:    { rate: 0.85, pitch: 1.0, volume: 1.0 },
  breathless:      { rate: 1.4, pitch: 1.15, volume: 0.8 },
};

const DEFAULT_PARAMS: SpeechParams = { rate: 1.0, pitch: 1.0, volume: 1.0 };

/**
 * Parse a compiled script into speech segments.
 * Each [condition] tag sets the tone for the text that follows it.
 * Example: "[excited] Hello! [whisper] Shh!" →
 *   [{ text: " Hello! ", condition: "excited" }, { text: "Shh!", condition: "whisper" }]
 */
export function parseScript(script: string): SpeechSegment[] {
  const regex = /\[([^\]]+)\]\s*/g;
  const segments: SpeechSegment[] = [];
  let lastIndex = 0;
  let currentCondition: string | null = null;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(script)) !== null) {
    // Text before this tag inherits the previous condition
    const before = script.slice(lastIndex, match.index);
    if (before.trim()) {
      segments.push({ text: before.trim(), condition: currentCondition });
    }
    // Update condition for text that follows this tag
    currentCondition = match[1].toLowerCase().trim();
    lastIndex = match.index + match[0].length;
  }

  // Remaining text after last tag
  const remaining = script.slice(lastIndex);
  if (remaining.trim()) {
    segments.push({ text: remaining.trim(), condition: currentCondition });
  }

  return segments;
}

/**
 * Get speech synthesis params for a condition string.
 */
export function getSpeechParams(condition: string | null): SpeechParams {
  if (!condition) return DEFAULT_PARAMS;
  return CONDITION_PARAMS[condition] ?? DEFAULT_PARAMS;
}

/**
 * Pick the best available English voice.
 */
function getPreferredVoice(): SpeechSynthesisVoice | null {
  const voices = window.speechSynthesis.getVoices();
  return (
    voices.find((v) => v.lang.startsWith("en") && v.name.includes("Natural")) ??
    voices.find((v) => v.lang.startsWith("en") && v.name.includes("Neural")) ??
    voices.find((v) => v.lang.startsWith("en") && v.name.includes("Microsoft")) ??
    voices.find((v) => v.lang.startsWith("en")) ??
    null
  );
}

// Pre-load voices (Chrome loads them async)
if (typeof window !== "undefined") {
  window.speechSynthesis.getVoices();
  window.speechSynthesis.onvoiceschanged = () => {
    window.speechSynthesis.getVoices();
  };
}

/**
 * Speak a compiled script with expressive parameters per condition.
 * Returns a cleanup function that cancels any pending speech.
 */
export function speakScript(
  script: string,
  onStart?: () => void,
  onEnd?: () => void
): () => void {
  const segments = parseScript(script);
  let cancelled = false;
  let currentIndex = 0;

  // Pick a good voice once for all utterances
  const preferredVoice = getPreferredVoice();

  function speakNext() {
    if (cancelled) return;

    // Skip empty segments
    while (currentIndex < segments.length && !segments[currentIndex].text.trim()) {
      currentIndex++;
    }

    if (currentIndex >= segments.length) {
      onEnd?.();
      return;
    }

    const segment = segments[currentIndex];
    const params = getSpeechParams(segment.condition);
    const utterance = new SpeechSynthesisUtterance(segment.text);
    utterance.rate = params.rate;
    utterance.pitch = params.pitch;
    utterance.volume = params.volume;
    if (preferredVoice) utterance.voice = preferredVoice;

    utterance.onstart = () => {
      if (currentIndex === 0) onStart?.();
    };

    utterance.onend = () => {
      currentIndex++;
      speakNext();
    };

    utterance.onerror = () => {
      currentIndex++;
      speakNext();
    };

    window.speechSynthesis.speak(utterance);
  }

  // Cancel any current speech and start fresh
  window.speechSynthesis.cancel();
  speakNext();

  return () => {
    cancelled = true;
    window.speechSynthesis.cancel();
  };
}
