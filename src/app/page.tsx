"use client";

import dynamic from "next/dynamic";
import { useEffect, useRef, useState } from "react";
import { REGIONS, type RegionId } from "@/lib/brain-regions";
import { useAvatar } from "@/lib/avatar-store";
import { SPEECH_PROGRAM, speakingEnvelope } from "@/lib/speech-script";

const KaiBrain = dynamic(
  () => import("@/components/avatar/KaiBrain").then((m) => m.KaiBrain),
  { ssr: false },
);

type DemoMode = "off" | "thinking" | "speaking";

type ThoughtBeat = {
  at: number;
  id: RegionId;
  peak: number;
  decayMs: number;
};

const ANALYSIS_SEQUENCE: ThoughtBeat[] = [
  { at: 0.0, id: "memory", peak: 0.9, decayMs: 1600 },
  { at: 0.9, id: "market", peak: 0.8, decayMs: 2400 },
  { at: 2.1, id: "news", peak: 0.7, decayMs: 1800 },
  { at: 3.0, id: "technicals", peak: 1.0, decayMs: 3000 },
  { at: 4.6, id: "alerts", peak: 0.85, decayMs: 2200 },
  { at: 5.9, id: "options", peak: 0.6, decayMs: 1700 },
  { at: 7.0, id: "users", peak: 0.55, decayMs: 1500 },
  { at: 8.0, id: "watchlist", peak: 0.75, decayMs: 1700 },
  { at: 9.4, id: "technicals", peak: 0.95, decayMs: 2400 },
  { at: 9.5, id: "alerts", peak: 0.9, decayMs: 2400 },
  { at: 9.6, id: "market", peak: 0.8, decayMs: 2400 },
];
const SEQUENCE_PERIOD_MS = 13000;

const MODE_LABELS: Record<DemoMode, string> = {
  off: "Demo · off",
  thinking: "Demo · thinking",
  speaking: "Demo · speaking",
};

function nextMode(m: DemoMode): DemoMode {
  if (m === "off") return "thinking";
  if (m === "thinking") return "speaking";
  return "off";
}

export default function Home() {
  const setIntensity = useAvatar((s) => s.setIntensity);
  const setBands = useAvatar((s) => s.setBands);
  const startSpeaking = useAvatar((s) => s.startSpeaking);
  const stopSpeaking = useAvatar((s) => s.stopSpeaking);
  const pulseRegion = useAvatar((s) => s.pulseRegion);
  const clearRegions = useAvatar((s) => s.clearRegions);

  const [mode, setMode] = useState<DemoMode>("speaking");
  const [currentPhrase, setCurrentPhrase] = useState<string | null>(null);
  const modeRef = useRef(mode);
  modeRef.current = mode;

  // ─── Thinking mode: scripted analysis sequence (no audio) ──────────────
  useEffect(() => {
    if (mode !== "thinking") return;
    const timeouts: number[] = [];
    setIntensity(0);
    setBands(0, 0, 0);
    stopSpeaking();
    const runCycle = () => {
      for (const beat of ANALYSIS_SEQUENCE) {
        const id = window.setTimeout(() => {
          if (modeRef.current !== "thinking") return;
          pulseRegion(beat.id, beat.peak, beat.decayMs);
        }, beat.at * 1000);
        timeouts.push(id);
      }
      const cycle = window.setTimeout(runCycle, SEQUENCE_PERIOD_MS);
      timeouts.push(cycle);
    };
    runCycle();
    return () => {
      for (const id of timeouts) window.clearTimeout(id);
      clearRegions();
    };
  }, [
    mode,
    pulseRegion,
    clearRegions,
    setIntensity,
    setBands,
    stopSpeaking,
  ]);

  // ─── Speaking mode: phrase program with syllable-driven audio bands ────
  useEffect(() => {
    if (mode !== "speaking") return;
    startSpeaking();

    let raf = 0;
    let entryIdx = 0;
    let entryStart = performance.now();
    const pulsedSet = new Set<number>();
    setCurrentPhrase(
      SPEECH_PROGRAM[0].kind === "phrase" ? SPEECH_PROGRAM[0].text : null,
    );

    const tick = () => {
      if (modeRef.current !== "speaking") return;
      const now = performance.now();
      const entry = SPEECH_PROGRAM[entryIdx];
      const elapsed = (now - entryStart) / 1000;

      if (elapsed >= entry.duration) {
        // Advance.
        entryIdx = (entryIdx + 1) % SPEECH_PROGRAM.length;
        entryStart = now;
        pulsedSet.clear();
        const next = SPEECH_PROGRAM[entryIdx];
        setCurrentPhrase(next.kind === "phrase" ? next.text : null);
      } else if (entry.kind === "phrase") {
        const env = speakingEnvelope(elapsed);
        setIntensity(env.intensity);
        setBands(env.bass, env.mid, env.treble);
        // Fire region pulses at their scheduled fractional offsets.
        entry.regions.forEach((r, i) => {
          if (!pulsedSet.has(i) && elapsed >= r.at * entry.duration) {
            pulsedSet.add(i);
            pulseRegion(r.id, r.peak, r.decayMs ?? 1800);
          }
        });
      } else {
        // Pause — fade audio out quickly.
        setIntensity(0);
        setBands(0, 0, 0);
      }

      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(raf);
      stopSpeaking();
      setIntensity(0);
      setBands(0, 0, 0);
      clearRegions();
      setCurrentPhrase(null);
    };
  }, [
    mode,
    setIntensity,
    setBands,
    startSpeaking,
    stopSpeaking,
    pulseRegion,
    clearRegions,
  ]);

  // ─── Off mode cleanup ─────────────────────────────────────────────────
  useEffect(() => {
    if (mode !== "off") return;
    setIntensity(0);
    setBands(0, 0, 0);
    stopSpeaking();
    clearRegions();
    setCurrentPhrase(null);
  }, [mode, setIntensity, setBands, stopSpeaking, clearRegions]);

  return (
    <main className="relative flex-1 overflow-hidden bg-[#05080A] text-white">
      <header className="absolute top-0 left-0 right-0 z-10 flex items-start justify-between px-6 pt-5">
        <div className="font-mono text-[11px] uppercase tracking-[0.25em] text-amber-200/85">
          kai · brain
        </div>
        <div className="flex flex-col items-end gap-1 text-[10px] uppercase tracking-[0.2em] text-amber-200/70 font-mono">
          <div>v0.3 · scroll to zoom · drag to orbit</div>
          <button
            onClick={() => setMode(nextMode)}
            className="rounded-sm border border-white/15 px-2.5 py-0.5 text-white/65 transition hover:border-white/40 hover:text-white"
          >
            {MODE_LABELS[mode]}
          </button>
        </div>
      </header>

      <KaiBrain />

      <footer className="absolute bottom-0 left-0 right-0 z-10 flex flex-col items-center gap-3 px-4 pb-6 pt-3 pointer-events-none">
        {/* Caption strip — shows what Kai is currently "saying" */}
        <div className="min-h-[1rem] font-mono text-[11px] uppercase tracking-[0.18em] text-amber-100/75">
          {currentPhrase ?? ""}
        </div>
        <div className="font-mono text-[10px] uppercase tracking-[0.3em] text-white/30">
          tap a region to fire it manually
        </div>
        <div className="pointer-events-auto flex flex-wrap justify-center gap-1.5">
          {REGIONS.map((r) => (
            <button
              key={r.id}
              onClick={() => pulseRegion(r.id, 1.0, 2400)}
              className="font-mono rounded-sm border border-white/10 bg-black/40 px-2.5 py-1 text-[10px] uppercase tracking-[0.22em] text-white/55 backdrop-blur transition hover:text-white"
            >
              <span
                className="mr-1.5 inline-block h-1.5 w-1.5 rounded-full align-middle"
                style={{
                  background: `#${r.color.getHexString()}`,
                  boxShadow: `0 0 6px #${r.color.getHexString()}`,
                }}
              />
              {r.label}
            </button>
          ))}
        </div>
      </footer>
    </main>
  );
}
