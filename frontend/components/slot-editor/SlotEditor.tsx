"use client";

import { useRef, useState, useCallback } from "react";
import type { Slot } from "@/types";
import { PRESET_CONDITIONS } from "@/lib/conditions";
import { SlotChip } from "./SlotChip";
import { SlotPicker } from "./SlotPicker";
import { compileScript, processTags } from "./compileScript";

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

      const { cleanText, autoSlots } = processTags(rawText);

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
        const newSlots = autoSlots.map((s) => {
          const id = crypto.randomUUID();
          return { ...s, id };
        });
        autoSlotIdsRef.current = new Set(newSlots.map((s) => s.id));

        onTextChange(cleanText);
        onSlotsChange(newSlots);
        const compiled = compileScript(cleanText, newSlots);
        onCompiledChange(compiled);

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

  const quickInsert = useCallback(
    (value: string) => {
      const tagText = `[${value}] `;
      const newRawText = text + tagText;
      onTextChange(newRawText);

      const { cleanText, autoSlots } = processTags(newRawText);
      if (autoSlots.length > 0) {
        const newSlots = autoSlots.map((s) => ({
          ...s,
          id: crypto.randomUUID(),
        }));
        onSlotsChange(newSlots);
        const compiled = compileScript(cleanText, newSlots);
        onCompiledChange(compiled);
      } else {
        const compiled = compileScript(newRawText, slots);
        onCompiledChange(compiled);
      }
    },
    [text, slots, onTextChange, onSlotsChange, onCompiledChange]
  );

  const quickPresets = PRESET_CONDITIONS.slice(0, 6);

  return (
    <div className="flex flex-col flex-1">
      {/* Active conditions bar */}
      {slots.length > 0 && (
        <div className="flex items-center gap-2 flex-wrap mb-4">
          {slots.map((slot) => (
            <SlotChip key={slot.id} slot={slot} onRemove={removeSlot} />
          ))}
        </div>
      )}

      {/* Quick-insert pills */}
      <div className="flex items-center gap-2 flex-wrap mb-5">
        {quickPresets.map((preset) => (
          <button
            key={preset.value}
            onClick={() => quickInsert(preset.value)}
            className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-surface-container-low/80 border border-outline-variant/50 font-mono text-[11px] text-on-surface-variant hover:border-primary/40 hover:text-primary hover:bg-surface-container transition-all duration-200"
          >
            <span className="text-[13px]">{preset.emoji}</span>
            <span>{preset.label}</span>
          </button>
        ))}
        <SlotPicker onSelect={addSlot} open={pickerOpen} onOpenChange={setPickerOpen}>
          <button className="flex items-center gap-1 px-3.5 py-1.5 rounded-full border border-dashed border-outline-variant/40 text-on-surface-variant/50 hover:text-primary hover:border-primary/40 transition-all duration-200 text-[11px] font-mono">
            <span className="material-symbols-outlined text-[14px]">add</span>
            <span>Condition</span>
          </button>
        </SlotPicker>
      </div>

      {/* Textarea */}
      <div className="flex-1 flex flex-col relative">
        <textarea
          ref={textareaRef}
          value={text}
          onChange={handleTextChange}
          onKeyUp={syncCursor}
          onClick={syncCursor}
          onMouseUp={syncCursor}
          placeholder="Start typing your script here...

Use [excited], [whisper], [angry] tags to shift emotional delivery."
          className="w-full flex-1 border-none focus:ring-0 p-0 text-[15px] leading-[2] bg-transparent resize-none text-on-surface min-h-[200px] tracking-[0.01em] placeholder:text-on-surface-variant/25 placeholder:leading-[2] placeholder:tracking-[0.01em] transition-colors duration-200"
          style={{ caretColor: "#000000" }}
        />
        {!text && (
          <div className="absolute top-0 left-0 pointer-events-none text-on-surface-variant/25 text-[15px] leading-[2] tracking-[0.01em]">
          </div>
        )}
      </div>
    </div>
  );
}
