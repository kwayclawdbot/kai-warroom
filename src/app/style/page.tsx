"use client";

import dynamic from "next/dynamic";
import { useEffect, useRef, useState } from "react";
import { REGIONS, type RegionId } from "@/lib/brain-regions";
import { useAvatar } from "@/lib/avatar-store";
import { VARIANTS, type VariantId } from "@/lib/cloud-variants";

const NeuralAvatar = dynamic(
  () => import("@/components/NeuralAvatar").then((m) => m.NeuralAvatar),
  { ssr: false },
);

const VARIANT_LIST: VariantId[] = ["lobes", "cortex", "aurora"];

type ThoughtBeat = { at: number; id: RegionId; peak: number; decayMs: number };
const ANALYSIS_SEQUENCE: ThoughtBeat[] = [
  { at: 0.0, id: "memory", peak: 0.9, decayMs: 1600 },
  { at: 0.9, id: "market", peak: 0.8, decayMs: 2400 },
  { at: 2.1, id: "news", peak: 0.7, decayMs: 1800 },
  { at: 3.0, id: "technicals", peak: 1.0, decayMs: 3000 },
  { at: 4.6, id: "alerts", peak: 0.8, decayMs: 2200 },
  { at: 5.9, id: "options", peak: 0.65, decayMs: 1700 },
  { at: 7.0, id: "users", peak: 0.55, decayMs: 1500 },
  { at: 8.0, id: "watchlist", peak: 0.7, decayMs: 1700 },
  // Conclusion peak.
  { at: 9.4, id: "technicals", peak: 0.95, decayMs: 2400 },
  { at: 9.5, id: "alerts", peak: 0.9, decayMs: 2400 },
  { at: 9.6, id: "market", peak: 0.8, decayMs: 2400 },
];
const SEQUENCE_PERIOD_MS = 13000;

export default function StylePage() {
  const [variant, setVariant] = useState<VariantId>("lobes");
  const [showLabels, setShowLabels] = useState(true);
  const [demoOn, setDemoOn] = useState(true);
  const demoOnRef = useRef(demoOn);
  demoOnRef.current = demoOn;

  const setIntensity = useAvatar((s) => s.setIntensity);
  const setBands = useAvatar((s) => s.setBands);
  const startSpeaking = useAvatar((s) => s.startSpeaking);
  const stopSpeaking = useAvatar((s) => s.stopSpeaking);
  const pulseRegion = useAvatar((s) => s.pulseRegion);
  const clearRegions = useAvatar((s) => s.clearRegions);

  // Audio band demo (drives ambient breathing on every variant).
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
    let nextSpike = 220;
    const tick = () => {
      const t = (performance.now() - start) / 1000;
      const i = 0.5 + 0.32 * Math.sin(t * 1.7) + 0.1 * Math.sin(t * 8.0);
      setIntensity(i);
      const bass = Math.pow(Math.max(0, Math.sin(t * 4.4)), 4) * 0.92;
      const mid = 0.35 + 0.45 * (0.5 + 0.5 * Math.sin(t * 4.1 + 1.3));
      if (performance.now() - start > nextSpike) {
        trebleSpike = 0.6 + Math.random() * 0.35;
        nextSpike += 220 + Math.random() * 280;
      }
      trebleSpike *= 0.86;
      setBands(bass, mid, trebleSpike);
      if (demoOnRef.current) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [demoOn, setIntensity, setBands, startSpeaking, stopSpeaking]);

  // Thought-sequence loop.
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

  const config = VARIANTS[variant];

  return (
    <main className="relative flex-1 overflow-hidden bg-black text-white">
      <header className="absolute top-0 left-0 right-0 z-20 flex items-start justify-between p-5">
        <div>
          <div className="text-[10px] uppercase tracking-[0.3em] text-white/40">
            Kai · War Room · Pick a style
          </div>
          <div className="mt-2 flex gap-1.5">
            {VARIANT_LIST.map((id) => (
              <button
                key={id}
                onClick={() => setVariant(id)}
                className={`rounded-full border px-3 py-1 text-xs uppercase tracking-[0.18em] transition ${
                  variant === id
                    ? "border-cyan-300 bg-cyan-300/15 text-cyan-100"
                    : "border-white/15 text-white/55 hover:border-white/40 hover:text-white"
                }`}
              >
                {VARIANTS[id].name}
              </button>
            ))}
          </div>
        </div>
        <div className="flex flex-col items-end gap-1.5 text-[10px] uppercase tracking-[0.2em] text-white/40">
          <button
            onClick={() => setShowLabels((v) => !v)}
            className="rounded-full border border-white/15 px-3 py-1 transition hover:border-white/40 hover:text-white"
          >
            {showLabels ? "Hide labels" : "Show labels"}
          </button>
          <button
            onClick={() => setDemoOn((v) => !v)}
            className="rounded-full border border-white/15 px-3 py-1 transition hover:border-white/40 hover:text-white"
          >
            {demoOn ? "Pause demo" : "Resume demo"}
          </button>
        </div>
      </header>

      <NeuralAvatar variant={variant} showLabels={showLabels} />

      <section className="absolute bottom-0 left-0 right-0 z-20 flex flex-col items-center gap-3 p-6">
        <div className="max-w-md text-center">
          <div className="text-xs uppercase tracking-[0.3em] text-white/50">
            {config.name} · {config.tagline}
          </div>
          <p className="mt-1 text-[11px] leading-snug text-white/40">
            {config.description}
          </p>
        </div>
        <div className="flex flex-wrap justify-center gap-1.5">
          {REGIONS.map((r) => (
            <button
              key={r.id}
              onClick={() => pulseRegion(r.id, 1.0, 2400)}
              className="rounded-full border border-white/10 bg-black/40 px-2.5 py-1 text-[10px] uppercase tracking-[0.18em] text-white/55 backdrop-blur transition hover:border-white/40 hover:text-white"
            >
              <span
                className="mr-1.5 inline-block h-1.5 w-1.5 rounded-full align-middle"
                style={{
                  background: `#${r.color.getHexString()}`,
                  boxShadow: `0 0 8px #${r.color.getHexString()}`,
                }}
              />
              {r.label}
            </button>
          ))}
        </div>
      </section>
    </main>
  );
}
