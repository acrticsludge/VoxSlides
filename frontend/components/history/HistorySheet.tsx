"use client";

import { useEffect, useState } from "react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { History, Trash2, Play } from "lucide-react";
import type { Generation } from "@/types";

const HISTORY_KEY = "voxslides_history";
const MAX_HISTORY = 5;

function loadHistory(): Generation[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveHistory(history: Generation[]) {
  localStorage.setItem(HISTORY_KEY, JSON.stringify(history.slice(0, MAX_HISTORY)));
}

interface HistorySheetProps {
  onReplay: (generation: Generation) => void;
}

export function HistorySheet({ onReplay }: HistorySheetProps) {
  const [history, setHistory] = useState<Generation[]>([]);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    setHistory(loadHistory());
  }, [open]);

  const clearAll = () => {
    localStorage.removeItem(HISTORY_KEY);
    setHistory([]);
  };

  const handleReplay = (gen: Generation) => {
    onReplay(gen);
    setOpen(false);
  };

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger
        render={
          <Button variant="ghost" size="sm" data-testid="history-btn" />
        }
      >
        <History className="h-4 w-4 mr-2" />
        History
      </SheetTrigger>
      <SheetContent side="right" className="w-80">
        <SheetHeader>
          <SheetTitle>Generation History</SheetTitle>
        </SheetHeader>

        {history.length === 0 ? (
          <p className="text-sm text-muted-foreground mt-4">
            No generations yet. Generate some audio to see history.
          </p>
        ) : (
          <div className="mt-4 space-y-2">
            {history.map((gen) => (
              <div
                key={gen.id}
                data-testid="history-item"
                className="flex items-start gap-3 p-3 rounded-lg border border-border bg-white/[0.02]"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-muted-foreground">
                    {new Date(gen.timestamp).toLocaleString()}
                  </p>
                  <p className="text-sm truncate mt-1 font-mono">
                    {gen.script.slice(0, 60)}
                    {gen.script.length > 60 ? "..." : ""}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 shrink-0"
                  onClick={() => handleReplay(gen)}
                >
                  <Play className="h-3.5 w-3.5" />
                </Button>
              </div>
            ))}
          </div>
        )}

        {history.length > 0 && (
          <Button
            variant="outline"
            size="sm"
            onClick={clearAll}
            className="w-full mt-4"
          >
            <Trash2 className="h-3.5 w-3.5 mr-2" />
            Clear All
          </Button>
        )}
      </SheetContent>
    </Sheet>
  );
}

export function addToHistory(generation: Generation) {
  const existing = loadHistory();
  saveHistory([generation, ...existing]);
}
