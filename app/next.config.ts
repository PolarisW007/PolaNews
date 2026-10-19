import type { NextConfig } from "next";
import path from "path";

const basePath = '/polanews';

const nextConfig: NextConfig = {
  output: 'standalone',
  experimental: { cpus: 1 },
  basePath,
  env: {
    NEXT_PUBLIC_BASE_PATH: basePath,
  },
  serverExternalPackages: ['pg', 'sharp', 'jsdom', 'bullmq', 'ioredis', 'web-push', 'nodemailer'],
  outputFileTracingExcludes: {
    '/*': ['./data/audio/**/*'],
  },
  turbopack: {
    root: path.resolve(__dirname),
  },
};

export default nextConfig;
