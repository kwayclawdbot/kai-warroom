"use client";

import { useEffect, useState } from "react";

type Side = {
  bid: number | null;
  ask: number | null;
  iv: number | null;
  oi: number | null;
  volume: number | null;
};
type Row = { strike: number; call: Side | null; put: Side | null };
type ChainResp = {
  symbol: string;
  expiry: string | null;
  spot: number | null;
  expiries: string[];
  strikes: Row[];
  note: string | null;
};

function fmt(n: number | null, frac = 2) {
  if (n == null || !Number.isFinite(n)) return "—";
  return n.toLocaleString("en-US", {
    minimumFractionDigits: frac,
    maximumFractionDigits: frac,
  });
}
function fmtIv(n: number | null) {
  if (n == null || !Number.isFinite(n)) return "—";
  return `${(n * 100).toFixed(0)}%`;
}
function fmtInt(n: number | null) {
  if (n == null || !Number.isFinite(n)) return "—";
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(1)}K`;
  return n.toFixed(0);
}

/**
 * Side-by-side calls/puts chain. Strike rows are clipped to a window around
 * spot so the panel doesn't try to render hundreds of deep OTM strikes.
 * If the API surfaces a `note` (typically "options chain requires a paid
 * Polygon options data plan"), the panel renders that placeholder instead
 * of an empty table.
 */
export function OptionsChainPanel({
  ticker,
  expiry: initialExpiry,
}: {
  ticker: string;
  expiry?: string;
}) {
  const [data, setData] = useState<ChainResp | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [selectedExpiry, setSelectedExpiry] = useState<string | null>(
    initialExpiry ?? null,
  );
  const symbol = ticker.toUpperCase();

  useEffect(() => {
    let cancel = false;
    setData(null);
    setErr(null);
    const params = new URLSearchParams({ symbol });
    if (selectedExpiry) params.set("expiry", selectedExpiry);
    fetch(`/api/options-chain?${params}`, { cache: "no-store" })
      .then(async (res) => {
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.error ?? `status ${res.status}`);
        }
        return (await res.json()) as ChainResp;
      })
      .then((d) => {
        if (cancel) return;
        setData(d);
        if (!selectedExpiry && d.expiry) setSelectedExpiry(d.expiry);
      })
      .catch((e: unknown) => {
        if (cancel) return;
        setErr(e instanceof Error ? e.message : "fetch failed");
      });
    return () => {
      cancel = true;
    };
  }, [symbol, selectedExpiry]);

  if (err) {
    return (
      <div className="flex h-full items-center justify-center p-6 font-mono text-[11px] text-red-300/80">
        couldn't load chain for {symbol} — {err}
      </div>
    );
  }
  if (!data) {
    return (
      <div className="flex h-full flex-col gap-2 px-4 py-3">
        <div className="h-8 rounded bg-white/[0.03] animate-pulse" />
        <div className="h-64 rounded border border-amber-200/10 bg-white/[0.02] animate-pulse" />
      </div>
    );
  }

  // Placeholder state — paid options plan required, or upstream returned no
  // contracts (common for tickers without listed options).
  if (data.strikes.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center px-6 text-center font-mono">
        <div className="text-[11px] uppercase tracking-[0.25em] text-amber-200/55">
          {symbol} · options chain
        </div>
        <div className="mt-3 text-[12px] text-amber-100/75 max-w-[320px]">
          {data.note ?? "no contracts returned for this ticker"}
        </div>
      </div>
    );
  }

  // Window strikes around spot (~30 rows max so the table is scannable).
  const spot = data.spot ?? data.strikes[Math.floor(data.strikes.length / 2)].strike;
  const sorted = [...data.strikes].sort(
    (a, b) => Math.abs(a.strike - spot) - Math.abs(b.strike - spot),
  );
  const windowed = sorted.slice(0, 30).sort((a, b) => a.strike - b.strike);

  return (
    <div className="flex h-full flex-col overflow-hidden font-mono">
      {/* Header — expiry picker + spot */}
      <div className="flex items-center justify-between gap-2 border-b border-amber-200/10 px-3 py-2">
        <div className="flex items-center gap-2">
          <span className="text-[10px] uppercase tracking-[0.22em] text-amber-200/55">
            expiry
          </span>
          <select
            value={selectedExpiry ?? ""}
            onChange={(e) => setSelectedExpiry(e.target.value)}
            className="rounded-sm border border-amber-200/20 bg-black/40 px-2 py-0.5 text-[11px] text-amber-100"
          >
            {data.expiries.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
        </div>
        <div className="text-[10px] uppercase tracking-[0.2em] text-amber-200/55">
          spot ${fmt(spot)}
        </div>
      </div>

      {/* Header row */}
      <div className="grid grid-cols-[1fr_1fr_1fr_1fr_70px_1fr_1fr_1fr_1fr] gap-1 border-b border-amber-200/10 px-2 py-1 text-[8.5px] uppercase tracking-[0.18em] text-amber-200/55">
        <span className="text-right">vol</span>
        <span className="text-right">oi</span>
        <span className="text-right">iv</span>
        <span className="text-right">bid/ask</span>
        <span className="text-center text-amber-200">strike</span>
        <span>bid/ask</span>
        <span>iv</span>
        <span>oi</span>
        <span>vol</span>
      </div>

      {/* Section labels */}
      <div className="grid grid-cols-2 border-b border-amber-200/10 text-[9px] uppercase tracking-[0.25em] text-amber-200/45">
        <span className="px-3 py-1 text-right">calls</span>
        <span className="px-3 py-1">puts</span>
      </div>

      {/* Rows */}
      <div className="flex-1 overflow-y-auto">
        {windowed.map((r) => {
          const atm = Math.abs(r.strike - spot) < 0.01;
          return (
            <div
              key={r.strike}
              className={`grid grid-cols-[1fr_1fr_1fr_1fr_70px_1fr_1fr_1fr_1fr] gap-1 border-b border-white/5 px-2 py-1 text-[10.5px] tabular-nums ${
                atm ? "bg-amber-200/[0.06]" : ""
              }`}
            >
              {/* CALLS */}
              <span className="text-right text-amber-100/70">
                {fmtInt(r.call?.volume ?? null)}
              </span>
              <span className="text-right text-amber-100/70">
                {fmtInt(r.call?.oi ?? null)}
              </span>
              <span className="text-right text-amber-100/70">
                {fmtIv(r.call?.iv ?? null)}
              </span>
              <span className="text-right text-emerald-200/85">
                {fmt(r.call?.bid ?? null)}/{fmt(r.call?.ask ?? null)}
              </span>
              {/* STRIKE */}
              <span className="text-center font-semibold text-amber-200">
                {r.strike}
              </span>
              {/* PUTS */}
              <span className="text-red-200/85">
                {fmt(r.put?.bid ?? null)}/{fmt(r.put?.ask ?? null)}
              </span>
              <span className="text-amber-100/70">
                {fmtIv(r.put?.iv ?? null)}
              </span>
              <span className="text-amber-100/70">
                {fmtInt(r.put?.oi ?? null)}
              </span>
              <span className="text-amber-100/70">
                {fmtInt(r.put?.volume ?? null)}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
