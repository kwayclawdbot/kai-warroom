"use client";

import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import * as THREE from "three";
import { useAvatar } from "@/lib/avatar-store";
import { getPalette } from "@/lib/emotion-palette";
import { orbFragment, orbVertex } from "@/lib/avatar-shaders";

export function CoreOrb({ radius = 0.55 }: { radius?: number }) {
  const meshRef = useRef<THREE.Mesh>(null);
  const matRef = useRef<THREE.ShaderMaterial>(null);

  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uIntensity: { value: 0 },
      uBass: { value: 0 },
      uCore: { value: new THREE.Color("#7a5cff") },
      uAccent: { value: new THREE.Color("#a0e0ff") },
    }),
    [],
  );

  useFrame((state, delta) => {
    const mesh = meshRef.current;
    const mat = matRef.current;
    if (!mesh || !mat) return;

    const { intensity, bass, emotion, role } = useAvatar.getState();
    const palette = getPalette(emotion, role);

    const u = mat.uniforms;
    u.uTime.value = state.clock.elapsedTime;

    const k = Math.min(1, delta * 5);
    u.uIntensity.value += (intensity - u.uIntensity.value) * k;
    u.uBass.value += (bass - u.uBass.value) * k;

    const kColor = Math.min(1, delta * 3);
    (u.uCore.value as THREE.Color).lerp(palette.core, kColor);
    (u.uAccent.value as THREE.Color).lerp(palette.accent, kColor);

    // Subtle breathing scale tied to bass + intensity.
    const target = 1.0 + bass * 0.18 + intensity * 0.1;
    mesh.scale.x += (target - mesh.scale.x) * k;
    mesh.scale.y = mesh.scale.x;
    mesh.scale.z = mesh.scale.x;

    mesh.rotation.y += delta * 0.12;
    mesh.rotation.x = Math.sin(state.clock.elapsedTime * 0.25) * 0.08;
  });

  return (
    <mesh ref={meshRef}>
      <icosahedronGeometry args={[radius, 5]} />
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
  );
}
