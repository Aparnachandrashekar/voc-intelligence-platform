import type { NextConfig } from "next";

const renderApiUrl = process.env.RENDER_API_URL?.replace(/\/$/, "");

const nextConfig: NextConfig = {
  // Production builds use .next-build so `npm run build` never corrupts the dev cache in .next
  distDir: process.env.NEXT_DIST_DIR || ".next",
  serverExternalPackages: ["pg", "@xenova/transformers", "onnxruntime-node"],
  /** Vercel frontend: proxy /api/* to Render backend (set RENDER_API_URL on Vercel). */
  async rewrites() {
    if (!renderApiUrl) return [];
    return [
      {
        source: "/api/:path*",
        destination: `${renderApiUrl}/api/:path*`,
      },
    ];
  },
};

export default nextConfig;
