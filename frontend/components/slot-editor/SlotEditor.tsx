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

/** Extract [tag] patterns from raw text, strip them, return clean text + auto slots */
function processTags(rawText: string): { cleanText: string; autoSlots: Omit<Slot, "id">[] } {
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
  // Track auto-generated slot ids so we can differentiate from manual
  const autoSlotIdsRef = useRef<Set<string>>(new Set());

  const syncCursor = useCallback(() => {
    if (textareaRef.current) {
      setCursorPos(textareaRef.current.selectionStart);
    }
  }, []);

  const handleTextChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      const rawText = e.target.value;
      const selStart = e.target.selectionStart;

      // Process [tag] patterns in the raw input
      const { cleanText, autoSlots } = processTags(rawText);

      // Calculate cursor position: how many chars were removed BEFORE the cursor
      let removedBeforeCursor = 0;
      const tagRegex = /\[([^\]]+)\]/g;
      let m: RegExpExecArray | null;
      while ((m = tagRegex.exec(rawText)) !== null) {
        if (m.index < selStart) {
          removedBeforeCursor += m[0].length;
        }
      }

      const newCursorPos = selStart - removedBeforeCursor;

      if (autoSlots.length > 0) {
        // Replace all slots with auto-detected ones
        const newSlots = autoSlots.map((s) => {
          const id = crypto.randomUUID();
          return { ...s, id };
        });
        autoSlotIdsRef.current = new Set(newSlots.map((s) => s.id));

        onTextChange(cleanText);
        onSlotsChange(newSlots);
        const compiled = compileScript(cleanText, newSlots);
        onCompiledChange(compiled);

        // Restore cursor position
        requestAnimationFrame(() => {
          if (textareaRef.current) {
            textareaRef.current.focus();
            const restorePos = Math.min(newCursorPos, cleanText.length);
            textareaRef.current.setSelectionRange(restorePos, restorePos);
          }
        });
      } else {
        onTextChange(cleanText);
        const compiled = compileScript(cleanText, slots);
        onCompiledChange(compiled);
      }
    },
    [slots, onTextChange, onSlotsChange, onCompiledChange]
  );

  const addSlot = useCallback(
    (condition: string, isCustom: boolean) => {
      const newText = text.slice(0, cursorPos) + " " + text.slice(cursorPos);
      onTextChange(newText);

      const newSlot: Slot = {
        id: crypto.randomUUID(),
        position: cursorPos,
        condition,
        isCustom,
      };
      const newSlots = [...slots, newSlot];
      onSlotsChange(newSlots);
      const compiled = compileScript(newText, newSlots);
      onCompiledChange(compiled);
      setPickerOpen(false);

      requestAnimationFrame(() => {
        if (textareaRef.current) {
          textareaRef.current.focus();
          textareaRef.current.setSelectionRange(cursorPos + 1, cursorPos + 1);
        }
      });
    },
    [cursorPos, slots, text, onSlotsChange, onTextChange, onCompiledChange]
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

  const quickPresets = PRESET_CONDITIONS.slice(0, 6);

  return (
    <div className="space-y-3">
      <textarea
        ref={textareaRef}
        data-testid="textarea"
        value={text}
        onChange={handleTextChange}
        onKeyUp={syncCursor}
        onClick={syncCursor}
        onMouseUp={syncCursor}
        placeholder="Type your script here... (or use [excited] [whisper] tags directly)"
        className={`
          w-full h-64 p-3 font-mono text-sm leading-relaxed
          bg-transparent border border-border rounded-lg
          text-foreground caret-amber-400
          placeholder:text-muted-foreground resize-y
          focus:outline-none focus:shadow-[0_0_0_1px_var(--accent)]
        `}
        style={{ fontFamily: "var(--font-mono)" }}
      />

      {/* Active conditions bar */}
      {slots.length > 0 && (
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs text-muted-foreground font-medium">Active:</span>
          {slots.map((slot) => (
            <SlotChip key={slot.id} slot={slot} onRemove={removeSlot} />
          ))}
        </div>
      )}

      {/* Quick-insert pills + add button */}
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
