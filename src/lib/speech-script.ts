// Synthetic speech simulator for the brain visualization.
//
// A `SpeechProgram` is a sequence of phrases (speaking segments) and pauses.
// Each phrase has a duration in seconds + a list of region pulses scheduled
// as fractions of the phrase duration. The page-level raf loop walks the
// program and drives the avatar store: intensity + bass/mid/treble during
// phrases, region pulses at scheduled offsets, silence during pauses.

import type { RegionId } from "./brain-regions";

export type PhraseRegionBeat = {
  /** Fractional offset within the phrase, 0..1. */
  at: number;
  id: RegionId;
  peak: number;
  decayMs?: number;
};

export type ProgramEntry =
  | {
      kind: "phrase";
      /** What Kai is "saying" — for logging / future caption rendering. */
      text: string;
      duration: number;
      regions: PhraseRegionBeat[];
    }
  | {
      kind: "pause";
      duration: number;
    };

export const SPEECH_PROGRAM: ProgramEntry[] = [
  {
    kind: "phrase",
    text: "Top trade right now is RKLB.",
    duration: 1.6,
    regions: [
      { at: 0.04, id: "memory", peak: 0.65, decayMs: 1400 },
      { at: 0.22, id: "market", peak: 0.85, decayMs: 1800 },
      { at: 0.62, id: "technicals", peak: 1.0, decayMs: 2200 },
      { at: 0.85, id: "alerts", peak: 0.85, decayMs: 1800 },
    ],
  },
  { kind: "pause", duration: 0.55 },
  {
    kind: "phrase",
    text: "NVDA broke above eight fifty with volume.",
    duration: 2.1,
    regions: [
      { at: 0.05, id: "technicals", peak: 0.9, decayMs: 2200 },
      { at: 0.4, id: "alerts", peak: 0.8, decayMs: 2000 },
      { at: 0.72, id: "market", peak: 0.75, decayMs: 1900 },
    ],
  },
  { kind: "pause", duration: 0.45 },
  {
    kind: "phrase",
    text: "Watchlist ARM showing strength.",
    duration: 1.5,
    regions: [
      { at: 0.05, id: "watchlist", peak: 0.85, decayMs: 1900 },
      { at: 0.5, id: "technicals", peak: 0.9, decayMs: 2000 },
    ],
  },
  { kind: "pause", duration: 0.5 },
  {
    kind: "phrase",
    text: "Three users asking about options on TSLA.",
    duration: 2.0,
    regions: [
      { at: 0.05, id: "users", peak: 0.8, decayMs: 1800 },
      { at: 0.45, id: "options", peak: 0.85, decayMs: 2000 },
      { at: 0.78, id: "market", peak: 0.65, decayMs: 1600 },
    ],
  },
  { kind: "pause", duration: 0.6 },
  {
    kind: "phrase",
    text: "Memory check confirms similar setup last week.",
    duration: 2.0,
    regions: [
      { at: 0.05, id: "memory", peak: 0.95, decayMs: 2400 },
      { at: 0.4, id: "technicals", peak: 0.85, decayMs: 2000 },
      { at: 0.78, id: "alerts", peak: 0.8, decayMs: 1900 },
    ],
  },
  { kind: "pause", duration: 0.7 },
];

/** Deterministic pseudo-random from a syllable index. */
function syllSeed(i: number): number {
  const x = Math.sin(i * 12.9898) * 43758.5453;
  return x - Math.floor(x);
}

/**
 * Speech envelope: returns audio bands at time `tSeconds` within a phrase.
 * Produces a syllable-rhythmic bell-curve pattern at ~4.3Hz with natural
 * jitter, plus stressed-syllable bass + plosive-like treble spikes.
 */
export function speakingEnvelope(tSeconds: number): {
  intensity: number;
  bass: number;
  mid: number;
  treble: number;
} {
  const syllRate = 4.3;
  const phase = tSeconds * syllRate;
  const syllIdx = Math.floor(phase);
  const cycle = phase - syllIdx; // 0..1 within the current syllable

  // Bell curve within syllable, slightly skewed earlier (sharp attack).
  const skewed = cycle - 0.42;
  const env0 = Math.max(0, 1 - skewed * skewed * 5.5);

  // Per-syllable amplitude — random variation.
  const seed = syllSeed(syllIdx);
  let env = env0 * (0.55 + seed * 0.5);

  // Word boundaries — occasional brief dips.
  const wordBoundary = syllSeed(syllIdx * 0.731 + 17) > 0.78;
  if (wordBoundary && cycle < 0.18) env *= 0.18;

  // Bass: stronger on every other syllable (stressed/vowel-like).
  const stressed = syllIdx % 2 === 0 ? 1 : 0.45;
  const bass = env * stressed * 0.9;
  // Mid: steady mid-range, mostly intensity-shaped.
  const mid = env * 0.7;
  // Treble: plosive-like bursts on every ~3rd syllable + random spikes.
  const trebleSpike =
    syllIdx % 3 === 1 ? 0.85 : syllSeed(syllIdx * 1.31) > 0.85 ? 0.75 : 0.2;
  const treble = env * trebleSpike;

  return { intensity: env, bass, mid, treble };
}
