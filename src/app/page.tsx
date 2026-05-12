"use client";

import dynamic from "next/dynamic";
import { useEffect, useRef, useState } from "react";
import { REGIONS, type RegionId } from "@/lib/brain-regions";
import { useAvatar } from "@/lib/avatar-store";

const KaiBrain = dynamic(
  () => import("@/components/avatar/KaiBrain").then((m) => m.KaiBrain),
  { ssr: false },
);

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

export default function Home() {
  const setIntensity = useAvatar((s) => s.setIntensity);
  const setBands = useAvatar((s) => s.setBands);
  const pulseRegion = useAvatar((s) => s.pulseRegion);
  const clearRegions = useAvatar((s) => s.clearRegions);

  const [demoOn, setDemoOn] = useState(true);
  const demoOnRef = useRef(demoOn);
  demoOnRef.current = demoOn;

  // Subtle audio bands — drives slow breathing on the cloud.
  useEffect(() => {
    if (!demoOn) {
      setIntensity(0);
      setBands(0, 0, 0);
      return;
    }
    let raf = 0;
    const start = performance.now();
    const tick = () => {
      const t = (performance.now() - start) / 1000;
      setIntensity(0.4 + 0.25 * Math.sin(t * 1.7));
      setBands(
        Math.pow(Math.max(0, Math.sin(t * 4.4)), 4) * 0.85,
        0.35 + 0.4 * (0.5 + 0.5 * Math.sin(t * 4.1 + 1.3)),
        0,
      );
      if (demoOnRef.current) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [demoOn, setIntensity, setBands]);

  // Thought sequence — pulses regions in a believable thinking pattern.
  useEffect(() => {
    if (!demoOn) {
      clearRegions();
      return;
    }
    const timeouts: number[] = [];
    const runCycle = () => {
      for (const beat of ANALYSIS_SEQUENCE) {
        const id = window.setTimeout(() => {
          if (!demoOnRef.current) return;
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
  }, [demoOn, pulseRegion, clearRegions]);

  return (
    <main className="relative flex-1 overflow-hidden bg-[#05080A] text-white">
      <header className="absolute top-0 left-0 right-0 z-10 flex items-start justify-between px-6 pt-5">
        <div className="font-mono text-[11px] uppercase tracking-[0.25em] text-amber-200/85">
          kai · brain
        </div>
        <div className="flex flex-col items-end gap-1 text-[10px] uppercase tracking-[0.2em] text-amber-200/70 font-mono">
          <div>v0.2 · scroll to zoom · drag to orbit</div>
          <button
            onClick={() => setDemoOn((v) => !v)}
            className="rounded-sm border border-white/15 px-2.5 py-0.5 text-white/55 transition hover:border-white/40 hover:text-white"
          >
            {demoOn ? "Pause demo" : "Resume demo"}
          </button>
        </div>
      </header>

      <KaiBrain />

      <footer className="absolute bottom-0 left-0 right-0 z-10 flex flex-col items-center gap-3 px-4 pb-6 pt-3 pointer-events-none">
        <div className="font-mono text-[10px] uppercase tracking-[0.3em] text-white/30">
          tap a region to fire it manually
        </div>
        <div className="pointer-events-auto flex flex-wrap justify-center gap-1.5">
          {REGIONS.map((r) => (
            <button
              key={r.id}
              onClick={() => pulseRegion(r.id, 1.0, 2400)}
              className="font-mono rounded-sm border border-white/10 bg-black/40 px-2.5 py-1 text-[10px] uppercase tracking-[0.22em] text-white/55 backdrop-blur transition hover:text-white"
              style={
                {
                  ["--hover-color" as string]: `#${r.color.getHexString()}`,
                } as React.CSSProperties
              }
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
