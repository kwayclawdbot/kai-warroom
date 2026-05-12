"use client";

import { Billboard, Text } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import * as THREE from "three";
import { useAvatar } from "@/lib/avatar-store";
import type { BrainRegion } from "@/lib/brain-regions";
import { orbFragment, orbVertex } from "@/lib/avatar-shaders";

type Props = {
  region: BrainRegion;
};

export function BrainNode({ region }: Props) {
  const groupRef = useRef<THREE.Group>(null);
  const matRef = useRef<THREE.ShaderMaterial>(null);
  const meshRef = useRef<THREE.Mesh>(null);
  const labelRef = useRef<THREE.Mesh>(null);

  // Internal smoothed activation in 0..1. Targets come from store.regions.
  const smoothed = useRef(0);

  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uIntensity: { value: 0 },
      uBass: { value: 0 },
      uCore: { value: region.color.clone() },
      uAccent: {
        value: region.color.clone().lerp(new THREE.Color("#ffffff"), 0.4),
      },
    }),
    [region.color],
  );

  useFrame((state, delta) => {
    const grp = groupRef.current;
    const mesh = meshRef.current;
    const mat = matRef.current;
    if (!grp || !mesh || !mat) return;

    const target = useAvatar.getState().regions[region.id] ?? 0;
    const k = Math.min(1, delta * 6);
    smoothed.current += (target - smoothed.current) * k;
    const a = smoothed.current;

    // Subtle baseline glow even when inactive so the network is always visible.
    const baseline = 0.18;
    const energy = baseline + a * 0.9;

    mat.uniforms.uTime.value = state.clock.elapsedTime;
    mat.uniforms.uIntensity.value = energy;
    mat.uniforms.uBass.value = a * 0.8;

    // Scale pulses on activation.
    const targetScale = 0.5 + a * 1.0;
    mesh.scale.x += (targetScale - mesh.scale.x) * k;
    mesh.scale.y = mesh.scale.x;
    mesh.scale.z = mesh.scale.x;

    // Gentle drift around its anchor.
    const t = state.clock.elapsedTime;
    grp.position.x =
      region.position[0] + Math.sin(t * 0.5 + region.position[0]) * 0.04;
    grp.position.y =
      region.position[1] + Math.cos(t * 0.4 + region.position[1]) * 0.04;
    grp.position.z =
      region.position[2] + Math.sin(t * 0.3 + region.position[2]) * 0.03;

    // Label opacity tracks activation but stays slightly visible at idle.
    if (labelRef.current) {
      const label = labelRef.current as unknown as {
        material?: { opacity?: number };
      };
      const labelOpacity = 0.32 + a * 0.68;
      if (label.material) label.material.opacity = labelOpacity;
    }

    mesh.rotation.y += delta * (0.15 + a * 0.4);
    mesh.rotation.x = Math.sin(t * 0.6 + region.position[1]) * 0.08;
  });

  // Outward direction for the label offset.
  const labelOffset = useMemo(() => {
    const p = new THREE.Vector3(...region.position);
    const dir = p.clone().normalize();
    return dir.multiplyScalar(0.42);
  }, [region.position]);

  return (
    <group ref={groupRef} position={region.position}>
      <mesh ref={meshRef}>
        <icosahedronGeometry args={[0.18, 3]} />
        <shaderMaterial
          ref={matRef}
          uniforms={uniforms}
          vertexShader={orbVertex}
          fragmentShader={orbFragment}
          transparent
          depthWrite={false}
          blending={THREE.AdditiveBlending}
        />
      </mesh>
      <Billboard position={labelOffset.toArray()}>
        <Text
          ref={labelRef as unknown as React.Ref<THREE.Mesh>}
          fontSize={0.13}
          color={region.color}
          anchorX="center"
          anchorY="middle"
          letterSpacing={0.18}
          outlineWidth={0.005}
          outlineColor="#000000"
          outlineOpacity={0.85}
          material-transparent
          material-toneMapped={false}
        >
          {region.label}
        </Text>
      </Billboard>
    </group>
  );
}
