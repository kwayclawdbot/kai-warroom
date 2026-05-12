// GLSL shaders for the Kai Cloud avatar v2.
//
// Vertex shader: places each particle on a deformed sphere shell, drifts it
// with curl-like noise, pulses outward on intensity, scatters extra on treble.
// Fragment shader: soft circular dot with additive blending.

export const particleVertex = /* glsl */ `
precision highp float;

uniform float uTime;
uniform float uIntensity;
uniform float uBass;
uniform float uMid;
uniform float uTreble;
uniform float uRadius;
uniform float uExpansion;
uniform float uDriftSpeed;
uniform float uPixelRatio;
uniform vec2  uResolution;

attribute vec3  aSeed;   // unit-vector base direction on the shell
attribute float aRand;   // 0..1 per particle
attribute float aLayer;  // 0..1 — depth layer (inner..outer)

varying float vAlpha;
varying float vEnergy;
varying float vRand;

// ---- 3D simplex noise (Ashima / Stefan Gustavson, public domain) ---------
vec4 permute(vec4 x){ return mod(((x*34.0)+1.0)*x, 289.0); }
vec4 taylorInvSqrt(vec4 r){ return 1.79284291400159 - 0.85373472095314 * r; }
float snoise(vec3 v){
  const vec2 C = vec2(1.0/6.0, 1.0/3.0);
  const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);
  vec3 i  = floor(v + dot(v, C.yyy));
  vec3 x0 = v - i + dot(i, C.xxx);
  vec3 g = step(x0.yzx, x0.xyz);
  vec3 l = 1.0 - g;
  vec3 i1 = min(g.xyz, l.zxy);
  vec3 i2 = max(g.xyz, l.zxy);
  vec3 x1 = x0 - i1 + C.xxx;
  vec3 x2 = x0 - i2 + C.yyy;
  vec3 x3 = x0 - D.yyy;
  i = mod(i, 289.0);
  vec4 p = permute(permute(permute(
            i.z + vec4(0.0, i1.z, i2.z, 1.0))
          + i.y + vec4(0.0, i1.y, i2.y, 1.0))
          + i.x + vec4(0.0, i1.x, i2.x, 1.0));
  float n_ = 1.0/7.0;
  vec3  ns = n_ * D.wyz - D.xzx;
  vec4 j = p - 49.0 * floor(p * ns.z * ns.z);
  vec4 x_ = floor(j * ns.z);
  vec4 y_ = floor(j - 7.0 * x_);
  vec4 x = x_ * ns.x + ns.yyyy;
  vec4 y = y_ * ns.x + ns.yyyy;
  vec4 h = 1.0 - abs(x) - abs(y);
  vec4 b0 = vec4(x.xy, y.xy);
  vec4 b1 = vec4(x.zw, y.zw);
  vec4 s0 = floor(b0)*2.0 + 1.0;
  vec4 s1 = floor(b1)*2.0 + 1.0;
  vec4 sh = -step(h, vec4(0.0));
  vec4 a0 = b0.xzyw + s0.xzyw*sh.xxyy;
  vec4 a1 = b1.xzyw + s1.xzyw*sh.zzww;
  vec3 p0 = vec3(a0.xy, h.x);
  vec3 p1 = vec3(a0.zw, h.y);
  vec3 p2 = vec3(a1.xy, h.z);
  vec3 p3 = vec3(a1.zw, h.w);
  vec4 norm = taylorInvSqrt(vec4(dot(p0,p0), dot(p1,p1), dot(p2,p2), dot(p3,p3)));
  p0 *= norm.x; p1 *= norm.y; p2 *= norm.z; p3 *= norm.w;
  vec4 m = max(0.6 - vec4(dot(x0,x0), dot(x1,x1), dot(x2,x2), dot(x3,x3)), 0.0);
  m = m*m;
  return 42.0 * dot(m*m, vec4(dot(p0,x0), dot(p1,x1), dot(p2,x2), dot(p3,x3)));
}

// Pseudo curl noise via 3 offset snoise samples.
vec3 curl(vec3 p){
  float e = 0.6;
  vec3 dx = vec3(e, 0.0, 0.0);
  vec3 dy = vec3(0.0, e, 0.0);
  vec3 dz = vec3(0.0, 0.0, e);
  float x = snoise(p + dy) - snoise(p - dy);
  float y = snoise(p + dz) - snoise(p - dz);
  float z = snoise(p + dx) - snoise(p - dx);
  return normalize(vec3(x, y, z) + 1e-5);
}

void main(){
  // Base direction lives on a unit-ish shell with slight per-particle radius noise.
  vec3 dir = normalize(aSeed);

  // Layer-aware radius — inner layers slightly tighter, outer layers wispier.
  float layerR = mix(0.65, 1.15, aLayer);
  float radius = uRadius * layerR * (0.85 + 0.3 * aRand);

  // Slow curl-noise drift around the shell.
  float tDrift = uTime * 0.18 * uDriftSpeed;
  vec3 drift = curl(dir * 1.4 + vec3(tDrift)) * 0.35;

  // Outward push from intensity (syllable pulse).
  float pulse = uIntensity * 0.55 * uExpansion;

  // Bass adds breathing on top of pulse.
  float breathe = uBass * 0.4 * (0.5 + 0.5 * sin(uTime * 1.6 + aRand * 6.28));

  // Mid drives ambient radius wobble.
  float wobble = uMid * 0.25 * sin(uTime * 2.2 + aRand * 9.0);

  // Treble = high-frequency scatter, more chaotic on outer layers.
  vec3 scatter = curl(dir * 5.5 + vec3(uTime * 0.9)) * uTreble * 0.32 * aLayer;

  vec3 pos = dir * (radius + pulse + breathe + wobble) + drift + scatter;

  vec4 mvPos = modelViewMatrix * vec4(pos, 1.0);
  gl_Position = projectionMatrix * mvPos;

  // Point size scales with intensity & viewport, attenuated by distance.
  float sizeBase = mix(2.6, 7.0, aLayer);
  float energy = 0.55 + uIntensity * 1.1 + uBass * 0.6;
  gl_PointSize = sizeBase * energy * (uResolution.y / max(-mvPos.z, 0.0001)) * 0.0018 * uPixelRatio;
  gl_PointSize = clamp(gl_PointSize, 1.0, 22.0);

  // Soft falloff by distance from origin → outer ring fades.
  float distR = length(pos) / max(uRadius, 0.0001);
  vAlpha = smoothstep(2.4, 0.6, distR) * mix(0.55, 1.0, aLayer);

  vEnergy = energy;
  vRand = aRand;
}
`;

export const particleFragment = /* glsl */ `
precision highp float;

uniform vec3 uCore;
uniform vec3 uAccent;
uniform float uTime;

varying float vAlpha;
varying float vEnergy;
varying float vRand;

void main(){
  // Circular sprite with soft edge.
  vec2 uv = gl_PointCoord - vec2(0.5);
  float d = length(uv);
  if (d > 0.5) discard;
  float soft = smoothstep(0.5, 0.0, d);

  // Color shifts subtly along vRand to break up uniformity.
  float tint = sin(vRand * 12.0 + uTime * 0.4) * 0.5 + 0.5;
  vec3 col = mix(uCore, uAccent, tint * 0.55);

  // Hot center bias on high-energy particles.
  col = mix(col, uAccent, smoothstep(0.0, 0.18, 0.25 - d) * 0.6);

  float a = soft * vAlpha * (0.42 + vEnergy * 0.5);
  gl_FragColor = vec4(col * (0.5 + vEnergy * 0.55), a);
}
`;

// ----- Core orb shaders -----------------------------------------------------

export const orbVertex = /* glsl */ `
varying vec3 vNormal;
varying vec3 vViewDir;

void main(){
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vNormal = normalize(normalMatrix * normal);
  vViewDir = normalize(-mv.xyz);
  gl_Position = projectionMatrix * mv;
}
`;

export const orbFragment = /* glsl */ `
precision highp float;

uniform vec3  uCore;
uniform vec3  uAccent;
uniform float uIntensity;
uniform float uBass;
uniform float uTime;

varying vec3 vNormal;
varying vec3 vViewDir;

void main(){
  // Fresnel-like rim — strongest where the surface faces away from camera.
  float facing = clamp(dot(vNormal, vViewDir), 0.0, 1.0);
  float rim = pow(1.0 - facing, 2.4);

  // Subtle iridescent shimmer.
  float irid = sin(vNormal.x * 5.0 + uTime * 0.7) * 0.5 + 0.5;
  vec3 base = mix(uCore, uAccent, irid * 0.6);

  // Bass-driven inner glow.
  vec3 hot = uAccent * (1.4 + uIntensity * 1.2);
  vec3 col = mix(base * 0.4, hot, rim);

  // Pulse alpha with bass so the core breathes.
  float alpha = (0.45 + uIntensity * 0.5 + uBass * 0.4) * (0.6 + rim * 0.6);
  alpha = clamp(alpha, 0.0, 1.0);

  gl_FragColor = vec4(col, alpha);
}
`;
