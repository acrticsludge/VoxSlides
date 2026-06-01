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
  amber:   "bg-amber-100 text-amber-800 border-amber-300",
  blue:    "bg-blue-100 text-blue-800 border-blue-300",
  purple:  "bg-purple-100 text-purple-800 border-purple-300",
  green:   "bg-green-100 text-green-800 border-green-300",
  yellow:  "bg-yellow-100 text-yellow-800 border-yellow-300",
  indigo:  "bg-indigo-100 text-indigo-800 border-indigo-300",
  red:     "bg-red-100 text-red-800 border-red-300",
  teal:    "bg-teal-100 text-teal-800 border-teal-300",
  orange:  "bg-orange-100 text-orange-800 border-orange-300",
  pink:    "bg-pink-100 text-pink-800 border-pink-300",
  brown:   "bg-amber-100 text-amber-900 border-amber-400",
  gray:    "bg-gray-100 text-gray-800 border-gray-300",
};
