/** @type {import('next').NextConfig} */
const nextConfig = {
  // Native / heavy Node-only modules must not be bundled by Next's server build.
  serverExternalPackages: ["better-sqlite3", "googleapis", "web-push"],
};

export default nextConfig;
