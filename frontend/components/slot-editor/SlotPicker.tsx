"use client";

import { useState } from "react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { PRESET_CONDITIONS } from "@/lib/conditions";

interface SlotPickerProps {
  onSelect: (condition: string, isCustom: boolean) => void;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children?: React.ReactElement;
}

export function SlotPicker({ onSelect, open, onOpenChange, children }: SlotPickerProps) {
  const [custom, setCustom] = useState("");

  const handleCustomAdd = () => {
    const trimmed = custom.trim();
    if (!trimmed) return;
    onSelect(trimmed, true);
    setCustom("");
  };

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger render={children ?? <button>+</button>} />
      <PopoverContent
        className="w-96 p-4 bg-surface-container-lowest border border-outline-variant rounded-lg shadow-[0_8px_30px_rgb(0,0,0,0.12)]"
        align="center"
      >
        <div className="flex justify-between items-center mb-4 border-b border-outline-variant pb-2">
          <h4 className="text-label-mono text-sm font-bold text-primary uppercase tracking-wider">
            Insert Condition
          </h4>
          <button
            onClick={() => onOpenChange(false)}
            className="text-on-surface-variant hover:text-primary transition-colors"
          >
            <span className="material-symbols-outlined text-[16px]">close</span>
          </button>
        </div>

        <div className="space-y-3">
          <div>
            <p className="text-[11px] font-bold text-on-surface uppercase tracking-wider mb-2">
              Presets
            </p>
            <div className="grid grid-cols-2 gap-2">
              {PRESET_CONDITIONS.map((preset) => (
                <button
                  key={preset.value}
                  onClick={() => onSelect(preset.value, false)}
                  className="flex items-center gap-2 px-3 py-2 rounded-md text-sm transition-colors bg-surface border border-outline-variant hover:border-primary text-on-surface text-left font-mono"
                >
                  <span>{preset.emoji}</span>
                  <span>{preset.label}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="border-t border-outline-variant pt-3">
            <p className="text-[11px] font-bold text-on-surface uppercase tracking-wider mb-2">
              Custom
            </p>
            <div className="flex gap-2">
              <input
                placeholder="e.g. robotic, whispery..."
                value={custom}
                onChange={(e) => setCustom(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleCustomAdd();
                }}
                className="h-9 w-full min-w-0 rounded-lg border border-outline-variant bg-transparent px-3 py-1 text-sm transition-colors outline-none placeholder:text-on-surface-variant/40 focus-visible:border-primary text-on-surface"
              />
              <button
                onClick={handleCustomAdd}
                disabled={!custom.trim()}
                className="h-9 px-4 rounded-lg bg-primary text-on-primary text-[11px] font-bold uppercase tracking-wider hover:opacity-90 transition-opacity disabled:opacity-40"
              >
                Add
              </button>
            </div>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
