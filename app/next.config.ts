import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: 'standalone',
  serverExternalPackages: ['pg', 'sharp', 'jsdom', 'bullmq', 'ioredis', 'web-push', 'nodemailer'],
};

export default nextConfig;
