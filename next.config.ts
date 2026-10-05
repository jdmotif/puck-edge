import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["better-sqlite3"],
  images: { remotePatterns: [{ protocol: "https", hostname: "assets.nhle.com" }] },
};

export default nextConfig;
