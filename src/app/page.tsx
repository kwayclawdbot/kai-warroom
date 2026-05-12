"use client";

import dynamic from "next/dynamic";
import { useEffect, useRef, useState } from "react";
import { REGIONS } from "@/lib/brain-regions";
import { useAvatar, type AvatarEmotion } from "@/lib/avatar-store";

const KaiAvatar = dynamic(
  () => import("@/components/KaiAvatar").then((m) => m.KaiAvatar),
  { ssr: false },
);

const EMOTIONS: AvatarEmotion[] = [
  "neutral",
  "hype",
  "bullish",
  "bearish",
  "teach",
  "warning",
  "chill",
];

// A scripted "thought sequence" — Kai analyzing a stock end-to-end. Used to
// demo the neural network until Task #4/#6 wire real tool calls into it.
type ThoughtBeat = {
  /** Seconds from sequence start. */
  at: number;
  /** Which region to fire. */
  id: import("@/lib/brain-regions").RegionId;
  /** Peak activation (0..1). */
  peak: number;
  /** How long the region stays lit before auto-decaying to 0 (ms). */
  decayMs: number;
};

const ANALYSIS_SEQUENCE: ThoughtBeat[] = [
  { at: 0.0, id: "memory", peak: 0.85, decayMs: 1400 },
  { at: 0.9, id: "market", peak: 0.75, decayMs: 2200 },
  { at: 2.1, id: "news", peak: 0.65, decayMs: 1600 },
  { at: 3.0, id: "technicals", peak: 0.95, decayMs: 2800 },
  { at: 4.6, id: "alerts", peak: 0.7, decayMs: 1900 },
  { at: 5.9, id: "options", peak: 0.55, decayMs: 1500 },
  { at: 7.0, id: "users", peak: 0.45, decayMs: 1200 },
  { at: 8.0, id: "watchlist", peak: 0.6, decayMs: 1500 },
  // Conclusion — multiple regions hold high together briefly.
  { at: 9.4, id: "technicals", peak: 0.9, decayMs: 2200 },
  { at: 9.5, id: "alerts", peak: 0.85, decayMs: 2200 },
  { at: 9.6, id: "market", peak: 0.75, decayMs: 2200 },
];
const SEQUENCE_PERIOD_MS = 13000;

export default function Home() {
  const setEmotion = useAvatar((s) => s.setEmotion);
  const setIntensity = useAvatar((s) => s.setIntensity);
  const setBands = useAvatar((s) => s.setBands);
  const startSpeaking = useAvatar((s) => s.startSpeaking);
  const stopSpeaking = useAvatar((s) => s.stopSpeaking);
  const pulseRegion = useAvatar((s) => s.pulseRegion);
  const clearRegions = useAvatar((s) => s.clearRegions);
  const emotion = useAvatar((s) => s.emotion);
  const speaking = useAvatar((s) => s.speaking);

  const [demoOn, setDemoOn] = useState(true);
  const demoOnRef = useRef(demoOn);
  demoOnRef.current = demoOn;

  // Audio bands demo (drives the ambient cloud while sequence runs).
  useEffect(() => {
    if (!demoOn) {
      stopSpeaking();
      setIntensity(0);
      setBands(0, 0, 0);
      return;
    }
    startSpeaking();
    let raf = 0;
    const start = performance.now();
    let trebleSpike = 0;
    let nextSpike = 200;
    const tick = () => {
      const t = (performance.now() - start) / 1000;
      const i = 0.5 + 0.3 * Math.sin(t * 1.7) + 0.1 * Math.sin(t * 8.0);
      setIntensity(i);
      const bass = Math.pow(Math.max(0, Math.sin(t * 4.4)), 4) * 0.9;
      const mid = 0.35 + 0.45 * (0.5 + 0.5 * Math.sin(t * 4.1 + 1.3));
      if (performance.now() - start > nextSpike) {
        trebleSpike = 0.55 + Math.random() * 0.35;
        nextSpike += 220 + Math.random() * 280;
      }
      trebleSpike *= 0.86;
      setBands(bass, mid, trebleSpike);
      if (demoOnRef.current) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [demoOn, setIntensity, setBands, startSpeaking, stopSpeaking]);

  // Thought-sequence loop — schedules region pulses simulating Kai analyzing
  // a ticker. Runs continuously until the user pauses the demo.
  useEffect(() => {
    if (!demoOn) {
      clearRegions();
      return;
    }
    const timeouts: number[] = [];
    let cycleTimer = 0;

    const runCycle = () => {
      for (const beat of ANALYSIS_SEQUENCE) {
        const id = window.setTimeout(() => {
          if (!demoOnRef.current) return;
          pulseRegion(beat.id, beat.peak, beat.decayMs);
        }, beat.at * 1000);
        timeouts.push(id);
      }
      cycleTimer = window.setTimeout(runCycle, SEQUENCE_PERIOD_MS);
      timeouts.push(cycleTimer);
    };
    runCycle();

    return () => {
      for (const id of timeouts) window.clearTimeout(id);
      clearRegions();
    };
  }, [demoOn, pulseRegion, clearRegions]);

  return (
    <main className="relative flex-1 overflow-hidden bg-black text-white">
      <header className="absolute top-0 left-0 right-0 z-10 flex items-center justify-between p-6">
        <div className="text-xs uppercase tracking-[0.3em] text-white/50">
          Kai · War Room
        </div>
        <button
          onClick={() => setDemoOn((v) => !v)}
          className="rounded-full border border-white/15 px-3 py-1 text-[10px] uppercase tracking-[0.2em] text-white/60 transition hover:border-white/40 hover:text-white"
        >
          {demoOn ? "Pause demo" : "Resume demo"}
        </button>
      </header>

      <KaiAvatar />

      <footer className="absolute bottom-0 left-0 right-0 z-10 flex flex-col items-center gap-4 p-6">
        <div className="flex flex-wrap justify-center gap-1.5">
          {REGIONS.map((r) => (
            <button
              key={r.id}
              onClick={() => pulseRegion(r.id, 0.95, 2200)}
              className="group rounded-full border border-white/10 bg-black/30 px-2.5 py-1 text-[10px] uppercase tracking-[0.18em] text-white/55 backdrop-blur transition hover:border-white/40 hover:text-white"
              style={
                {
                  ["--region-color" as string]: `#${r.color.getHexString()}`,
                } as React.CSSProperties
              }
            >
              <span
                className="inline-block h-1.5 w-1.5 rounded-full mr-1.5 align-middle"
                style={{
                  background: `#${r.color.getHexString()}`,
                  boxShadow: `0 0 8px #${r.color.getHexString()}`,
                }}
              />
              {r.label}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap justify-center gap-1.5">
          {EMOTIONS.map((e) => (
            <button
              key={e}
              onClick={() => setEmotion(e)}
              className={`rounded-full border px-2.5 py-0.5 text-[10px] uppercase tracking-[0.18em] transition ${
                emotion === e
                  ? "border-cyan-300 bg-cyan-300/15 text-cyan-100"
                  : "border-white/10 text-white/40 hover:border-white/30 hover:text-white/80"
              }`}
            >
              {e}
            </button>
          ))}
        </div>

        <div className="text-[10px] uppercase tracking-[0.3em] text-white/30">
          {speaking ? "thinking" : "idle"} · synthetic sequence · real tools in
          task #4
        </div>
      </footer>
    </main>
  );
}
