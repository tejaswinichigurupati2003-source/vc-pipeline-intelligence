/**
 * Imports seed/vcs.csv through the insert-only /api/import route (never overwrites existing rows).
 * Usage: npm run seed            (dev server on http://localhost:3000)
 *        npm run seed -- http://localhost:3001
 */
import { readFileSync } from "node:fs";

const base = process.argv[2] ?? process.env.SEED_URL ?? "http://localhost:3000";
const token = process.env.ADMIN_TOKEN;
if (!token) throw new Error("ADMIN_TOKEN missing (put it in .env.local)");

const res = await fetch(`${base}/api/import`, {
  method: "POST",
  headers: { "x-admin-token": token },
  body: readFileSync("seed/vcs.csv", "utf8"),
});
console.log(res.status, await res.text());
