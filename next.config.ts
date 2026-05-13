import type { NextConfig } from "next";

// Content Security Policy.
//
// Trade-off: we keep `'unsafe-inline'` and `'unsafe-eval'` in `script-src`
// because Next 16 + Turbopack + React Three Fiber rely on inline bootstrap
// scripts and runtime-evaluated shader/material code. Hardening these out
// would require nonce-based CSP and a Turbopack/R3F audit beyond this pass.
const CSP = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "media-src 'self' blob:",
  "worker-src 'self' blob:",
  "font-src 'self' data:",
  "connect-src 'self' https://cheatcode-ai.up.railway.app https://api.openai.com https://ryprohqthwflinadqotj.supabase.co wss://ryprohqthwflinadqotj.supabase.co",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join("; ");

const SECURITY_HEADERS = [
  { key: "Content-Security-Policy", value: CSP },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "microphone=(self)" },
];

// Design-preview CSP — loosened so the inlined Kai-Screen-Set.html can pull
// React + Babel-standalone from unpkg and fonts from Google + Fontshare.
// Scope is limited to /design-preview/* only; everything else stays on the
// strict CSP above.
const DESIGN_PREVIEW_CSP = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://unpkg.com",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://api.fontshare.com",
  "img-src 'self' data: blob:",
  "media-src 'self' blob:",
  "worker-src 'self' blob:",
  "font-src 'self' data: https://fonts.gstatic.com https://cdn.fontshare.com",
  // unpkg via script tags doesn't need connect-src, but Babel may fetch sourcemaps
  "connect-src 'self' https://unpkg.com",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join("; ");

const DESIGN_PREVIEW_HEADERS = [
  { key: "Content-Security-Policy", value: DESIGN_PREVIEW_CSP },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
];

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        // Override must come BEFORE the catch-all so Next merges per-route.
        source: "/design-preview/:path*",
        headers: DESIGN_PREVIEW_HEADERS,
      },
      {
        source: "/:path*",
        headers: SECURITY_HEADERS,
      },
    ];
  },
};

export default nextConfig;
