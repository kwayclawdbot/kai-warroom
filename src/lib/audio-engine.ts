// Audio playback + mic capture + real-time frequency-band analysis for the
// brain visualizer.
//
// Single AnalyserNode shared between playback (TTS) and capture (mic). Each
// audio source routes to the analyser separately; playback sources also
// route to destination (so we hear them), mic sources do NOT (no feedback).
//
// AudioContext can only be created after a user gesture (browser autoplay
// policy). Callers must invoke `resume()` from within an event handler the
// first time.

import { useAvatar } from "./avatar-store";

class AudioEngine {
  private ctx: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private rafId: number | null = null;

  // Playback (TTS).
  private currentSource: MediaElementAudioSourceNode | null = null;
  private currentAudio: HTMLAudioElement | null = null;
  private currentObjectUrl: string | null = null;

  // Mic capture.
  private currentMicSource: MediaStreamAudioSourceNode | null = null;
  private currentMicStream: MediaStream | null = null;

  private ensure() {
    if (this.ctx && this.analyser) {
      return { ctx: this.ctx, analyser: this.analyser };
    }
    const AC =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext;
    const ctx = new AC();
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 256;
    analyser.smoothingTimeConstant = 0.55;
    // NOTE: analyser is NOT connected to destination. Each playback source
    // wires itself to both analyser and destination separately. Mic sources
    // wire only to analyser — no feedback to speakers.
    this.ctx = ctx;
    this.analyser = analyser;
    return { ctx, analyser };
  }

  async resume() {
    const { ctx } = this.ensure();
    if (ctx.state === "suspended") await ctx.resume();
  }

  /** Play an mp3 (base64). AnalyserNode drives the avatar bands. */
  async play(
    audioBase64: string,
    mime: string = "audio/mpeg",
  ): Promise<HTMLAudioElement> {
    const { ctx, analyser } = this.ensure();
    if (ctx.state === "suspended") await ctx.resume();

    this.stop();
    this.stopMic();

    const binary = atob(audioBase64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    const blob = new Blob([bytes], { type: mime });
    const url = URL.createObjectURL(blob);

    const audio = new Audio(url);
    audio.crossOrigin = "anonymous";

    const source = ctx.createMediaElementSource(audio);
    source.connect(analyser);
    source.connect(ctx.destination); // route to speakers too

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
    if (!this.currentMicSource) this.cleanupBands();
  }

  /**
   * Pipe a live mic stream through the analyser so the brain reacts to the
   * user's voice while recording. Does NOT route to destination — no feedback.
   */
  startMic(stream: MediaStream) {
    const { ctx, analyser } = this.ensure();
    if (ctx.state === "suspended") void ctx.resume();
    this.stopMic();
    this.stop();

    const src = ctx.createMediaStreamSource(stream);
    src.connect(analyser);
    this.currentMicSource = src;
    this.currentMicStream = stream;
    this.startBandReader();
  }

  stopMic() {
    if (this.currentMicSource) {
      try {
        this.currentMicSource.disconnect();
      } catch {
        /* ignore */
      }
      this.currentMicSource = null;
    }
    if (this.currentMicStream) {
      this.currentMicStream.getTracks().forEach((t) => t.stop());
      this.currentMicStream = null;
    }
    if (!this.currentSource) this.cleanupBands();
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
      // fftSize 256 → 128 bins. Approximate vocal bands:
      // bass:    bin 0-3   (~0-750Hz)
      // mid:     bin 4-31  (~750-6000Hz)
      // treble:  bin 32+   (~6kHz+)
      let bassSum = 0;
      let midSum = 0;
      let trebleSum = 0;
      for (let i = 0; i < 4; i++) bassSum += data[i];
      for (let i = 4; i < 32; i++) midSum += data[i];
      for (let i = 32; i < data.length; i++) trebleSum += data[i];
      const bass = bassSum / 4 / 255;
      const mid = midSum / 28 / 255;
      const treble = trebleSum / (data.length - 32) / 255;
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
