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

const NODE_COUNT = 2000;
const K_NEAREST = 4; // 2000 nodes × 4 nearest ≈ 4000 unique edges after dedupe
const EDGE_SEGMENTS = 6; // points along each bezier curve — fewer is fine since curves are gentler
const VERTS_PER_EDGE = EDGE_SEGMENTS * 2; // line segments need 2 verts each
// More compact + still slightly elongated front-back, with sagittal fissure.
const ELLIPSOID = { x: 0.88, y: 0.77, z: 0.98 };
const DRIFT_AMP = 0.032;

// ---- Helpers ----------------------------------------------------------------

function brainShapedPoint(): [number, number, number] {
  // Sample in unit ball, map to ellipsoid, then apply two anatomical tweaks:
  // (1) bias density to the outer shell (cortex), (2) thin out the sagittal
  // plane to create a soft longitudinal fissure separating two hemispheres.
  for (let tries = 0; tries < 30; tries++) {
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
    // Cortical density bias — most nodes live near the outer surface.
    const r = Math.cbrt(d) * (0.7 + Math.random() * 0.3);
    const inv = r / Math.max(Math.sqrt(d), 1e-6);
    let px = x * inv * ELLIPSOID.x;
    let py = y * inv * ELLIPSOID.y;
    let pz = z * inv * ELLIPSOID.z;

    // Longitudinal fissure: reject most samples near the x=0 plane to create
    // a thin gap between hemispheres. Falls off quickly with distance.
    const xNorm = Math.abs(px) / ELLIPSOID.x;
    const fissureKeep = 1 - Math.exp(-(xNorm * xNorm) / 0.012) * 0.85;
    if (Math.random() > fissureKeep) continue;

    // Subtle ventral curve — frontal lobe slightly lower at the front.
    if (pz > 0.4) {
      py -= (pz - 0.4) * 0.08;
    }

    return [px, py, pz];
  }
  return [0, 0, 0];
}

function generateNodes() {
  const positions: THREE.Vector3[] = [];
  const regions = new Uint8Array(NODE_COUNT);
  const seeds = new Float32Array(NODE_COUNT);

  const regionDirs = REGIONS.map((r) =>
    new THREE.Vector3(...r.position).normalize(),
  );

  for (let i = 0; i < NODE_COUNT; i++) {
    const [x, y, z] = brainShapedPoint();
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

/** Pre-compute curved (bezier) sample points + per-vertex region info + baseline gradient colors. */
function buildCurvedEdgeGeometry(
  nodes: THREE.Vector3[],
  edges: [number, number][],
  regions: Uint8Array,
) {
  const edgeCount = edges.length;
  const positions = new Float32Array(edgeCount * VERTS_PER_EDGE * 3);
  const colors = new Float32Array(edgeCount * VERTS_PER_EDGE * 3);
  // Precomputed full-saturation gradient colors per vertex. Per-frame we just
  // scale these by the edge's current brightness — no lerp work in the hot path.
  const baselineColors = new Float32Array(edgeCount * VERTS_PER_EDGE * 3);
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
    // Gentler curves — closer to straight, just enough bend to avoid angular look.
    const bendMag = edgeLen * (0.04 + Math.random() * 0.07);
    const mid = new THREE.Vector3()
      .addVectors(A, B)
      .multiplyScalar(0.5)
      .add(bendAxis.multiplyScalar(bendMag));

    const curve = new THREE.QuadraticBezierCurve3(A, mid, B);
    const samples = curve.getPoints(EDGE_SEGMENTS);

    const colA = REGIONS[regions[a]].color;
    const colB = REGIONS[regions[b]].color;

    // Emit line segments: (samples[0..1], samples[1..2], ...)
    for (let s = 0; s < EDGE_SEGMENTS; s++) {
      for (let end = 0; end < 2; end++) {
        const sample = samples[s + end];
        const vIdx = e * VERTS_PER_EDGE + s * 2 + end;
        positions[vIdx * 3] = sample.x;
        positions[vIdx * 3 + 1] = sample.y;
        positions[vIdx * 3 + 2] = sample.z;
        const tt = (s + end) / EDGE_SEGMENTS;
        tValues[vIdx] = tt;
        edgeInfo[vIdx * 3] = e;
        edgeInfo[vIdx * 3 + 1] = regions[a];
        edgeInfo[vIdx * 3 + 2] = regions[b];

        // Precompute the full-saturation gradient at this point along the
        // curve. Per-frame we only multiply by a brightness scalar.
        baselineColors[vIdx * 3] = colA.r + (colB.r - colA.r) * tt;
        baselineColors[vIdx * 3 + 1] = colA.g + (colB.g - colA.g) * tt;
        baselineColors[vIdx * 3 + 2] = colA.b + (colB.b - colA.b) * tt;
      }
    }
  }
  return { positions, colors, baselineColors, edgeInfo, tValues, edgeCount };
}

// ---- Glowing-orb shader for nodes ------------------------------------------

const ORB_VERTEX = /* glsl */ `
attribute float aSize;
varying vec3 vColor;
void main() {
  vColor = color;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mv;
  // Size attenuates with distance so closer orbs are larger.
  gl_PointSize = aSize * (340.0 / max(-mv.z, 0.0001));
  gl_PointSize = clamp(gl_PointSize, 1.0, 60.0);
}
`;

const ORB_FRAGMENT = /* glsl */ `
precision highp float;
varying vec3 vColor;
void main() {
  // Circular sprite with bright center, soft glowing falloff.
  vec2 uv = gl_PointCoord - 0.5;
  float d = length(uv);
  if (d > 0.5) discard;
  // Two-layer falloff: hot core + outer halo.
  float core = smoothstep(0.5, 0.0, d);
  float halo = pow(core, 2.0);
  float hotCenter = smoothstep(0.18, 0.0, d);
  vec3 col = vColor * (1.0 + hotCenter * 0.8);
  float alpha = (core * 0.55 + halo * 0.55);
  gl_FragColor = vec4(col, alpha);
}
`;

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
  const nodeSizes = useMemo(() => new Float32Array(NODE_COUNT), []);
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

    const state2 = useAvatar.getState();
    const intensity = state2.intensity;
    const bass = state2.bass;

    // Constant swirl — runs regardless of audio/region state.
    grp.rotation.y = t * 0.05;
    grp.rotation.x = Math.sin(t * 0.035) * 0.12;

    // Speech-driven breathing scale: bass + intensity expand the whole brain
    // gently in time with syllables.
    const targetScale = 1.0 + bass * 0.05 + intensity * 0.035;
    const currentScale = grp.scale.x;
    grp.scale.setScalar(
      currentScale + (targetScale - currentScale) * Math.min(1, delta * 8),
    );

    // Smooth region activations from store.
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

      // Size grows with activation + sparkles with pulse + global speech boost.
      nodeSizes[i] = 0.05 + pulse * 0.025 + act * 0.13 + intensity * 0.035;
    }
    nodes.geometry.attributes.position.needsUpdate = true;
    nodes.geometry.attributes.color.needsUpdate = true;
    nodes.geometry.attributes.aSize.needsUpdate = true;

    // 2) Edge colors — scale precomputed baseline gradient by per-edge
    //    brightness (cheap multiplies, no lerps). Brightness from avg
    //    activation; same-region edges get a slight boost so the regions
    //    read as zones.
    const baselineColors = graph.edgeGeo.baselineColors;
    for (let e = 0; e < graph.edgeGeo.edgeCount; e++) {
      const ia = graph.edges[e][0];
      const ib = graph.edges[e][1];
      const ra = graph.regions[ia];
      const rb = graph.regions[ib];
      const actA = regionActSmooth.current[ra];
      const actB = regionActSmooth.current[rb];
      const avgAct = (actA + actB) * 0.5;
      const sameRegion = ra === rb;
      // Thinner / wispier baseline — was 0.08, now 0.04. Active boost reduced.
      const baseBrightness =
        0.04 + avgAct * (sameRegion ? 0.38 : 0.2) + (sameRegion ? 0.025 : 0);

      const base = e * VERTS_PER_EDGE * 3;
      for (let i = 0; i < VERTS_PER_EDGE * 3; i++) {
        edgeColors[base + i] = baselineColors[base + i] * baseBrightness;
      }
    }

    // 3) Synapse cascades — probability ramps with max activation AND with
    //    speech intensity (so the brain looks visibly more active when Kai
    //    is talking). Cascade walks a short chain with stagger and decay.
    const fireRate = 0.05 + maxAct * 0.18 + intensity * 0.18;
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
          opacity={0.55}
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
          <bufferAttribute
            attach="attributes-aSize"
            args={[nodeSizes, 1]}
            count={NODE_COUNT}
          />
        </bufferGeometry>
        <shaderMaterial
          vertexShader={ORB_VERTEX}
          fragmentShader={ORB_FRAGMENT}
          vertexColors
          transparent
          depthWrite={false}
          blending={THREE.AdditiveBlending}
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
        camera={{ position: [0, 0, 4.6], fov: 50 }}
        dpr={[1, 2]}
        gl={{ antialias: true, alpha: true }}
        style={{ background: "transparent" }}
      >
        <NeuralGraph />
        <OrbitControls
          enableDamping
          dampingFactor={0.06}
          enablePan={false}
          minDistance={3.0}
          maxDistance={9}
          rotateSpeed={0.5}
          zoomSpeed={0.6}
        />
      </Canvas>
    </div>
  );
}
