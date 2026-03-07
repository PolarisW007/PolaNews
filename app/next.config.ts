import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: 'standalone',
  basePath: '/polanews',
  serverExternalPackages: ['pg', 'sharp', 'jsdom', 'bullmq', 'ioredis', 'web-push', 'nodemailer'],
};

export default nextConfig;
