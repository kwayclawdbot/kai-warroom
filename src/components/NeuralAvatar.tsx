"use client";

import { Canvas, useFrame, useThree } from "@react-three/fiber";
import {
  Bloom,
  EffectComposer,
  Noise,
  Vignette,
} from "@react-three/postprocessing";
import { BlendFunction } from "postprocessing";
import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { useAvatar } from "@/lib/avatar-store";
import { VARIANTS, type VariantId } from "@/lib/cloud-variants";
import { NeuralCloud } from "./avatar/NeuralCloud";
import { RegionLabels } from "./avatar/RegionLabels";

type Props = {
  variant: VariantId;
  /** Optionally suppress labels (for super-clean recordings). */
  showLabels?: boolean;
};

function CameraRig({ baseZ }: { baseZ: number }) {
  const { camera } = useThree();
  useEffect(() => {
    camera.position.set(0, 0, baseZ);
  }, [camera, baseZ]);
  useFrame((_, delta) => {
    const { bass, intensity } = useAvatar.getState();
    const target = baseZ - bass * 0.3 - intensity * 0.12;
    camera.position.z += (target - camera.position.z) * Math.min(1, delta * 4);
  });
  return null;
}

function CoreGlow() {
  // A subtle ever-present inner glow at center — gives the brain a "stem".
  const matRef = useRef<THREE.MeshBasicMaterial>(null);
  const meshRef = useRef<THREE.Mesh>(null);
  useFrame((state, delta) => {
    if (!matRef.current || !meshRef.current) return;
    const { intensity, bass } = useAvatar.getState();
    const o = 0.18 + intensity * 0.25 + bass * 0.18;
    matRef.current.opacity += (o - matRef.current.opacity) * Math.min(1, delta * 6);
    const s = 1.0 + bass * 0.25 + intensity * 0.12;
    meshRef.current.scale.x += (s - meshRef.current.scale.x) * Math.min(1, delta * 6);
    meshRef.current.scale.y = meshRef.current.scale.x;
    meshRef.current.scale.z = meshRef.current.scale.x;
    meshRef.current.rotation.y = state.clock.elapsedTime * 0.05;
  });
  return (
    <mesh ref={meshRef}>
      <sphereGeometry args={[0.32, 24, 24]} />
      <meshBasicMaterial
        ref={matRef}
        color="#ffffff"
        transparent
        depthWrite={false}
        blending={THREE.AdditiveBlending}
        toneMapped={false}
      />
    </mesh>
  );
}

export function NeuralAvatar({ variant, showLabels = true }: Props) {
  const config = VARIANTS[variant];
  const visible = useAvatar((s) => s.visible);
  const [particleCount, setParticleCount] = useState(config.particleCount.desktop);
  const [dpr, setDpr] = useState<[number, number]>([1, 2]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const mobile = window.matchMedia(
      "(max-width: 768px), (pointer: coarse)",
    ).matches;
    setParticleCount(
      mobile ? config.particleCount.mobile : config.particleCount.desktop,
    );
    setDpr(mobile ? [1, 1.5] : [1, 2]);
  }, [config.particleCount.desktop, config.particleCount.mobile]);

  // Generate centroids once per variant to pass to labels (use full count
  // doesn't matter, only the centroid positions, which are deterministic).
  const centroids = useMemo(
    () => config.generate(64).regionCentroids,
    [config],
  );

  return (
    <div
      className="absolute inset-0 transition-opacity duration-500"
      style={{ opacity: visible ? 1 : 0 }}
    >
      <Canvas
        camera={{ position: [0, 0, config.cameraZ], fov: 45 }}
        gl={{
          antialias: false,
          alpha: true,
          powerPreference: "high-performance",
        }}
        dpr={dpr}
      >
        <color attach="background" args={["#000000"]} />
        <ambientLight intensity={0.04} />
        <CameraRig baseZ={config.cameraZ} />
        <CoreGlow />
        <NeuralCloud variant={config} count={particleCount} />
        {showLabels && <RegionLabels centroids={centroids} />}

        <EffectComposer multisampling={0}>
          <Bloom
            intensity={1.7}
            luminanceThreshold={0.08}
            luminanceSmoothing={0.85}
            mipmapBlur
          />
          <Noise opacity={0.02} blendFunction={BlendFunction.OVERLAY} />
          <Vignette eskil={false} offset={0.18} darkness={0.78} />
        </EffectComposer>
      </Canvas>
    </div>
  );
}
