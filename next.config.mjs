import path from "node:path";

/** @type {import('next').NextConfig} */
const nextConfig = {
  serverExternalPackages: ["cheerio"],
  webpack: (config) => {
    config.resolve.alias["@"] = path.resolve(import.meta.dirname, "src");
    return config;
  },
};
export default nextConfig;
