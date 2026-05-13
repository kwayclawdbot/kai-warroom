import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 15;

/**
 * GET /api/news?symbol=NVDA&limit=10
 *
 * Fetches recent news for a ticker via Polygon /v2/reference/news. 60s
 * in-memory cache per (symbol, limit) — same pattern as /api/chart-bars.
 */

type Article = {
  title: string;
  source: string;
  url: string;
  published_utc: string;
  summary: string | null;
};

const cache = new Map<string, { at: number; articles: Article[] }>();
const TTL_MS = 60_000;

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const symbol = (url.searchParams.get("symbol") || "").toUpperCase().trim();
  const limit = Math.min(
    Math.max(parseInt(url.searchParams.get("limit") || "10", 10), 1),
    20,
  );
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

  const cacheKey = `${symbol}:${limit}`;
  const hit = cache.get(cacheKey);
  if (hit && Date.now() - hit.at < TTL_MS) {
    return NextResponse.json({
      symbol,
      articles: hit.articles,
      cached: true,
    });
  }

  const endpoint = `https://api.polygon.io/v2/reference/news?ticker=${symbol}&limit=${limit}&apiKey=${apiKey}`;

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
      { error: `polygon news ${res.status}` },
      { status: 502 },
    );
  }
  type NewsJson = {
    results?: Array<{
      title?: string;
      publisher?: { name?: string };
      article_url?: string;
      published_utc?: string;
      description?: string;
    }>;
  };
  const json = (await res.json()) as NewsJson;
  const articles: Article[] = (json.results ?? []).map((a) => ({
    title: a.title ?? "(untitled)",
    source: a.publisher?.name ?? "unknown",
    url: a.article_url ?? "",
    published_utc: a.published_utc ?? "",
    summary: a.description ?? null,
  }));

  cache.set(cacheKey, { at: Date.now(), articles });
  return NextResponse.json({ symbol, articles });
}
