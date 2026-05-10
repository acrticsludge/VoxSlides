import { Slot } from "@/types";

export function compileScript(text: string, slots: Slot[]): string {
  const sorted = [...slots].sort((a, b) => b.position - a.position);

  let result = text;
  for (const slot of sorted) {
    const tag = `[${slot.condition}] `;
    result = result.slice(0, slot.position) + tag + result.slice(slot.position);
  }

  return "Speaker 1: " + result.replace(/\s+/g, " ").trim();
}
