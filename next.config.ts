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

  // The admin dashboard collapsed from six tabs to four. RAs have these old
  // URLs bookmarked, so keep them working.
  async redirects() {
    return [
      { source: "/admin/slots", destination: "/admin/schedule", permanent: false },
      { source: "/admin/run", destination: "/admin", permanent: false },
      { source: "/admin/participants", destination: "/admin/people", permanent: false },
      { source: "/admin/emails", destination: "/admin/people", permanent: false },
    ];
  },
};

export default nextConfig;
