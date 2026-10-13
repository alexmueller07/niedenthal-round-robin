// Copy the whole Round Robin database from one Postgres to another, and prove
// the copy is exact.
//
// Written for the move to wisc.edu (Randy, 2026-10-13: "Sasha will write a
// script to transfer all data to Wisconsin servers"). Any two Postgres servers
// work — Neon, a UW-hosted Postgres, or a local Docker container for practice.
//
//   node scripts/migrate-db.mjs --from <url> --to <url>            # dry run
//   node scripts/migrate-db.mjs --from <url> --to <url> --yes      # copy
//   node scripts/migrate-db.mjs --from <url> --to <url> --verify   # check only
//
// URLs can also come from FROM_DATABASE_URL / TO_DATABASE_URL, which keeps
// them out of shell history. Never commit either.
//
// What a copy does, in order:
//   1. applies schema.sql to the target (idempotent), so every table exists;
//   2. refuses if the target already holds rows, unless --replace is given;
//   3. empties the target's tables and copies every row, parents first (the
//      order is read from the foreign keys, not a hand-kept list);
//   4. moves every serial sequence past the copied ids;
//   5. verifies: per table, the row count and a checksum over every row's
//      content must match on both sides. Any mismatch exits non-zero.
//
// Recordings are not copied: the video lives on the Research Drive, and the
// database only holds the rows describing it.

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const BATCH = 500;

function arg(name) {
  const i = process.argv.indexOf(name);
  return i === -1 ? undefined : process.argv[i + 1];
}
const has = (flag) => process.argv.includes(flag);

const fromUrl = arg("--from") ?? process.env.FROM_DATABASE_URL;
const toUrl = arg("--to") ?? process.env.TO_DATABASE_URL;
if (!fromUrl || !toUrl) {
  console.error("usage: node scripts/migrate-db.mjs --from <url> --to <url> [--yes] [--replace] [--verify]");
  process.exit(2);
}
if (fromUrl === toUrl) {
  console.error("--from and --to are the same database.");
  process.exit(2);
}

/** Host and database only — a URL's password never reaches the terminal. */
function describe(url) {
  try {
    const u = new URL(url);
    return `${u.hostname}${u.port ? `:${u.port}` : ""}${u.pathname}`;
  } catch {
    return "(unparseable URL)";
  }
}

async function connect(url) {
  const local = /@(localhost|127\.0\.0\.1)[:/]/.test(url);
  // TLS is set explicitly below (verified, except on this machine), so the
  // URL's own sslmode is dropped rather than left for pg to reinterpret.
  const parsed = new URL(url);
  parsed.searchParams.delete("sslmode");
  parsed.searchParams.delete("channel_binding");
  const client = new pg.Client({
    connectionString: parsed.toString(),
    ssl: local ? false : { rejectUnauthorized: true },
  });
  await client.connect();
  // Checksums compare text renderings; a timestamp renders in the session's
  // time zone, so both ends must use the same one.
  await client.query("SET TIME ZONE 'UTC'");
  return client;
}

async function tables(client) {
  const { rows } = await client.query(`
    SELECT table_name FROM information_schema.tables
    WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
    ORDER BY table_name`);
  return rows.map((r) => r.table_name);
}

/** Parents before children, from the foreign keys themselves. */
async function dependencyOrder(client, names) {
  const { rows } = await client.query(`
    SELECT tc.table_name AS child, ccu.table_name AS parent
    FROM information_schema.table_constraints tc
    JOIN information_schema.constraint_column_usage ccu
      ON tc.constraint_name = ccu.constraint_name AND tc.table_schema = ccu.table_schema
    WHERE tc.constraint_type = 'FOREIGN KEY' AND tc.table_schema = 'public'`);
  const parents = new Map(names.map((n) => [n, new Set()]));
  for (const { child, parent } of rows) {
    if (child !== parent && parents.has(child) && parents.has(parent)) {
      parents.get(child).add(parent);
    }
  }
  const ordered = [];
  const done = new Set();
  const visit = (name, stack = new Set()) => {
    if (done.has(name)) return;
    if (stack.has(name)) throw new Error(`foreign-key cycle through ${name}`);
    stack.add(name);
    for (const p of parents.get(name)) visit(p, stack);
    stack.delete(name);
    done.add(name);
    ordered.push(name);
  };
  for (const n of [...names].sort()) visit(n);
  return ordered;
}

async function count(client, table) {
  const { rows } = await client.query(`SELECT count(*)::bigint AS n FROM "${table}"`);
  return Number(rows[0].n);
}

/**
 * md5 over every row's content, order-independent. jsonb normalises key order,
 * so a table whose columns were added in a different order on the two servers
 * (ALTER TABLE history vs. a fresh schema.sql) still checksums the same.
 */
async function checksum(client, table) {
  const { rows } = await client.query(`
    SELECT coalesce(md5(string_agg(h, '' ORDER BY h)), 'empty') AS sum
    FROM (SELECT md5(to_jsonb(t)::text) AS h FROM "${table}" t) x`);
  return rows[0].sum;
}

function applySchema() {
  const path = join(dirname(fileURLToPath(import.meta.url)), "..", "schema.sql");
  return readFileSync(path, "utf8")
    .split(/\r?\n/)
    .filter((line) => !/^\s*--/.test(line))
    .join("\n")
    .split(/;\s*(?:\r?\n|$)/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

async function verify(source, target, order) {
  let ok = true;
  console.log("\nverify");
  for (const t of order) {
    const [a, b] = await Promise.all([count(source, t), count(target, t)]);
    const [x, y] = await Promise.all([checksum(source, t), checksum(target, t)]);
    const match = a === b && x === y;
    if (!match) ok = false;
    console.log(`${match ? "  ok " : "  !! "}${String(a).padStart(7)} ${String(b).padStart(7)}  ${t}`);
  }
  return ok;
}

const source = await connect(fromUrl);
const target = await connect(toUrl);
try {
  console.log(`from ${describe(fromUrl)}`);
  console.log(`to   ${describe(toUrl)}`);

  const names = await tables(source);
  const order = await dependencyOrder(source, names);

  if (has("--verify")) {
    const ok = await verify(source, target, order);
    console.log(ok ? "\nEvery table matches." : "\nMISMATCH — see the !! rows.");
    process.exitCode = ok ? 0 : 1;
  } else {
    let total = 0;
    console.log("\nsource rows");
    for (const t of order) {
      const n = await count(source, t);
      total += n;
      console.log(`${String(n).padStart(9)}  ${t}`);
    }
    console.log(`${String(total).padStart(9)}  total, ${order.length} tables`);

    if (!has("--yes")) {
      console.log("\nDry run. Re-run with --yes to copy.");
    } else {
      // Counted BEFORE schema.sql runs: it seeds a few default rows, and those
      // are not anybody's data.
      const before = new Set(await tables(target));
      let existing = 0;
      for (const t of order) if (before.has(t)) existing += await count(target, t);
      if (existing > 0 && !has("--replace")) {
        throw new Error(`target already holds ${existing} rows. Re-run with --replace to overwrite them.`);
      }

      for (const statement of applySchema()) await target.query(statement);
      console.log("\nschema.sql applied to the target");

      const targetNames = new Set(await tables(target));
      const missing = order.filter((t) => !targetNames.has(t));
      if (missing.length) {
        throw new Error(`target is missing tables schema.sql does not create: ${missing.join(", ")}`);
      }

      await target.query("BEGIN");
      try {
        await target.query(
          `TRUNCATE TABLE ${order.map((t) => `"${t}"`).join(", ")} RESTART IDENTITY CASCADE`
        );
        for (const t of order) {
          let copied = 0;
          for (let offset = 0; ; offset += BATCH) {
            // ctid order is stable for a table nobody is writing to, and needs
            // no primary key — not every table here has one.
            const { rows } = await source.query(
              `SELECT to_jsonb(t) AS r FROM "${t}" t ORDER BY ctid LIMIT ${BATCH} OFFSET ${offset}`
            );
            if (rows.length === 0) break;
            await target.query(
              `INSERT INTO "${t}" SELECT * FROM jsonb_populate_recordset(NULL::"${t}", $1::jsonb)`,
              [JSON.stringify(rows.map((x) => x.r))]
            );
            copied += rows.length;
          }
          if (copied) console.log(`copied ${String(copied).padStart(7)}  ${t}`);
        }
        // Serial columns: the next id has to come after the copied ones.
        const { rows: seqs } = await target.query(`
          SELECT table_name, column_name,
                 pg_get_serial_sequence('"' || table_name || '"', column_name) AS seq
          FROM information_schema.columns
          WHERE table_schema = 'public' AND column_default LIKE 'nextval(%'`);
        for (const { table_name, column_name, seq } of seqs) {
          if (!seq) continue;
          await target.query(
            `SELECT setval($1, coalesce((SELECT max("${column_name}") FROM "${table_name}"), 0) + 1, false)`,
            [seq]
          );
        }
        await target.query("COMMIT");
      } catch (err) {
        await target.query("ROLLBACK");
        throw err;
      }

      const ok = await verify(source, target, order);
      console.log(ok ? "\nCopied, and every table matches." : "\nMISMATCH after copy — see the !! rows.");
      process.exitCode = ok ? 0 : 1;
    }
  }
} catch (err) {
  console.error(`\nFailed: ${err.message}`);
  process.exitCode = 1;
} finally {
  await source.end();
  await target.end();
}
