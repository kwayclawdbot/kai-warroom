"use client";

import dynamic from "next/dynamic";
import { useEffect, useRef, useState } from "react";
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

export default function Home() {
  const setEmotion = useAvatar((s) => s.setEmotion);
  const setIntensity = useAvatar((s) => s.setIntensity);
  const setBands = useAvatar((s) => s.setBands);
  const startSpeaking = useAvatar((s) => s.startSpeaking);
  const stopSpeaking = useAvatar((s) => s.stopSpeaking);
  const emotion = useAvatar((s) => s.emotion);
  const speaking = useAvatar((s) => s.speaking);

  const [demoOn, setDemoOn] = useState(true);
  const demoOnRef = useRef(demoOn);
  demoOnRef.current = demoOn;

  // Synthetic 3-band reactivity until Task #6 wires real audio.
  // Bass = slow heavy thump, mid = breathy oscillation, treble = sharp spikes.
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
      // Overall intensity rides a slow + fast wave.
      const i = 0.55 + 0.35 * Math.sin(t * 1.9) + 0.1 * Math.sin(t * 9.0);
      setIntensity(i);
      // Bass: heavy slow pulse — like a kick drum every ~1.2s.
      const bass = Math.pow(Math.max(0, Math.sin(t * 5.2)), 4) * 0.95;
      // Mid: continuous voice-band oscillation.
      const mid = 0.4 + 0.45 * (0.5 + 0.5 * Math.sin(t * 4.7 + 1.3));
      // Treble: random spikes every ~200-450ms that decay quickly.
      if (performance.now() - start > nextSpike) {
        trebleSpike = 0.65 + Math.random() * 0.35;
        nextSpike += 200 + Math.random() * 250;
      }
      trebleSpike *= 0.86;
      setBands(bass, mid, trebleSpike);
      if (demoOnRef.current) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [demoOn, setIntensity, setBands, startSpeaking, stopSpeaking]);

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

      <footer className="absolute bottom-0 left-0 right-0 z-10 flex flex-col items-center gap-4 p-8">
        <div className="flex flex-wrap justify-center gap-2 text-xs">
          {EMOTIONS.map((e) => (
            <button
              key={e}
              onClick={() => setEmotion(e)}
              className={`rounded-full border px-3 py-1 transition ${
                emotion === e
                  ? "border-cyan-300 bg-cyan-300/20 text-cyan-100"
                  : "border-white/15 text-white/60 hover:border-white/40 hover:text-white"
              }`}
            >
              {e}
            </button>
          ))}
        </div>
        <div className="text-[10px] uppercase tracking-[0.3em] text-white/30">
          {speaking ? "speaking" : "idle"} · synthetic audio · real mic in task #6
        </div>
      </footer>
    </main>
  );
}
