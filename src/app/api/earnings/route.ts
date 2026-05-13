import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 15;

/**
 * GET /api/earnings?symbol=NVDA
 *
 * Earnings history + next-report estimate.
 *
 * Approach picked: Polygon's `/vX/reference/financials` endpoint. Reason:
 * keeps the panel single-source (Polygon key already in env), no Python
 * subprocess, no backend round-trip, no yfinance flakiness. Tradeoff:
 * Polygon's financials surface diluted EPS as `basic_earnings_per_share`
 * (and `diluted_earnings_per_share`) on the income statement — we use that
 * as the "actual" EPS. Polygon does NOT ship analyst consensus estimates
 * on standard data plans, so the `estimate` and `beat_miss` columns ship
 * as null for now. The panel renders "—" for those cells with a footnote
 * note. Future work: subscribe to a fundamentals provider (Benzinga,
 * FMP) or add an internal backend endpoint that proxies the kai-agent's
 * `get_earnings_calendar` tool to fill in estimates + next-report date.
 */

type Quarter = {
  period: string;        // e.g. "2025-Q3"
  date: string;          // fiscal_period_end_date, ISO
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

const cache = new Map<string, { at: number; data: EarningsResp }>();
const TTL_MS = 5 * 60_000;

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

  const endpoint = `https://api.polygon.io/vX/reference/financials?ticker=${symbol}&timeframe=quarterly&order=desc&limit=6&apiKey=${apiKey}`;

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
  if (!res.ok) {
    return NextResponse.json(
      { error: `polygon financials ${res.status}` },
      { status: 502 },
    );
  }

  type FinJson = {
    results?: Array<{
      fiscal_period?: string;
      fiscal_year?: string;
      end_date?: string;
      financials?: {
        income_statement?: {
          basic_earnings_per_share?: { value?: number };
          diluted_earnings_per_share?: { value?: number };
        };
      };
    }>;
  };

  const json = (await res.json()) as FinJson;
  const quarters: Quarter[] = (json.results ?? []).map((r) => {
    const eps =
      r.financials?.income_statement?.diluted_earnings_per_share?.value ??
      r.financials?.income_statement?.basic_earnings_per_share?.value ??
      null;
    const period =
      r.fiscal_year && r.fiscal_period
        ? `${r.fiscal_year}-${r.fiscal_period}`
        : (r.end_date ?? "");
    return {
      period,
      date: r.end_date ?? "",
      estimate: null,
      actual: eps,
      beat_miss: null,
    };
  });

  const data: EarningsResp = {
    symbol,
    next_date: null,
    next_estimate: null,
    quarters,
    note:
      quarters.length === 0
        ? "no fundamentals available for this ticker on the current data plan"
        : "analyst estimates require a fundamentals data plan upgrade — historical EPS shown",
  };

  cache.set(symbol, { at: Date.now(), data });
  return NextResponse.json(data);
}
