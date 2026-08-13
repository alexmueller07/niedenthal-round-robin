#!/usr/bin/env node
// Builds the self-contained bundle for the UW psych server (Plesk Node.js).
//
// Usage:
//   node scripts/bundle-nickel.mjs https://wwwtest.sc.psych.wisc.edu   (test)
//   node scripts/bundle-nickel.mjs https://sc.psych.wisc.edu           (production)
//
// The public URL is an argument, not an env var you might forget: NEXT_PUBLIC_*
// values are baked in at build time, and a bundle built without the right
// NEXT_PUBLIC_BASE_URL sends every email confirm link to localhost:3000.
// Test and production therefore need separate bundles.
//
// Output: ./nickel-bundle — upload its CONTENTS to the app directory on the
// server over SFTP, then follow artifacts/2026-07-22-nickel-deploy-runbook.md
// (in the parent folder's artifacts/) for the Plesk Node.js setup and the
// environment variables.

import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const base = process.argv[2];
if (!base || !/^https:\/\/[a-z0-9.-]+$/i.test(base)) {
  console.error("Usage: node scripts/bundle-nickel.mjs <public https URL>");
  console.error("  e.g. node scripts/bundle-nickel.mjs https://wwwtest.sc.psych.wisc.edu");
  process.exit(1);
}

console.log(`Building with NEXT_PUBLIC_BASE_URL=${base}`);
execSync("npm run build", {
  stdio: "inherit",
  env: { ...process.env, NEXT_PUBLIC_BASE_URL: base },
});

const out = path.join(process.cwd(), "nickel-bundle");
fs.rmSync(out, { recursive: true, force: true });

// `output: "standalone"` emits the server and its pruned node_modules, but
// deliberately not the static assets or public files — those normally live on
// a CDN. On nickel the Node server serves everything, so copy them in.
fs.cpSync(".next/standalone", out, { recursive: true });
fs.cpSync(".next/static", path.join(out, ".next", "static"), { recursive: true });
fs.cpSync("public", path.join(out, "public"), { recursive: true });

console.log(`\nBundle ready: ${out}`);
console.log(`Built for:    ${base}`);
console.log("\nNext steps (details in the runbook):");
console.log("  1. SFTP the CONTENTS of nickel-bundle/ to the app directory on the server.");
console.log("  2. Plesk -> Node.js: application startup file = server.js.");
console.log("  3. Set the environment variables (DATABASE_URL, AUTH_SECRET, ADMIN_PASSWORD,");
console.log("     PPS_SHARED_SECRET, RECORDING_DIR, CRON_SECRET, EMAIL_* ).");
console.log("  4. Run scripts/setup-db.mjs once against the same DATABASE_URL.");
console.log("  5. Plesk -> Scheduled Tasks: daily curl of /api/cron/reminders.");
