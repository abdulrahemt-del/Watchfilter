import type { NextConfig } from "next";

const securityHeaders = [
  { key: "X-Content-Type-Options",    value: "nosniff" },
  { key: "X-Frame-Options",           value: "DENY" },
  { key: "X-XSS-Protection",          value: "1; mode=block" },
  { key: "Referrer-Policy",           value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy",        value: "camera=(), microphone=(), geolocation=()" },
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
  {
    key: "Content-Security-Policy",
    value: [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval'",  // Next.js requires unsafe-eval in dev
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob: https://img.youtube.com https://i.ytimg.com https://yt3.ggpht.com https://*.vercel-storage.com",
      "media-src 'self' blob: https://*.vercel-storage.com https://*.public.blob.vercel-storage.com https://*.blob.vercel-storage.com",
      "connect-src 'self' https://accounts.google.com https://oauth2.googleapis.com https://www.googleapis.com https://vitals.vercel-insights.com",
      "frame-src https://www.youtube.com",
      "font-src 'self'",
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
    ].join("; "),
  },
];

const nextConfig: NextConfig = {
  // Fix multiple-lockfile workspace root warning
  outputFileTracingRoot: process.cwd(),

  async headers() {
    return [
      {
        source: "/(.*)",
        headers: securityHeaders,
      },
    ];
  },
};

export default nextConfig;
