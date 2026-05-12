"use client";

// Port of wink-at-web/src/components/BrainVisualization.tsx with a region-
// awareness layer added. Same Jarvis aesthetic: sparse nodes, acid green +
// ember orange only, wispy connections, dramatic infrequent synapse cascades.
//
// Each node is tagged with a region (0..7) by spatial zone — when a region
// activates via useAvatar.pulseRegion(id), its nodes shift toward ember
// orange and become preferred origins for cascade fires.

import { Canvas, useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import * as THREE from "three";
import { useAvatar } from "@/lib/avatar-store";
import { REGIONS } from "@/lib/brain-regions";

const NODE_COUNT = 100;
const DUST_COUNT = 240;
const REGION_COUNT = 8;

// ----- Color palette (wink-at-web brand) -----
const ACID = { r: 0.55, g: 1.0, b: 0.12 }; // HSL 72° 100% 50% → acid green
const EMBER = { r: 1.0, g: 0.45, b: 0.08 }; // HSL 30° 100% 50% → ember orange

function NeuralCloud() {
  const groupRef = useRef<THREE.Group>(null);
  const linesRef = useRef<THREE.LineSegments>(null);
  const pointsRef = useRef<THREE.Points>(null);
  const glowPointsRef = useRef<THREE.Points>(null);

  const {
    nodes,
    edges,
    nodeRegions,
    basePositions,
    linePositions,
    glowPositions,
  } = useMemo(() => {
    const nodes: THREE.Vector3[] = [];
    const nodeRegions = new Uint8Array(NODE_COUNT);

    // Soft cloud shape — loosely spherical with organic variance.
    for (let i = 0; i < NODE_COUNT; i++) {
      const phi = Math.acos(2 * Math.random() - 1);
      const theta = Math.random() * Math.PI * 2;
      const r = 1.6 + Math.random() * 2.1;
      const x = r * Math.sin(phi) * Math.cos(theta) * 1.4;
      const y = r * Math.sin(phi) * Math.sin(theta) * 1.0;
      const z = r * Math.cos(phi) * 1.1;
      nodes.push(new THREE.Vector3(x, y, z));
    }

    // Assign each node to the nearest REGION by angular direction. This
    // partitions the cloud into 8 contiguous lobes without changing shape.
    const regionDirs = REGIONS.map((r) => {
      const p = new THREE.Vector3(...r.position);
      return p.normalize();
    });
    for (let i = 0; i < NODE_COUNT; i++) {
      const dir = nodes[i].clone().normalize();
      let bestI = 0;
      let bestDot = -Infinity;
      for (let k = 0; k < regionDirs.length; k++) {
        const d = dir.dot(regionDirs[k]);
        if (d > bestDot) {
          bestDot = d;
          bestI = k;
        }
      }
      nodeRegions[i] = bestI;
    }

    // Longer-range connections for wispy look (same threshold as wink-at-web).
    const edges: [number, number][] = [];
    for (let i = 0; i < NODE_COUNT; i++) {
      for (let j = i + 1; j < NODE_COUNT; j++) {
        const dist = nodes[i].distanceTo(nodes[j]);
        if (dist < 2.9 && Math.random() < 0.28) {
          edges.push([i, j]);
        }
      }
    }

    const basePositions = new Float32Array(NODE_COUNT * 3);
    nodes.forEach((n, i) => {
      basePositions[i * 3] = n.x;
      basePositions[i * 3 + 1] = n.y;
      basePositions[i * 3 + 2] = n.z;
    });

    const linePositions = new Float32Array(edges.length * 6);
    edges.forEach(([a, b], i) => {
      linePositions[i * 6] = nodes[a].x;
      linePositions[i * 6 + 1] = nodes[a].y;
      linePositions[i * 6 + 2] = nodes[a].z;
      linePositions[i * 6 + 3] = nodes[b].x;
      linePositions[i * 6 + 4] = nodes[b].y;
      linePositions[i * 6 + 5] = nodes[b].z;
    });

    // Ambient ember/acid dust.
    const glowPositions = new Float32Array(DUST_COUNT * 3);
    for (let i = 0; i < DUST_COUNT; i++) {
      const phi = Math.acos(2 * Math.random() - 1);
      const theta = Math.random() * Math.PI * 2;
      const r = 0.5 + Math.random() * 3.7;
      glowPositions[i * 3] = r * Math.sin(phi) * Math.cos(theta) * 1.5;
      glowPositions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta) * 1.1;
      glowPositions[i * 3 + 2] = r * Math.cos(phi) * 1.2;
    }

    return {
      nodes,
      edges,
      nodeRegions,
      basePositions,
      linePositions,
      glowPositions,
    };
  }, []);

  const positions = useMemo(
    () => new Float32Array(basePositions),
    [basePositions],
  );
  const lineColors = useMemo(
    () => new Float32Array(edges.length * 6),
    [edges],
  );
  const pointColors = useMemo(
    () => new Float32Array(NODE_COUNT * 3),
    [],
  );
  const pointSizes = useMemo(() => new Float32Array(NODE_COUNT), []);
  const glowColors = useMemo(() => new Float32Array(DUST_COUNT * 3), []);

  // Internal smoothed region activations (0..1) for stable color transitions.
  const regionActSmooth = useRef(new Float32Array(REGION_COUNT));
  // Synapse firing queue.
  const firingRef = useRef<
    { edgeIdx: number; startTime: number; intensity: number; ember: boolean }[]
  >([]);

  // Pre-compute which edges belong to which region (an edge "belongs" to
  // region X if its midpoint's nearest region is X — used to bias cascades).
  const edgeRegion = useMemo(() => {
    const out = new Uint8Array(edges.length);
    for (let i = 0; i < edges.length; i++) {
      out[i] = nodeRegions[edges[i][0]];
    }
    return out;
  }, [edges, nodeRegions]);

  useFrame(({ clock }, delta) => {
    const t = clock.elapsedTime;
    const state = useAvatar.getState();

    // 1) Smooth region activation values from store.
    const k = Math.min(1, delta * 5);
    for (let r = 0; r < REGION_COUNT; r++) {
      const id = REGIONS[r].id;
      const target = state.regions[id] ?? 0;
      regionActSmooth.current[r] += (target - regionActSmooth.current[r]) * k;
    }

    if (groupRef.current) {
      // Slow, dreamy rotation + gentle breathing (bass-modulated).
      groupRef.current.rotation.y = t * 0.06;
      groupRef.current.rotation.x = Math.sin(t * 0.04) * 0.08;
      const breathe = 1.0 + Math.sin(t * 0.3) * 0.02 + state.bass * 0.04;
      groupRef.current.scale.setScalar(breathe);
    }

    // 2) Drift nodes organically.
    if (pointsRef.current) {
      const geo = pointsRef.current.geometry;
      const pos = geo.attributes.position.array as Float32Array;
      for (let i = 0; i < NODE_COUNT; i++) {
        const seed = i * 0.7;
        pos[i * 3] = basePositions[i * 3] + Math.sin(t * 0.2 + seed) * 0.15;
        pos[i * 3 + 1] =
          basePositions[i * 3 + 1] + Math.cos(t * 0.15 + seed * 1.3) * 0.15;
        pos[i * 3 + 2] =
          basePositions[i * 3 + 2] + Math.sin(t * 0.25 + seed * 0.9) * 0.1;
      }
      geo.attributes.position.needsUpdate = true;

      // Mirror to line endpoints.
      if (linesRef.current) {
        const lineGeo = linesRef.current.geometry;
        const linePos = lineGeo.attributes.position.array as Float32Array;
        for (let i = 0; i < edges.length; i++) {
          const [a, b] = edges[i];
          linePos[i * 6] = pos[a * 3];
          linePos[i * 6 + 1] = pos[a * 3 + 1];
          linePos[i * 6 + 2] = pos[a * 3 + 2];
          linePos[i * 6 + 3] = pos[b * 3];
          linePos[i * 6 + 4] = pos[b * 3 + 1];
          linePos[i * 6 + 5] = pos[b * 3 + 2];
        }
        lineGeo.attributes.position.needsUpdate = true;
      }

      // 3) Node colors — interpolate between acid (idle) and ember (active).
      for (let i = 0; i < NODE_COUNT; i++) {
        const region = nodeRegions[i];
        const act = regionActSmooth.current[region]; // 0..1
        const pulse = Math.sin(t * 1.2 + i * 1.1) * 0.5 + 0.5;

        // Mix acid → ember by activation, then add per-node sparkle pulse.
        const mix = Math.min(1, act);
        const baseR = ACID.r + (EMBER.r - ACID.r) * mix;
        const baseG = ACID.g + (EMBER.g - ACID.g) * mix;
        const baseB = ACID.b + (EMBER.b - ACID.b) * mix;

        // Brightness scales with activation + per-node pulse.
        const brightness = 0.55 + pulse * 0.35 + act * 0.4;
        pointColors[i * 3] = baseR * brightness;
        pointColors[i * 3 + 1] = baseG * brightness;
        pointColors[i * 3 + 2] = baseB * brightness;

        // Sizes: bigger when active, slightly bigger on pulse.
        pointSizes[i] = 0.12 + pulse * 0.05 + act * 0.18;
      }
      geo.setAttribute(
        "color",
        new THREE.BufferAttribute(pointColors, 3),
      );
      geo.attributes.color.needsUpdate = true;
    }

    // 4) Spawn synapse cascades. Probability ramps with the max active region
    // value — when the brain is "thinking hard" you see more firings.
    let maxAct = 0;
    let hotRegion = -1;
    for (let r = 0; r < REGION_COUNT; r++) {
      if (regionActSmooth.current[r] > maxAct) {
        maxAct = regionActSmooth.current[r];
        hotRegion = r;
      }
    }
    const baseRate = 0.04;
    const hotRate = baseRate + maxAct * 0.16;

    if (Math.random() < hotRate) {
      // Cascade origin: bias toward edges in the hot region.
      let startEdge = Math.floor(Math.random() * edges.length);
      if (hotRegion >= 0 && Math.random() < 0.7) {
        const regionEdges: number[] = [];
        for (let i = 0; i < edges.length; i++) {
          if (edgeRegion[i] === hotRegion) regionEdges.push(i);
        }
        if (regionEdges.length > 0) {
          startEdge =
            regionEdges[Math.floor(Math.random() * regionEdges.length)];
        }
      }
      const cascadeCount = 2 + Math.floor(Math.random() * 4);
      const startNode = edges[startEdge][1];
      const cascadeIsEmber = hotRegion >= 0 && Math.random() < 0.6;

      for (let c = 0; c < cascadeCount; c++) {
        const connected = edges
          .map((e, idx) => ({ e, idx }))
          .filter(({ e }) => e[0] === startNode || e[1] === startNode);
        if (connected.length > 0) {
          const pick = connected[Math.floor(Math.random() * connected.length)];
          firingRef.current.push({
            edgeIdx: pick.idx,
            startTime: t + c * 0.08,
            intensity: 1.0 - c * 0.1,
            ember: cascadeIsEmber,
          });
        }
      }
    }
    // Expire old firings.
    firingRef.current = firingRef.current.filter(
      (f) => t - f.startTime < 0.85,
    );

    // 5) Line colors.
    if (linesRef.current) {
      const geo = linesRef.current.geometry;
      for (let i = 0; i < edges.length; i++) {
        const firing = firingRef.current.find(
          (f) => f.edgeIdx === i && t >= f.startTime,
        );
        if (firing) {
          const age = t - firing.startTime;
          const fadeIn = Math.min(age / 0.05, 1);
          const fadeOut = Math.max(0, 1 - (age - 0.1) / 0.7);
          const brightness = fadeIn * fadeOut * firing.intensity;
          // White-hot peak that decays into ember or acid.
          const r = brightness * (firing.ember ? 1.0 : 0.85);
          const g = brightness * (firing.ember ? 0.55 : 1.0);
          const b = brightness * (firing.ember ? 0.1 : 0.35);
          lineColors[i * 6] = r;
          lineColors[i * 6 + 1] = g;
          lineColors[i * 6 + 2] = b;
          lineColors[i * 6 + 3] = r;
          lineColors[i * 6 + 4] = g;
          lineColors[i * 6 + 5] = b;
        } else {
          // Dim ambient connection — slightly hotter for active regions.
          const region = edgeRegion[i];
          const act = regionActSmooth.current[region];
          const dim = 0.06 + Math.sin(t * 0.5 + i * 0.2) * 0.03 + act * 0.12;
          // Shift toward ember in active regions.
          const mix = Math.min(1, act);
          lineColors[i * 6] = dim * (0.5 + mix * 0.5);
          lineColors[i * 6 + 1] = dim * (1.0 - mix * 0.4);
          lineColors[i * 6 + 2] = dim * (0.0 + mix * 0.1);
          lineColors[i * 6 + 3] = lineColors[i * 6];
          lineColors[i * 6 + 4] = lineColors[i * 6 + 1];
          lineColors[i * 6 + 5] = lineColors[i * 6 + 2];
        }
      }
      geo.setAttribute(
        "color",
        new THREE.BufferAttribute(lineColors, 3),
      );
      geo.attributes.color.needsUpdate = true;
    }

    // 6) Ambient glow particles.
    if (glowPointsRef.current) {
      const geo = glowPointsRef.current.geometry;
      const pos = geo.attributes.position.array as Float32Array;
      for (let i = 0; i < DUST_COUNT; i++) {
        const seed = i * 0.4;
        pos[i * 3] += Math.sin(t * 0.1 + seed) * 0.002;
        pos[i * 3 + 1] += Math.cos(t * 0.08 + seed) * 0.002;
        pos[i * 3 + 2] += Math.sin(t * 0.12 + seed * 0.7) * 0.001;

        const pulse = Math.sin(t * 0.8 + i * 0.3) * 0.5 + 0.5;
        if (i % 5 === 0) {
          glowColors[i * 3] = 0.35 + pulse * 0.3;
          glowColors[i * 3 + 1] = 0.16 + pulse * 0.15;
          glowColors[i * 3 + 2] = 0;
        } else {
          glowColors[i * 3] = 0.18 + pulse * 0.22;
          glowColors[i * 3 + 1] = 0.3 + pulse * 0.35;
          glowColors[i * 3 + 2] = 0;
        }
      }
      geo.attributes.position.needsUpdate = true;
      geo.setAttribute(
        "color",
        new THREE.BufferAttribute(glowColors, 3),
      );
      geo.attributes.color.needsUpdate = true;
    }
  });

  return (
    <group ref={groupRef}>
      {/* Ambient dust */}
      <points ref={glowPointsRef}>
        <bufferGeometry>
          <bufferAttribute
            attach="attributes-position"
            args={[glowPositions, 3]}
            count={DUST_COUNT}
          />
        </bufferGeometry>
        <pointsMaterial
          vertexColors
          size={0.04}
          transparent
          opacity={0.45}
          sizeAttenuation
        />
      </points>

      {/* Synaptic connections */}
      <lineSegments ref={linesRef}>
        <bufferGeometry>
          <bufferAttribute
            attach="attributes-position"
            args={[linePositions, 3]}
            count={edges.length * 2}
          />
        </bufferGeometry>
        <lineBasicMaterial vertexColors transparent opacity={0.7} />
      </lineSegments>

      {/* Core nodes */}
      <points ref={pointsRef}>
        <bufferGeometry>
          <bufferAttribute
            attach="attributes-position"
            args={[positions, 3]}
            count={NODE_COUNT}
          />
        </bufferGeometry>
        <pointsMaterial
          vertexColors
          size={0.16}
          transparent
          opacity={0.9}
          sizeAttenuation
        />
      </points>
    </group>
  );
}

export function KaiBrain() {
  return (
    <div className="absolute inset-0 pointer-events-none">
      {/* Soft radial backdrop matching wink-at-web's hero glow. */}
      <div
        className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[700px] h-[700px] md:w-[1100px] md:h-[1100px]"
        style={{
          background:
            "radial-gradient(circle, hsla(72, 100%, 50%, 0.14) 0%, hsla(30, 100%, 50%, 0.07) 40%, transparent 70%)",
          filter: "blur(40px)",
        }}
      />
      <Canvas
        camera={{ position: [0, 0, 7], fov: 50 }}
        dpr={[1, 1.5]}
        gl={{ antialias: true, alpha: true }}
        style={{ background: "transparent" }}
      >
        <NeuralCloud />
      </Canvas>
    </div>
  );
}
