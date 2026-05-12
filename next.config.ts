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
  "connect-src 'self' https://cheatcode-ai.up.railway.app https://api.openai.com",
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

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        source: "/:path*",
        headers: SECURITY_HEADERS,
      },
    ];
  },
};

export default nextConfig;
