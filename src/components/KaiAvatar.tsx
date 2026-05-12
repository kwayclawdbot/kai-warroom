"use client";

import { Canvas, useFrame, useThree } from "@react-three/fiber";
import {
  Bloom,
  ChromaticAberration,
  EffectComposer,
  Noise,
  Vignette,
} from "@react-three/postprocessing";
import { BlendFunction } from "postprocessing";
import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { useAvatar } from "@/lib/avatar-store";
import { getPalette } from "@/lib/emotion-palette";
import { BrainNetwork } from "./avatar/BrainNetwork";
import { CoreOrb } from "./avatar/CoreOrb";
import { ParticleField } from "./avatar/ParticleField";

type Props = {
  /** Render even smaller on mobile / low-power devices. */
  forceLowPower?: boolean;
};

/** Subtle camera dolly toward the avatar on bass peaks — adds "leap at viewer" feel. */
function CameraRig() {
  const { camera } = useThree();
  const baseZ = useRef(camera.position.z);
  useFrame((_, delta) => {
    const { bass, intensity } = useAvatar.getState();
    const target = baseZ.current - bass * 0.25 - intensity * 0.1;
    camera.position.z += (target - camera.position.z) * Math.min(1, delta * 4);
  });
  return null;
}

/** Animated background haze that picks up the current palette. */
function PaletteBackdrop() {
  const matRef = useRef<THREE.MeshBasicMaterial>(null);
  useFrame((_, delta) => {
    if (!matRef.current) return;
    const { emotion, role } = useAvatar.getState();
    const palette = getPalette(emotion, role);
    const k = Math.min(1, delta * 2);
    matRef.current.color.lerp(palette.bloom, k);
  });
  return (
    <mesh position={[0, 0, -4]}>
      <planeGeometry args={[18, 18]} />
      <meshBasicMaterial
        ref={matRef}
        color="#1a0e2e"
        transparent
        opacity={0.18}
        depthWrite={false}
      />
    </mesh>
  );
}

function AberrationLayer() {
  const offset = useMemo(() => new THREE.Vector2(0, 0), []);
  const ref = useRef<{
    offset: THREE.Vector2;
  } | null>(null);
  useFrame((_, delta) => {
    if (!ref.current) return;
    const { treble, intensity, emotion, role } = useAvatar.getState();
    const palette = getPalette(emotion, role);
    const target =
      (treble * 0.0018 + intensity * 0.0008) * palette.aberration * 4.0;
    const k = Math.min(1, delta * 5);
    offset.x += (target - offset.x) * k;
    offset.y += (target * 0.7 - offset.y) * k;
    ref.current.offset.set(offset.x, offset.y);
  });
  return (
    <ChromaticAberration
      ref={ref as unknown as React.Ref<unknown>}
      offset={offset}
      modulationOffset={0.15}
      radialModulation
      blendFunction={BlendFunction.NORMAL}
    />
  );
}

export function KaiAvatar({ forceLowPower = false }: Props) {
  const [particleCount, setParticleCount] = useState(12000);
  const [dpr, setDpr] = useState<[number, number]>([1, 2]);
  const visible = useAvatar((s) => s.visible);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const mobile =
      forceLowPower ||
      window.matchMedia("(max-width: 768px), (pointer: coarse)").matches;
    // Slightly lower counts than v2 so the brain network reads cleanly.
    setParticleCount(mobile ? 3000 : 8000);
    setDpr(mobile ? [1, 1.5] : [1, 2]);
  }, [forceLowPower]);

  return (
    <div
      className="absolute inset-0 transition-opacity duration-500"
      style={{ opacity: visible ? 1 : 0 }}
    >
      <Canvas
        camera={{ position: [0, 0, 6.0], fov: 45 }}
        gl={{
          antialias: false,
          alpha: true,
          powerPreference: "high-performance",
        }}
        dpr={dpr}
      >
        <color attach="background" args={["#000000"]} />
        <ambientLight intensity={0.05} />
        <CameraRig />
        <PaletteBackdrop />
        <ParticleField count={particleCount} radius={1.05} />
        <CoreOrb />
        <BrainNetwork />

        <EffectComposer multisampling={0}>
          <Bloom
            intensity={1.5}
            luminanceThreshold={0.12}
            luminanceSmoothing={0.85}
            mipmapBlur
          />
          <AberrationLayer />
          <Noise opacity={0.025} blendFunction={BlendFunction.OVERLAY} />
          <Vignette eskil={false} offset={0.18} darkness={0.75} />
        </EffectComposer>
      </Canvas>
    </div>
  );
}
