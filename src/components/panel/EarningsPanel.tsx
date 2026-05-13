"use client";

import { useEffect, useState } from "react";

type Quarter = {
  period: string;
  date: string;
  estimate: number | null;
  actual: number | null;
  beat_miss: "BEAT" | "MISS" | "INLINE" | null;
};
type EarningsResp = {
  symbol: string;
  next_date: string | null;
  next_estimate: number | null;
  quarters: Quarter[];
  note: string | null;
};

function fmtEps(n: number | null) {
  if (n == null || !Number.isFinite(n)) return "—";
  return `$${n.toFixed(2)}`;
}

/**
 * Next-earnings card + last few quarters table. Polygon doesn't ship analyst
 * estimates on the free / standard tier, so the estimate column renders "—"
 * and the panel surfaces the note string returned by the API explaining
 * why.
 */
export function EarningsPanel({ ticker }: { ticker: string }) {
  const [data, setData] = useState<EarningsResp | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const symbol = ticker.toUpperCase();

  useEffect(() => {
    let cancel = false;
    setData(null);
    setErr(null);
    fetch(`/api/earnings?symbol=${encodeURIComponent(symbol)}`, {
      cache: "no-store",
    })
      .then(async (res) => {
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.error ?? `status ${res.status}`);
        }
        return (await res.json()) as EarningsResp;
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
      <div className="flex h-full items-center justify-center p-6 font-mono text-[11px] text-red-300/80">
        couldn't load earnings for {symbol} — {err}
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex h-full flex-col gap-3 px-4 py-3">
        <div className="h-24 rounded border border-amber-200/10 bg-white/[0.02] animate-pulse" />
        <div className="h-48 rounded border border-amber-200/10 bg-white/[0.02] animate-pulse" />
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col overflow-y-auto px-4 py-3 font-mono">
      {/* Next earnings card */}
      <div className="rounded border border-amber-200/15 bg-amber-200/5 p-3">
        <div className="text-[9px] uppercase tracking-[0.25em] text-amber-200/55">
          next earnings · {symbol}
        </div>
        <div className="mt-1 flex items-baseline gap-4">
          <span className="text-lg text-amber-50">
            {data.next_date ?? "TBD"}
          </span>
          <span className="text-[11px] text-amber-200/65">
            est EPS {fmtEps(data.next_estimate)}
          </span>
        </div>
      </div>

      {/* History table */}
      <div className="mt-3 rounded border border-amber-200/10 bg-black/30">
        <div className="grid grid-cols-[1fr_1fr_1fr_70px] gap-2 px-3 py-1.5 text-[9px] uppercase tracking-[0.22em] text-amber-200/45 border-b border-amber-200/10">
          <span>period</span>
          <span className="text-right">est</span>
          <span className="text-right">actual</span>
          <span className="text-right">result</span>
        </div>
        {data.quarters.length === 0 ? (
          <div className="px-3 py-4 text-[11px] text-amber-200/55">
            no quarterly history available
          </div>
        ) : (
          data.quarters.map((q, i) => {
            const pillColor =
              q.beat_miss === "BEAT"
                ? "bg-emerald-400/15 text-emerald-200 border-emerald-400/30"
                : q.beat_miss === "MISS"
                  ? "bg-red-400/15 text-red-200 border-red-400/30"
                  : "bg-white/5 text-amber-200/55 border-white/10";
            return (
              <div
                key={`${q.period}:${i}`}
                className="grid grid-cols-[1fr_1fr_1fr_70px] items-center gap-2 px-3 py-1.5 text-[11px] text-amber-100/85 border-b border-white/5 last:border-b-0"
              >
                <span className="truncate">{q.period || q.date || "—"}</span>
                <span className="text-right tabular-nums">
                  {fmtEps(q.estimate)}
                </span>
                <span className="text-right tabular-nums">
                  {fmtEps(q.actual)}
                </span>
                <span className="flex justify-end">
                  <span
                    className={`rounded-sm border px-1.5 py-[1px] text-[9px] uppercase tracking-[0.18em] ${pillColor}`}
                  >
                    {q.beat_miss ?? "—"}
                  </span>
                </span>
              </div>
            );
          })
        )}
      </div>

      {data.note && (
        <div className="mt-3 rounded border border-amber-200/10 px-3 py-2 text-[10px] text-amber-200/55">
          {data.note}
        </div>
      )}
    </div>
  );
}
