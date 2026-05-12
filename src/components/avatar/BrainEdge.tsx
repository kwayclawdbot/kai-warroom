"use client";

import { Line } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import * as THREE from "three";
import { useAvatar } from "@/lib/avatar-store";
import type { BrainRegion } from "@/lib/brain-regions";

type Props = {
  region: BrainRegion;
  /** Optional second endpoint — when provided, the edge connects two regions. */
  to?: BrainRegion;
};

const CORE = new THREE.Vector3(0, 0, 0);

/**
 * A glowing line between the core and a region (or between two regions when `to` is set).
 * Includes a small sphere "synapse pulse" that travels along the path when active.
 */
export function BrainEdge({ region, to }: Props) {
  // drei's <Line> ref points at Line2|LineSegments2 internally. We only need
  // `.material.opacity` for the fade, so use a structural type.
  const lineRef = useRef<unknown>(null);
  const pulseMatRef = useRef<THREE.MeshBasicMaterial>(null);
  const pulseRef = useRef<THREE.Mesh>(null);
  const smoothed = useRef(0);

  const start = useMemo(
    () => (to ? new THREE.Vector3(...region.position) : CORE.clone()),
    [region.position, to],
  );
  const end = useMemo(
    () =>
      new THREE.Vector3(
        ...(to ? to.position : region.position),
      ),
    [region.position, to],
  );

  // Slight bezier curve so edges look organic, not straight wires.
  const curve = useMemo(() => {
    const mid = start
      .clone()
      .add(end)
      .multiplyScalar(0.5)
      .add(new THREE.Vector3(0, 0, 0.15));
    return new THREE.QuadraticBezierCurve3(start, mid, end);
  }, [start, end]);

  const points = useMemo(() => curve.getPoints(32), [curve]);

  // For synapse edges (region↔region), brightness is the MIN of the two activations.
  function targetActivation() {
    const s = useAvatar.getState();
    const a = s.regions[region.id] ?? 0;
    if (!to) return a;
    const b = s.regions[to.id] ?? 0;
    return Math.min(a, b);
  }

  useFrame((state, delta) => {
    const target = targetActivation();
    const k = Math.min(1, delta * 5);
    smoothed.current += (target - smoothed.current) * k;
    const a = smoothed.current;

    // Line opacity: dim baseline + activation lift.
    const baseline = to ? 0.04 : 0.12;
    const peak = to ? 0.6 : 0.85;
    const opacity = baseline + a * peak;
    const line = lineRef.current as
      | { material?: { opacity: number } }
      | null;
    if (line?.material) line.material.opacity = opacity;

    // Pulse traveling from start to end when active. Cycles every ~900ms.
    if (pulseRef.current && pulseMatRef.current) {
      const t = (state.clock.elapsedTime * 1.1) % 1.0;
      const p = curve.getPoint(t);
      pulseRef.current.position.copy(p);
      const visible = a > 0.05;
      pulseMatRef.current.opacity = visible ? a * 0.95 : 0;
      const scale = 0.04 + a * 0.06;
      pulseRef.current.scale.setScalar(scale);
    }
  });

  return (
    <group>
      <Line
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ref={lineRef as React.MutableRefObject<any>}
        points={points}
        color={region.color}
        lineWidth={to ? 0.7 : 1.1}
        transparent
        depthWrite={false}
        toneMapped={false}
      />
      <mesh ref={pulseRef}>
        <sphereGeometry args={[1, 12, 12]} />
        <meshBasicMaterial
          ref={pulseMatRef}
          color={region.color}
          transparent
          depthWrite={false}
          blending={THREE.AdditiveBlending}
          toneMapped={false}
        />
      </mesh>
    </group>
  );
}
