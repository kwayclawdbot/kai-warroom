"use client";

import { useEffect, useState } from "react";

/**
 * One-glance ticker price card. Fetches /api/quote-card on mount + when the
 * ticker prop changes; renders a skeleton while pending, falls back to a
 * "couldn't load" line on error. Color-coded change line matches the
 * unified JarvisChart palette (green = bullish, red = bearish, amber =
 * neutral / no change).
 */
type QuoteCard = {
  symbol: string;
  name: string | null;
  last: number | null;
  prev_close: number | null;
  change: number | null;
  change_pct: number | null;
  day_open: number | null;
  day_high: number | null;
  day_low: number | null;
  volume: number | null;
  avg_volume: number | null;
  market_cap: number | null;
  sector: string | null;
};

const PALETTE = {
  bull: "#1fa237",
  bear: "#ff1e00",
  neutral: "#dca100",
} as const;

function fmtPrice(n: number | null) {
  if (n == null || !Number.isFinite(n)) return "—";
  return n.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}
function fmtVol(n: number | null) {
  if (n == null || !Number.isFinite(n)) return "—";
  if (n >= 1e9) return `${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(2)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(1)}K`;
  return n.toFixed(0);
}
function fmtCap(n: number | null) {
  if (n == null || !Number.isFinite(n)) return "—";
  if (n >= 1e12) return `${(n / 1e12).toFixed(2)}T`;
  if (n >= 1e9) return `${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(2)}M`;
  return n.toFixed(0);
}

export function QuoteCardPanel({ ticker }: { ticker: string }) {
  const [data, setData] = useState<QuoteCard | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const symbol = ticker.toUpperCase();

  useEffect(() => {
    let cancel = false;
    setData(null);
    setErr(null);
    fetch(`/api/quote-card?symbol=${encodeURIComponent(symbol)}`, {
      cache: "no-store",
    })
      .then(async (res) => {
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.error ?? `status ${res.status}`);
        }
        return (await res.json()) as QuoteCard;
      })
      .then((d) => {
        if (cancel) return;
        setData(d);
      })
      .catch((e: unknown) => {
        if (cancel) return;
        setErr(e instanceof Error ? e.message : "fetch failed");
      });
    return () => {
      cancel = true;
    };
  }, [symbol]);

  if (err) {
    return (
      <div className="flex h-full w-full items-center justify-center p-6 text-center font-mono text-[11px] text-red-300/80">
        couldn't load {symbol} — {err}
      </div>
    );
  }

  if (!data) {
    return <QuoteCardSkeleton symbol={symbol} />;
  }

  const changeColor =
    data.change == null
      ? PALETTE.neutral
      : data.change > 0
        ? PALETTE.bull
        : data.change < 0
          ? PALETTE.bear
          : PALETTE.neutral;
  const sign = (data.change ?? 0) >= 0 ? "+" : "";

  return (
    <div className="flex h-full w-full flex-col overflow-y-auto px-5 py-4 font-mono text-amber-100/85">
      {/* HEADER */}
      <div className="mb-4">
        <div className="flex items-baseline gap-3">
          <span className="text-3xl font-semibold tracking-wide text-amber-50">
            {data.symbol}
          </span>
          {data.name && (
            <span className="text-[11px] uppercase tracking-[0.2em] text-amber-200/55 truncate max-w-[260px]">
              {data.name}
            </span>
          )}
        </div>
        <div className="mt-3 flex items-baseline gap-4">
          <span className="text-4xl tabular-nums text-white">
            ${fmtPrice(data.last)}
          </span>
          <span
            className="tabular-nums text-base"
            style={{ color: changeColor }}
          >
            {sign}
            {fmtPrice(data.change)}
            <span className="ml-1.5 text-xs">
              ({sign}
              {data.change_pct == null ? "—" : data.change_pct.toFixed(2)}%)
            </span>
          </span>
        </div>
      </div>

      {/* GRID */}
      <div className="grid grid-cols-2 gap-2.5 text-[11px]">
        <Stat label="prev close" value={`$${fmtPrice(data.prev_close)}`} />
        <Stat label="day open" value={`$${fmtPrice(data.day_open)}`} />
        <Stat label="day high" value={`$${fmtPrice(data.day_high)}`} />
        <Stat label="day low" value={`$${fmtPrice(data.day_low)}`} />
        <Stat label="volume" value={fmtVol(data.volume)} />
        <Stat label="avg vol" value={fmtVol(data.avg_volume)} />
        <Stat label="mkt cap" value={fmtCap(data.market_cap)} />
        <Stat label="sector" value={data.sector ?? "—"} />
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded border border-amber-200/10 bg-black/30 px-2.5 py-1.5">
      <div className="text-[9px] uppercase tracking-[0.22em] text-amber-200/45">
        {label}
      </div>
      <div className="mt-0.5 text-[12px] text-amber-100 tabular-nums truncate">
        {value}
      </div>
    </div>
  );
}

function QuoteCardSkeleton({ symbol }: { symbol: string }) {
  return (
    <div className="flex h-full w-full flex-col px-5 py-4 font-mono">
      <div className="mb-4">
        <div className="text-3xl font-semibold tracking-wide text-amber-50/70">
          {symbol}
        </div>
        <div className="mt-3 h-9 w-44 rounded bg-white/5 animate-pulse" />
      </div>
      <div className="grid grid-cols-2 gap-2.5">
        {Array.from({ length: 8 }).map((_, i) => (
          <div
            key={i}
            className="h-12 rounded border border-amber-200/10 bg-white/[0.02] animate-pulse"
          />
        ))}
      </div>
    </div>
  );
}
