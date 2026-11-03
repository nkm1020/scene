/** @type {import('next').NextConfig} */
const nextConfig = {
  serverExternalPackages: ["sharp", "esbuild"],
  experimental: { serverActions: { bodySizeLimit: "8mb" } },
  images: { unoptimized: true },
};
export default nextConfig;
