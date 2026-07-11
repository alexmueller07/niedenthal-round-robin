// Applies schema.sql to the database in DATABASE_URL (idempotent).
// Usage: node scripts/setup-db.mjs
import { neon } from "@neondatabase/serverless";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is not set. Pull it with: npx vercel env pull .env.local");
  process.exit(1);
}

const schemaPath = join(dirname(fileURLToPath(import.meta.url)), "..", "schema.sql");
const schema = readFileSync(schemaPath, "utf8");

// The Neon HTTP driver runs one statement per call; split on top-level ';'.
const statements = schema
  .split(/;\s*(?:\r?\n|$)/)
  .map((s) => s.trim())
  .filter((s) => s.length > 0 && !s.startsWith("--"));

const sql = neon(url);
for (const statement of statements) {
  await sql.query(statement);
}
console.log(`Applied ${statements.length} statements from schema.sql`);
