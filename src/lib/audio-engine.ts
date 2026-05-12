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

  // Playback (TTS). AudioBufferSourceNode is used (not <Audio> +
  // MediaElementSource) because Safari refuses to play an Audio element
  // when the gesture chain has been broken by async work (mic → STT → chat
  // → play). Decoded buffers play through the AudioContext directly and
  // are not gated by the autoplay policy once the context is resumed.
  private currentBufferSource: AudioBufferSourceNode | null = null;
  private currentEndedHandler: (() => void) | null = null;

  // Mic capture.
  private currentMicSource: MediaStreamAudioSourceNode | null = null;
  private currentMicStream: MediaStream | null = null;

  // Pre-analyzed amplitude envelope for TTS playback (iOS Safari workaround
  // — AnalyserNode returns zeros on AudioBufferSourceNode there).
  private envelopeRafId: number | null = null;

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

  /**
   * Decode + play an mp3 (base64) through an AudioBufferSourceNode. Returns
   * a promise that resolves when playback ends. AnalyserNode drives the bands.
   */
  async play(audioBase64: string): Promise<void> {
    const { ctx, analyser } = this.ensure();
    if (ctx.state === "suspended") await ctx.resume();

    this.stop();
    this.stopMic();

    // Decode base64 → ArrayBuffer.
    const binary = atob(audioBase64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);

    // decodeAudioData may detach the buffer on some browsers — copy it.
    const arrayBuf = bytes.buffer.slice(0) as ArrayBuffer;
    const audioBuffer: AudioBuffer = await new Promise((resolve, reject) => {
      ctx.decodeAudioData(arrayBuf, resolve, reject);
    });

    const src = ctx.createBufferSource();
    src.buffer = audioBuffer;
    // NOTE: NOT connecting to analyser here. iOS Safari's AnalyserNode
    // returns all-zero data when fed from a BufferSource. We pre-compute
    // the amplitude envelope from the decoded PCM data and drive the
    // bands off ctx.currentTime instead — works on every device.
    src.connect(ctx.destination);

    this.currentBufferSource = src;
    this.startEnvelopeDriver(audioBuffer, ctx);
    // Reference analyser so the unused-import lint doesn't complain
    // (mic capture still uses it via startMic).
    void analyser;

    return new Promise<void>((resolve, reject) => {
      let resolved = false;
      const onEnded = () => {
        if (resolved) return;
        resolved = true;
        this.stopEnvelopeDriver();
        this.cleanupBands();
        this.currentBufferSource = null;
        this.currentEndedHandler = null;
        resolve();
      };
      this.currentEndedHandler = onEnded;
      src.onended = onEnded;
      try {
        src.start(0);
        window.setTimeout(
          () => {
            if (resolved) return;
            if (this.currentBufferSource === src) onEnded();
          },
          audioBuffer.duration * 1000 + 500,
        );
      } catch (e) {
        reject(e);
      }
    });
  }

  /**
   * Play a sequence of base64-encoded mp3 chunks back-to-back. Useful when
   * the server streams TTS per sentence — each chunk drives its own
   * amplitude envelope, and there's no overlap between sentences.
   */
  async playSequential(
    chunks: Array<{ base64: string }>,
    onChunkStart?: (index: number) => void,
  ): Promise<void> {
    for (let i = 0; i < chunks.length; i++) {
      onChunkStart?.(i);
      await this.play(chunks[i].base64);
    }
  }

  /**
   * Pre-compute the audio buffer's amplitude envelope (RMS per 33ms window),
   * then drive the avatar's bass/mid/treble bands from it using
   * ctx.currentTime as the playback clock. Independent of AnalyserNode, so
   * works on iOS Safari where AnalyserNode is unreliable on BufferSources.
   */
  private startEnvelopeDriver(buffer: AudioBuffer, ctx: AudioContext) {
    this.stopEnvelopeDriver();
    const channelData = buffer.getChannelData(0);
    const sr = buffer.sampleRate;
    const windowMs = 33;
    const windowSize = Math.max(1, Math.floor((sr * windowMs) / 1000));
    const numWindows = Math.max(1, Math.floor(channelData.length / windowSize));
    const env = new Float32Array(numWindows);
    let peak = 0;
    for (let i = 0; i < numWindows; i++) {
      let sum = 0;
      const start = i * windowSize;
      for (let j = 0; j < windowSize; j++) {
        const s = channelData[start + j];
        sum += s * s;
      }
      const rms = Math.sqrt(sum / windowSize);
      env[i] = rms;
      if (rms > peak) peak = rms;
    }
    const norm = peak > 0 ? 1 / peak : 1;
    const startCtxTime = ctx.currentTime;

    const tick = () => {
      const elapsed = ctx.currentTime - startCtxTime;
      const idx = Math.floor((elapsed * 1000) / windowMs);
      if (idx >= numWindows) {
        this.envelopeRafId = null;
        return;
      }
      const amp = Math.min(1, env[idx] * norm);
      const prev = idx > 0 ? env[idx - 1] * norm : amp;
      // Coarse band approximation from the amplitude curve:
      // - bass: low-passed (moving avg of 3 windows)
      // - mid:  the raw amplitude
      // - treble: spike on rapid changes
      let bassAvg = amp;
      if (idx >= 2) {
        bassAvg = (env[idx - 2] + env[idx - 1] + env[idx]) * norm * (1 / 3);
      }
      const trebleSpike = Math.min(1, Math.abs(amp - prev) * 2.5);

      const s = useAvatar.getState();
      s.setIntensity(amp);
      s.setBands(bassAvg * 0.9, amp * 0.75, trebleSpike);

      this.envelopeRafId = requestAnimationFrame(tick);
    };
    this.envelopeRafId = requestAnimationFrame(tick);
  }

  private stopEnvelopeDriver() {
    if (this.envelopeRafId !== null) {
      cancelAnimationFrame(this.envelopeRafId);
      this.envelopeRafId = null;
    }
  }

  stop() {
    this.stopEnvelopeDriver();
    if (this.currentBufferSource) {
      try {
        this.currentBufferSource.onended = null;
        this.currentBufferSource.stop();
      } catch {
        /* ignore */
      }
      try {
        this.currentBufferSource.disconnect();
      } catch {
        /* ignore */
      }
      this.currentBufferSource = null;
    }
    if (this.currentEndedHandler) {
      this.currentEndedHandler();
    }
    this.currentEndedHandler = null;
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
    if (!this.currentBufferSource) this.cleanupBands();
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
