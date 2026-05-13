"use client";

import {
  CandlestickSeries,
  ColorType,
  createChart,
  CrosshairMode,
  LineSeries,
  LineStyle,
  type CandlestickData,
  type IChartApi,
  type IPriceLine,
  type ISeriesApi,
  type LineData,
  type Time,
} from "lightweight-charts";
import { useEffect, useImperativeHandle, useRef, type Ref } from "react";
import { getBarsFor } from "@/lib/chart/sample-data";
import {
  emaPair,
  heatmapCandleColor,
  reversalBands,
  rsi,
  withAlpha,
} from "@/lib/chart/cca-v5";

type Bar = { time: string; open: number; high: number; low: number; close: number };

/**
 * Fetch live daily OHLC from /api/chart-bars (which proxies Polygon with a
 * 60s in-memory cache). Falls back to sample-data on any error so the panel
 * never goes blank during dev or rate-limit hiccups.
 */
async function fetchBars(symbol: string): Promise<Bar[]> {
  try {
    const res = await fetch(`/api/chart-bars?symbol=${encodeURIComponent(symbol)}&days=180`, {
      cache: "no-store",
    });
    if (!res.ok) throw new Error(`status ${res.status}`);
    const json = (await res.json()) as { bars?: Bar[] };
    if (Array.isArray(json.bars) && json.bars.length > 0) return json.bars;
    throw new Error("empty bars");
  } catch (e) {
    console.warn(`[chart] live bars failed for ${symbol}, using sample`, e);
    return getBarsFor(symbol) as Bar[];
  }
}

/**
 * Imperative handle exposed to Kai's tool-call dispatcher. The frontend host
 * calls these methods when Kai's NDJSON stream emits matching tool events:
 *   • show_ticker(symbol)              → setTicker
 *   • draw_line(price, label, color)   → drawPriceLine
 *   • clear_annotations()              → clearAnnotations
 *
 * CCA v5 overlay toggles are also exposed for future tool wiring (not bound
 * to the chat NDJSON path yet — Kai can flip them once we add a tool):
 *   • setHeatmap(on)
 *   • setEmaClouds(on)
 *   • setReversalBands(on)
 */
export type JarvisChartHandle = {
  setTicker: (symbol: string) => void;
  drawPriceLine: (
    price: number,
    label: string,
    color?: "support" | "resistance" | "neutral",
  ) => void;
  removePriceLine: (label: string) => void;
  clearAnnotations: () => void;
  setHeatmap: (on: boolean) => void;
  setEmaClouds: (on: boolean) => void;
  setReversalBands: (on: boolean) => void;
  // Fibonacci retracement — internally renders 7 price lines using
  // drawPriceLine with `fib <pct>` labels. clearFibRetracement removes any
  // price line whose label starts with the fib prefix.
  drawFibRetracement: (high: number, low: number, labelPrefix?: string) => void;
  clearFibRetracement: () => void;
  // Two-point diagonal trend lines. Replace-by-label semantics like price
  // lines; removeTrendLine yanks one by label.
  drawTrendLine: (
    start: { time: string; price: number },
    end: { time: string; price: number },
    label: string,
    color?: "support" | "resistance" | "neutral",
  ) => void;
  removeTrendLine: (label: string) => void;
  // Snapshot of everything currently on the chart, so the backend agent can
  // see what Kway is looking at instead of guessing. Sent with every chat
  // message via /api/chat → kai-agent.
  getState: () => {
    ticker: string | null;
    overlays: {
      heatmap: boolean;
      ema_clouds: boolean;
      reversal_bands: boolean;
    };
    levels: Array<{ label: string; price: number }>;
    trend_lines: string[];
    fib_active: boolean;
  };
};

type Props = {
  ref?: Ref<JarvisChartHandle>;
  defaultTicker?: string;
};

// All overlay tones below are pulled directly from the SH1 heatmap candle
// gradient (src/lib/chart/cca-v5.ts SH1_COLORS_RAW), so every layer of the
// chart — candles, EMA clouds, reversal bands, and Kai's level annotations —
// belongs to one unified palette. Mental model: warm = bearish / overbought-
// resistance, cool/green = bullish / oversold-support, amber = neutral.
const PALETTE = {
  greenStrong: "#1fa237",   // strong bullish (palette green)
  greenTeal: "#1ea780",     // bullish, lighter
  blueDeep: "#0080ff",      // overbought blue (palette top)
  blueMid: "#0e89cb",       // softer blue
  amber: "#dca100",         // neutral mid-gradient
  amberLight: "#d3ac00",
  orange: "#f07e00",        // warm warning
  redBright: "#ff1e00",     // bearish red
  redDeep: "#ff0000",       // extreme red
} as const;

const PRICE_LINE_COLORS = {
  support: PALETTE.greenStrong,
  resistance: PALETTE.redBright,
  neutral: PALETTE.amber,
} as const;

// EMA Clouds — green when fast > slow, red when fast < slow. Match heatmap
// bullish/bearish tones exactly.
const EMA_GREEN = PALETTE.greenStrong;
const EMA_RED = PALETTE.redBright;

// Reversal Bands — gradient from gentle to extreme. Upper warns of
// overheated; lower flags oversold/extended low.
const RB_COLORS = {
  upper1: withAlpha(PALETTE.amber, 0.55),       // gentle warning (amber)
  upper2: withAlpha(PALETTE.orange, 0.55),      // real warning (orange)
  upper3: withAlpha(PALETTE.redBright, 0.85),   // extreme (red)
  lower1: withAlpha(PALETTE.greenStrong, 0.55), // gentle support (green)
  lower2: withAlpha(PALETTE.blueMid, 0.55),     // stretched (teal-blue)
  lower3: withAlpha(PALETTE.blueDeep, 0.85),    // oversold extreme (blue)
};

export function JarvisChart({ ref, defaultTicker = "NVDA" }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  // Track price lines by their label so Kai can actively add/remove/replace
  // specific levels mid-conversation instead of wiping and re-drawing every
  // time. Lowercased label is the key — Kai's label vocabulary is short
  // ("R1", "vwap", "8ema", "entry", "stop") and case sometimes drifts.
  const priceLinesRef = useRef<Map<string, IPriceLine>>(new Map());
  // Tracks labels that belong to a fib retracement so clearFibRetracement can
  // remove exactly those (and only those) without touching ad-hoc levels.
  const fibLabelsRef = useRef<Set<string>>(new Set());
  // Trend lines render as their own 2-point LineSeries (price lines can only
  // be horizontal). Keyed by lowercased label so Kai can replace by name.
  const trendLinesRef = useRef<Map<string, ISeriesApi<"Line">>>(new Map());
  const tickerRef = useRef<HTMLSpanElement>(null);

  // CCA v5 overlay series + state. Kept in refs so toggles can re-skin the
  // chart without re-running the full setData pipeline.
  const lastBarsRef = useRef<Bar[]>([]);
  const emaFastShortRef = useRef<ISeriesApi<"Line"> | null>(null);
  const emaSlowShortRef = useRef<ISeriesApi<"Line"> | null>(null);
  const emaFastLongRef = useRef<ISeriesApi<"Line"> | null>(null);
  const emaSlowLongRef = useRef<ISeriesApi<"Line"> | null>(null);
  const rbUpper1Ref = useRef<ISeriesApi<"Line"> | null>(null);
  const rbUpper2Ref = useRef<ISeriesApi<"Line"> | null>(null);
  const rbUpper3Ref = useRef<ISeriesApi<"Line"> | null>(null);
  const rbLower1Ref = useRef<ISeriesApi<"Line"> | null>(null);
  const rbLower2Ref = useRef<ISeriesApi<"Line"> | null>(null);
  const rbLower3Ref = useRef<ISeriesApi<"Line"> | null>(null);
  const showHeatmapRef = useRef<boolean>(true);
  const showEmaCloudsRef = useRef<boolean>(true);
  const showReversalBandsRef = useRef<boolean>(true);

  // ── Init chart once on mount ───────────────────────────────────────────
  useEffect(() => {
    if (!containerRef.current) return;

    const chart = createChart(containerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: "transparent" },
        textColor: "rgba(252, 211, 77, 0.6)",      // amber/60
        fontFamily: "'JetBrains Mono', ui-monospace, monospace",
        fontSize: 11,
      },
      grid: {
        vertLines: { color: "rgba(255,255,255,0.04)" },
        horzLines: { color: "rgba(255,255,255,0.04)" },
      },
      timeScale: {
        borderColor: "rgba(252,211,77,0.15)",
        timeVisible: false,
        secondsVisible: false,
      },
      rightPriceScale: {
        borderColor: "rgba(252,211,77,0.15)",
      },
      crosshair: {
        mode: CrosshairMode.Magnet,
      },
      autoSize: true,
    });

    const candles = chart.addSeries(CandlestickSeries, {
      // Base colors — overridden per-bar by the heatmap pipeline when on.
      upColor: "#34d399",
      downColor: "#f87171",
      borderUpColor: "#34d399",
      borderDownColor: "#f87171",
      wickUpColor: "rgba(52,211,153,0.7)",
      wickDownColor: "rgba(248,113,113,0.7)",
    });

    // EMA cloud lines — two pairs (5/12 and 34/50). lastValueVisible/priceLine
    // off so the right scale only labels candle price, not every overlay.
    const lineCommon = {
      lineWidth: 1 as const,
      lastValueVisible: false,
      priceLineVisible: false,
      crosshairMarkerVisible: false,
    };
    const emaFastShort = chart.addSeries(LineSeries, { ...lineCommon, color: EMA_GREEN });
    const emaSlowShort = chart.addSeries(LineSeries, { ...lineCommon, color: EMA_GREEN });
    const emaFastLong = chart.addSeries(LineSeries, { ...lineCommon, color: EMA_GREEN });
    const emaSlowLong = chart.addSeries(LineSeries, { ...lineCommon, color: EMA_GREEN });

    // Reversal bands — six envelope lines.
    const rbUpper1 = chart.addSeries(LineSeries, { ...lineCommon, color: RB_COLORS.upper1 });
    const rbUpper2 = chart.addSeries(LineSeries, { ...lineCommon, color: RB_COLORS.upper2 });
    const rbUpper3 = chart.addSeries(LineSeries, { ...lineCommon, color: RB_COLORS.upper3 });
    const rbLower1 = chart.addSeries(LineSeries, { ...lineCommon, color: RB_COLORS.lower1 });
    const rbLower2 = chart.addSeries(LineSeries, { ...lineCommon, color: RB_COLORS.lower2 });
    const rbLower3 = chart.addSeries(LineSeries, { ...lineCommon, color: RB_COLORS.lower3 });

    chartRef.current = chart;
    seriesRef.current = candles;
    emaFastShortRef.current = emaFastShort;
    emaSlowShortRef.current = emaSlowShort;
    emaFastLongRef.current = emaFastLong;
    emaSlowLongRef.current = emaSlowLong;
    rbUpper1Ref.current = rbUpper1;
    rbUpper2Ref.current = rbUpper2;
    rbUpper3Ref.current = rbUpper3;
    rbLower1Ref.current = rbLower1;
    rbLower2Ref.current = rbLower2;
    rbLower3Ref.current = rbLower3;

    // Seed with sample for instant paint, then upgrade to live Polygon data.
    applyBars(getBarsFor(defaultTicker) as Bar[]);
    chart.timeScale().fitContent();
    if (tickerRef.current) tickerRef.current.textContent = defaultTicker;
    let cancelled = false;
    fetchBars(defaultTicker).then((bars) => {
      if (cancelled || !seriesRef.current) return;
      applyBars(bars);
      chartRef.current?.timeScale().fitContent();
    });

    return () => {
      cancelled = true;
      chart.remove();
      chartRef.current = null;
      seriesRef.current = null;
      emaFastShortRef.current = null;
      emaSlowShortRef.current = null;
      emaFastLongRef.current = null;
      emaSlowLongRef.current = null;
      rbUpper1Ref.current = null;
      rbUpper2Ref.current = null;
      rbUpper3Ref.current = null;
      rbLower1Ref.current = null;
      rbLower2Ref.current = null;
      rbLower3Ref.current = null;
      priceLinesRef.current.clear();
      fibLabelsRef.current.clear();
      trendLinesRef.current.clear();
      lastBarsRef.current = [];
    };
  }, [defaultTicker]);

  /**
   * Recompute every CCA v5 overlay for the given bars and push the resulting
   * data into the relevant series. Honors the current toggle state — when a
   * layer is off it's blanked rather than removed (cheaper than tearing
   * series down on every flip).
   */
  function applyBars(bars: Bar[]) {
    const series = seriesRef.current;
    if (!series || bars.length === 0) return;
    lastBarsRef.current = bars;

    const closes = bars.map((b) => b.close);
    const highs = bars.map((b) => b.high);
    const lows = bars.map((b) => b.low);

    // 1. HeatMap candle coloring (per-bar). Pine: sensitivity='Medium' uses
    //    LSMA-smoothed source for the SuperTrend math, but the RSI scheme
    //    feeds directly off `close` regardless of sensitivity — so we only
    //    need RSI(14) here. LSMA / SuperTrend math live in cca-v5.ts for
    //    future signal/cloud expansion.
    const r = rsi(closes, 14);
    const candleData: CandlestickData<Time>[] = bars.map((b, i) => {
      const style = showHeatmapRef.current ? heatmapCandleColor(r[i]) : null;
      const base: CandlestickData<Time> = {
        time: b.time as Time,
        open: b.open,
        high: b.high,
        low: b.low,
        close: b.close,
      };
      if (style) {
        base.color = style.color;
        base.borderColor = style.borderColor;
        base.wickColor = style.wickColor;
      }
      return base;
    });
    series.setData(candleData);

    // 2. EMA Clouds — two pairs (5/12 and 34/50). The Pine fills the gap
    //    between fast and slow green/red based on fast>slow. We approximate
    //    that "cloud" by coloring both lines green/red per-bar so the visual
    //    signal still reads at a glance. (True between-line fills require a
    //    custom series primitive — punted to v2.)
    const pairShort = emaPair(closes, 5, 12);
    const pairLong = emaPair(closes, 34, 50);

    const fastShortData: LineData<Time>[] = [];
    const slowShortData: LineData<Time>[] = [];
    const fastLongData: LineData<Time>[] = [];
    const slowLongData: LineData<Time>[] = [];
    for (let i = 0; i < bars.length; i++) {
      const time = bars[i].time as Time;
      const fs = pairShort.fast[i];
      const ss = pairShort.slow[i];
      const fl = pairLong.fast[i];
      const sl = pairLong.slow[i];
      const shortColor = Number.isFinite(fs) && Number.isFinite(ss)
        ? fs > ss
          ? withAlpha(EMA_GREEN, 0.85)
          : withAlpha(EMA_RED, 0.85)
        : undefined;
      const longColor = Number.isFinite(fl) && Number.isFinite(sl)
        ? fl > sl
          ? withAlpha(EMA_GREEN, 0.85)
          : withAlpha(EMA_RED, 0.85)
        : undefined;
      if (Number.isFinite(fs)) fastShortData.push({ time, value: fs, color: shortColor });
      if (Number.isFinite(ss)) slowShortData.push({ time, value: ss, color: shortColor });
      if (Number.isFinite(fl)) fastLongData.push({ time, value: fl, color: longColor });
      if (Number.isFinite(sl)) slowLongData.push({ time, value: sl, color: longColor });
    }

    if (showEmaCloudsRef.current) {
      emaFastShortRef.current?.setData(fastShortData);
      emaSlowShortRef.current?.setData(slowShortData);
      emaFastLongRef.current?.setData(fastLongData);
      emaSlowLongRef.current?.setData(slowLongData);
    } else {
      emaFastShortRef.current?.setData([]);
      emaSlowShortRef.current?.setData([]);
      emaFastLongRef.current?.setData([]);
      emaSlowLongRef.current?.setData([]);
    }

    // 3. Reversal Bands — TMA + ATR envelope, six lines.
    const rb = reversalBands(highs, lows, closes);
    const pack = (arr: number[]): LineData<Time>[] => {
      const out: LineData<Time>[] = [];
      for (let i = 0; i < bars.length; i++) {
        if (Number.isFinite(arr[i])) out.push({ time: bars[i].time as Time, value: arr[i] });
      }
      return out;
    };
    if (showReversalBandsRef.current) {
      rbUpper1Ref.current?.setData(pack(rb.upper1));
      rbUpper2Ref.current?.setData(pack(rb.upper2));
      rbUpper3Ref.current?.setData(pack(rb.upper3));
      rbLower1Ref.current?.setData(pack(rb.lower1));
      rbLower2Ref.current?.setData(pack(rb.lower2));
      rbLower3Ref.current?.setData(pack(rb.lower3));
    } else {
      rbUpper1Ref.current?.setData([]);
      rbUpper2Ref.current?.setData([]);
      rbUpper3Ref.current?.setData([]);
      rbLower1Ref.current?.setData([]);
      rbLower2Ref.current?.setData([]);
      rbLower3Ref.current?.setData([]);
    }
  }

  // ── Imperative API for Kai's tool dispatcher ──────────────────────────
  useImperativeHandle(
    ref,
    () => ({
      setTicker(symbol: string) {
        const series = seriesRef.current;
        const chart = chartRef.current;
        if (!series || !chart) return;
        const SYM = symbol.toUpperCase();
        // Clear previous annotations on ticker change.
        for (const line of priceLinesRef.current.values()) series.removePriceLine(line);
        priceLinesRef.current.clear();
        fibLabelsRef.current.clear();
        // Trend lines anchor to dates on the previous ticker — also stale on
        // ticker change.
        for (const s of trendLinesRef.current.values()) {
          try { chart.removeSeries(s); } catch { /* noop */ }
        }
        trendLinesRef.current.clear();
        // Instant paint from sample, then upgrade to live data.
        applyBars(getBarsFor(SYM) as Bar[]);
        chart.timeScale().fitContent();
        if (tickerRef.current) tickerRef.current.textContent = SYM;
        fetchBars(SYM).then((bars) => {
          if (!seriesRef.current) return;
          applyBars(bars);
          chartRef.current?.timeScale().fitContent();
        });
      },
      drawPriceLine(price, label, color = "neutral") {
        const series = seriesRef.current;
        if (!series) return;
        const key = label.toLowerCase().trim();
        // Replace any line with the same label so Kai can update a level
        // ("actually the real support is 32") without leaving the old one
        // floating on the chart.
        const existing = priceLinesRef.current.get(key);
        if (existing) {
          series.removePriceLine(existing);
          priceLinesRef.current.delete(key);
          fibLabelsRef.current.delete(key);
        }
        const line = series.createPriceLine({
          price,
          color: PRICE_LINE_COLORS[color],
          lineWidth: 2,
          lineStyle: LineStyle.Dashed,
          axisLabelVisible: true,
          title: label,
        });
        priceLinesRef.current.set(key, line);
      },
      removePriceLine(label: string) {
        const series = seriesRef.current;
        if (!series) return;
        const key = label.toLowerCase().trim();
        const existing = priceLinesRef.current.get(key);
        if (existing) {
          series.removePriceLine(existing);
          priceLinesRef.current.delete(key);
          fibLabelsRef.current.delete(key);
        }
      },
      clearAnnotations() {
        const series = seriesRef.current;
        const chart = chartRef.current;
        if (!series) return;
        for (const line of priceLinesRef.current.values()) series.removePriceLine(line);
        priceLinesRef.current.clear();
        fibLabelsRef.current.clear();
        // clearAnnotations is the nuclear option — also yank trend lines.
        if (chart) {
          for (const s of trendLinesRef.current.values()) {
            try { chart.removeSeries(s); } catch { /* noop */ }
          }
        }
        trendLinesRef.current.clear();
      },
      setHeatmap(on: boolean) {
        showHeatmapRef.current = on;
        if (lastBarsRef.current.length > 0) applyBars(lastBarsRef.current);
      },
      setEmaClouds(on: boolean) {
        showEmaCloudsRef.current = on;
        if (lastBarsRef.current.length > 0) applyBars(lastBarsRef.current);
      },
      setReversalBands(on: boolean) {
        showReversalBandsRef.current = on;
        if (lastBarsRef.current.length > 0) applyBars(lastBarsRef.current);
      },
      drawFibRetracement(high: number, low: number, labelPrefix = "fib") {
        const series = seriesRef.current;
        if (!series || !(high > low)) return;
        const prefix = (labelPrefix || "fib").trim() || "fib";
        const range = high - low;
        // Standard 7 fib retracement levels. Color graded by depth so the
        // 50% line reads as the visual anchor, with shallow / deep pulls
        // shading toward support/resistance tones.
        const RATIOS: Array<{ pct: number; color: "support" | "resistance" | "neutral" }> = [
          { pct: 0,    color: "resistance" }, // top (swing high)
          { pct: 23.6, color: "resistance" }, // shallow pullback
          { pct: 38.2, color: "neutral" },    // mild retracement
          { pct: 50,   color: "neutral" },    // golden mean
          { pct: 61.8, color: "neutral" },    // golden ratio (key)
          { pct: 78.6, color: "support" },    // deep retracement
          { pct: 100,  color: "support" },    // bottom (swing low)
        ];
        for (const r of RATIOS) {
          const price = high - (range * (r.pct / 100));
          // Trim to avoid "fib 61.8000000" floats — pct is finite-precision.
          const pctLabel = Number.isInteger(r.pct) ? `${r.pct}` : r.pct.toFixed(1);
          const label = `${prefix} ${pctLabel}`;
          const key = label.toLowerCase().trim();
          const existing = priceLinesRef.current.get(key);
          if (existing) {
            series.removePriceLine(existing);
            priceLinesRef.current.delete(key);
          }
          const line = series.createPriceLine({
            price,
            color: PRICE_LINE_COLORS[r.color],
            lineWidth: 1,
            lineStyle: LineStyle.Dotted,
            axisLabelVisible: true,
            title: label,
          });
          priceLinesRef.current.set(key, line);
          fibLabelsRef.current.add(key);
        }
      },
      clearFibRetracement() {
        const series = seriesRef.current;
        if (!series) return;
        for (const key of fibLabelsRef.current) {
          const existing = priceLinesRef.current.get(key);
          if (existing) {
            series.removePriceLine(existing);
            priceLinesRef.current.delete(key);
          }
        }
        fibLabelsRef.current.clear();
      },
      drawTrendLine(start, end, label, color = "neutral") {
        const chart = chartRef.current;
        if (!chart) return;
        const key = label.toLowerCase().trim();
        // Replace by label so Kai can update a trend line in place.
        const existing = trendLinesRef.current.get(key);
        if (existing) {
          try { chart.removeSeries(existing); } catch { /* noop */ }
          trendLinesRef.current.delete(key);
        }
        const series = chart.addSeries(LineSeries, {
          color: PRICE_LINE_COLORS[color],
          lineWidth: 2,
          lineStyle: LineStyle.Solid,
          lastValueVisible: false,
          priceLineVisible: false,
          crosshairMarkerVisible: false,
          title: label,
        });
        // 2-point series — lightweight-charts draws a straight line between
        // them. Times must be sorted ascending.
        const a = { time: start.time as Time, value: start.price };
        const b = { time: end.time as Time, value: end.price };
        const data: LineData<Time>[] = start.time <= end.time ? [a, b] : [b, a];
        series.setData(data);
        trendLinesRef.current.set(key, series);
      },
      removeTrendLine(label: string) {
        const chart = chartRef.current;
        if (!chart) return;
        const key = label.toLowerCase().trim();
        const existing = trendLinesRef.current.get(key);
        if (existing) {
          try { chart.removeSeries(existing); } catch { /* noop */ }
          trendLinesRef.current.delete(key);
        }
      },
      getState() {
        const ticker = tickerRef.current?.textContent?.trim() || null;
        const levels: Array<{ label: string; price: number }> = [];
        for (const [key, line] of priceLinesRef.current.entries()) {
          // IPriceLine.options() exposes price + title from creation opts.
          try {
            const opts = line.options();
            const label = (opts.title as string | undefined) ?? key;
            levels.push({ label, price: opts.price });
          } catch {
            /* skip lines whose options API isn't reachable */
          }
        }
        return {
          ticker,
          overlays: {
            heatmap: showHeatmapRef.current,
            ema_clouds: showEmaCloudsRef.current,
            reversal_bands: showReversalBandsRef.current,
          },
          levels,
          trend_lines: Array.from(trendLinesRef.current.keys()),
          fib_active: fibLabelsRef.current.size > 0,
        };
      },
    }),
    [],
  );

  return (
    <div className="flex h-full w-full flex-col">
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-white/5 font-mono text-[10px] uppercase tracking-[0.2em] text-amber-200/75">
        <span>
          chart ·{" "}
          <span ref={tickerRef} className="text-amber-100">
            {defaultTicker}
          </span>
        </span>
        <span className="text-amber-200/45">kai · live</span>
      </div>
      <div ref={containerRef} className="relative flex-1" />
    </div>
  );
}
