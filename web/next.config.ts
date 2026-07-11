import type { NextConfig } from "next";
import { resolve } from "node:path";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  experimental: {
    externalDir: true,
  },
  outputFileTracingRoot: resolve(process.cwd(), ".."),
  webpack(config) {
    config.resolve.symlinks = false;
    config.resolve.modules = [resolve(process.cwd(), "node_modules"), ...(config.resolve.modules || [])];
    return config;
  },
};

export default nextConfig;
