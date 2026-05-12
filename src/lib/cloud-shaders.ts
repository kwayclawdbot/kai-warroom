// Shared GLSL building blocks for the neural-cloud variants.

const NOISE_AND_CURL = /* glsl */ `
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
vec3 curl(vec3 p){
  float e = 0.6;
  vec3 dx = vec3(e, 0.0, 0.0);
  vec3 dy = vec3(0.0, e, 0.0);
  vec3 dz = vec3(0.0, 0.0, e);
  float a = snoise(p + dy) - snoise(p - dy);
  float b = snoise(p + dz) - snoise(p - dz);
  float c = snoise(p + dx) - snoise(p - dx);
  return normalize(vec3(a, b, c) + 1e-5);
}
`;

const VERTEX_HEAD = /* glsl */ `
precision highp float;

uniform float uTime;
uniform float uIntensity;
uniform float uBass;
uniform float uMid;
uniform float uTreble;
uniform float uPixelRatio;
uniform vec2  uResolution;
uniform float uRegionActivations[8];
uniform vec3  uRegionColors[8];

attribute vec3  aSeed;
attribute float aRand;
attribute float aRegion;

varying vec3  vColor;
varying float vAlpha;
varying float vEnergy;
varying float vActivation;
`;

const VERTEX_MAIN_TEMPLATE = /* glsl */ `
void main() {
  vec3 base = position;
  vec3 seed = aSeed;
  float rand = aRand;
  float regionIdx = aRegion;
  int idx = int(regionIdx);

  // Look up region activation + color.
  float regionAct = uRegionActivations[idx];
  vec3 regionCol = uRegionColors[idx];

  // === Per-variant position computation ===
  vec3 pos;
  {
    %VERTEX_BODY%
  }
  // ========================================

  vec4 mvPos = modelViewMatrix * vec4(pos, 1.0);
  gl_Position = projectionMatrix * mvPos;

  float baseSize = 3.5;
  float energy = 0.6 + uIntensity * 0.6 + regionAct * 1.4;
  gl_PointSize = baseSize * energy * (uResolution.y / max(-mvPos.z, 0.0001)) * 0.0018 * uPixelRatio;
  gl_PointSize = clamp(gl_PointSize, 1.2, 26.0);

  vColor = regionCol;
  vEnergy = energy;
  vActivation = regionAct;
  vAlpha = 0.4 + regionAct * 0.6;
}
`;

const FRAGMENT_SOURCE = /* glsl */ `
precision highp float;

varying vec3  vColor;
varying float vAlpha;
varying float vEnergy;
varying float vActivation;

void main(){
  vec2 uv = gl_PointCoord - 0.5;
  float d = length(uv);
  if (d > 0.5) discard;
  float soft = smoothstep(0.5, 0.0, d);

  // Brighten center on activation — looks like glowing nuclei.
  float hot = smoothstep(0.25, 0.0, d) * (0.4 + vActivation * 0.7);
  vec3 col = vColor * (0.6 + vEnergy * 0.6) + vColor * hot;

  float idleFloor = 0.08;
  float alpha = soft * (idleFloor + vAlpha * 0.9) * (0.35 + vEnergy * 0.65);
  gl_FragColor = vec4(col, alpha);
}
`;

/** Build a full vertex shader by injecting a variant-specific body. */
export function buildVertexShader(variantBody: string): string {
  return (
    NOISE_AND_CURL +
    VERTEX_HEAD +
    VERTEX_MAIN_TEMPLATE.replace("%VERTEX_BODY%", variantBody)
  );
}

export const cloudFragmentShader = FRAGMENT_SOURCE;
