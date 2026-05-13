import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 15;

type Bar = { time: string; open: number; high: number; low: number; close: number };

/**
 * GET /api/chart-bars?symbol=NVDA&days=180
 *
 * Fetches daily OHLC from Polygon and returns lightweight-charts-shaped bars
 * (time = YYYY-MM-DD). 60s in-memory cache per (symbol, days) to keep us off
 * the rate limiter when Kai bounces between tickers in a single session.
 */
const cache = new Map<string, { at: number; bars: Bar[] }>();
const TTL_MS = 60_000;

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const symbol = (url.searchParams.get("symbol") || "").toUpperCase().trim();
  const days = Math.min(Math.max(parseInt(url.searchParams.get("days") || "180", 10), 30), 730);
  if (!/^[A-Z]{1,5}$/.test(symbol)) {
    return NextResponse.json({ error: "invalid symbol" }, { status: 400 });
  }
  const apiKey = process.env.POLYGON_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "POLYGON_API_KEY not configured" }, { status: 500 });
  }

  const cacheKey = `${symbol}:${days}`;
  const hit = cache.get(cacheKey);
  if (hit && Date.now() - hit.at < TTL_MS) {
    return NextResponse.json({ symbol, bars: hit.bars, cached: true });
  }

  const to = new Date();
  const from = new Date(Date.now() - days * 86_400_000);
  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  const endpoint = `https://api.polygon.io/v2/aggs/ticker/${symbol}/range/1/day/${fmt(from)}/${fmt(to)}?adjusted=true&sort=asc&limit=5000&apiKey=${apiKey}`;

  let res: Response;
  try {
    res = await fetch(endpoint, { cache: "no-store" });
  } catch (e) {
    const detail = e instanceof Error ? e.message : "unknown";
    return NextResponse.json({ error: "polygon unreachable", detail }, { status: 502 });
  }
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    return NextResponse.json(
      { error: `polygon ${res.status}`, detail: detail.slice(0, 200) },
      { status: 502 },
    );
  }
  const json = (await res.json()) as {
    results?: Array<{ t: number; o: number; h: number; l: number; c: number }>;
    resultsCount?: number;
  };
  const results = Array.isArray(json.results) ? json.results : [];
  const bars: Bar[] = results.map((b) => ({
    time: new Date(b.t).toISOString().slice(0, 10),
    open: b.o,
    high: b.h,
    low: b.l,
    close: b.c,
  }));
  cache.set(cacheKey, { at: Date.now(), bars });
  return NextResponse.json({ symbol, bars });
}
