"use client";

// Obsidian-vault-graph-style neural mesh. ~300 nodes, ~1200 curved edges,
// region-tagged colors, constant swirl + per-node drift, drag-to-orbit /
// scroll-to-zoom controls in the spirit of kai-face.vercel.app.

import { OrbitControls } from "@react-three/drei";
import { Canvas, useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import * as THREE from "three";
import { useAvatar } from "@/lib/avatar-store";
import { REGIONS } from "@/lib/brain-regions";

const NODE_COUNT = 320;
const K_NEAREST = 5; // each node connects to 5 nearest = ~1200 unique edges
const EDGE_SEGMENTS = 9; // points along each bezier curve → smooth, not angular
const VERTS_PER_EDGE = EDGE_SEGMENTS * 2; // line segments need 2 verts each
const ELLIPSOID = { x: 1.65, y: 1.35, z: 1.15 };
const DRIFT_AMP = 0.075;

// ---- Helpers ----------------------------------------------------------------

function ellipsoidPoint(): [number, number, number] {
  // Uniform-ish point inside a unit ball, then map to ellipsoid.
  let x = 0,
    y = 0,
    z = 0,
    d = 2;
  while (d > 1) {
    x = Math.random() * 2 - 1;
    y = Math.random() * 2 - 1;
    z = Math.random() * 2 - 1;
    d = x * x + y * y + z * z;
  }
  // Bias outward a bit so the cloud has visible "skin".
  const r = Math.cbrt(d) * (0.55 + Math.random() * 0.45);
  const inv = r / Math.max(Math.sqrt(d), 1e-6);
  return [x * inv * ELLIPSOID.x, y * inv * ELLIPSOID.y, z * inv * ELLIPSOID.z];
}

function generateNodes() {
  const positions: THREE.Vector3[] = [];
  const regions = new Uint8Array(NODE_COUNT);
  const seeds = new Float32Array(NODE_COUNT);

  const regionDirs = REGIONS.map((r) =>
    new THREE.Vector3(...r.position).normalize(),
  );

  for (let i = 0; i < NODE_COUNT; i++) {
    const [x, y, z] = ellipsoidPoint();
    positions.push(new THREE.Vector3(x, y, z));
    seeds[i] = Math.random() * 1000;

    // Region = closest region anchor by direction.
    const dir = positions[i].clone().normalize();
    let bestI = 0;
    let bestDot = -Infinity;
    for (let k = 0; k < regionDirs.length; k++) {
      const d = dir.dot(regionDirs[k]);
      if (d > bestDot) {
        bestDot = d;
        bestI = k;
      }
    }
    regions[i] = bestI;
  }
  return { positions, regions, seeds };
}

/** Build k-nearest-neighbor edges, deduplicated. */
function buildEdges(positions: THREE.Vector3[]): [number, number][] {
  const edges: [number, number][] = [];
  const seen = new Set<string>();
  const distances: { idx: number; d: number }[] = [];

  for (let i = 0; i < NODE_COUNT; i++) {
    distances.length = 0;
    for (let j = 0; j < NODE_COUNT; j++) {
      if (i === j) continue;
      distances.push({ idx: j, d: positions[i].distanceToSquared(positions[j]) });
    }
    distances.sort((a, b) => a.d - b.d);
    for (let k = 0; k < K_NEAREST; k++) {
      const j = distances[k].idx;
      const key = i < j ? `${i}-${j}` : `${j}-${i}`;
      if (!seen.has(key)) {
        seen.add(key);
        edges.push([i, j]);
      }
    }
  }
  return edges;
}

/** Pre-compute curved (bezier) sample points + per-vertex region info. */
function buildCurvedEdgeGeometry(
  nodes: THREE.Vector3[],
  edges: [number, number][],
  regions: Uint8Array,
) {
  const edgeCount = edges.length;
  const positions = new Float32Array(edgeCount * VERTS_PER_EDGE * 3);
  const colors = new Float32Array(edgeCount * VERTS_PER_EDGE * 3);
  // For each vertex: (edgeIdx, endpointA, endpointB, t-along-curve)
  const edgeInfo = new Uint16Array(edgeCount * VERTS_PER_EDGE * 3);
  const tValues = new Float32Array(edgeCount * VERTS_PER_EDGE);

  const up = new THREE.Vector3(0, 1, 0);
  const tmp = new THREE.Vector3();

  for (let e = 0; e < edgeCount; e++) {
    const [a, b] = edges[e];
    const A = nodes[a];
    const B = nodes[b];

    // Bend midpoint perpendicular to A→B, with small random magnitude.
    const dir = tmp.copy(B).sub(A).normalize();
    let bendAxis = new THREE.Vector3().crossVectors(dir, up);
    if (bendAxis.lengthSq() < 1e-4) {
      bendAxis = new THREE.Vector3(1, 0, 0);
    }
    bendAxis.normalize();
    // Random rotation around the dir so the bend doesn't always lift "up".
    const rotAngle = Math.random() * Math.PI * 2;
    bendAxis.applyAxisAngle(dir, rotAngle);
    const edgeLen = A.distanceTo(B);
    const bendMag = edgeLen * (0.14 + Math.random() * 0.16);
    const mid = new THREE.Vector3()
      .addVectors(A, B)
      .multiplyScalar(0.5)
      .add(bendAxis.multiplyScalar(bendMag));

    const curve = new THREE.QuadraticBezierCurve3(A, mid, B);
    const samples = curve.getPoints(EDGE_SEGMENTS);

    // Emit line segments: (samples[0..1], samples[1..2], ...)
    for (let s = 0; s < EDGE_SEGMENTS; s++) {
      for (let end = 0; end < 2; end++) {
        const sample = samples[s + end];
        const vIdx = e * VERTS_PER_EDGE + s * 2 + end;
        positions[vIdx * 3] = sample.x;
        positions[vIdx * 3 + 1] = sample.y;
        positions[vIdx * 3 + 2] = sample.z;
        tValues[vIdx] = (s + end) / EDGE_SEGMENTS;
        edgeInfo[vIdx * 3] = e;
        edgeInfo[vIdx * 3 + 1] = regions[a];
        edgeInfo[vIdx * 3 + 2] = regions[b];
      }
    }
  }
  return { positions, colors, edgeInfo, tValues, edgeCount };
}

// ---- The cloud --------------------------------------------------------------

function NeuralGraph() {
  const groupRef = useRef<THREE.Group>(null);
  const nodesRef = useRef<THREE.Points>(null);
  const edgesRef = useRef<THREE.LineSegments>(null);

  // Build the graph ONCE.
  const graph = useMemo(() => {
    const { positions, regions, seeds } = generateNodes();
    const edges = buildEdges(positions);
    const edgeGeo = buildCurvedEdgeGeometry(positions, edges, regions);
    const basePositions = new Float32Array(NODE_COUNT * 3);
    positions.forEach((p, i) => {
      basePositions[i * 3] = p.x;
      basePositions[i * 3 + 1] = p.y;
      basePositions[i * 3 + 2] = p.z;
    });
    return {
      positions,
      regions,
      seeds,
      edges,
      edgeGeo,
      basePositions,
    };
  }, []);

  // Mutable per-frame buffers.
  const nodePositions = useMemo(
    () => new Float32Array(graph.basePositions),
    [graph.basePositions],
  );
  const nodeColors = useMemo(() => new Float32Array(NODE_COUNT * 3), []);
  const edgeColors = graph.edgeGeo.colors;

  // Smoothed region activations.
  const regionActSmooth = useRef(new Float32Array(8));
  const cascadesRef = useRef<
    { edgeIdx: number; startTime: number; intensity: number }[]
  >([]);

  // Map node → list of edge indices for cascade chaining.
  const nodeEdges = useMemo(() => {
    const m: number[][] = Array.from({ length: NODE_COUNT }, () => []);
    graph.edges.forEach(([a, b], i) => {
      m[a].push(i);
      m[b].push(i);
    });
    return m;
  }, [graph.edges]);

  useFrame((state, delta) => {
    const t = state.clock.elapsedTime;
    const grp = groupRef.current;
    const nodes = nodesRef.current;
    const edges = edgesRef.current;
    if (!grp || !nodes || !edges) return;

    // Constant swirl — runs regardless of audio/region state.
    grp.rotation.y = t * 0.05;
    grp.rotation.x = Math.sin(t * 0.035) * 0.12;

    // Smooth region activations from store.
    const state2 = useAvatar.getState();
    const k = Math.min(1, delta * 5);
    let maxAct = 0;
    let hotRegion = -1;
    for (let r = 0; r < 8; r++) {
      const target = state2.regions[REGIONS[r].id] ?? 0;
      regionActSmooth.current[r] +=
        (target - regionActSmooth.current[r]) * k;
      if (regionActSmooth.current[r] > maxAct) {
        maxAct = regionActSmooth.current[r];
        hotRegion = r;
      }
    }

    // 1) Node drift + color.
    for (let i = 0; i < NODE_COUNT; i++) {
      const seed = graph.seeds[i];
      const region = graph.regions[i];
      const act = regionActSmooth.current[region];
      const pulse = Math.sin(t * 1.1 + seed * 0.7) * 0.5 + 0.5;

      // Independent drift — each node moves on its own sine path.
      nodePositions[i * 3] =
        graph.basePositions[i * 3] +
        Math.sin(t * 0.25 + seed) * DRIFT_AMP;
      nodePositions[i * 3 + 1] =
        graph.basePositions[i * 3 + 1] +
        Math.cos(t * 0.21 + seed * 1.3) * DRIFT_AMP;
      nodePositions[i * 3 + 2] =
        graph.basePositions[i * 3 + 2] +
        Math.sin(t * 0.19 + seed * 0.7) * DRIFT_AMP * 0.7;

      // Region-colored node: dim baseline, brighter + slightly hotter on activation.
      const rc = REGIONS[region].color;
      const baseBrightness = 0.45 + pulse * 0.18 + act * 0.55;
      // Add a touch of white at activation peak for hot-center feel.
      const whiteMix = act * 0.18 * pulse;
      nodeColors[i * 3] = Math.min(1, rc.r * baseBrightness + whiteMix);
      nodeColors[i * 3 + 1] = Math.min(1, rc.g * baseBrightness + whiteMix);
      nodeColors[i * 3 + 2] = Math.min(1, rc.b * baseBrightness + whiteMix);
    }
    nodes.geometry.attributes.position.needsUpdate = true;
    nodes.geometry.attributes.color.needsUpdate = true;

    // 2) Edge colors — gradient between endpoint region colors, brightness =
    //    avg activation. Cascade fires add white-hot brightness.
    for (let e = 0; e < graph.edgeGeo.edgeCount; e++) {
      const ia = graph.edges[e][0];
      const ib = graph.edges[e][1];
      const ra = graph.regions[ia];
      const rb = graph.regions[ib];
      const actA = regionActSmooth.current[ra];
      const actB = regionActSmooth.current[rb];
      const avgAct = (actA + actB) * 0.5;
      const sameRegion = ra === rb ? 1 : 0;
      // Inter-region edges stay dimmer so the regions read as zones.
      const baseBrightness =
        0.08 + avgAct * (sameRegion ? 0.55 : 0.32) + sameRegion * 0.04;

      const colA = REGIONS[ra].color;
      const colB = REGIONS[rb].color;

      for (let v = 0; v < VERTS_PER_EDGE; v++) {
        const vIdx = e * VERTS_PER_EDGE + v;
        const tt = graph.edgeGeo.tValues[vIdx];
        const r = colA.r + (colB.r - colA.r) * tt;
        const g = colA.g + (colB.g - colA.g) * tt;
        const b = colA.b + (colB.b - colA.b) * tt;
        edgeColors[vIdx * 3] = r * baseBrightness;
        edgeColors[vIdx * 3 + 1] = g * baseBrightness;
        edgeColors[vIdx * 3 + 2] = b * baseBrightness;
      }
    }

    // 3) Synapse cascades — probability ramps with max activation. Cascade
    //    walks a short chain of connected edges with stagger and decay.
    const fireRate = 0.05 + maxAct * 0.18;
    if (Math.random() < fireRate) {
      // Pick origin node: bias toward the hot region's nodes.
      let originNode = Math.floor(Math.random() * NODE_COUNT);
      if (hotRegion >= 0 && Math.random() < 0.75) {
        const hotNodes: number[] = [];
        for (let i = 0; i < NODE_COUNT; i++) {
          if (graph.regions[i] === hotRegion) hotNodes.push(i);
        }
        if (hotNodes.length > 0) {
          originNode = hotNodes[Math.floor(Math.random() * hotNodes.length)];
        }
      }
      const chainLen = 3 + Math.floor(Math.random() * 4);
      let currentNode = originNode;
      for (let c = 0; c < chainLen; c++) {
        const candidates = nodeEdges[currentNode];
        if (candidates.length === 0) break;
        const edgeIdx =
          candidates[Math.floor(Math.random() * candidates.length)];
        cascadesRef.current.push({
          edgeIdx,
          startTime: t + c * 0.07,
          intensity: 1 - c * 0.12,
        });
        // Walk to the other end for next hop.
        const [ea, eb] = graph.edges[edgeIdx];
        currentNode = currentNode === ea ? eb : ea;
      }
    }
    // Expire old.
    cascadesRef.current = cascadesRef.current.filter(
      (c) => t - c.startTime < 0.85,
    );

    // 4) Overlay cascade white-hot brightness onto edges.
    for (const c of cascadesRef.current) {
      const age = t - c.startTime;
      if (age < 0) continue;
      const fadeIn = Math.min(age / 0.05, 1);
      const fadeOut = Math.max(0, 1 - (age - 0.1) / 0.7);
      const boost = fadeIn * fadeOut * c.intensity;
      if (boost <= 0) continue;
      const baseV = c.edgeIdx * VERTS_PER_EDGE;
      for (let v = 0; v < VERTS_PER_EDGE; v++) {
        const idx = (baseV + v) * 3;
        edgeColors[idx] = Math.min(1, edgeColors[idx] + boost);
        edgeColors[idx + 1] = Math.min(1, edgeColors[idx + 1] + boost);
        edgeColors[idx + 2] = Math.min(1, edgeColors[idx + 2] + boost);
      }
    }
    edges.geometry.attributes.color.needsUpdate = true;
  });

  return (
    <group ref={groupRef}>
      {/* Edges first so nodes draw on top. */}
      <lineSegments ref={edgesRef}>
        <bufferGeometry>
          <bufferAttribute
            attach="attributes-position"
            args={[graph.edgeGeo.positions, 3]}
            count={graph.edgeGeo.edgeCount * VERTS_PER_EDGE}
          />
          <bufferAttribute
            attach="attributes-color"
            args={[edgeColors, 3]}
            count={graph.edgeGeo.edgeCount * VERTS_PER_EDGE}
          />
        </bufferGeometry>
        <lineBasicMaterial
          vertexColors
          transparent
          opacity={0.9}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
          toneMapped={false}
        />
      </lineSegments>

      <points ref={nodesRef}>
        <bufferGeometry>
          <bufferAttribute
            attach="attributes-position"
            args={[nodePositions, 3]}
            count={NODE_COUNT}
          />
          <bufferAttribute
            attach="attributes-color"
            args={[nodeColors, 3]}
            count={NODE_COUNT}
          />
        </bufferGeometry>
        <pointsMaterial
          vertexColors
          size={0.13}
          transparent
          opacity={0.95}
          sizeAttenuation
          blending={THREE.AdditiveBlending}
          depthWrite={false}
          toneMapped={false}
        />
      </points>
    </group>
  );
}

export function KaiBrain() {
  return (
    <div className="absolute inset-0">
      {/* Subtle radial backdrop — kai-face uses near-black, we keep that vibe. */}
      <div
        className="pointer-events-none absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] md:w-[1200px] md:h-[1200px]"
        style={{
          background:
            "radial-gradient(circle, hsla(45, 90%, 55%, 0.08) 0%, hsla(280, 70%, 55%, 0.04) 45%, transparent 70%)",
          filter: "blur(60px)",
        }}
      />
      <Canvas
        camera={{ position: [0, 0, 5.6], fov: 50 }}
        dpr={[1, 2]}
        gl={{ antialias: true, alpha: true }}
        style={{ background: "transparent" }}
      >
        <NeuralGraph />
        <OrbitControls
          enableDamping
          dampingFactor={0.06}
          enablePan={false}
          minDistance={3.5}
          maxDistance={11}
          rotateSpeed={0.5}
          zoomSpeed={0.6}
        />
      </Canvas>
    </div>
  );
}
