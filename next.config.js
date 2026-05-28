/** @type {import('next').NextConfig} */
const nextConfig = {
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
