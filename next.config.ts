import type { NextConfig } from "next";

// `npm run build:static` sets these for the GitHub Pages copy (served from /<repo>/).
const isStatic = process.env.NEXT_PUBLIC_STATIC_SITE === "1";
const basePath = isStatic ? process.env.NEXT_PUBLIC_BASE_PATH || undefined : undefined;

const nextConfig: NextConfig = {
  images: { remotePatterns: [{ protocol: "https", hostname: "assets.nhle.com" }] },
  ...(basePath ? { basePath } : {}),
  // Keep the static build out of .next so it never clobbers a local `next build`.
  ...(isStatic ? { distDir: ".next-static" } : {}),
};

export default nextConfig;
