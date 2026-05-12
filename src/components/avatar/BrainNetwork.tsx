"use client";

import { REGIONS, REGION_BY_ID, SYNAPSES } from "@/lib/brain-regions";
import { BrainEdge } from "./BrainEdge";
import { BrainNode } from "./BrainNode";

export function BrainNetwork() {
  return (
    <group>
      {/* Core → region "spokes" (always visible, dim at idle). */}
      {REGIONS.map((r) => (
        <BrainEdge key={`spoke-${r.id}`} region={r} />
      ))}
      {/* Cross-region synapses — light up only when both endpoints are active. */}
      {SYNAPSES.map(([a, b]) => (
        <BrainEdge
          key={`syn-${a}-${b}`}
          region={REGION_BY_ID[a]}
          to={REGION_BY_ID[b]}
        />
      ))}
      {REGIONS.map((r) => (
        <BrainNode key={r.id} region={r} />
      ))}
    </group>
  );
}
