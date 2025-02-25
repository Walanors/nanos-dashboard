import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  assetPrefix: process.env.NODE_ENV === 'production' ? 'https://hetzner.nanosmanager.uk:3000' : '',
  trailingSlash: true,
  poweredByHeader: false,
  reactStrictMode: true,
  // Disable HTTPS forcing
  experimental: {
    forceSwcTransforms: true
  }
};

export default nextConfig;
