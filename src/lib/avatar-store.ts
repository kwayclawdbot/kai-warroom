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
  /** 0..1, overall syllable-sync amplitude (matches v1.7 API). */
  intensity: number;
  /** 0..1, low-freq (sub-bass to ~250Hz) energy — drives breathing pulse. */
  bass: number;
  /** 0..1, mid (~250Hz to ~2kHz) energy — drives cloud radius. */
  mid: number;
  /** 0..1, high (~2kHz+) energy — drives outer scatter + chromatic aberration. */
  treble: number;
  speaking: boolean;
  visible: boolean;
  setRole: (r: AvatarRole) => void;
  setEmotion: (e: AvatarEmotion) => void;
  setIntensity: (i: number) => void;
  setBands: (bass: number, mid: number, treble: number) => void;
  startSpeaking: () => void;
  stopSpeaking: () => void;
  show: () => void;
  hide: () => void;
};

const clamp01 = (n: number) => Math.max(0, Math.min(1, n));

export const useAvatar = create<AvatarState>((set) => ({
  role: "idle",
  emotion: "neutral",
  intensity: 0,
  bass: 0,
  mid: 0,
  treble: 0,
  speaking: false,
  visible: true,
  setRole: (role) => set({ role }),
  setEmotion: (emotion) => set({ emotion }),
  setIntensity: (i) => set({ intensity: clamp01(i) }),
  setBands: (bass, mid, treble) =>
    set({ bass: clamp01(bass), mid: clamp01(mid), treble: clamp01(treble) }),
  startSpeaking: () => set({ speaking: true }),
  stopSpeaking: () =>
    set({ speaking: false, intensity: 0, bass: 0, mid: 0, treble: 0 }),
  show: () => set({ visible: true }),
  hide: () => set({ visible: false }),
}));
