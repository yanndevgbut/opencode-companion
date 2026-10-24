import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  typescript: {
    ignoreBuildErrors: true,
  },
  transpilePackages: ["@occ/schemas", "@occ/adapter", "@occ/core"],
  serverExternalPackages: ["jsonc-parser", "ajv"],
};

export default nextConfig;
