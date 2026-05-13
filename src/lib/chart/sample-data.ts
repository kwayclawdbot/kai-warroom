// Sample OHLC bars used until the Polygon feed is wired. Roughly NVDA-shaped
// daily bars over ~60 sessions — just enough to make the chart look alive
// when Kai pulls it up. Replace with a real feed in the next iteration.

import type { CandlestickData, Time } from "lightweight-charts";

function genBars(
  startTs: number,
  count: number,
  startPrice: number,
): CandlestickData<Time>[] {
  const bars: CandlestickData<Time>[] = [];
  let close = startPrice;
  for (let i = 0; i < count; i++) {
    const drift = (Math.random() - 0.48) * close * 0.025;
    const open = close;
    const high = open + Math.abs(drift) * (1 + Math.random() * 0.6);
    const low = open - Math.abs(drift) * (1 + Math.random() * 0.6);
    close = open + drift;
    bars.push({
      time: (startTs + i * 86400) as Time,
      open: round2(open),
      high: round2(high),
      low: round2(low),
      close: round2(close),
    });
  }
  return bars;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

const NOW = Math.floor(Date.now() / 1000);
const SIXTY_DAYS_AGO = NOW - 60 * 86400;

export const SAMPLE_BARS: Record<string, CandlestickData<Time>[]> = {
  NVDA: genBars(SIXTY_DAYS_AGO, 60, 480),
  TSLA: genBars(SIXTY_DAYS_AGO, 60, 240),
  SPY: genBars(SIXTY_DAYS_AGO, 60, 565),
  MRAM: genBars(SIXTY_DAYS_AGO, 60, 22),
};

export function getBarsFor(ticker: string): CandlestickData<Time>[] {
  const key = ticker.toUpperCase();
  return SAMPLE_BARS[key] ?? genBars(SIXTY_DAYS_AGO, 60, 100);
}
