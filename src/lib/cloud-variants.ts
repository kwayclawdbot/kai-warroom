// Three distinct neural-cloud variants. Each defines:
//  - a particle distribution (positions, region tags, per-particle seeds)
//  - a vertex shader that computes the per-frame position from those attributes
//  - default camera + radius hints
//
// All variants share the same fragment shader (see cloud-shaders.ts) and the
// same uniforms contract: uRegionActivations[8] + uRegionColors[8] plus the
// standard time/intensity/bands.

import { REGIONS } from "./brain-regions";

export type VariantId = "lobes" | "cortex" | "aurora";

export type CloudAttributes = {
  count: number;
  positions: Float32Array; // base position per particle (3 floats)
  seeds: Float32Array; // 3 random unit floats per particle for noise lookups
  randoms: Float32Array; // 1 random float per particle 0..1
  regions: Float32Array; // 1 region index per particle 0..7
  /** Anchor in 3D space where each region's label should render. */
  regionCentroids: Array<[number, number, number]>;
};

export type VariantConfig = {
  id: VariantId;
  name: string;
  tagline: string;
  description: string;
  cameraZ: number;
  particleCount: { desktop: number; mobile: number };
  /** GLSL — must define `vec3 computePosition(vec3 base, vec3 seed, float rand, float regionAct, float regionIdx)` */
  vertexBody: string;
  /** Build per-particle attributes. */
  generate: (count: number) => CloudAttributes;
};

// ---------- Helper: random on a unit sphere ---------------------------------
function rngSphere(out: Float32Array, i: number) {
  let x = 0,
    y = 0,
    z = 0,
    d = 0;
  do {
    x = Math.random() * 2 - 1;
    y = Math.random() * 2 - 1;
    z = Math.random() * 2 - 1;
    d = x * x + y * y + z * z;
  } while (d > 1 || d < 1e-4);
  const inv = 1 / Math.sqrt(d);
  out[i * 3] = x * inv;
  out[i * 3 + 1] = y * inv;
  out[i * 3 + 2] = z * inv;
}

// ============================================================================
// VARIANT 1: LOBES — anatomical brain shape with 8 spatial lobes
// ============================================================================
// Particles fill an elongated ellipsoid (the "brain"). Region affiliation is
// determined by spatial zone within the brain — like cortical lobes. Each
// lobe is a wedge of the volume centered on its region position.

function generateLobes(count: number): CloudAttributes {
  const positions = new Float32Array(count * 3);
  const seeds = new Float32Array(count * 3);
  const randoms = new Float32Array(count);
  const regions = new Float32Array(count);

  // Brain bounding ellipsoid (slightly tall and wide, elongated front-back).
  const A = 1.5; // x half-width
  const B = 1.25; // y half-height
  const C = 1.0; // z half-depth

  // Region centroids (in normalized brain space, scaled by ellipsoid). Each
  // matches REGIONS[i] but spatially repositioned for an anatomy-like layout.
  const lobeAnchors: Array<[number, number, number]> = [
    [-0.3, 0.85, 0.4], // MEMORY (front-top-left = prefrontal)
    [0.3, 0.85, 0.4], // MARKET (front-top-right)
    [0.85, 0.2, 0.0], // TECHNICALS (right-temporal)
    [0.5, -0.55, 0.4], // ALERTS (right-front-bottom)
    [-0.5, -0.55, 0.4], // WATCHLIST (left-front-bottom)
    [0.0, -0.75, -0.2], // USERS (bottom — limbic)
    [-0.85, 0.2, 0.0], // NEWS (left-temporal)
    [0.0, 0.2, -0.85], // OPTIONS (back — occipital)
  ];
  const anchorVecs = lobeAnchors.map(
    ([x, y, z]) => [x * A, y * B, z * C] as [number, number, number],
  );

  for (let i = 0; i < count; i++) {
    // Sample inside a unit sphere, then map to ellipsoid.
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
    // Bias slightly toward the surface so the brain has clear shape.
    const surfBias = 0.55 + Math.random() * 0.45;
    const r = Math.cbrt(d) * surfBias;
    const inv = r / Math.max(Math.sqrt(d), 1e-6);
    const px = x * inv * A;
    const py = y * inv * B;
    const pz = z * inv * C;
    positions[i * 3] = px;
    positions[i * 3 + 1] = py;
    positions[i * 3 + 2] = pz;

    // Assign to nearest lobe anchor.
    let bestI = 0;
    let bestD = Number.POSITIVE_INFINITY;
    for (let k = 0; k < anchorVecs.length; k++) {
      const dx = px - anchorVecs[k][0];
      const dy = py - anchorVecs[k][1];
      const dz = pz - anchorVecs[k][2];
      const dist = dx * dx + dy * dy + dz * dz;
      if (dist < bestD) {
        bestD = dist;
        bestI = k;
      }
    }
    regions[i] = bestI;

    rngSphere(seeds, i);
    randoms[i] = Math.random();
  }

  return {
    count,
    positions,
    seeds,
    randoms,
    regions,
    regionCentroids: anchorVecs.map(([x, y, z]) => [x * 1.15, y * 1.15, z]),
  };
}

const lobesVertex = /* glsl */ `
  // base = ellipsoidal position seeded at init
  // Drift gently around base; activation pushes particles slightly outward
  // along the radial direction from the brain center.
  vec3 drift = curl(base * 0.8 + vec3(uTime * 0.18)) * 0.18;

  // Radial direction for outward puff on activation.
  vec3 outward = normalize(base + 1e-4);
  float pulse = regionAct * 0.35;

  // Audio bands modulate the cloud subtly across the whole brain.
  float breathe = uBass * 0.18 * (0.5 + 0.5 * sin(uTime * 1.6 + rand * 6.28));
  vec3 micro = curl(base * 3.0 + vec3(uTime * 0.5)) * uTreble * 0.22;

  vec3 pos = base + drift + outward * (pulse + breathe) + micro;
  return pos;
`;

// ============================================================================
// VARIANT 2: CORTEX — wrinkled brain surface with patches
// ============================================================================
// Particles on a shell, displaced radially by high-freq noise creating folds.
// Regions are spherical patches (defined by direction toward each region's
// anchor).

function generateCortex(count: number): CloudAttributes {
  const positions = new Float32Array(count * 3);
  const seeds = new Float32Array(count * 3);
  const randoms = new Float32Array(count);
  const regions = new Float32Array(count);

  // 8 region anchor directions, spread on a sphere.
  const dirs: Array<[number, number, number]> = [
    [-0.4, 0.9, 0.2], // MEMORY (front-top-left)
    [0.4, 0.9, 0.2], // MARKET (front-top-right)
    [0.95, 0.15, 0.25], // TECHNICALS (right)
    [0.55, -0.65, 0.5], // ALERTS (right-bottom)
    [-0.55, -0.65, 0.5], // WATCHLIST (left-bottom)
    [0.0, -0.95, 0.3], // USERS (bottom)
    [-0.95, 0.15, 0.25], // NEWS (left)
    [0.0, 0.15, -0.95], // OPTIONS (back)
  ];
  const dirVecs = dirs.map(([x, y, z]) => {
    const m = Math.sqrt(x * x + y * y + z * z);
    return [x / m, y / m, z / m] as [number, number, number];
  });

  const R = 1.4;

  for (let i = 0; i < count; i++) {
    // Uniform direction on unit sphere.
    rngSphere(seeds, i); // also doubles as our direction
    const dx = seeds[i * 3];
    const dy = seeds[i * 3 + 1];
    const dz = seeds[i * 3 + 2];

    // Slight radial jitter so particles aren't perfectly on the shell.
    const r = R * (0.96 + Math.random() * 0.08);
    positions[i * 3] = dx * r;
    positions[i * 3 + 1] = dy * r;
    positions[i * 3 + 2] = dz * r;

    // Region by closest direction.
    let bestI = 0;
    let bestDot = -Infinity;
    for (let k = 0; k < dirVecs.length; k++) {
      const dot =
        dx * dirVecs[k][0] + dy * dirVecs[k][1] + dz * dirVecs[k][2];
      if (dot > bestDot) {
        bestDot = dot;
        bestI = k;
      }
    }
    regions[i] = bestI;
    randoms[i] = Math.random();
  }

  return {
    count,
    positions,
    seeds,
    randoms,
    regions,
    regionCentroids: dirVecs.map(
      ([x, y, z]) => [x * R * 1.25, y * R * 1.25, z * R * 1.25],
    ),
  };
}

const cortexVertex = /* glsl */ `
  // base is on a near-shell. Apply cortex-fold displacement: high-freq noise
  // pushes particles in/out along the surface normal.
  vec3 normal = normalize(base + 1e-4);
  float folds = snoise(normal * 5.5 + vec3(uTime * 0.06)) * 0.22;
  float microFolds = snoise(normal * 16.0) * 0.05;

  // Activation puffs the patch outward.
  float pulse = regionAct * 0.42;

  // Bass = whole-brain breathing.
  float breathe = uBass * 0.12;

  // Treble = surface shimmer.
  float shimmer = uTreble * 0.08 * sin(uTime * 6.0 + rand * 12.0);

  vec3 pos = normal * (length(base) + folds + microFolds + pulse + breathe + shimmer);
  return pos;
`;

// ============================================================================
// VARIANT 3: AURORA — 8 sinuous tendrils, each one region
// ============================================================================
// Each region gets a tendril — a curved tube of particles snaking outward
// from the origin. Tendrils breathe and intensify when their region activates.

function generateAurora(count: number): CloudAttributes {
  const positions = new Float32Array(count * 3);
  const seeds = new Float32Array(count * 3);
  const randoms = new Float32Array(count);
  const regions = new Float32Array(count);

  // Tendril end directions — 8 spread around a sphere.
  const ends: Array<[number, number, number]> = [
    [-0.7, 1.4, 0.2], // MEMORY
    [0.7, 1.4, 0.2], // MARKET
    [1.6, 0.5, -0.3], // TECHNICALS
    [1.3, -1.0, 0.4], // ALERTS
    [-1.3, -1.0, 0.4], // WATCHLIST
    [0.0, -1.6, 0.5], // USERS
    [-1.6, 0.5, -0.3], // NEWS
    [0.0, 0.2, -1.7], // OPTIONS
  ];

  const perTendril = Math.floor(count / ends.length);
  let p = 0;

  for (let t = 0; t < ends.length; t++) {
    const [ex, ey, ez] = ends[t];
    const cnt = t === ends.length - 1 ? count - p : perTendril;
    for (let i = 0; i < cnt && p < count; i++, p++) {
      // Distance along the tendril 0..1.
      const u = Math.pow(Math.random(), 0.65); // bias toward inner end
      // Curved path: lerp from origin to end, with a slight bend.
      const bendX = (Math.random() - 0.5) * 0.4;
      const bendY = (Math.random() - 0.5) * 0.4;
      const bendZ = (Math.random() - 0.5) * 0.4;
      const px = ex * u + bendX * u * (1 - u) * 4;
      const py = ey * u + bendY * u * (1 - u) * 4;
      const pz = ez * u + bendZ * u * (1 - u) * 4;

      // Random offset perpendicular-ish to the path (tendril thickness).
      const offR = (0.15 + Math.random() * 0.18) * (0.4 + u * 0.6);
      const offX = (Math.random() * 2 - 1) * offR;
      const offY = (Math.random() * 2 - 1) * offR;
      const offZ = (Math.random() * 2 - 1) * offR;

      positions[p * 3] = px + offX;
      positions[p * 3 + 1] = py + offY;
      positions[p * 3 + 2] = pz + offZ;

      regions[p] = t;
      randoms[p] = u; // store distance-along-tendril here for shader use
      rngSphere(seeds, p);
    }
  }

  return {
    count: p,
    positions,
    seeds,
    randoms,
    regions,
    regionCentroids: ends.map(
      ([x, y, z]) => [x * 1.1, y * 1.1, z * 1.1] as [number, number, number],
    ),
  };
}

const auroraVertex = /* glsl */ `
  // rand here is distance-along-tendril 0..1.
  float along = rand;

  // Sinuous snake-like motion: lateral wave in two axes, phase shifted per tendril.
  float phase = regionIdx * 0.78;
  vec3 wave = vec3(
    sin(uTime * 1.3 + along * 5.0 + phase) * 0.18,
    cos(uTime * 1.1 + along * 4.5 + phase * 1.4) * 0.18,
    sin(uTime * 0.9 + along * 3.5 + phase * 2.1) * 0.12
  ) * (0.3 + along * 0.7);

  // Activation thickens the tendril and pushes particles outward radially.
  vec3 radial = normalize(base + 1e-4);
  float swell = regionAct * 0.45 * along;

  // Bass = global pulse, treble = micro-scatter.
  float breathe = uBass * 0.18 * along;
  vec3 micro = curl(base * 4.0 + vec3(uTime * 0.6)) * uTreble * 0.18;

  vec3 pos = base + wave + radial * (swell + breathe) + micro;
  return pos;
`;

// ============================================================================

export const VARIANTS: Record<VariantId, VariantConfig> = {
  lobes: {
    id: "lobes",
    name: "Lobes",
    tagline: "Anatomical brain",
    description:
      "An elongated brain-shaped cloud divided into 8 anatomical lobes. Each region is a spatial wedge — like prefrontal cortex, temporal lobe, occipital — that brightens in place when active.",
    cameraZ: 5.2,
    particleCount: { desktop: 14000, mobile: 5500 },
    vertexBody: lobesVertex,
    generate: generateLobes,
  },
  cortex: {
    id: "cortex",
    name: "Cortex",
    tagline: "Folded surface",
    description:
      "Densely packed particles forming a wrinkled brain-cortex shell. Cortical folds via high-frequency noise. Each region is a surface patch — patches puff outward and bloom when their region activates.",
    cameraZ: 4.6,
    particleCount: { desktop: 16000, mobile: 6500 },
    vertexBody: cortexVertex,
    generate: generateCortex,
  },
  aurora: {
    id: "aurora",
    name: "Aurora",
    tagline: "Volumetric tendrils",
    description:
      "Eight sinuous neural tendrils snaking outward from a central core, each in its own color. Tendrils breathe and thicken when their region fires — like the brain's aurora borealis.",
    cameraZ: 5.8,
    particleCount: { desktop: 12000, mobile: 4500 },
    vertexBody: auroraVertex,
    generate: generateAurora,
  },
};

// Per-region color flat array (for uRegionColors uniform): 8 colors x 3 floats.
export function regionColorsFlat(): number[] {
  const flat: number[] = [];
  for (const r of REGIONS) {
    flat.push(r.color.r, r.color.g, r.color.b);
  }
  return flat;
}
