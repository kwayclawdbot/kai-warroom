"use client";

import {
  forwardRef,
  useCallback,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";
import { AnimatePresence, motion } from "motion/react";
import {
  JarvisChart,
  type JarvisChartHandle,
} from "@/components/chart/JarvisChart";
import { QuoteCardPanel } from "./QuoteCardPanel";
import { NewsPanel } from "./NewsPanel";
import { EarningsPanel } from "./EarningsPanel";
import { OptionsChainPanel } from "./OptionsChainPanel";

/**
 * PanelHost — Jarvis-style multi-panel framework.
 *
 * Kai (or the user) opens panels by type. Each open panel shows up as a tab
 * at the top of the right-rail area; the active tab's content fills the
 * body. Multiple panels coexist, persist across messages, and animate in
 * from below when materialized.
 *
 * Tab entry timing: 250ms scale+slide+fade. Exit reverses with 200ms.
 *
 * The chart panel is special — its imperative API (drawPriceLine, setTicker,
 * setHeatmap, getState, etc.) is exposed through `getChartHandle()` so the
 * existing page.tsx tool-event dispatcher can keep calling it without
 * changes. The host instantiates JarvisChart exactly once and KEEPS IT
 * MOUNTED so its annotations and state survive panel switches.
 */

export type PanelType =
  | "chart"
  | "quote_card"
  | "news"
  | "earnings"
  | "options_chain";

type OpenPanel = {
  id: string;
  type: PanelType;
  args: Record<string, unknown>;
  openedAt: number;
};

export type PanelHostHandle = {
  openPanel: (type: PanelType, args?: Record<string, unknown>) => void;
  closePanel: (type: PanelType) => void;
  closeAll: () => void;
  /**
   * Imperative handle for the chart panel. Returns null if the chart panel
   * is not currently open. Existing tool-event branches in page.tsx call
   * this to draw price lines, trend lines, fib retracements, etc.
   */
  getChartHandle: () => JarvisChartHandle | null;
  /** What's currently on-screen, for the backend chart_state snapshot. */
  getOpenPanelTypes: () => PanelType[];
};

const PANEL_LABELS: Record<PanelType, string> = {
  chart: "chart",
  quote_card: "quote",
  news: "news",
  earnings: "earnings",
  options_chain: "options",
};

const PANEL_ICONS: Record<PanelType, string> = {
  chart: "▦",
  quote_card: "$",
  news: "§",
  earnings: "Σ",
  options_chain: "θ",
};

export const PanelHost = forwardRef<PanelHostHandle, { defaultTicker?: string }>(
  function PanelHost({ defaultTicker = "NVDA" }, ref) {
    const [panels, setPanels] = useState<OpenPanel[]>([]);
    const [activeId, setActiveId] = useState<string | null>(null);
    const chartHandleRef = useRef<JarvisChartHandle | null>(null);

    /**
     * Open or focus a panel by type. If a panel of the same type is already
     * open, the existing instance stays mounted and its args are merged in
     * (so a second show_quote_card with a different ticker re-fetches in
     * place). The matching tab becomes active either way.
     */
    const openPanel = useCallback(
      (type: PanelType, args: Record<string, unknown> = {}) => {
        setPanels((cur) => {
          const existing = cur.find((p) => p.type === type);
          if (existing) {
            const merged: OpenPanel = {
              ...existing,
              args: { ...existing.args, ...args },
            };
            setActiveId(existing.id);
            return cur.map((p) => (p.id === existing.id ? merged : p));
          }
          const id = `${type}:${Date.now()}`;
          setActiveId(id);
          return [
            ...cur,
            { id, type, args, openedAt: Date.now() },
          ];
        });
      },
      [],
    );

    const closePanel = useCallback((type: PanelType) => {
      setPanels((cur) => {
        const next = cur.filter((p) => p.type !== type);
        // Reassign active to the most recent remaining tab if we just closed it.
        setActiveId((curActive) => {
          const stillThere = next.find((p) => p.id === curActive);
          if (stillThere) return curActive;
          return next.length > 0 ? next[next.length - 1].id : null;
        });
        return next;
      });
    }, []);

    const closeAll = useCallback(() => {
      setPanels([]);
      setActiveId(null);
    }, []);

    useImperativeHandle(
      ref,
      () => ({
        openPanel,
        closePanel,
        closeAll,
        getChartHandle: () => chartHandleRef.current,
        getOpenPanelTypes: () => panels.map((p) => p.type),
      }),
      [openPanel, closePanel, closeAll, panels],
    );

    const isOpen = panels.length > 0;
    const activePanel = useMemo(
      () => panels.find((p) => p.id === activeId) ?? null,
      [panels, activeId],
    );

    return (
      <section
        aria-hidden={!isOpen}
        className={`absolute top-14 right-0 bottom-0 z-20 w-full md:w-[46vw] md:min-w-[420px] md:max-w-[680px] border-l border-amber-200/15 bg-[#05080A]/92 backdrop-blur-md transition-transform duration-500 ease-out ${
          isOpen ? "translate-x-0" : "translate-x-full"
        }`}
      >
        {/* Tab strip — horizontally scrollable on mobile when many tabs are
            open; on desktop the panel is wide enough to fit a few. */}
        <div className="flex h-10 items-end gap-1 overflow-x-auto overflow-y-hidden border-b border-amber-200/10 px-2 pt-2 [&::-webkit-scrollbar]:hidden">
          <AnimatePresence initial={false}>
            {panels.map((p) => {
              const active = p.id === activeId;
              return (
                <motion.div
                  key={p.id}
                  layout
                  initial={{ scale: 0.8, y: 12, opacity: 0 }}
                  animate={{ scale: 1, y: 0, opacity: 1 }}
                  exit={{ scale: 0.85, y: 8, opacity: 0 }}
                  transition={{
                    duration: 0.25,
                    ease: [0.22, 1, 0.36, 1],
                  }}
                  className={`relative flex items-center gap-1.5 rounded-t-md border border-b-0 px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.2em] ${
                    active
                      ? "border-amber-200/30 bg-amber-200/[0.08] text-amber-100"
                      : "border-white/8 bg-black/40 text-white/55 hover:text-white/85"
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => setActiveId(p.id)}
                    className="flex items-center gap-1.5"
                  >
                    <span className="text-amber-200/75">
                      {PANEL_ICONS[p.type]}
                    </span>
                    <span>{PANEL_LABELS[p.type]}</span>
                    {typeof p.args.ticker === "string" && (
                      <span className="text-amber-200/60 normal-case tracking-normal">
                        · {(p.args.ticker as string).toUpperCase()}
                      </span>
                    )}
                  </button>
                  <button
                    type="button"
                    aria-label={`close ${PANEL_LABELS[p.type]}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      closePanel(p.type);
                    }}
                    className="ml-1 rounded-sm px-1 text-white/40 hover:bg-white/10 hover:text-white/85"
                  >
                    ×
                  </button>
                </motion.div>
              );
            })}
          </AnimatePresence>
          <div className="flex-1" />
          {panels.length > 0 && (
            <button
              type="button"
              onClick={closeAll}
              className="mb-0.5 rounded-sm border border-white/10 px-2 py-0.5 font-mono text-[9px] uppercase tracking-[0.22em] text-white/55 hover:border-white/30 hover:text-white"
            >
              close all
            </button>
          )}
        </div>

        {/* Body. The chart panel stays mounted across tab switches (and
            even briefly after closure if you want to preserve state — we
            unmount on explicit close to keep memory clean) so its
            annotations + series state survive switching to other panels.
            Other panels mount/unmount through AnimatePresence. */}
        <div className="relative h-[calc(100%-2.5rem)]">
          {/* Persistent chart layer */}
          {panels.some((p) => p.type === "chart") && (
            <div
              className={`absolute inset-0 ${
                activePanel?.type === "chart"
                  ? "opacity-100"
                  : "opacity-0 pointer-events-none"
              }`}
              aria-hidden={activePanel?.type !== "chart"}
            >
              <JarvisChart ref={chartHandleRef} defaultTicker={defaultTicker} />
            </div>
          )}

          {/* Non-chart panels — crossfade in/out */}
          <AnimatePresence mode="wait">
            {activePanel && activePanel.type !== "chart" && (
              <motion.div
                key={activePanel.id}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 4 }}
                transition={{ duration: 0.2, ease: "easeOut" }}
                className="absolute inset-0"
              >
                <PanelBody
                  panel={activePanel}
                  chartRef={chartHandleRef}
                  defaultTicker={defaultTicker}
                />
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </section>
    );
  },
);

function PanelBody({
  panel,
  defaultTicker,
}: {
  panel: OpenPanel;
  chartRef: React.MutableRefObject<JarvisChartHandle | null>;
  defaultTicker: string;
}) {
  const ticker =
    typeof panel.args.ticker === "string"
      ? (panel.args.ticker as string)
      : defaultTicker;
  switch (panel.type) {
    case "chart":
      // Chart is rendered in the persistent layer above — unreachable here.
      return null;
    case "quote_card":
      return <QuoteCardPanel ticker={ticker} />;
    case "news":
      return <NewsPanel ticker={ticker} />;
    case "earnings":
      return <EarningsPanel ticker={ticker} />;
    case "options_chain":
      return (
        <OptionsChainPanel
          ticker={ticker}
          expiry={
            typeof panel.args.expiry === "string"
              ? (panel.args.expiry as string)
              : undefined
          }
        />
      );
  }
}
