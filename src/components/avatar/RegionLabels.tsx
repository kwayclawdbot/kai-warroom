"use client";

import { Billboard, Text } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { useRef } from "react";
import * as THREE from "three";
import { useAvatar } from "@/lib/avatar-store";
import { REGIONS } from "@/lib/brain-regions";

type Props = {
  centroids: Array<[number, number, number]>;
};

export function RegionLabels({ centroids }: Props) {
  return (
    <group>
      {REGIONS.map((r, i) => (
        <RegionLabel
          key={r.id}
          regionIdx={i}
          regionId={r.id}
          color={r.color}
          label={r.label}
          position={centroids[i] ?? [0, 0, 0]}
        />
      ))}
    </group>
  );
}

function RegionLabel({
  regionId,
  color,
  label,
  position,
}: {
  regionIdx: number;
  regionId: import("@/lib/brain-regions").RegionId;
  color: THREE.Color;
  label: string;
  position: [number, number, number];
}) {
  const textRef = useRef<THREE.Mesh | null>(null);
  const smoothed = useRef(0);

  useFrame((_, delta) => {
    const t = useAvatar.getState().regions[regionId] ?? 0;
    smoothed.current += (t - smoothed.current) * Math.min(1, delta * 5);
    const m = textRef.current as unknown as {
      material?: {
        opacity?: number;
        color?: THREE.Color;
      };
    } | null;
    if (m?.material) {
      m.material.opacity = 0.28 + smoothed.current * 0.72;
    }
  });

  return (
    <Billboard position={position}>
      <Text
        ref={textRef as React.Ref<THREE.Mesh>}
        fontSize={0.11}
        color={color}
        anchorX="center"
        anchorY="middle"
        letterSpacing={0.2}
        outlineWidth={0.004}
        outlineColor="#000000"
        outlineOpacity={0.85}
        material-transparent
        material-toneMapped={false}
        material-depthWrite={false}
      >
        {label}
      </Text>
    </Billboard>
  );
}
