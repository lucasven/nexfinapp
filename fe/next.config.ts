import type { NextConfig } from "next";
import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin('./i18n.ts');

const nextConfig: NextConfig = {
  eslint: {
    // Disable ESLint during builds to avoid circular structure warning
    // ESLint can still be run manually with `npm run lint`
    ignoreDuringBuilds: true,
  },
};

export default withNextIntl(nextConfig);
