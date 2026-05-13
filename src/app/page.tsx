"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useRef, useState } from "react";
import { REGIONS, type RegionId } from "@/lib/brain-regions";
import { useAvatar } from "@/lib/avatar-store";
import { SPEECH_PROGRAM, speakingEnvelope } from "@/lib/speech-script";
import { audioEngine } from "@/lib/audio-engine";
import { PanelHost, type PanelHostHandle } from "@/components/panel/PanelHost";

// Tool-name → region mapping mirrors the server-side map in
// src/app/api/chat/route.ts so we can pulse a region the instant a
// `tool_start` event arrives, without waiting for the final region schedule.
function toolToRegion(toolName: string): RegionId | null {
  const n = toolName.toLowerCase();
  if (/(memor|recall|vault|history)/.test(n)) return "memory";
  if (/(sector|market|regime|macro|tape|index)/.test(n)) return "market";
  if (/(chart|snapshot|ticker|breakout|technical|score|pattern|level)/.test(n))
    return "technicals";
  if (/(alert|signal|winner)/.test(n)) return "alerts";
  if (/(watchlist|saved|fav)/.test(n)) return "watchlist";
  if (/(user|community|pulse|chatter|subscriber|sentiment)/.test(n))
    return "users";
  if (/(news|headline|story)/.test(n)) return "news";
  if (/(option|flow|unusual|chain|strike)/.test(n)) return "options";
  return null;
}

type ChatStreamEvent =
  | { type: "tool_start"; name: string; args?: unknown }
  | { type: "tool_end"; name: string; duration_ms: number }
  | { type: "text"; text: string }
  | {
      type: "regions";
      regions: Array<{
        id: string;
        peak: number;
        decay_ms: number;
        at_second: number;
      }>;
      duration_estimate_sec: number;
    }
  | { type: "audio_chunk"; index: number; base64: string; mime: string; text: string }
  | { type: "filler"; id: string; url: string }
  | { type: "done"; chunks: number }
  | { type: "error"; message: string };

/** Fetch a static filler mp3 and base64-encode it for the audio queue. */
async function fetchFillerBase64(url: string): Promise<string> {
  const res = await fetch(url, { cache: "force-cache" });
  if (!res.ok) throw new Error(`filler fetch ${res.status}`);
  const buf = await res.arrayBuffer();
  // Browser-safe base64 encode of an ArrayBuffer.
  let binary = "";
  const bytes = new Uint8Array(buf);
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode.apply(
      null,
      Array.from(bytes.subarray(i, i + chunkSize)),
    );
  }
  return btoa(binary);
}

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

  // Multi-panel host — Kai materializes tabs in here when he wants to show
  // data (chart, quote card, news, earnings, options chain). Each panel
  // animates in as a tab + body; multiple coexist; user can close any.
  const panelHostRef = useRef<PanelHostHandle | null>(null);

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
      // Demo loops cancel themselves via the chatPlaying / recording guards
      // in their effect bodies — but we also flip mode to "off" so users
      // don't see the demo state stuck in the header during a real turn.
      if (modeRef.current !== "off") setMode("off");

      setChatError(null);
      setChatLoading(true);
      clearRegions();
      await audioEngine.resume();

      // Queue of audio chunks streamed in from the server. A single async
      // task drains the queue and plays them sequentially through the audio
      // engine; the server may still be rendering later sentences while the
      // first sentence is playing.
      const audioQueue: Array<{ base64: string; text: string }> = [];
      const streamState = { ended: false };

      const engine = audioEngine;
      const drainAudioQueue = async () => {
        try {
          while (true) {
            const next = audioQueue.shift();
            if (!next) {
              if (streamState.ended) break;
              await new Promise((r) => setTimeout(r, 30));
              continue;
            }
            if (!chatPlayingRef.current) {
              setChatPlaying(true);
              startSpeaking();
            }
            setCurrentPhrase(next.text);
            try {
              await engine.play(next.base64);
            } catch (err) {
              console.error("[playback chunk]", err);
            }
          }
        } finally {
          setChatPlaying(false);
          setCurrentPhrase(null);
          stopSpeaking();
        }
      };
      const playerTask = drainAudioQueue();

      try {
        // Snapshot what's currently on Kway's panels so Kai can see them.
        // Chart state lives inside PanelHost — and we also pass the list of
        // open panel types so Kai doesn't reopen a panel that's already up.
        const host = panelHostRef.current;
        const chartHandle = host?.getChartHandle() ?? null;
        const openPanels = host?.getOpenPanelTypes() ?? [];
        const chartCore = chartHandle ? chartHandle.getState() : null;
        const chartState =
          openPanels.length === 0
            ? null
            : { ...(chartCore ?? {}), open_panels: openPanels };
        const res = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            message: message.trim(),
            chart_state: chartState,
          }),
        });
        if (!res.ok || !res.body) {
          const body = await res
            .json()
            .catch(() => ({}) as { error?: string });
          throw new Error(body.error ?? `HTTP ${res.status}`);
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buf = "";

        // Stream pump: parse NDJSON line by line. Tool events pulse regions
        // immediately; audio chunks queue for the player; `done` ends the
        // stream loop.
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          buf += decoder.decode(value, { stream: true });

          let nl = buf.indexOf("\n");
          while (nl !== -1) {
            const line = buf.slice(0, nl).trim();
            buf = buf.slice(nl + 1);
            nl = buf.indexOf("\n");
            if (!line) continue;
            let evt: ChatStreamEvent;
            try {
              evt = JSON.parse(line) as ChatStreamEvent;
            } catch {
              console.warn("[chat] bad ndjson line:", line.slice(0, 120));
              continue;
            }
            switch (evt.type) {
              case "tool_start": {
                const region = toolToRegion(evt.name);
                if (region) pulseRegion(region, 0.9, 2200);
                const n = evt.name.toLowerCase();
                type Level = {
                  price: number;
                  label: string;
                  color: "support" | "resistance" | "neutral";
                };
                type PanelTypeArg =
                  | "chart"
                  | "quote_card"
                  | "news"
                  | "earnings"
                  | "options_chain";
                const args = evt.args as
                  | {
                      ticker?: string;
                      symbol?: string;
                      price?: number;
                      label?: string;
                      color?: "support" | "resistance" | "neutral";
                      levels?: Level[];
                      // toggle_chart_overlay
                      layer?: "heatmap" | "ema_clouds" | "reversal_bands";
                      on?: boolean;
                      // draw_fib_retracement
                      high?: number;
                      low?: number;
                      // draw_trend_line
                      start_date?: string;
                      start_price?: number;
                      end_date?: string;
                      end_price?: number;
                      // panel control
                      panel_type?: PanelTypeArg;
                      expiry?: string;
                    }
                  | undefined;

                const host = panelHostRef.current;
                const ensureChart = (ticker?: string) => {
                  host?.openPanel("chart", ticker ? { ticker } : {});
                  if (ticker) host?.getChartHandle()?.setTicker(ticker);
                };

                // ──────────────────────────────────────────────────────────
                // PANEL CONTROL tools (new — explicit open/close).
                // ──────────────────────────────────────────────────────────
                if (n === "show_quote_card") {
                  host?.openPanel("quote_card", { ticker: args?.ticker });
                  break;
                }
                if (n === "show_news_panel") {
                  host?.openPanel("news", { ticker: args?.ticker });
                  break;
                }
                if (n === "show_earnings_panel") {
                  host?.openPanel("earnings", { ticker: args?.ticker });
                  break;
                }
                if (n === "show_options_chain") {
                  host?.openPanel("options_chain", {
                    ticker: args?.ticker,
                    expiry: args?.expiry,
                  });
                  break;
                }
                if (n === "close_panel") {
                  if (args?.panel_type) host?.closePanel(args.panel_type);
                  break;
                }
                if (n === "close_all_panels") {
                  host?.closeAll();
                  break;
                }

                // ──────────────────────────────────────────────────────────
                // Implicit chart panel triggers + existing chart-tool wires.
                // ──────────────────────────────────────────────────────────
                if (
                  /(chart|ticker|snapshot|level|technical|score|breakout|pattern)/.test(
                    n,
                  )
                ) {
                  ensureChart(args?.ticker ?? args?.symbol);
                }
                if (
                  /(^|_)(mark_chart_levels|draw_levels|set_chart_levels)$/.test(
                    n,
                  )
                ) {
                  ensureChart(args?.ticker);
                  if (Array.isArray(args?.levels)) {
                    args!.levels!.forEach((lvl, i) => {
                      if (typeof lvl?.price !== "number") return;
                      setTimeout(() => {
                        host?.getChartHandle()?.drawPriceLine(
                          lvl.price,
                          lvl.label ?? `${lvl.price}`,
                          lvl.color ?? "neutral",
                        );
                      }, i * 700);
                    });
                  }
                }
                if (
                  /(^|_)(draw_line|draw_price_line|mark_level|add_level)$/.test(
                    n,
                  )
                ) {
                  if (typeof args?.price === "number") {
                    ensureChart(args?.ticker);
                    host?.getChartHandle()?.drawPriceLine(
                      args.price,
                      args.label ?? `${args.price}`,
                      args.color ?? "neutral",
                    );
                  }
                }
                if (
                  /(^|_)(remove_chart_level|remove_level|clear_level)$/.test(n)
                ) {
                  const label =
                    typeof args?.label === "string" ? args.label : undefined;
                  if (label) host?.getChartHandle()?.removePriceLine(label);
                }
                if (/(^|_)(clear_chart|clear_annotations|reset_chart)$/.test(n)) {
                  host?.getChartHandle()?.clearAnnotations();
                }
                if (/(^|_)toggle_chart_overlay$/.test(n)) {
                  const c = host?.getChartHandle();
                  const layer = args?.layer;
                  const on = args?.on;
                  if (c && layer && typeof on === "boolean") {
                    if (layer === "heatmap") c.setHeatmap(on);
                    else if (layer === "ema_clouds") c.setEmaClouds(on);
                    else if (layer === "reversal_bands") c.setReversalBands(on);
                  }
                }
                if (/(^|_)draw_fib_retracement$/.test(n)) {
                  const hi = typeof args?.high === "number" ? args.high : NaN;
                  const lo = typeof args?.low === "number" ? args.low : NaN;
                  if (Number.isFinite(hi) && Number.isFinite(lo) && hi > lo) {
                    ensureChart(args?.ticker);
                    const prefix =
                      typeof args?.label === "string" && args.label.trim()
                        ? args.label.trim()
                        : "fib";
                    host?.getChartHandle()?.drawFibRetracement(hi, lo, prefix);
                  }
                }
                if (/(^|_)clear_fib_retracement$/.test(n)) {
                  host?.getChartHandle()?.clearFibRetracement();
                }
                if (/(^|_)draw_trend_line$/.test(n)) {
                  const sd = args?.start_date;
                  const ed = args?.end_date;
                  const sp =
                    typeof args?.start_price === "number"
                      ? args.start_price
                      : NaN;
                  const ep =
                    typeof args?.end_price === "number" ? args.end_price : NaN;
                  const label =
                    typeof args?.label === "string" ? args.label : "";
                  if (
                    sd &&
                    ed &&
                    label &&
                    Number.isFinite(sp) &&
                    Number.isFinite(ep)
                  ) {
                    ensureChart(args?.ticker);
                    host?.getChartHandle()?.drawTrendLine(
                      { time: sd, price: sp },
                      { time: ed, price: ep },
                      label,
                      args?.color ?? "neutral",
                    );
                  }
                }
                if (/(^|_)remove_trend_line$/.test(n)) {
                  const label =
                    typeof args?.label === "string" ? args.label : undefined;
                  if (label) host?.getChartHandle()?.removeTrendLine(label);
                }
                break;
              }
              case "tool_end":
                break;
              case "text":
                // Reserved for future caption hand-off; currently the per-
                // chunk `text` field drives the caption strip.
                break;
              case "regions":
                // Fallback: if no tool_start events fired (e.g. cache hit),
                // play out the scheduled regions so the avatar still moves.
                if (evt.regions.length > 0) {
                  evt.regions.forEach((r) => {
                    if (!VALID_REGION_IDS.has(r.id)) return;
                    window.setTimeout(
                      () => pulseRegion(r.id as RegionId, r.peak, r.decay_ms),
                      Math.max(0, r.at_second * 1000),
                    );
                  });
                }
                break;
              case "audio_chunk":
                audioQueue.push({ base64: evt.base64, text: evt.text });
                break;
              case "filler": {
                // Fetch the static mp3 and queue it BEFORE any real audio
                // chunks. Fire-and-forget — the player loop polls the queue
                // every 30ms, so as soon as the filler resolves it plays.
                const url = evt.url;
                void fetchFillerBase64(url)
                  .then((base64) => {
                    audioQueue.push({ base64, text: "" });
                  })
                  .catch((err) => {
                    // Filler is best-effort latency-cover. Failure is silent
                    // — the real reply will still arrive.
                    console.warn("[filler]", err);
                  });
                break;
              }
              case "done":
                streamState.ended = true;
                break;
              case "error":
                throw new Error(evt.message);
            }
          }
        }
        // Flush any trailing partial line.
        const tail = buf.trim();
        if (tail) {
          try {
            const evt = JSON.parse(tail) as ChatStreamEvent;
            if (evt.type === "audio_chunk") {
              audioQueue.push({ base64: evt.base64, text: evt.text });
            }
          } catch {
            /* ignore */
          }
        }
        streamState.ended = true;
      } catch (err) {
        console.error("[chat]", err);
        streamState.ended = true;
        setChatError(err instanceof Error ? err.message : "send failed");
      } finally {
        setChatLoading(false);
      }

      // Wait until the player has drained the queue (or settled on error).
      await playerTask;
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
          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                const host = panelHostRef.current;
                if (!host) return;
                // Toggle the chart panel. If anything is open at all and the
                // chart is in there, close it; otherwise open it.
                if (host.getOpenPanelTypes().includes("chart")) {
                  host.closePanel("chart");
                } else {
                  host.openPanel("chart");
                }
              }}
              className="rounded-sm border border-white/15 px-2.5 py-0.5 text-white/65 transition hover:border-white/40 hover:text-white"
            >
              chart
            </button>
            <button
              onClick={() => setMode(nextMode)}
              disabled={chatPlaying || chatLoading || recording || transcribing}
              className="rounded-sm border border-white/15 px-2.5 py-0.5 text-white/65 transition hover:border-white/40 hover:text-white disabled:opacity-40 disabled:hover:border-white/15"
            >
              {MODE_LABELS[mode]}
            </button>
          </div>
        </div>
      </header>

      <KaiBrain />

      {/* Multi-panel host — slides in from the right when ANY panel is open.
          Kai materializes tabs by calling openPanel; user closes via tab X.
          The chart panel keeps its imperative handle via getChartHandle(). */}
      <PanelHost ref={panelHostRef} defaultTicker="NVDA" />

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
