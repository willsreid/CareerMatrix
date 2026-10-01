/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // This app is local-first: everything lives in localStorage, there is no API
  // surface and nothing is fetched from the network at runtime.
  eslint: { ignoreDuringBuilds: true },
  typescript: { ignoreBuildErrors: false },
};

export default nextConfig;
