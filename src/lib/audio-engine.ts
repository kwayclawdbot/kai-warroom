// Audio playback + real-time frequency-band analysis for the brain visualizer.
//
// On each chat response, we:
//   1. Decode the base64 mp3 → Blob → object URL
//   2. Create an <Audio> element + MediaElementSourceNode bound to it
//   3. Pipe through a shared AnalyserNode → AudioContext.destination
//   4. raf-loop reads the analyser's frequency bins → splits into bass/mid/
//      treble → writes to the avatar store → drives the cloud glow
//
// AudioContext can only be created after a user gesture (autoplay policy).
// Callers must invoke `ensureAudioCtx()` synchronously from within an event
// handler the first time, or pass `resume: true` to `play()`.

import { useAvatar } from "./avatar-store";

class AudioEngine {
  private ctx: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private rafId: number | null = null;
  private currentSource: MediaElementAudioSourceNode | null = null;
  private currentAudio: HTMLAudioElement | null = null;
  private currentObjectUrl: string | null = null;

  private ensure() {
    if (this.ctx && this.analyser) {
      return { ctx: this.ctx, analyser: this.analyser };
    }
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new AC();
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 256;
    analyser.smoothingTimeConstant = 0.55;
    analyser.connect(ctx.destination);
    this.ctx = ctx;
    this.analyser = analyser;
    return { ctx, analyser };
  }

  async resume() {
    const { ctx } = this.ensure();
    if (ctx.state === "suspended") await ctx.resume();
  }

  /** Play an mp3 (base64 or url). Returns the audio element. */
  async play(
    audioBase64: string,
    mime: string = "audio/mpeg",
  ): Promise<HTMLAudioElement> {
    const { ctx, analyser } = this.ensure();
    if (ctx.state === "suspended") await ctx.resume();

    // Clean up previous playback.
    this.stop();

    // Decode base64 → Blob → object URL.
    const binary = atob(audioBase64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    const blob = new Blob([bytes], { type: mime });
    const url = URL.createObjectURL(blob);

    const audio = new Audio(url);
    audio.crossOrigin = "anonymous";

    const source = ctx.createMediaElementSource(audio);
    source.connect(analyser);

    this.currentAudio = audio;
    this.currentSource = source;
    this.currentObjectUrl = url;

    await audio.play();
    this.startBandReader();

    audio.addEventListener(
      "ended",
      () => {
        this.cleanupBands();
      },
      { once: true },
    );

    return audio;
  }

  /** Stop playback and reset bands. */
  stop() {
    if (this.currentAudio) {
      try {
        this.currentAudio.pause();
        this.currentAudio.currentTime = 0;
      } catch {
        /* ignore */
      }
    }
    if (this.currentSource) {
      try {
        this.currentSource.disconnect();
      } catch {
        /* ignore */
      }
    }
    if (this.currentObjectUrl) {
      try {
        URL.revokeObjectURL(this.currentObjectUrl);
      } catch {
        /* ignore */
      }
    }
    this.currentAudio = null;
    this.currentSource = null;
    this.currentObjectUrl = null;
    this.cleanupBands();
  }

  private cleanupBands() {
    this.stopBandReader();
    const s = useAvatar.getState();
    s.setIntensity(0);
    s.setBands(0, 0, 0);
  }

  private startBandReader() {
    if (!this.analyser || this.rafId !== null) return;
    const analyser = this.analyser;
    const data = new Uint8Array(analyser.frequencyBinCount);

    const tick = () => {
      analyser.getByteFrequencyData(data);
      // fftSize 256 @ 48kHz → 128 bins, ~187Hz each.
      // bass:    bin 0-3   (~0-750Hz)
      // mid:     bin 4-31  (~750-6000Hz)
      // treble:  bin 32-127 (~6kHz+)
      let bassSum = 0;
      let midSum = 0;
      let trebleSum = 0;
      for (let i = 0; i < 4; i++) bassSum += data[i];
      for (let i = 4; i < 32; i++) midSum += data[i];
      for (let i = 32; i < data.length; i++) trebleSum += data[i];
      const bass = bassSum / 4 / 255;
      const mid = midSum / 28 / 255;
      const treble = trebleSum / (data.length - 32) / 255;
      // Boost intensity slightly so quiet speech still drives glow visibly.
      const intensity = Math.min(1, bass * 0.6 + mid * 0.6 + treble * 0.3);

      const s = useAvatar.getState();
      s.setIntensity(intensity);
      s.setBands(bass, mid, treble);

      this.rafId = requestAnimationFrame(tick);
    };
    this.rafId = requestAnimationFrame(tick);
  }

  private stopBandReader() {
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
  }
}

export const audioEngine =
  typeof window !== "undefined" ? new AudioEngine() : null;

export type ChatResponse = {
  text: string;
  audio_base64: string;
  audio_mime: string;
  regions: Array<{
    id: string;
    peak: number;
    decay_ms: number;
    at_second: number;
  }>;
  duration_estimate_sec: number;
};
