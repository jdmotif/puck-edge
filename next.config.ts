import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: { remotePatterns: [{ protocol: "https", hostname: "assets.nhle.com" }] },
};

export default nextConfig;
