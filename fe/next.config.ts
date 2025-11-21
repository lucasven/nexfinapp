import type { NextConfig } from "next";
import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin('./i18n.ts');

const nextConfig: NextConfig = {
  eslint: {
    // Disable ESLint during builds to avoid circular structure warning
    // ESLint can still be run manually with `npm run lint`
    ignoreDuringBuilds: true,
  },
  async redirects() {
    return [
      // Redirect old Vercel domain to production domain
      // This prevents PWA installations on the wrong domain
      {
        source: "/:path*",
        has: [
          {
            type: "host",
            value: "nexfinapp.vercel.app",
          },
        ],
        destination: "https://nexfin.app.br/:path*",
        permanent: true,
      },
    ];
  },
  async rewrites() {
    return [
      {
        source: "/ingest/static/:path*",
        destination: "https://us-assets.i.posthog.com/static/:path*",
      },
      {
        source: "/ingest/:path*",
        destination: "https://us.i.posthog.com/:path*",
      },
    ];
  },
  // This is required to support PostHog trailing slash API requests
  skipTrailingSlashRedirect: true,
};

export default withNextIntl(nextConfig);
