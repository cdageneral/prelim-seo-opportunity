/** @type {import('next').NextConfig} */
const nextConfig = {
  // Next.js 14.2.x uses experimental.serverComponentsExternalPackages.
  // (The top-level `serverExternalPackages` is a Next.js 15 rename and is
  // rejected as an unrecognized key on 14.2.15.)
  experimental: {
    serverComponentsExternalPackages: ['puppeteer-core', '@sparticuz/chromium'],
    // v7.374: @sparticuz/chromium ^149 loads its brotli-packed binary from
    // node_modules/@sparticuz/chromium/bin at runtime in a way the output file
    // tracer no longer follows, so the folder was missing from the deployed
    // lambda ("input directory .../bin does not exist"). Force-include it for
    // the PDF route (both key forms so either app-route matcher hits).
    outputFileTracingIncludes: {
      '/api/reports/pdf': ['./node_modules/@sparticuz/chromium/bin/**'],
      '/api/reports/pdf/route': ['./node_modules/@sparticuz/chromium/bin/**'],
    },
  },
  webpack: (config, { isServer }) => {
    if (isServer) {
      config.externals.push('puppeteer-core', '@sparticuz/chromium');
    }
    return config;
  },
};

module.exports = nextConfig;
