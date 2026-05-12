import { create } from "zustand";

export type AvatarRole = "idle" | "lead" | "cohost";
export type AvatarEmotion =
  | "neutral"
  | "hype"
  | "chill"
  | "teach"
  | "warning"
  | "bullish"
  | "bearish";

type AvatarState = {
  role: AvatarRole;
  emotion: AvatarEmotion;
  intensity: number; // 0..1, syllable-sync amplitude
  speaking: boolean;
  setRole: (r: AvatarRole) => void;
  setEmotion: (e: AvatarEmotion) => void;
  setIntensity: (i: number) => void;
  startSpeaking: () => void;
  stopSpeaking: () => void;
};

export const useAvatar = create<AvatarState>((set) => ({
  role: "idle",
  emotion: "neutral",
  intensity: 0,
  speaking: false,
  setRole: (role) => set({ role }),
  setEmotion: (emotion) => set({ emotion }),
  setIntensity: (intensity) =>
    set({ intensity: Math.max(0, Math.min(1, intensity)) }),
  startSpeaking: () => set({ speaking: true }),
  stopSpeaking: () => set({ speaking: false, intensity: 0 }),
}));
