import type { NextConfig } from "next";

const renderApiUrl = process.env.RENDER_API_URL?.replace(/\/$/, "");

const nextConfig: NextConfig = {
  // Vercel requires `.next`. Locally use `npm run build:local` for `.next-build` while dev runs.
  distDir: process.env.VERCEL ? ".next" : process.env.NEXT_DIST_DIR || ".next",
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
