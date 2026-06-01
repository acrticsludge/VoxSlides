import type { Slot } from "@/types";
import { PRESET_CONDITIONS } from "@/lib/conditions";

export function compileScript(text: string, slots: Slot[]): string {
  const sorted = [...slots].sort((a, b) => b.position - a.position);

  let result = text;
  for (const slot of sorted) {
    const tag = `[${slot.condition}] `;
    result = result.slice(0, slot.position) + tag + result.slice(slot.position);
  }

  return "Speaker 1: " + result.replace(/\s+/g, " ").trim();
}

export function processTags(
  rawText: string
): { cleanText: string; autoSlots: Omit<Slot, "id">[] } {
  const tagRegex = /\[([^\]]+)\]/g;
  const tags: { raw: string; condition: string; index: number }[] = [];
  let match: RegExpExecArray | null;

  while ((match = tagRegex.exec(rawText)) !== null) {
    tags.push({
      raw: match[0],
      condition: match[1].toLowerCase().trim(),
      index: match.index,
    });
  }

  if (tags.length === 0) return { cleanText: rawText, autoSlots: [] };

  // Build clean text by removing tags, and calculate adjusted positions
  let cleanText = rawText;
  const autoSlots: Omit<Slot, "id">[] = [];
  let removedChars = 0;

  for (const tag of tags) {
    const adjustedPos = tag.index - removedChars;
    autoSlots.push({
      position: adjustedPos,
      condition: tag.condition,
      isCustom: !PRESET_CONDITIONS.some((p) => p.value === tag.condition),
    });
    cleanText = cleanText.slice(0, adjustedPos) + cleanText.slice(adjustedPos + tag.raw.length);
    removedChars += tag.raw.length;
  }

  return { cleanText, autoSlots };
}
