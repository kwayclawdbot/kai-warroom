"use client";

import { Canvas, useFrame } from "@react-three/fiber";
import { useRef } from "react";
import * as THREE from "three";
import { useAvatar } from "@/lib/avatar-store";

function CorePlaceholder() {
  const meshRef = useRef<THREE.Mesh>(null);
  const matRef = useRef<THREE.MeshStandardMaterial>(null);
  const intensity = useAvatar((s) => s.intensity);
  const emotion = useAvatar((s) => s.emotion);

  useFrame((state) => {
    const t = state.clock.elapsedTime;
    if (!meshRef.current || !matRef.current) return;
    const breathe = 1 + Math.sin(t * 1.2) * 0.04;
    const pulse = 1 + intensity * 0.35;
    meshRef.current.scale.setScalar(breathe * pulse);
    meshRef.current.rotation.y = t * 0.12;
    meshRef.current.rotation.x = Math.sin(t * 0.3) * 0.1;
    const hue = emotionToHue(emotion);
    matRef.current.color.setHSL(hue, 0.65, 0.55);
    matRef.current.emissive.setHSL(hue, 0.9, 0.35 + intensity * 0.25);
    matRef.current.emissiveIntensity = 0.6 + intensity * 0.8;
  });

  return (
    <mesh ref={meshRef}>
      <icosahedronGeometry args={[1.4, 4]} />
      <meshStandardMaterial
        ref={matRef}
        wireframe
        toneMapped={false}
      />
    </mesh>
  );
}

function emotionToHue(e: string): number {
  switch (e) {
    case "hype":
    case "bullish":
      return 0.42; // green-cyan
    case "bearish":
    case "warning":
      return 0.95; // magenta-red
    case "chill":
      return 0.55; // blue
    case "teach":
      return 0.74; // violet
    default:
      return 0.72; // idle violet
  }
}

export function AvatarStub() {
  return (
    <Canvas
      camera={{ position: [0, 0, 4.5], fov: 45 }}
      gl={{ antialias: true, alpha: true }}
      dpr={[1, 2]}
    >
      <ambientLight intensity={0.15} />
      <pointLight position={[3, 3, 5]} intensity={2.2} color="#8ae6ff" />
      <pointLight position={[-3, -2, -3]} intensity={1.4} color="#c08aff" />
      <CorePlaceholder />
    </Canvas>
  );
}
