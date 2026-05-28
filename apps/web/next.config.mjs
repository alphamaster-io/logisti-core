/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ['@logisti-core/shared'],
  output: 'standalone',
  reactStrictMode: true,
  env: {
    NEXT_PUBLIC_API_BASE_URL: process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:4000/api/v1',
  },
};

export default nextConfig;
