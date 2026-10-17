import type { NextConfig } from 'next';
const config: NextConfig = {
  images: { unoptimized: true },
  experimental: { serverActions: { bodySizeLimit: '3mb' } },
  // CSP bernonce dipasang per request di src/proxy.ts. Header statis di bawah tidak bergantung pada request.
  async headers() {
    return [{ source: '/:path*', headers: [
      { key: 'X-Content-Type-Options', value: 'nosniff' },
      { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
      { key: 'X-Frame-Options', value: 'DENY' },
      { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()' },
      { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
    ] }];
  },
};
export default config;
