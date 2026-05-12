"use client";

import dynamic from "next/dynamic";
import { useEffect, useRef, useState } from "react";
import { REGIONS, type RegionId } from "@/lib/brain-regions";
import { useAvatar } from "@/lib/avatar-store";
import { SPEECH_PROGRAM, speakingEnvelope } from "@/lib/speech-script";
import { audioEngine, type ChatResponse } from "@/lib/audio-engine";

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

const VALID_REGION_IDS = new Set<string>(REGIONS.map((r) => r.id));

export default function Home() {
  const setIntensity = useAvatar((s) => s.setIntensity);
  const setBands = useAvatar((s) => s.setBands);
  const startSpeaking = useAvatar((s) => s.startSpeaking);
  const stopSpeaking = useAvatar((s) => s.stopSpeaking);
  const pulseRegion = useAvatar((s) => s.pulseRegion);
  const clearRegions = useAvatar((s) => s.clearRegions);

  const [mode, setMode] = useState<DemoMode>("speaking");
  const [chatInput, setChatInput] = useState("");
  const [chatLoading, setChatLoading] = useState(false);
  const [chatPlaying, setChatPlaying] = useState(false);
  const [chatError, setChatError] = useState<string | null>(null);
  const [currentPhrase, setCurrentPhrase] = useState<string | null>(null);

  const modeRef = useRef(mode);
  modeRef.current = mode;
  const chatPlayingRef = useRef(chatPlaying);
  chatPlayingRef.current = chatPlaying;

  // ─── Thinking mode (suspended while chatting) ─────────────────────────
  useEffect(() => {
    if (mode !== "thinking" || chatPlaying) return;
    const timeouts: number[] = [];
    setIntensity(0);
    setBands(0, 0, 0);
    stopSpeaking();
    const runCycle = () => {
      for (const beat of ANALYSIS_SEQUENCE) {
        const id = window.setTimeout(() => {
          if (modeRef.current !== "thinking" || chatPlayingRef.current) return;
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
    chatPlaying,
    pulseRegion,
    clearRegions,
    setIntensity,
    setBands,
    stopSpeaking,
  ]);

  // ─── Speaking demo (suspended while chatting) ─────────────────────────
  useEffect(() => {
    if (mode !== "speaking" || chatPlaying) return;
    startSpeaking();

    let raf = 0;
    let entryIdx = 0;
    let entryStart = performance.now();
    const pulsedSet = new Set<number>();
    setCurrentPhrase(
      SPEECH_PROGRAM[0].kind === "phrase" ? SPEECH_PROGRAM[0].text : null,
    );

    const tick = () => {
      if (modeRef.current !== "speaking" || chatPlayingRef.current) return;
      const now = performance.now();
      const entry = SPEECH_PROGRAM[entryIdx];
      const elapsed = (now - entryStart) / 1000;

      if (elapsed >= entry.duration) {
        entryIdx = (entryIdx + 1) % SPEECH_PROGRAM.length;
        entryStart = now;
        pulsedSet.clear();
        const next = SPEECH_PROGRAM[entryIdx];
        setCurrentPhrase(next.kind === "phrase" ? next.text : null);
      } else if (entry.kind === "phrase") {
        const env = speakingEnvelope(elapsed);
        setIntensity(env.intensity);
        setBands(env.bass, env.mid, env.treble);
        entry.regions.forEach((r, i) => {
          if (!pulsedSet.has(i) && elapsed >= r.at * entry.duration) {
            pulsedSet.add(i);
            pulseRegion(r.id, r.peak, r.decayMs ?? 1800);
          }
        });
      } else {
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
    chatPlaying,
    setIntensity,
    setBands,
    startSpeaking,
    stopSpeaking,
    pulseRegion,
    clearRegions,
  ]);

  // ─── Off mode ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (mode !== "off" || chatPlaying) return;
    setIntensity(0);
    setBands(0, 0, 0);
    stopSpeaking();
    clearRegions();
    setCurrentPhrase(null);
  }, [
    mode,
    chatPlaying,
    setIntensity,
    setBands,
    stopSpeaking,
    clearRegions,
  ]);

  // ─── Chat send ────────────────────────────────────────────────────────
  async function handleSend(e?: React.FormEvent) {
    e?.preventDefault();
    if (!chatInput.trim() || chatLoading || chatPlaying || !audioEngine) return;
    const message = chatInput.trim();
    setChatInput("");
    setChatError(null);
    setChatLoading(true);
    // User gesture — safe to resume the AudioContext now.
    await audioEngine.resume();

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}) as { error?: string });
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }
      const data: ChatResponse = await res.json();

      // Switch to chat playback — pauses demos.
      setChatPlaying(true);
      clearRegions();
      setCurrentPhrase(data.text);
      startSpeaking();

      // Schedule region pulses at the timestamps the server estimated.
      const pulseTimeouts: number[] = [];
      data.regions.forEach((r) => {
        if (!VALID_REGION_IDS.has(r.id)) return;
        const id = window.setTimeout(() => {
          pulseRegion(r.id as RegionId, r.peak, r.decay_ms);
        }, Math.max(0, r.at_second * 1000));
        pulseTimeouts.push(id);
      });

      // Play audio — AnalyserNode in audio-engine drives intensity/bands.
      const audio = await audioEngine.play(
        data.audio_base64,
        data.audio_mime ?? "audio/mpeg",
      );
      audio.addEventListener(
        "ended",
        () => {
          for (const id of pulseTimeouts) window.clearTimeout(id);
          setChatPlaying(false);
          setCurrentPhrase(null);
          stopSpeaking();
        },
        { once: true },
      );
    } catch (err) {
      console.error("[chat]", err);
      setChatError(err instanceof Error ? err.message : "send failed");
      setChatPlaying(false);
      stopSpeaking();
    } finally {
      setChatLoading(false);
    }
  }

  return (
    <main className="relative flex-1 overflow-hidden bg-[#05080A] text-white">
      <header className="absolute top-0 left-0 right-0 z-10 flex items-start justify-between px-6 pt-5">
        <div className="font-mono text-[11px] uppercase tracking-[0.25em] text-amber-200/85">
          kai · brain
        </div>
        <div className="flex flex-col items-end gap-1 text-[10px] uppercase tracking-[0.2em] text-amber-200/70 font-mono">
          <div>v1.0 · scroll to zoom · drag to orbit</div>
          <button
            onClick={() => setMode(nextMode)}
            disabled={chatPlaying || chatLoading}
            className="rounded-sm border border-white/15 px-2.5 py-0.5 text-white/65 transition hover:border-white/40 hover:text-white disabled:opacity-40 disabled:hover:border-white/15"
          >
            {MODE_LABELS[mode]}
          </button>
        </div>
      </header>

      <KaiBrain />

      <footer className="absolute bottom-0 left-0 right-0 z-10 flex flex-col items-center gap-3 px-4 pb-6 pt-3 pointer-events-none">
        {/* Caption strip */}
        <div className="min-h-[2.5rem] max-w-3xl text-center font-mono text-[11px] uppercase tracking-[0.18em] text-amber-100/80 leading-relaxed pointer-events-none">
          {currentPhrase ?? ""}
        </div>

        {/* Chat input */}
        <form
          onSubmit={handleSend}
          className="pointer-events-auto flex w-full max-w-md items-stretch gap-2"
        >
          <input
            type="text"
            value={chatInput}
            onChange={(e) => setChatInput(e.target.value)}
            placeholder="ask Kai anything..."
            disabled={chatLoading || chatPlaying}
            className="flex-1 rounded-lg border border-white/10 bg-black/55 px-3.5 py-2 text-xs text-white/85 placeholder:text-white/30 outline-none focus:border-emerald-400/40 disabled:opacity-50"
            aria-label="message Kai"
          />
          <button
            type="submit"
            disabled={!chatInput.trim() || chatLoading || chatPlaying}
            className="rounded-lg border border-emerald-300/30 bg-emerald-400/15 px-3 text-[11px] uppercase tracking-[0.18em] text-emerald-200 transition hover:bg-emerald-400/25 disabled:cursor-not-allowed disabled:opacity-30"
          >
            {chatLoading ? "…" : chatPlaying ? "playing" : "send"}
          </button>
        </form>

        {chatError && (
          <div className="pointer-events-auto rounded-sm border border-red-500/30 bg-red-500/10 px-3 py-1 text-[10px] text-red-200">
            {chatError}
          </div>
        )}

        {/* Manual region triggers */}
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
