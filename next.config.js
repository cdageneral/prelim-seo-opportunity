/** @type {import('next').NextConfig} */
const nextConfig = {
  // serverExternalPackages replaces experimental.serverComponentsExternalPackages in Next.js 14.1+
  serverExternalPackages: ['puppeteer-core', '@sparticuz/chromium'],
  webpack: (config, { isServer }) => {
    if (isServer) {
      config.externals.push('puppeteer-core', '@sparticuz/chromium');
    }
    return config;
  },
};

module.exports = nextConfig;
