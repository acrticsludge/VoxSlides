"use client";

import { PRESET_CONDITIONS, CONDITION_COLORS } from "@/lib/conditions";
import type { Slot } from "@/types";

interface SlotChipProps {
  slot: Slot;
  onRemove: (id: string) => void;
}

function getColorClasses(slot: Slot): string {
  if (slot.isCustom) {
    return "bg-primary/10 text-primary border-primary/20";
  }
  const preset = PRESET_CONDITIONS.find((p) => p.value === slot.condition);
  if (!preset) return "bg-primary/10 text-primary border-primary/20";
  return CONDITION_COLORS[preset.color] ?? "bg-primary/10 text-primary border-primary/20";
}

export function SlotChip({ slot, onRemove }: SlotChipProps) {
  const preset = slot.isCustom
    ? null
    : PRESET_CONDITIONS.find((p) => p.value === slot.condition);

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-medium border ${getColorClasses(slot)}`}
    >
      {preset?.emoji}
      <span className="text-[11px]">{slot.condition}</span>
      <button
        onClick={() => onRemove(slot.id)}
        className="flex items-center justify-center w-8 h-8 -mr-1 opacity-70 hover:opacity-100 transition-opacity"
      >
        <span className="material-symbols-outlined text-[14px]">close</span>
      </button>
    </span>
  );
}
