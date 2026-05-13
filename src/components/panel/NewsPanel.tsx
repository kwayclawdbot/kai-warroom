"use client";

import { useEffect, useState } from "react";

type Article = {
  title: string;
  source: string;
  url: string;
  published_utc: string;
  summary: string | null;
};

function timeAgo(iso: string): string {
  if (!iso) return "";
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return "";
  const ms = Date.now() - t;
  const min = Math.floor(ms / 60_000);
  if (min < 1) return "just now";
  if (min < 60) return `${min}m`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h`;
  const d = Math.floor(hr / 24);
  return `${d}d`;
}

/**
 * Recent headlines for a ticker. Click a row to expand summary; click again
 * (or click another row) to collapse. Up to 10 items.
 */
export function NewsPanel({ ticker }: { ticker: string }) {
  const [articles, setArticles] = useState<Article[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<number | null>(null);
  const symbol = ticker.toUpperCase();

  useEffect(() => {
    let cancel = false;
    setArticles(null);
    setErr(null);
    setExpanded(null);
    fetch(
      `/api/news?symbol=${encodeURIComponent(symbol)}&limit=10`,
      { cache: "no-store" },
    )
      .then(async (res) => {
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.error ?? `status ${res.status}`);
        }
        return (await res.json()) as { articles: Article[] };
      })
      .then((d) => {
        if (cancel) return;
        setArticles(d.articles ?? []);
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
        couldn't load news for {symbol} — {err}
      </div>
    );
  }

  if (!articles) {
    return (
      <div className="flex h-full flex-col gap-1.5 overflow-hidden px-4 py-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div
            key={i}
            className="h-14 rounded border border-amber-200/10 bg-white/[0.02] animate-pulse"
          />
        ))}
      </div>
    );
  }

  if (articles.length === 0) {
    return (
      <div className="flex h-full items-center justify-center p-6 font-mono text-[11px] text-amber-200/55">
        no recent headlines for {symbol}
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col overflow-y-auto px-4 py-3 font-mono">
      <div className="mb-3 text-[10px] uppercase tracking-[0.25em] text-amber-200/55">
        {symbol} · {articles.length} headlines
      </div>
      <ul className="flex flex-col gap-1.5">
        {articles.map((a, i) => {
          const isOpen = expanded === i;
          return (
            <li
              key={`${a.url}:${i}`}
              className="rounded border border-amber-200/10 bg-black/30 transition hover:border-amber-200/30"
            >
              <button
                type="button"
                onClick={() => setExpanded(isOpen ? null : i)}
                className="block w-full text-left px-3 py-2"
              >
                <div className="flex items-center gap-2 text-[9px] uppercase tracking-[0.22em] text-amber-200/55">
                  <span className="truncate max-w-[140px]">{a.source}</span>
                  <span>·</span>
                  <span>{timeAgo(a.published_utc)}</span>
                </div>
                <div className="mt-1 text-[12px] leading-snug text-amber-100/90">
                  {a.title}
                </div>
                {isOpen && a.summary && (
                  <div className="mt-2 text-[11px] leading-relaxed text-amber-100/65">
                    {a.summary}
                  </div>
                )}
                {isOpen && a.url && (
                  <a
                    href={a.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={(e) => e.stopPropagation()}
                    className="mt-1.5 inline-block text-[10px] uppercase tracking-[0.2em] text-emerald-300/80 hover:text-emerald-200"
                  >
                    open ↗
                  </a>
                )}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
