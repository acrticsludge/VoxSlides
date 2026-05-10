"use client";

import { X } from "lucide-react";
import { PRESET_CONDITIONS, CONDITION_COLORS } from "@/lib/conditions";
import type { Slot } from "@/types";

interface SlotChipProps {
  slot: Slot;
  onRemove: (id: string) => void;
}

function getColorClasses(slot: Slot): string {
  if (slot.isCustom) {
    return "bg-teal-500/20 text-teal-300 border-teal-500/30";
  }
  const preset = PRESET_CONDITIONS.find((p) => p.value === slot.condition);
  if (!preset) return "bg-teal-500/20 text-teal-300 border-teal-500/30";
  return CONDITION_COLORS[preset.color] ?? "bg-teal-500/20 text-teal-300 border-teal-500/30";
}

export function SlotChip({ slot, onRemove }: SlotChipProps) {
  const preset = slot.isCustom
    ? null
    : PRESET_CONDITIONS.find((p) => p.value === slot.condition);

  return (
    <span
      data-testid="slot-chip"
      className={`
        inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium
        border ${getColorClasses(slot)}
      `}
    >
      {preset?.emoji}
      {slot.condition}
      <button
        data-testid="slot-chip-remove"
        onClick={() => onRemove(slot.id)}
        className="ml-0.5 hover:text-white transition-colors"
      >
        <X className="h-3 w-3" />
      </button>
    </span>
  );
}
