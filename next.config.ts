import type { NextConfig } from "next";

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), interest-cohort=()" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
];

const nextConfig: NextConfig = {
  // Sem o botão "N" de desenvolvimento nas telas de teste.
  devIndicators: false,
  poweredByHeader: false,
  // Imagens de marketplaces são servidas direto da origem (sem otimizador pago).
  images: { unoptimized: true },
  experimental: { optimizePackageImports: ["lucide-react", "recharts", "motion"] },
  async headers() {
    return [
      { source: "/:path*", headers: securityHeaders },
      { source: "/app/:path*", headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow" }] },
      { source: "/admin/:path*", headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow" }] },
      { source: "/api/:path*", headers: [{ key: "X-Robots-Tag", value: "noindex" }, { key: "Cache-Control", value: "no-store" }] },
    ];
  },
};

export default nextConfig;

// Habilita bindings da Cloudflare (AI etc.) durante `next dev`.
import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";
if (process.env.NODE_ENV === "development" && process.env.WW_CF_DEV === "1") initOpenNextCloudflareForDev();
