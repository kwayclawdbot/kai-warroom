"use client";

import dynamic from "next/dynamic";
import { useEffect } from "react";
import { useAvatar } from "@/lib/avatar-store";

const AvatarStub = dynamic(
  () => import("@/components/AvatarStub").then((m) => m.AvatarStub),
  { ssr: false },
);

export default function Home() {
  const setEmotion = useAvatar((s) => s.setEmotion);
  const setIntensity = useAvatar((s) => s.setIntensity);
  const emotion = useAvatar((s) => s.emotion);
  const intensity = useAvatar((s) => s.intensity);

  // Temporary visual demo loop — real audio drives this in Task #6.
  useEffect(() => {
    let raf = 0;
    const start = performance.now();
    const tick = () => {
      const t = (performance.now() - start) / 1000;
      setIntensity(0.5 + 0.5 * Math.sin(t * 2.4));
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [setIntensity]);

  return (
    <main className="relative flex-1 overflow-hidden bg-black text-white">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_45%,rgba(80,200,255,0.12),transparent_60%)]" />

      <header className="absolute top-0 left-0 right-0 z-10 flex items-center justify-between p-6">
        <div className="text-xs uppercase tracking-[0.3em] text-white/50">
          Kai · War Room
        </div>
        <div className="text-xs text-white/40">Phase 1 scaffold</div>
      </header>

      <div className="absolute inset-0">
        <AvatarStub />
      </div>

      <footer className="absolute bottom-0 left-0 right-0 z-10 flex flex-col items-center gap-4 p-8">
        <div className="flex flex-wrap justify-center gap-2 text-xs">
          {(
            [
              "neutral",
              "hype",
              "bullish",
              "bearish",
              "teach",
              "warning",
              "chill",
            ] as const
          ).map((e) => (
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
          intensity {intensity.toFixed(2)} · avatar v2 lands in task #2
        </div>
      </footer>
    </main>
  );
}
