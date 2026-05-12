"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useRef, useState } from "react";
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

/** Pick the best MIME the browser supports for MediaRecorder. */
function pickRecorderMime(): string | undefined {
  if (typeof window === "undefined" || typeof MediaRecorder === "undefined") {
    return undefined;
  }
  const candidates = [
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/mp4",
    "audio/ogg;codecs=opus",
  ];
  for (const m of candidates) {
    if (MediaRecorder.isTypeSupported(m)) return m;
  }
  return undefined;
}

export default function Home() {
  const setIntensity = useAvatar((s) => s.setIntensity);
  const setBands = useAvatar((s) => s.setBands);
  const startSpeaking = useAvatar((s) => s.startSpeaking);
  const stopSpeaking = useAvatar((s) => s.stopSpeaking);
  const pulseRegion = useAvatar((s) => s.pulseRegion);
  const clearRegions = useAvatar((s) => s.clearRegions);

  const [mode, setMode] = useState<DemoMode>("off");
  const [chatInput, setChatInput] = useState("");
  const [chatLoading, setChatLoading] = useState(false);
  const [chatPlaying, setChatPlaying] = useState(false);
  const [chatError, setChatError] = useState<string | null>(null);
  const [currentPhrase, setCurrentPhrase] = useState<string | null>(null);

  // Mic / STT state.
  const [recording, setRecording] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const recorderRef = useRef<{
    stop: () => Promise<Blob>;
  } | null>(null);

  const modeRef = useRef(mode);
  modeRef.current = mode;
  const chatPlayingRef = useRef(chatPlaying);
  chatPlayingRef.current = chatPlaying;

  // ─── Demo loops (suspended while chatting / recording) ────────────────
  useEffect(() => {
    if (mode !== "thinking" || chatPlaying || recording) return;
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
    recording,
    pulseRegion,
    clearRegions,
    setIntensity,
    setBands,
    stopSpeaking,
  ]);

  useEffect(() => {
    if (mode !== "speaking" || chatPlaying || recording) return;
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
    recording,
    setIntensity,
    setBands,
    startSpeaking,
    stopSpeaking,
    pulseRegion,
    clearRegions,
  ]);

  useEffect(() => {
    if (mode !== "off" || chatPlaying || recording) return;
    setIntensity(0);
    setBands(0, 0, 0);
    stopSpeaking();
    clearRegions();
    setCurrentPhrase(null);
  }, [
    mode,
    chatPlaying,
    recording,
    setIntensity,
    setBands,
    stopSpeaking,
    clearRegions,
  ]);

  // ─── Send a message (text from input OR transcribed from mic) ─────────
  const sendMessage = useCallback(
    async (message: string) => {
      if (!message.trim() || chatLoading || chatPlaying || !audioEngine) return;
      setChatError(null);
      setChatLoading(true);
      await audioEngine.resume();

      try {
        const res = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message: message.trim() }),
        });
        if (!res.ok) {
          const body = await res
            .json()
            .catch(() => ({}) as { error?: string });
          throw new Error(body.error ?? `HTTP ${res.status}`);
        }
        const data: ChatResponse = await res.json();

        setChatPlaying(true);
        clearRegions();
        startSpeaking();

        const pulseTimeouts: number[] = [];
        data.regions.forEach((r) => {
          if (!VALID_REGION_IDS.has(r.id)) return;
          const id = window.setTimeout(() => {
            pulseRegion(r.id as RegionId, r.peak, r.decay_ms);
          }, Math.max(0, r.at_second * 1000));
          pulseTimeouts.push(id);
        });

        // play() resolves when the decoded buffer finishes — clean up there.
        audioEngine
          .play(data.audio_base64)
          .then(() => {
            for (const id of pulseTimeouts) window.clearTimeout(id);
            setChatPlaying(false);
            setCurrentPhrase(null);
            stopSpeaking();
          })
          .catch((err) => {
            console.error("[playback]", err);
            for (const id of pulseTimeouts) window.clearTimeout(id);
            setChatPlaying(false);
            setCurrentPhrase(null);
            stopSpeaking();
            setChatError(
              err instanceof Error ? err.message : "playback failed",
            );
          });
      } catch (err) {
        console.error("[chat]", err);
        setChatError(err instanceof Error ? err.message : "send failed");
        setChatPlaying(false);
        stopSpeaking();
      } finally {
        setChatLoading(false);
      }
    },
    [
      chatLoading,
      chatPlaying,
      clearRegions,
      pulseRegion,
      startSpeaking,
      stopSpeaking,
    ],
  );

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const msg = chatInput.trim();
    if (!msg) return;
    setChatInput("");
    void sendMessage(msg);
  }

  // ─── Mic: hold to record, release to transcribe + auto-send ───────────
  const startRecording = useCallback(async () => {
    if (
      recording ||
      transcribing ||
      chatLoading ||
      chatPlaying ||
      !audioEngine
    ) {
      return;
    }
    setChatError(null);
    try {
      // Simple constraints — Safari can silently mute the mic when
      // echoCancellation is true and the TTS audio is also active.
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const track = stream.getAudioTracks()[0];
      console.log(
        "[mic] track",
        track?.label,
        "enabled:",
        track?.enabled,
        "muted:",
        track?.muted,
        "readyState:",
        track?.readyState,
      );
      // Let MediaRecorder pick its own supported MIME — Safari can lie about
      // mp4 support in isTypeSupported but fails when you force it.
      const mr = new MediaRecorder(stream);
      const chunks: Blob[] = [];
      mr.ondataavailable = (e) => {
        console.log("[mic] data", e.data.size, "bytes");
        if (e.data.size > 0) chunks.push(e.data);
      };
      const stopPromise = new Promise<Blob>((resolve) => {
        mr.onstop = () => {
          const blob = new Blob(chunks, {
            type: mr.mimeType || "audio/webm",
          });
          stream.getTracks().forEach((t) => t.stop());
          resolve(blob);
        };
      });
      mr.start();
      console.log("[mic] started, recorder.mimeType =", mr.mimeType);

      recorderRef.current = {
        stop: () => {
          if (mr.state !== "inactive") mr.stop();
          return stopPromise;
        },
      };
      // Pipe mic through the audio engine's analyser so the brain reacts
      // to the user's voice while recording.
      await audioEngine.resume();
      audioEngine.startMic(stream);
      setRecording(true);
    } catch (err) {
      console.error("[mic]", err);
      const msg = err instanceof Error ? err.message : "mic access failed";
      setChatError(msg.includes("denied") ? "Mic access denied" : msg);
    }
  }, [chatLoading, chatPlaying, recording, transcribing]);

  const stopRecording = useCallback(async () => {
    const handle = recorderRef.current;
    if (!handle) return;
    recorderRef.current = null;
    setRecording(false);
    audioEngine?.stopMic();

    let blob: Blob;
    try {
      blob = await handle.stop();
    } catch (err) {
      console.error("[mic stop]", err);
      setChatError("recording failed");
      return;
    }
    if (blob.size < 1500) return; // ~120ms — too short, ignore taps

    setTranscribing(true);
    try {
      const form = new FormData();
      // Use the blob's actual MIME-derived extension so the server reads it
      // as the correct format. Safari produces audio/mp4; Chrome audio/webm.
      const ext = blob.type.includes("mp4")
        ? "mp4"
        : blob.type.includes("ogg")
          ? "ogg"
          : blob.type.includes("wav")
            ? "wav"
            : "webm";
      form.append("audio", blob, `mic.${ext}`);
      console.log("[mic] blob", blob.type, blob.size, "ext", ext);
      const res = await fetch("/api/transcribe", {
        method: "POST",
        body: form,
      });
      if (!res.ok) {
        const body = await res
          .json()
          .catch(() => ({}) as { error?: string });
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }
      const data: { text?: string } = await res.json();
      const text = (data.text ?? "").trim();
      setTranscribing(false);
      if (!text) {
        setChatError("didn't catch that — try again");
        return;
      }
      // Filter the most common Whisper silence-hallucinations only.
      const lower = text.toLowerCase().replace(/[.!?,]/g, "").trim();
      if (
        lower === "thanks for watching" ||
        lower === "thank you for watching" ||
        lower === "you" ||
        lower.length < 2
      ) {
        setChatError(`heard "${text}" — didn't catch real speech, try again`);
        return;
      }
      void sendMessage(text);
    } catch (err) {
      console.error("[transcribe]", err);
      setChatError(err instanceof Error ? err.message : "transcribe failed");
      setTranscribing(false);
    }
  }, [sendMessage]);

  // Spacebar = push-to-talk (when not focused in input).
  useEffect(() => {
    function isTypingTarget(el: EventTarget | null) {
      const node = el as HTMLElement | null;
      if (!node) return false;
      const tag = node.tagName;
      return (
        tag === "INPUT" ||
        tag === "TEXTAREA" ||
        node.isContentEditable === true
      );
    }
    function onDown(e: KeyboardEvent) {
      if (e.code !== "Space" || e.repeat) return;
      if (isTypingTarget(e.target)) return;
      e.preventDefault();
      void startRecording();
    }
    function onUp(e: KeyboardEvent) {
      if (e.code !== "Space") return;
      if (isTypingTarget(e.target)) return;
      e.preventDefault();
      void stopRecording();
    }
    window.addEventListener("keydown", onDown);
    window.addEventListener("keyup", onUp);
    return () => {
      window.removeEventListener("keydown", onDown);
      window.removeEventListener("keyup", onUp);
    };
  }, [startRecording, stopRecording]);

  const micDisabled =
    chatLoading || chatPlaying || transcribing;
  const micActiveLabel = transcribing
    ? "thinking…"
    : recording
      ? "listening…"
      : chatPlaying
        ? "speaking"
        : chatLoading
          ? "loading"
          : "hold to talk · or hit space";

  return (
    <main className="relative flex-1 overflow-hidden bg-[#05080A] text-white">
      <header className="absolute top-0 left-0 right-0 z-10 flex items-start justify-between px-6 pt-5">
        <div className="font-mono text-[11px] uppercase tracking-[0.25em] text-amber-200/85">
          kai · brain
        </div>
        <div className="flex flex-col items-end gap-1 text-[10px] uppercase tracking-[0.2em] text-amber-200/70 font-mono">
          <div>v1.1 · hold mic or space to talk</div>
          <button
            onClick={() => setMode(nextMode)}
            disabled={chatPlaying || chatLoading || recording || transcribing}
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

        {/* Mic button (push-to-talk) */}
        <div className="pointer-events-auto flex flex-col items-center gap-2">
          <button
            type="button"
            aria-label="hold to talk to Kai"
            disabled={micDisabled}
            onPointerDown={(e) => {
              e.preventDefault();
              void startRecording();
            }}
            onPointerUp={(e) => {
              e.preventDefault();
              void stopRecording();
            }}
            onPointerLeave={() => {
              if (recording) void stopRecording();
            }}
            onContextMenu={(e) => e.preventDefault()}
            className={`relative h-16 w-16 rounded-full flex items-center justify-center border transition-all select-none ${
              recording
                ? "bg-red-500/20 border-red-400/60 text-red-200 scale-110 shadow-[0_0_30px_rgba(248,113,113,0.45)]"
                : transcribing
                  ? "bg-amber-400/15 border-amber-300/40 text-amber-200"
                  : micDisabled
                    ? "bg-white/5 border-white/15 text-white/30 cursor-not-allowed"
                    : "bg-emerald-400/10 border-emerald-300/30 text-emerald-200 hover:bg-emerald-400/20 hover:scale-105"
            }`}
          >
            {recording && (
              <span className="absolute inset-0 rounded-full border border-red-400/40 animate-ping" />
            )}
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
              className="h-7 w-7 relative"
              aria-hidden
            >
              <rect x="9" y="3" width="6" height="12" rx="3" />
              <path d="M5 11a7 7 0 0 0 14 0" />
              <line x1="12" y1="18" x2="12" y2="22" />
              <line x1="8" y1="22" x2="16" y2="22" />
            </svg>
          </button>
          <div className="font-mono text-[10px] uppercase tracking-[0.25em] text-white/50">
            {micActiveLabel}
          </div>
        </div>

        {/* Chat input — text fallback */}
        <form
          onSubmit={handleSubmit}
          className="pointer-events-auto flex w-full max-w-md items-stretch gap-2"
        >
          <input
            type="text"
            value={chatInput}
            onChange={(e) => setChatInput(e.target.value)}
            placeholder="or type and Kai will speak the reply…"
            disabled={chatLoading || chatPlaying || recording || transcribing}
            className="flex-1 rounded-lg border border-white/10 bg-black/55 px-3.5 py-2 text-xs text-white/85 placeholder:text-white/30 outline-none focus:border-emerald-400/40 disabled:opacity-50"
            aria-label="message Kai"
          />
          <button
            type="submit"
            disabled={
              !chatInput.trim() ||
              chatLoading ||
              chatPlaying ||
              recording ||
              transcribing
            }
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
