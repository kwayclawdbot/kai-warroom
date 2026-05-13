import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 15;

/**
 * GET /api/options-chain?symbol=NVDA&expiry=2025-11-21
 *
 * Returns a side-by-side call/put options chain grouped by strike. Pulls
 * Polygon's options snapshot endpoint, which requires a paid options data
 * plan; on free / non-options plans the upstream returns 403/empty results
 * and we surface that to the client so the panel renders a placeholder.
 *
 * Strategy if `expiry` is omitted: read the first batch of contracts
 * regardless of expiry, group by expiration_date, return the earliest
 * future expiry plus the full set of available expiries.
 */

type Side = {
  bid: number | null;
  ask: number | null;
  iv: number | null;
  oi: number | null;
  volume: number | null;
};

type Row = {
  strike: number;
  call: Side | null;
  put: Side | null;
};

type ChainResp = {
  symbol: string;
  expiry: string | null;
  spot: number | null;
  expiries: string[];
  strikes: Row[];
  note: string | null;
};

const cache = new Map<string, { at: number; data: ChainResp }>();
const TTL_MS = 60_000;

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const symbol = (url.searchParams.get("symbol") || "").toUpperCase().trim();
  const expiry = (url.searchParams.get("expiry") || "").trim();
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

  const cacheKey = `${symbol}:${expiry}`;
  const hit = cache.get(cacheKey);
  if (hit && Date.now() - hit.at < TTL_MS) {
    return NextResponse.json({ ...hit.data, cached: true });
  }

  let endpoint = `https://api.polygon.io/v3/snapshot/options/${symbol}?limit=250&apiKey=${apiKey}`;
  if (expiry) {
    endpoint += `&expiration_date=${encodeURIComponent(expiry)}`;
  }

  let res: Response;
  try {
    res = await fetch(endpoint, { cache: "no-store" });
  } catch (e) {
    const detail = e instanceof Error ? e.message : "unknown";
    return NextResponse.json(
      { error: "polygon unreachable", detail },
      { status: 502 },
    );
  }

  // Free / non-options Polygon plans return 403 (or empty results) here. We
  // ship a structured placeholder so the panel can render a clean
  // "upgrade required" state instead of just exploding.
  if (!res.ok) {
    const data: ChainResp = {
      symbol,
      expiry: expiry || null,
      spot: null,
      expiries: [],
      strikes: [],
      note:
        res.status === 403
          ? "options chain requires a paid Polygon options data plan"
          : `polygon options ${res.status}`,
    };
    cache.set(cacheKey, { at: Date.now(), data });
    return NextResponse.json(data);
  }

  type Contract = {
    details?: {
      contract_type?: "call" | "put";
      strike_price?: number;
      expiration_date?: string;
    };
    last_quote?: { bid?: number; ask?: number };
    implied_volatility?: number;
    open_interest?: number;
    day?: { volume?: number };
    underlying_asset?: { price?: number };
  };
  type SnapJson = { results?: Contract[] };
  const json = (await res.json()) as SnapJson;
  const all = json.results ?? [];

  if (all.length === 0) {
    const data: ChainResp = {
      symbol,
      expiry: expiry || null,
      spot: null,
      expiries: [],
      strikes: [],
      note: "no options data returned — likely requires a paid options plan",
    };
    cache.set(cacheKey, { at: Date.now(), data });
    return NextResponse.json(data);
  }

  // Pull spot from the first contract that reports underlying_asset.price.
  const spot =
    all.find((c) => typeof c.underlying_asset?.price === "number")
      ?.underlying_asset?.price ?? null;

  const expiries = Array.from(
    new Set(
      all
        .map((c) => c.details?.expiration_date)
        .filter((d): d is string => typeof d === "string" && d.length > 0),
    ),
  ).sort();

  // If caller didn't pin an expiry, default to the earliest non-past one.
  const today = new Date().toISOString().slice(0, 10);
  const effectiveExpiry =
    expiry ||
    expiries.find((d) => d >= today) ||
    expiries[0] ||
    null;

  const filtered = effectiveExpiry
    ? all.filter((c) => c.details?.expiration_date === effectiveExpiry)
    : all;

  // Group by strike. side null means the leg wasn't returned (one-sided strike).
  const byStrike = new Map<number, Row>();
  for (const c of filtered) {
    const strike = c.details?.strike_price;
    const ctype = c.details?.contract_type;
    if (typeof strike !== "number" || (ctype !== "call" && ctype !== "put")) {
      continue;
    }
    const side: Side = {
      bid: c.last_quote?.bid ?? null,
      ask: c.last_quote?.ask ?? null,
      iv: c.implied_volatility ?? null,
      oi: c.open_interest ?? null,
      volume: c.day?.volume ?? null,
    };
    let row = byStrike.get(strike);
    if (!row) {
      row = { strike, call: null, put: null };
      byStrike.set(strike, row);
    }
    if (ctype === "call") row.call = side;
    else row.put = side;
  }
  const strikes = Array.from(byStrike.values()).sort(
    (a, b) => a.strike - b.strike,
  );

  const data: ChainResp = {
    symbol,
    expiry: effectiveExpiry,
    spot,
    expiries,
    strikes,
    note: null,
  };
  cache.set(cacheKey, { at: Date.now(), data });
  return NextResponse.json(data);
}
