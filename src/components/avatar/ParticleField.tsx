"use client";

import { useFrame, useThree } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import * as THREE from "three";
import { useAvatar } from "@/lib/avatar-store";
import { getPalette } from "@/lib/emotion-palette";
import { particleFragment, particleVertex } from "@/lib/avatar-shaders";

type Props = {
  count?: number;
  radius?: number;
};

export function ParticleField({ count = 12000, radius = 1.4 }: Props) {
  const matRef = useRef<THREE.ShaderMaterial>(null);
  const { size, viewport } = useThree();

  const { positions, seeds, randoms, layers } = useMemo(() => {
    const positions = new Float32Array(count * 3);
    const seeds = new Float32Array(count * 3);
    const randoms = new Float32Array(count);
    const layers = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      // Uniform point on a unit sphere via rejection sampling.
      let x = 0,
        y = 0,
        z = 0,
        d = 0;
      do {
        x = Math.random() * 2 - 1;
        y = Math.random() * 2 - 1;
        z = Math.random() * 2 - 1;
        d = x * x + y * y + z * z;
      } while (d > 1 || d < 0.0001);
      const inv = 1 / Math.sqrt(d);
      seeds[i * 3] = x * inv;
      seeds[i * 3 + 1] = y * inv;
      seeds[i * 3 + 2] = z * inv;
      randoms[i] = Math.random();
      // Layer 0 = innermost (denser, brighter); 1 = outermost (wispier).
      // Bias toward inner shell so the core feels solid.
      const r = Math.random();
      layers[i] = Math.pow(r, 0.7);
      positions[i * 3] = 0;
      positions[i * 3 + 1] = 0;
      positions[i * 3 + 2] = 0;
    }
    return { positions, seeds, randoms, layers };
  }, [count]);

  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uIntensity: { value: 0 },
      uBass: { value: 0 },
      uMid: { value: 0 },
      uTreble: { value: 0 },
      uRadius: { value: radius },
      uExpansion: { value: 1.0 },
      uDriftSpeed: { value: 0.8 },
      uPixelRatio: { value: Math.min(window.devicePixelRatio ?? 1, 2) },
      uResolution: { value: new THREE.Vector2(size.width, size.height) },
      uCore: { value: new THREE.Color("#7a5cff") },
      uAccent: { value: new THREE.Color("#a0e0ff") },
    }),
    [radius, size.width, size.height],
  );

  useFrame((state, delta) => {
    const mat = matRef.current;
    if (!mat) return;

    const { intensity, bass, mid, treble, emotion, role } =
      useAvatar.getState();
    const palette = getPalette(emotion, role);

    const u = mat.uniforms;
    u.uTime.value = state.clock.elapsedTime;
    u.uResolution.value.set(size.width, size.height);

    // Smooth value lerps for cinematic transitions.
    const k = Math.min(1, delta * 5);
    u.uIntensity.value += (intensity - u.uIntensity.value) * k;
    u.uBass.value += (bass - u.uBass.value) * k;
    u.uMid.value += (mid - u.uMid.value) * k;
    u.uTreble.value += (treble - u.uTreble.value) * k;
    u.uExpansion.value += (palette.expansion - u.uExpansion.value) * k;
    u.uDriftSpeed.value += (palette.driftSpeed - u.uDriftSpeed.value) * k;

    // Color lerps — about 400ms full transition.
    const kColor = Math.min(1, delta * 3);
    (u.uCore.value as THREE.Color).lerp(palette.core, kColor);
    (u.uAccent.value as THREE.Color).lerp(palette.accent, kColor);
  });

  // viewport.width keeps a margin; nudge camera distance by scene scale in KaiAvatar.
  void viewport;

  return (
    <points frustumCulled={false}>
      <bufferGeometry>
        <bufferAttribute
          attach="attributes-position"
          args={[positions, 3]}
          count={count}
        />
        <bufferAttribute
          attach="attributes-aSeed"
          args={[seeds, 3]}
          count={count}
        />
        <bufferAttribute
          attach="attributes-aRand"
          args={[randoms, 1]}
          count={count}
        />
        <bufferAttribute
          attach="attributes-aLayer"
          args={[layers, 1]}
          count={count}
        />
      </bufferGeometry>
      <shaderMaterial
        ref={matRef}
        uniforms={uniforms}
        vertexShader={particleVertex}
        fragmentShader={particleFragment}
        transparent
        depthWrite={false}
        blending={THREE.AdditiveBlending}
      />
    </points>
  );
}
