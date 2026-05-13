"use client";

import {
  CandlestickSeries,
  ColorType,
  createChart,
  CrosshairMode,
  LineStyle,
  type IChartApi,
  type IPriceLine,
  type ISeriesApi,
} from "lightweight-charts";
import { useEffect, useImperativeHandle, useRef, type Ref } from "react";
import { getBarsFor } from "@/lib/chart/sample-data";

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
 */
export type JarvisChartHandle = {
  setTicker: (symbol: string) => void;
  drawPriceLine: (
    price: number,
    label: string,
    color?: "support" | "resistance" | "neutral",
  ) => void;
  clearAnnotations: () => void;
};

type Props = {
  ref?: Ref<JarvisChartHandle>;
  defaultTicker?: string;
};

const PRICE_LINE_COLORS = {
  support: "#34d399",      // emerald
  resistance: "#f87171",   // red
  neutral: "#fbbf24",      // amber (matches warroom palette)
} as const;

export function JarvisChart({ ref, defaultTicker = "NVDA" }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const priceLinesRef = useRef<IPriceLine[]>([]);
  const tickerRef = useRef<HTMLSpanElement>(null);

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
      upColor: "#34d399",
      downColor: "#f87171",
      borderUpColor: "#34d399",
      borderDownColor: "#f87171",
      wickUpColor: "rgba(52,211,153,0.7)",
      wickDownColor: "rgba(248,113,113,0.7)",
    });

    chartRef.current = chart;
    seriesRef.current = candles;

    // Seed with sample for instant paint, then upgrade to live Polygon data.
    candles.setData(getBarsFor(defaultTicker));
    chart.timeScale().fitContent();
    if (tickerRef.current) tickerRef.current.textContent = defaultTicker;
    let cancelled = false;
    fetchBars(defaultTicker).then((bars) => {
      if (cancelled || !seriesRef.current) return;
      seriesRef.current.setData(bars);
      chartRef.current?.timeScale().fitContent();
    });

    return () => {
      cancelled = true;
      chart.remove();
      chartRef.current = null;
      seriesRef.current = null;
      priceLinesRef.current = [];
    };
  }, [defaultTicker]);

  // ── Imperative API for Kai's tool dispatcher ──────────────────────────
  useImperativeHandle(
    ref,
    () => ({
      setTicker(symbol: string) {
        const series = seriesRef.current;
        if (!series) return;
        const SYM = symbol.toUpperCase();
        // Clear previous annotations on ticker change
        for (const line of priceLinesRef.current) series.removePriceLine(line);
        priceLinesRef.current = [];
        // Instant paint from sample, then upgrade to live data.
        series.setData(getBarsFor(SYM));
        chartRef.current?.timeScale().fitContent();
        if (tickerRef.current) tickerRef.current.textContent = SYM;
        fetchBars(SYM).then((bars) => {
          if (!seriesRef.current) return;
          seriesRef.current.setData(bars);
          chartRef.current?.timeScale().fitContent();
        });
      },
      drawPriceLine(price, label, color = "neutral") {
        const series = seriesRef.current;
        if (!series) return;
        const line = series.createPriceLine({
          price,
          color: PRICE_LINE_COLORS[color],
          lineWidth: 2,
          lineStyle: LineStyle.Dashed,
          axisLabelVisible: true,
          title: label,
        });
        priceLinesRef.current.push(line);
      },
      clearAnnotations() {
        const series = seriesRef.current;
        if (!series) return;
        for (const line of priceLinesRef.current) series.removePriceLine(line);
        priceLinesRef.current = [];
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
