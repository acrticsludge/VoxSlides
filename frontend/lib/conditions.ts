export interface PresetCondition {
  label: string;
  emoji: string;
  color: string;
  value: string;
}

export const PRESET_CONDITIONS: PresetCondition[] = [
  { label: "Excited",         emoji: "⚡", color: "amber",   value: "excited" },
  { label: "Whisper",         emoji: "🤫", color: "blue",    value: "whisper" },
  { label: "Slow & Dramatic", emoji: "🎭", color: "purple",  value: "slow and dramatic" },
  { label: "Fast",            emoji: "💨", color: "green",   value: "fast" },
  { label: "Nervous",         emoji: "😰", color: "yellow",  value: "nervous" },
  { label: "Crying",          emoji: "😢", color: "indigo",  value: "crying" },
  { label: "Angry",           emoji: "🔥", color: "red",     value: "angry" },
  { label: "Calm",            emoji: "🌊", color: "teal",    value: "calm" },
  { label: "Laughing",        emoji: "😂", color: "orange",  value: "laughing" },
  { label: "Sarcastic",       emoji: "🙄", color: "pink",    value: "sarcastic" },
  { label: "Storytelling",    emoji: "📖", color: "brown",   value: "storytelling" },
  { label: "Breathless",      emoji: "😮", color: "gray",    value: "breathless" },
];

export const CONDITION_COLORS: Record<string, string> = {
  amber:   "bg-amber-500/20 text-amber-300 border-amber-500/30",
  blue:    "bg-blue-500/20 text-blue-300 border-blue-500/30",
  purple:  "bg-purple-500/20 text-purple-300 border-purple-500/30",
  green:   "bg-green-500/20 text-green-300 border-green-500/30",
  yellow:  "bg-yellow-500/20 text-yellow-300 border-yellow-500/30",
  indigo:  "bg-indigo-500/20 text-indigo-300 border-indigo-500/30",
  red:     "bg-red-500/20 text-red-300 border-red-500/30",
  teal:    "bg-teal-500/20 text-teal-300 border-teal-500/30",
  orange:  "bg-orange-500/20 text-orange-300 border-orange-500/30",
  pink:    "bg-pink-500/20 text-pink-300 border-pink-500/30",
  brown:   "bg-amber-700/20 text-amber-400 border-amber-700/30",
  gray:    "bg-gray-500/20 text-gray-300 border-gray-500/30",
};
