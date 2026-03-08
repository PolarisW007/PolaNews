import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  output: 'standalone',
  basePath: '/polanews',
  serverExternalPackages: ['pg', 'sharp', 'jsdom', 'bullmq', 'ioredis', 'web-push', 'nodemailer'],
  turbopack: {
    root: path.resolve(__dirname),
  },
};

export default nextConfig;
