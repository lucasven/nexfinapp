import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  eslint: {
    // Disable ESLint during builds to avoid circular structure warning
    // ESLint can still be run manually with `npm run lint`
    ignoreDuringBuilds: true,
  },
};

export default nextConfig;
