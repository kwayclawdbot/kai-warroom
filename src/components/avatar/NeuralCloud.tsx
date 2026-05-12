"use client";

import { useFrame, useThree } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import * as THREE from "three";
import { useAvatar } from "@/lib/avatar-store";
import { REGIONS } from "@/lib/brain-regions";
import { buildVertexShader, cloudFragmentShader } from "@/lib/cloud-shaders";
import { type VariantConfig, regionColorsFlat } from "@/lib/cloud-variants";

type Props = {
  variant: VariantConfig;
  count: number;
};

export function NeuralCloud({ variant, count }: Props) {
  const matRef = useRef<THREE.ShaderMaterial>(null);
  const { size } = useThree();

  // Generate attributes for this variant (memoized per variant + count).
  const attrs = useMemo(() => variant.generate(count), [variant, count]);

  const uniforms = useMemo(() => {
    const colorArr = regionColorsFlat();
    const colorVecs: THREE.Vector3[] = [];
    for (let i = 0; i < 8; i++) {
      colorVecs.push(
        new THREE.Vector3(colorArr[i * 3], colorArr[i * 3 + 1], colorArr[i * 3 + 2]),
      );
    }
    return {
      uTime: { value: 0 },
      uIntensity: { value: 0 },
      uBass: { value: 0 },
      uMid: { value: 0 },
      uTreble: { value: 0 },
      uPixelRatio: {
        value: Math.min(
          typeof window !== "undefined" ? window.devicePixelRatio : 1,
          2,
        ),
      },
      uResolution: { value: new THREE.Vector2(size.width, size.height) },
      uRegionActivations: { value: new Float32Array(8) },
      uRegionColors: { value: colorVecs },
    };
  }, [size.width, size.height]);

  // Smoothed local copies of activation values (so transitions are creamy).
  const smoothed = useRef(new Float32Array(8));

  const vertexShader = useMemo(
    () => buildVertexShader(variant.vertexBody),
    [variant.vertexBody],
  );

  useFrame((state, delta) => {
    const mat = matRef.current;
    if (!mat) return;

    const s = useAvatar.getState();
    const u = mat.uniforms;
    u.uTime.value = state.clock.elapsedTime;
    u.uIntensity.value += (s.intensity - u.uIntensity.value) * Math.min(1, delta * 5);
    u.uBass.value += (s.bass - u.uBass.value) * Math.min(1, delta * 5);
    u.uMid.value += (s.mid - u.uMid.value) * Math.min(1, delta * 5);
    u.uTreble.value += (s.treble - u.uTreble.value) * Math.min(1, delta * 5);
    u.uResolution.value.set(size.width, size.height);

    const arr = u.uRegionActivations.value as Float32Array;
    const k = Math.min(1, delta * 6);
    for (let i = 0; i < 8; i++) {
      const id = REGIONS[i].id;
      const target = s.regions[id] ?? 0;
      smoothed.current[i] += (target - smoothed.current[i]) * k;
      arr[i] = smoothed.current[i];
    }
  });

  return (
    <points frustumCulled={false}>
      <bufferGeometry>
        <bufferAttribute
          attach="attributes-position"
          args={[attrs.positions, 3]}
          count={attrs.count}
        />
        <bufferAttribute
          attach="attributes-aSeed"
          args={[attrs.seeds, 3]}
          count={attrs.count}
        />
        <bufferAttribute
          attach="attributes-aRand"
          args={[attrs.randoms, 1]}
          count={attrs.count}
        />
        <bufferAttribute
          attach="attributes-aRegion"
          args={[attrs.regions, 1]}
          count={attrs.count}
        />
      </bufferGeometry>
      <shaderMaterial
        ref={matRef}
        uniforms={uniforms}
        vertexShader={vertexShader}
        fragmentShader={cloudFragmentShader}
        transparent
        depthWrite={false}
        blending={THREE.AdditiveBlending}
      />
    </points>
  );
}
