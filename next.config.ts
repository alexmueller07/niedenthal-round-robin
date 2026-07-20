import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  turbopack: {
    root: path.join(__dirname),
  },
  // Self-contained server bundle (.next/standalone) so the app can run under a
  // Node runtime on the UW psych server (Plesk Node toolkit / Passenger) with
  // `node server.js`, not just Vercel. No effect on the Vercel deployment.
  output: "standalone",
};

export default nextConfig;
