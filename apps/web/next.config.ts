import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  typescript: {
    ignoreBuildErrors: true,
  },
  transpilePackages: ["@occ/schemas", "@occ/adapter", "@occ/core"],
};

export default nextConfig;
