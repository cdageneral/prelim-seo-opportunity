/** @type {import('next').NextConfig} */
const nextConfig = {
  // Next.js 14.2.x uses experimental.serverComponentsExternalPackages.
  // (The top-level `serverExternalPackages` is a Next.js 15 rename and is
  // rejected as an unrecognized key on 14.2.15.)
  experimental: {
    serverComponentsExternalPackages: ['puppeteer-core', '@sparticuz/chromium'],
  },
  webpack: (config, { isServer }) => {
    if (isServer) {
      config.externals.push('puppeteer-core', '@sparticuz/chromium');
    }
    return config;
  },
};

module.exports = nextConfig;
