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

export function addToHistory(generation: Generation) {
  const existing = loadHistory();
  saveHistory([generation, ...existing]);
}

export { loadHistory, HISTORY_KEY, MAX_HISTORY };
