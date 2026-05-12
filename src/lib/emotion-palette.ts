import * as THREE from "three";
import type { AvatarEmotion, AvatarRole } from "./avatar-store";

export type Palette = {
  /** Core glow color (the cloud's primary tint) */
  core: THREE.Color;
  /** Particle accent color (rim / scatter) */
  accent: THREE.Color;
  /** Sub-bloom color (post-processing bias) */
  bloom: THREE.Color;
  /** How aggressively the cloud expands on intensity (0.5..1.5) */
  expansion: number;
  /** Drift speed multiplier (0.5..1.8) */
  driftSpeed: number;
  /** Chromatic-aberration scale (0..1) */
  aberration: number;
};

const C = (hex: string) => new THREE.Color(hex);

const palettes: Record<AvatarEmotion, Palette> = {
  neutral: {
    core: C("#7a5cff"),
    accent: C("#a0e0ff"),
    bloom: C("#5b3df0"),
    expansion: 0.8,
    driftSpeed: 0.7,
    aberration: 0.25,
  },
  hype: {
    core: C("#34ffb1"),
    accent: C("#ffffff"),
    bloom: C("#1fff8a"),
    expansion: 1.4,
    driftSpeed: 1.6,
    aberration: 0.8,
  },
  bullish: {
    core: C("#26d987"),
    accent: C("#d6ff7c"),
    bloom: C("#0fbf6b"),
    expansion: 1.15,
    driftSpeed: 1.2,
    aberration: 0.45,
  },
  bearish: {
    core: C("#ff3b6d"),
    accent: C("#ff9046"),
    bloom: C("#d12150"),
    expansion: 0.9,
    driftSpeed: 0.9,
    aberration: 0.55,
  },
  chill: {
    core: C("#3aa4ff"),
    accent: C("#8be5ff"),
    bloom: C("#1d6cd6"),
    expansion: 0.75,
    driftSpeed: 0.55,
    aberration: 0.2,
  },
  teach: {
    core: C("#b67dff"),
    accent: C("#ffc6f0"),
    bloom: C("#8447e8"),
    expansion: 0.85,
    driftSpeed: 0.8,
    aberration: 0.3,
  },
  warning: {
    core: C("#ff9b1a"),
    accent: C("#ff5151"),
    bloom: C("#cc4d00"),
    expansion: 1.0,
    driftSpeed: 1.1,
    aberration: 0.6,
  },
};

const rolePalettes: Record<AvatarRole, Partial<Palette>> = {
  idle: {},
  // Lead = male analyst, cyan/teal bias
  lead: { core: C("#3ad8ff"), accent: C("#caf6ff"), bloom: C("#1aa4e0") },
  // Cohost = female host, magenta/pink bias
  cohost: { core: C("#ff5ed1"), accent: C("#ffd5e8"), bloom: C("#d63c9f") },
};

/** When the role overrides emotion (role wins for the base color in idle states). */
export function getPalette(
  emotion: AvatarEmotion,
  role: AvatarRole,
): Palette {
  const emo = palettes[emotion];
  // Only let role tint the palette when emotion is neutral — otherwise emotion wins.
  if (emotion === "neutral" && role !== "idle") {
    return { ...emo, ...rolePalettes[role] };
  }
  return emo;
}
