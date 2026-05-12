// Brain regions mapped to Kai's actual cognitive modules + vault folders.
// Each region is a node in the avatar's neural network — lights up when the
// corresponding tool fires, vault folder is queried, or topic is discussed.

import * as THREE from "three";

export type RegionId =
  | "market"
  | "technicals"
  | "alerts"
  | "watchlist"
  | "users"
  | "news"
  | "options"
  | "memory";

export type BrainRegion = {
  id: RegionId;
  label: string;
  /** Position around the core orb. Roughly arranged on a sphere of radius ~2.4. */
  position: [number, number, number];
  /** Each region has its own signature color. */
  color: THREE.Color;
  /** A short tagline describing what triggers this region (optional, for UX). */
  triggers: string;
};

const C = (hex: string) => new THREE.Color(hex);

export const REGIONS: BrainRegion[] = [
  {
    id: "memory",
    label: "MEMORY",
    position: [-1.55, 1.55, -0.1],
    color: C("#3ad8ff"),
    triggers: "vault search · conversation history",
  },
  {
    id: "market",
    label: "MARKET",
    position: [0.05, 2.25, 0.25],
    color: C("#5b9dff"),
    triggers: "regime · macro · sectors",
  },
  {
    id: "technicals",
    label: "TECHNICALS",
    position: [2.0, 1.05, -0.25],
    color: C("#34ffb1"),
    triggers: "charts · patterns · scoring",
  },
  {
    id: "alerts",
    label: "ALERTS",
    position: [2.45, -0.35, 0.35],
    color: C("#ffc14d"),
    triggers: "sent alerts · performance · winners",
  },
  {
    id: "watchlist",
    label: "WATCHLIST",
    position: [1.55, -1.6, -0.2],
    color: C("#b67dff"),
    triggers: "user watchlists · saved tickers",
  },
  {
    id: "users",
    label: "USERS",
    position: [-0.2, -2.2, 0.3],
    color: C("#ff5ed1"),
    triggers: "community chatter · churn signals",
  },
  {
    id: "news",
    label: "NEWS",
    position: [-1.8, -1.25, -0.2],
    color: C("#ff9b1a"),
    triggers: "headlines · sentiment · themes",
  },
  {
    id: "options",
    label: "OPTIONS",
    position: [-2.45, 0.15, 0.35],
    color: C("#e660ff"),
    triggers: "chains · flow · unusual activity",
  },
];

/** Cross-region synapses — light up when BOTH endpoints are active. */
export const SYNAPSES: Array<[RegionId, RegionId]> = [
  ["memory", "market"],
  ["market", "technicals"],
  ["market", "news"],
  ["technicals", "alerts"],
  ["alerts", "watchlist"],
  ["watchlist", "technicals"],
  ["alerts", "users"],
  ["news", "users"],
  ["technicals", "options"],
  ["memory", "alerts"],
];

export const REGION_BY_ID: Record<RegionId, BrainRegion> = Object.fromEntries(
  REGIONS.map((r) => [r.id, r]),
) as Record<RegionId, BrainRegion>;
