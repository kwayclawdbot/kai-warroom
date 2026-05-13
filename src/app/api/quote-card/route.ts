import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 15;

/**
 * GET /api/quote-card?symbol=NVDA
 *
 * Returns the data Kai's QuoteCardPanel needs to render a one-glance price
 * card: current price, day change, OHLC, volume, and reference details
 * (market cap, sector, name). Proxies Polygon with a 60s in-memory cache.
 *
 * Two upstream calls run in parallel:
 *   • /v2/snapshot/locale/us/markets/stocks/tickers/{symbol} — live tape
 *   • /v3/reference/tickers/{symbol}                         — static facts
 *
 * If the reference call fails (it sometimes 404s on obscure tickers), the
 * snapshot half still ships — the panel just renders without sector / cap.
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

const cache = new Map<string, { at: number; data: QuoteCard }>();
const TTL_MS = 60_000;

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const symbol = (url.searchParams.get("symbol") || "").toUpperCase().trim();
  if (!/^[A-Z]{1,5}$/.test(symbol)) {
    return NextResponse.json({ error: "invalid symbol" }, { status: 400 });
  }
  const apiKey = process.env.POLYGON_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "POLYGON_API_KEY not configured" },
      { status: 500 },
    );
  }

  const hit = cache.get(symbol);
  if (hit && Date.now() - hit.at < TTL_MS) {
    return NextResponse.json({ ...hit.data, cached: true });
  }

  const snapUrl = `https://api.polygon.io/v2/snapshot/locale/us/markets/stocks/tickers/${symbol}?apiKey=${apiKey}`;
  const refUrl = `https://api.polygon.io/v3/reference/tickers/${symbol}?apiKey=${apiKey}`;

  const [snapRes, refRes] = await Promise.all([
    fetch(snapUrl, { cache: "no-store" }).catch(() => null),
    fetch(refUrl, { cache: "no-store" }).catch(() => null),
  ]);

  if (!snapRes || !snapRes.ok) {
    const status = snapRes?.status ?? 502;
    return NextResponse.json(
      { error: `polygon snapshot ${status}` },
      { status: 502 },
    );
  }

  type SnapJson = {
    ticker?: {
      day?: { o?: number; h?: number; l?: number; c?: number; v?: number };
      prevDay?: { c?: number; v?: number };
      lastTrade?: { p?: number };
      min?: { c?: number; v?: number };
      todaysChange?: number;
      todaysChangePerc?: number;
    };
  };
  const snap = (await snapRes.json()) as SnapJson;
  const t = snap.ticker ?? {};
  const last =
    t.lastTrade?.p ?? t.min?.c ?? t.day?.c ?? t.prevDay?.c ?? null;
  const prev_close = t.prevDay?.c ?? null;

  let name: string | null = null;
  let market_cap: number | null = null;
  let sector: string | null = null;
  if (refRes && refRes.ok) {
    type RefJson = {
      results?: {
        name?: string;
        market_cap?: number;
        sic_description?: string;
        sector?: string;
      };
    };
    const ref = (await refRes.json()) as RefJson;
    name = ref.results?.name ?? null;
    market_cap = ref.results?.market_cap ?? null;
    // Polygon doesn't expose a "sector" field directly; sic_description is
    // the closest human-readable industry string available on the free tier.
    sector = ref.results?.sector ?? ref.results?.sic_description ?? null;
  }

  const data: QuoteCard = {
    symbol,
    name,
    last,
    prev_close,
    change: t.todaysChange ?? null,
    change_pct: t.todaysChangePerc ?? null,
    day_open: t.day?.o ?? null,
    day_high: t.day?.h ?? null,
    day_low: t.day?.l ?? null,
    volume: t.day?.v ?? null,
    avg_volume: null,
    market_cap,
    sector,
  };

  cache.set(symbol, { at: Date.now(), data });
  return NextResponse.json(data);
}
