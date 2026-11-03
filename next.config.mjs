/** @type {import('next').NextConfig} */
const nextConfig = {
  serverExternalPackages: ["sharp", "esbuild"],
  experimental: { serverActions: { bodySizeLimit: "8mb" } },
  images: { unoptimized: true },
  devIndicators: false,
  distDir: process.env.NEXT_DIST_DIR || ".next",
};
export default nextConfig;
