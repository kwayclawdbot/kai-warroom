/**
 * CheatCode ALGO F.V5 — pure-TS port of the visual math from
 * `breakout-alert-system/indicators/cca_v5.pine`.
 *
 * Three visuals are ported here for v1:
 *   1. HeatMap candle coloring (SH1 scheme) — per-bar color/borderColor/wickColor
 *      driven by RSI(14) rescaled across the 22-color SH1 gradient.
 *   2. EMA Clouds — two pairs (5/12 + 34/50), green fill when fast > slow else red.
 *   3. Reversal Bands — TMA on log(close) + ATR-style range, upper/lower envelopes.
 *
 * No chart dependency. All functions are pure and operate on plain numeric arrays.
 * NaN is used wherever a window cannot be filled yet (matches Pine's `na`).
 */

// ── Pine-equivalent primitives ───────────────────────────────────────────────

/**
 * Simple moving average. Returns NaN until the window is full.
 * Pine: ta.sma(src, length)
 */
export function sma(src: readonly number[], length: number): number[] {
  const out = new Array<number>(src.length).fill(NaN);
  if (length <= 0) return out;
  let sum = 0;
  for (let i = 0; i < src.length; i++) {
    sum += src[i];
    if (i >= length) sum -= src[i - length];
    if (i >= length - 1) out[i] = sum / length;
  }
  return out;
}

/**
 * Exponential moving average. Pine seeds the EMA with the SMA of the first
 * `length` bars (ta.ema behavior). Returns NaN before that seed is available.
 */
export function ema(src: readonly number[], length: number): number[] {
  const out = new Array<number>(src.length).fill(NaN);
  if (length <= 0 || src.length === 0) return out;
  const alpha = 2 / (length + 1);
  // seed with SMA over first `length` bars
  let seed = 0;
  let validCount = 0;
  for (let i = 0; i < src.length; i++) {
    const v = src[i];
    if (!Number.isFinite(v)) continue;
    validCount++;
    if (validCount <= length) {
      seed += v;
      if (validCount === length) out[i] = seed / length;
      continue;
    }
    const prev = out[i - 1];
    out[i] = alpha * v + (1 - alpha) * prev;
  }
  return out;
}

/**
 * Wilder's RMA (running moving average). Pine seeds with SMA over `length` bars.
 * Used by ta.rma() and is also the smoother behind ta.rsi().
 */
export function rma(src: readonly number[], length: number): number[] {
  const out = new Array<number>(src.length).fill(NaN);
  if (length <= 0) return out;
  const alpha = 1 / length;
  let seed = 0;
  let validCount = 0;
  for (let i = 0; i < src.length; i++) {
    const v = src[i];
    if (!Number.isFinite(v)) continue;
    validCount++;
    if (validCount <= length) {
      seed += v;
      if (validCount === length) out[i] = seed / length;
      continue;
    }
    const prev = out[i - 1];
    out[i] = alpha * v + (1 - alpha) * prev;
  }
  return out;
}

/**
 * Symmetrically weighted moving average. Pine ta.swma uses 4-bar window with
 * weights [1, 2, 2, 1] / 6.
 */
export function swma(src: readonly number[]): number[] {
  const out = new Array<number>(src.length).fill(NaN);
  for (let i = 3; i < src.length; i++) {
    const a = src[i - 3];
    const b = src[i - 2];
    const c = src[i - 1];
    const d = src[i];
    if (![a, b, c, d].every(Number.isFinite)) continue;
    out[i] = (a * 1 + b * 2 + c * 2 + d * 1) / 6;
  }
  return out;
}

/**
 * Linear regression value at offset 0 over `length` bars. This is the LSMA
 * (least-squares moving average) Pine uses for `sensitivity='Medium'`:
 *   lsma = ta.linreg(close, 12, 0)
 *
 * The fitted value at the last point of the window is `intercept + slope*(length-1)`,
 * which is what Pine returns at offset 0.
 */
export function lsma(src: readonly number[], length: number): number[] {
  const out = new Array<number>(src.length).fill(NaN);
  if (length <= 1) return out;
  // Pre-compute fixed sums for x in [0..length-1]
  const n = length;
  const sumX = ((n - 1) * n) / 2;
  const sumX2 = ((n - 1) * n * (2 * n - 1)) / 6;
  const denom = n * sumX2 - sumX * sumX;
  if (denom === 0) return out;
  for (let i = length - 1; i < src.length; i++) {
    let sumY = 0;
    let sumXY = 0;
    let ok = true;
    for (let k = 0; k < length; k++) {
      const y = src[i - (length - 1) + k];
      if (!Number.isFinite(y)) {
        ok = false;
        break;
      }
      sumY += y;
      sumXY += k * y;
    }
    if (!ok) continue;
    const slope = (n * sumXY - sumX * sumY) / denom;
    const intercept = (sumY - slope * sumX) / n;
    // Value at x = length - 1 (offset 0 → most recent bar)
    out[i] = intercept + slope * (n - 1);
  }
  return out;
}

/**
 * True range series, with `na` at i=0 (Pine ta.tr returns na for the first bar).
 */
export function trueRange(
  highs: readonly number[],
  lows: readonly number[],
  closes: readonly number[],
): number[] {
  const out = new Array<number>(highs.length).fill(NaN);
  for (let i = 1; i < highs.length; i++) {
    const h = highs[i];
    const l = lows[i];
    const pc = closes[i - 1];
    out[i] = Math.max(h - l, Math.abs(h - pc), Math.abs(l - pc));
  }
  // bar 0: high - low (matches ta.tr(handle_na=true) behavior; Pine actually
  // returns na — our STF starts at i=1 anyway, so this is harmless).
  if (highs.length > 0) out[0] = highs[0] - lows[0];
  return out;
}

/**
 * RSI(length) using Wilder's smoothing (rma of gains and losses).
 * Pine: ta.rsi(close, 14)
 */
export function rsi(src: readonly number[], length: number): number[] {
  const out = new Array<number>(src.length).fill(NaN);
  if (src.length < 2 || length <= 0) return out;
  const gains = new Array<number>(src.length).fill(0);
  const losses = new Array<number>(src.length).fill(0);
  for (let i = 1; i < src.length; i++) {
    const ch = src[i] - src[i - 1];
    gains[i] = ch > 0 ? ch : 0;
    losses[i] = ch < 0 ? -ch : 0;
  }
  const avgGain = rma(gains.slice(1), length);
  const avgLoss = rma(losses.slice(1), length);
  // shift back by 1 because we sliced off the first diff
  for (let i = 0; i < avgGain.length; i++) {
    const g = avgGain[i];
    const l = avgLoss[i];
    if (!Number.isFinite(g) || !Number.isFinite(l)) continue;
    const rs = l === 0 ? Infinity : g / l;
    out[i + 1] = 100 - 100 / (1 + rs);
  }
  return out;
}

// ── SuperTrend channels (Pine STF()) ─────────────────────────────────────────

export type SuperTrendOut = {
  /** Active band value per bar (== up when trend = 1, dn when trend = -1). */
  band: number[];
  /** +1 = uptrend (long-side), -1 = downtrend. */
  trend: number[];
  /** Raw upper band (src + multiplier * atr, ratcheted). */
  upper: number[];
  /** Raw lower band (src - multiplier * atr, ratcheted). */
  lower: number[];
};

/**
 * Direct TS port of Pine STF():
 *   atr   = ta.ema(ta.tr, Periods)
 *   up    = src - Multiplier * atr
 *   up   := close[1] > up[1] ? max(up, up[1]) : up
 *   dn    = src + Multiplier * atr
 *   dn   := close[1] < dn[1] ? min(dn, dn[1]) : dn
 *   trend init 1; flips on close > dn[1] (to +1) or close < up[1] (to -1)
 */
export function superTrendChannels(
  highs: readonly number[],
  lows: readonly number[],
  closes: readonly number[],
  source: readonly number[],
  periods: number,
  multiplier: number,
): SuperTrendOut {
  const n = closes.length;
  const tr = trueRange(highs, lows, closes);
  const atr = ema(tr, periods);
  const up = new Array<number>(n).fill(NaN);
  const dn = new Array<number>(n).fill(NaN);
  const trend = new Array<number>(n).fill(1);
  for (let i = 0; i < n; i++) {
    const a = atr[i];
    const src = source[i];
    if (!Number.isFinite(a) || !Number.isFinite(src)) {
      trend[i] = i > 0 ? trend[i - 1] : 1;
      continue;
    }
    let upRaw = src - multiplier * a;
    let dnRaw = src + multiplier * a;
    const prevUp = i > 0 && Number.isFinite(up[i - 1]) ? up[i - 1] : upRaw;
    const prevDn = i > 0 && Number.isFinite(dn[i - 1]) ? dn[i - 1] : dnRaw;
    const prevClose = i > 0 ? closes[i - 1] : closes[i];
    if (prevClose > prevUp) upRaw = Math.max(upRaw, prevUp);
    if (prevClose < prevDn) dnRaw = Math.min(dnRaw, prevDn);
    up[i] = upRaw;
    dn[i] = dnRaw;
    const prevTrend = i > 0 ? trend[i - 1] : 1;
    let t = prevTrend;
    if (prevTrend === -1 && closes[i] > prevDn) t = 1;
    else if (prevTrend === 1 && closes[i] < prevUp) t = -1;
    trend[i] = t;
  }
  const band = new Array<number>(n).fill(NaN);
  for (let i = 0; i < n; i++) band[i] = trend[i] === 1 ? up[i] : dn[i];
  return { band, trend, upper: up, lower: dn };
}

// ── HeatMap candle coloring (SH1 scheme, inverted as the Pine sets i_invert) ─

/**
 * SH1 ("HeatMap Candles") gradient. The Pine pushes these 22 colors in this
 * exact order then reverses the array (i_invert = true). After reversal, low
 * RSI (≈20) maps to red and high RSI (≈80) maps to blue.
 */
export const SH1_COLORS_RAW: readonly string[] = [
  "#ff0000", "#ff0d00", "#fe1e00", "#fc3700", "#f96200", "#f57000",
  "#f07e00", "#ea8a00", "#e39600", "#dca100", "#d3ac00", "#c9b600",
  "#bfc000", "#b3ca00", "#a6d400", "#97dd00", "#86e600", "#1fa237",
  "#1ea780", "#189daf", "#0e89cb", "#0080ff",
];
export const SH1_COLORS: readonly string[] = [...SH1_COLORS_RAW].reverse();

/**
 * Pick a color index from a gradient by rescaling `src` into the [min..max] range.
 * Direct port of f_rescale(): integer step in [0..size], clamped.
 */
function rescaleIndex(value: number, min: number, max: number, size: number): number {
  const range = Math.max(max - min, 1e-10);
  let step = Math.floor((size * (value - min)) / range);
  if (step > size) step = size;
  else if (step < 0) step = 0;
  return step;
}

/**
 * Per-bar HeatMap color for the SH1 scheme. Drives candle body, border, and wick.
 * Returns null if RSI hasn't warmed up yet.
 */
export function heatmapColorForRsi(rsiValue: number): string | null {
  if (!Number.isFinite(rsiValue)) return null;
  const size = SH1_COLORS.length - 1;
  const idx = rescaleIndex(rsiValue, 20, 80, size);
  return SH1_COLORS[idx];
}

/** Convenience: compute the heatmap color series across all bars from closes. */
export function heatmapColors(closes: readonly number[]): (string | null)[] {
  const r = rsi(closes, 14);
  return r.map(heatmapColorForRsi);
}

// ── EMA Cloud pairs ──────────────────────────────────────────────────────────

export type EmaCloudPair = {
  fast: number[];
  slow: number[];
  fastPeriod: number;
  slowPeriod: number;
};

/**
 * Compute an EMA pair (e.g. 5/12 or 34/50) used by the Pine EMA Cloud block.
 * Caller decides the fill color based on `fast[i] > slow[i]`.
 */
export function emaPair(
  closes: readonly number[],
  fastPeriod: number,
  slowPeriod: number,
): EmaCloudPair {
  return {
    fast: ema(closes, fastPeriod),
    slow: ema(closes, slowPeriod),
    fastPeriod,
    slowPeriod,
  };
}

// ── Reversal Bands (TMA + ATR-style range, in log space) ────────────────────

export type ReversalBandsOut = {
  /** Center: exp(swma(rma(log(close), 25))) — the TMA midline. */
  mid: number[];
  /** Upper bands (closest → farthest): exp(tma + range_2_4_6_8 * atr). */
  upper1: number[]; // tma + (M+4) * atr  → yellow region inner
  upper2: number[]; // tma + (M+6) * atr  → red region inner
  upper3: number[]; // tma + (M+8) * atr  → red region outer
  /** Lower bands (closest → farthest). */
  lower1: number[]; // tma - M * atr      → blue region inner
  lower2: number[]; // tma - (M+2) * atr  → blue region outer
  lower3: number[]; // tma - (M+4) * atr  → green region outer
  /** Parameters actually used. */
  tmaPeriod: number;
  atrPeriod: number;
  multiplier: number;
};

/**
 * Pine "Reversal Bands":
 *   TMAPeriodBack = 25, ATRPeriodBack = 45, ATRMultiplier = 2.4
 *   ssi   = ta.rma(math.log(close), TMAPeriodBack)
 *   tma   = ta.swma(ssi)
 *   atrrb = ta.rma(math.log(high) - math.log(low), ATRPeriodBack)
 *   range0/1/2/3/4 = atrrb * (M, M+2, M+4, M+6, M+8)
 *   uppers plotted: tma + range2, tma + range3, tma + range4
 *   lowers plotted: tma - range0, tma - range1, tma - range2
 * Returned in linear price space via math.exp(...).
 */
export function reversalBands(
  highs: readonly number[],
  lows: readonly number[],
  closes: readonly number[],
  tmaPeriod = 25,
  atrPeriod = 45,
  multiplier = 2.4,
): ReversalBandsOut {
  const logClose = closes.map((c) => Math.log(c));
  const logHigh = highs.map((h) => Math.log(h));
  const logLow = lows.map((l) => Math.log(l));
  const ssi = rma(logClose, tmaPeriod);
  const tma = swma(ssi);
  const logRange = logHigh.map((lh, i) => lh - logLow[i]);
  const atrrb = rma(logRange, atrPeriod);

  const n = closes.length;
  const out: ReversalBandsOut = {
    mid: new Array<number>(n).fill(NaN),
    upper1: new Array<number>(n).fill(NaN),
    upper2: new Array<number>(n).fill(NaN),
    upper3: new Array<number>(n).fill(NaN),
    lower1: new Array<number>(n).fill(NaN),
    lower2: new Array<number>(n).fill(NaN),
    lower3: new Array<number>(n).fill(NaN),
    tmaPeriod,
    atrPeriod,
    multiplier,
  };
  for (let i = 0; i < n; i++) {
    const m = tma[i];
    const a = atrrb[i];
    if (!Number.isFinite(m) || !Number.isFinite(a)) continue;
    out.mid[i] = Math.exp(m);
    out.upper1[i] = Math.exp(m + a * (multiplier + 4)); // Pine tmah2 (yellow inner)
    out.upper2[i] = Math.exp(m + a * (multiplier + 6)); // Pine tmah3 (red inner)
    out.upper3[i] = Math.exp(m + a * (multiplier + 8)); // Pine tmah4 (red outer)
    out.lower1[i] = Math.exp(m - a * multiplier);       // Pine tmal  (blue inner)
    out.lower2[i] = Math.exp(m - a * (multiplier + 2)); // Pine tma2  (blue outer)
    out.lower3[i] = Math.exp(m - a * (multiplier + 4)); // Pine tma3  (green outer)
  }
  return out;
}

// ── High-level helper: per-bar candle styling object ────────────────────────

export type HeatmapCandleStyle = {
  color: string;
  borderColor: string;
  wickColor: string;
};

/**
 * Compute the full per-bar HeatMap candle style. Pine line 1118 sets
 * body, border, and wick all to the same `colorcandles` value when
 * plotborder = false (the trading-stream config default). Wick uses a
 * slightly translucent variant for visual lightness.
 */
export function heatmapCandleColor(rsiValue: number): HeatmapCandleStyle | null {
  const color = heatmapColorForRsi(rsiValue);
  if (!color) return null;
  return {
    color,
    borderColor: color,
    wickColor: withAlpha(color, 0.7),
  };
}

/** Append an 8-bit alpha to a #RRGGBB string. */
export function withAlpha(hex: string, alpha: number): string {
  if (!/^#[0-9a-fA-F]{6}$/.test(hex)) return hex;
  const a = Math.max(0, Math.min(1, alpha));
  const aa = Math.round(a * 255).toString(16).padStart(2, "0");
  return `${hex}${aa}`;
}
