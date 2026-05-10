"use client";

import { useState } from "react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus } from "lucide-react";
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
      <PopoverTrigger
        render={
          children ?? (
            <Button
              data-testid="add-slot-btn"
              variant="outline"
              size="icon"
              className="h-8 w-8 rounded-full border-dashed"
            >
              <Plus className="h-4 w-4" />
            </Button>
          )
        }
      />
      <PopoverContent className="w-72 p-3 backdrop-blur-xl bg-background/80" align="start">
        <div className="space-y-3">
          <div>
            <p className="text-sm font-medium mb-2 text-muted-foreground">
              Presets
            </p>
            <div className="grid grid-cols-2 gap-1.5">
              {PRESET_CONDITIONS.map((preset) => (
                <button
                  key={preset.value}
                  onClick={() => onSelect(preset.value, false)}
                  className="flex items-center gap-2 px-2.5 py-2 rounded-md text-xs transition-colors hover:bg-white/5 text-left border border-border/50"
                >
                  <span>{preset.emoji}</span>
                  <span>{preset.label}</span>
                </button>
              ))}
            </div>
          </div>
          <div className="border-t border-border pt-3">
            <p className="text-sm font-medium mb-2 text-muted-foreground">
              Custom
            </p>
            <div className="flex gap-2">
              <Input
                placeholder="e.g. robotic, whispery..."
                value={custom}
                onChange={(e) => setCustom(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleCustomAdd();
                }}
                className="h-8 text-xs"
              />
              <Button
                size="sm"
                variant="secondary"
                onClick={handleCustomAdd}
                disabled={!custom.trim()}
                className="h-8 text-xs"
              >
                Add
              </Button>
            </div>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
