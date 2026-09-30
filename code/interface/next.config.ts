import type { NextConfig } from "next";

/**
 * Hosts allowed to embed the app (Teams tabs / side panels, Outlook and Microsoft 365).
 * X-Frame-Options is deliberately NOT set: it would block these embeddings.
 */
const FRAME_ANCESTORS = [
  "'self'",
  "https://teams.microsoft.com",
  "https://*.teams.microsoft.com",
  "https://*.teams.microsoft.us",
  "https://*.skype.com",
  "https://*.office.com",
  "https://outlook.office.com",
  "https://outlook.office365.com",
  "https://*.microsoft365.com",
  "https://*.cloud.microsoft",
].join(" ");

const securityHeaders = [
  // script-src/default-src are omitted on purpose: Next injects inline scripts that would need per-request nonces.
  { key: "Content-Security-Policy", value: `frame-ancestors ${FRAME_ANCESTORS}; object-src 'none'; base-uri 'self'; form-action 'self'` },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  // The repo root has its own lockfile; pin tracing to this app so builds don't pick the wrong root.
  outputFileTracingRoot: process.cwd(),
  async headers() {
    return [
      { source: "/:path*", headers: securityHeaders },
      { source: "/api/:path*", headers: [{ key: "Cache-Control", value: "no-store" }] },
    ];
  },
};

export default nextConfig;
