/** @type {import('next').NextConfig} */
const nextConfig = {
  serverExternalPackages: ["sharp", "esbuild"],
  experimental: { serverActions: { bodySizeLimit: "8mb" } },
  images: { unoptimized: true },
  devIndicators: false,
};
export default nextConfig;
