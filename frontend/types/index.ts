export interface Slot {
  id: string;
  position: number;
  condition: string;
  isCustom: boolean;
}

export interface Generation {
  id: string;
  script: string;
  audioUrl: string;
  timestamp: number;
  slots: Slot[];
}
