"use client";

import { useRef, useState, useCallback } from "react";
import type { Slot } from "@/types";
import { PRESET_CONDITIONS } from "@/lib/conditions";
import { SlotChip } from "./SlotChip";
import { SlotPicker } from "./SlotPicker";
import { compileScript } from "./compileScript";

interface SlotEditorProps {
  text: string;
  slots: Slot[];
  compiledScript: string;
  onTextChange: (text: string) => void;
  onSlotsChange: (slots: Slot[]) => void;
  onCompiledChange: (compiled: string) => void;
}

export function SlotEditor({
  text,
  slots,
  onTextChange,
  onSlotsChange,
  onCompiledChange,
}: SlotEditorProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [cursorPos, setCursorPos] = useState(0);
  const [pickerOpen, setPickerOpen] = useState(false);

  const syncCursor = useCallback(() => {
    if (textareaRef.current) {
      setCursorPos(textareaRef.current.selectionStart);
    }
  }, []);

  const handleTextChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      const newText = e.target.value;
      onTextChange(newText);
      const compiled = compileScript(newText, slots);
      onCompiledChange(compiled);
    },
    [slots, onTextChange, onCompiledChange]
  );

  const addSlot = useCallback(
    (condition: string, isCustom: boolean) => {
      const newSlot: Slot = {
        id: crypto.randomUUID(),
        position: cursorPos,
        condition,
        isCustom,
      };
      const newSlots = [...slots, newSlot];
      onSlotsChange(newSlots);
      const compiled = compileScript(text, newSlots);
      onCompiledChange(compiled);
      setPickerOpen(false);
    },
    [cursorPos, slots, text, onSlotsChange, onCompiledChange]
  );

  const removeSlot = useCallback(
    (id: string) => {
      const newSlots = slots.filter((s) => s.id !== id);
      onSlotsChange(newSlots);
      const compiled = compileScript(text, newSlots);
      onCompiledChange(compiled);
    },
    [slots, text, onSlotsChange, onCompiledChange]
  );

  const renderOverlay = () => {
    if (slots.length === 0) return null;

    const sorted = [...slots].sort((a, b) => a.position - b.position);
    const parts: React.ReactNode[] = [];
    let lastIdx = 0;

    for (let i = 0; i < sorted.length; i++) {
      const slot = sorted[i];
      if (slot.position > lastIdx) {
        parts.push(
          <span key={`t-${i}`}>
            {text.slice(lastIdx, slot.position)}
          </span>
        );
      }
      parts.push(<SlotChip key={`s-${slot.id}`} slot={slot} onRemove={removeSlot} />);
      lastIdx = slot.position;
    }

    if (lastIdx < text.length) {
      parts.push(<span key="t-end">{text.slice(lastIdx)}</span>);
    }

    return parts;
  };

  const quickPresets = PRESET_CONDITIONS.slice(0, 6);

  return (
    <div className="space-y-3">
      <div className="relative min-h-[16rem]">
        <div
          className="absolute inset-0 font-mono text-sm leading-relaxed p-3 pointer-events-none whitespace-pre-wrap break-words text-transparent z-10"
          aria-hidden="true"
        >
          {renderOverlay()}
        </div>
        <textarea
          ref={textareaRef}
          data-testid="textarea"
          value={text}
          onChange={handleTextChange}
          onKeyUp={syncCursor}
          onClick={syncCursor}
          placeholder="Type your script here..."
          className={`
            relative w-full h-64 p-3 font-mono text-sm leading-relaxed
            bg-transparent border border-border rounded-lg
            text-foreground caret-amber-400
            placeholder:text-muted-foreground resize-y
            focus:outline-none focus:shadow-[0_0_0_1px_var(--accent)]
          `}
        />
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        {quickPresets.map((preset) => (
          <button
            key={preset.value}
            onClick={() => addSlot(preset.value, false)}
            className="flex items-center gap-1 px-2.5 py-1 rounded-full text-xs border border-border bg-white/[0.03] hover:bg-white/[0.07] transition-colors"
          >
            <span>{preset.emoji}</span>
            <span>{preset.label}</span>
          </button>
        ))}
        <SlotPicker onSelect={addSlot} open={pickerOpen} onOpenChange={setPickerOpen}>
          <button
            data-testid="add-slot-btn"
            className="flex items-center gap-1 px-2.5 py-1 rounded-full text-xs border border-dashed border-muted-foreground/50 text-muted-foreground hover:text-foreground hover:border-foreground/50 transition-colors"
          >
            <span>+</span>
            <span>Condition</span>
          </button>
        </SlotPicker>
      </div>

      <div className="text-xs text-muted-foreground">
        {text.length} characters
      </div>
    </div>
  );
}
