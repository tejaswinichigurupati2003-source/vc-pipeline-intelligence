import path from "node:path";

/** @type {import('next').NextConfig} */
const nextConfig = {
  serverExternalPackages: ["cheerio"],
  webpack: (config) => {
    config.resolve.alias["@"] = path.resolve(import.meta.dirname, "src");
    return config;
  },
  // The old shared view and /workspace area were merged into one app: keep old links working.
  async redirects() {
    return [
      { source: "/workspace", destination: "/", permanent: true },
      { source: "/workspace/pipeline", destination: "/investors", permanent: true },
      { source: "/workspace/vc/:id", destination: "/investors/:id", permanent: true },
      { source: "/vc/:id", destination: "/investors/:id", permanent: true },
      { source: "/workspace/timeline", destination: "/conversations", permanent: true },
      { source: "/workspace/materials", destination: "/data-room", permanent: true },
      { source: "/workspace/:path(signals|intros|round|integrations|import|meetings)/:rest*", destination: "/:path/:rest*", permanent: true },
    ];
  },
};
export default nextConfig;
