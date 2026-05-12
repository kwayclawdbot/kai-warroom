import { create } from "zustand";
import type { RegionId } from "./brain-regions";

export type AvatarRole = "idle" | "lead" | "cohost";
export type AvatarEmotion =
  | "neutral"
  | "hype"
  | "chill"
  | "teach"
  | "warning"
  | "bullish"
  | "bearish";

/** Per-region activation targets (0..1). Smoothed components read these. */
export type RegionActivations = Partial<Record<RegionId, number>>;

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
  /** Targets for each brain region (0..1). Components smoothly approach these. */
  regions: RegionActivations;

  setRole: (r: AvatarRole) => void;
  setEmotion: (e: AvatarEmotion) => void;
  setIntensity: (i: number) => void;
  setBands: (bass: number, mid: number, treble: number) => void;
  startSpeaking: () => void;
  stopSpeaking: () => void;
  show: () => void;
  hide: () => void;

  /** Set a region's target activation (0..1). */
  setRegion: (id: RegionId, value: number) => void;
  /** Briefly pulse a region — sets to `peak`, then auto-decays to 0 over `decayMs`. */
  pulseRegion: (id: RegionId, peak?: number, decayMs?: number) => void;
  /** Activate multiple regions at once. Replaces existing targets for the given ids. */
  setRegions: (next: RegionActivations) => void;
  /** Clear all region targets. */
  clearRegions: () => void;
};

const clamp01 = (n: number) => Math.max(0, Math.min(1, n));

export const useAvatar = create<AvatarState>((set, get) => ({
  role: "idle",
  emotion: "neutral",
  intensity: 0,
  bass: 0,
  mid: 0,
  treble: 0,
  speaking: false,
  visible: true,
  regions: {},

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

  setRegion: (id, value) =>
    set((state) => ({
      regions: { ...state.regions, [id]: clamp01(value) },
    })),

  pulseRegion: (id, peak = 1, decayMs = 1500) => {
    set((state) => ({
      regions: { ...state.regions, [id]: clamp01(peak) },
    }));
    if (typeof window !== "undefined" && decayMs > 0) {
      window.setTimeout(() => {
        const current = get().regions[id] ?? 0;
        // Only decay if no one else bumped it higher in the meantime.
        if (current <= peak + 0.001) {
          set((state) => ({
            regions: { ...state.regions, [id]: 0 },
          }));
        }
      }, decayMs);
    }
  },

  setRegions: (next) =>
    set((state) => {
      const merged = { ...state.regions };
      for (const k of Object.keys(next) as RegionId[]) {
        const v = next[k];
        if (typeof v === "number") merged[k] = clamp01(v);
      }
      return { regions: merged };
    }),

  clearRegions: () => set({ regions: {} }),
}));
