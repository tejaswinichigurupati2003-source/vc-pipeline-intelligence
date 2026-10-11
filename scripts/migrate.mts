/**
 * Applies SQL migration files via the Supabase Management API.
 * Usage: npm run migrate -- supabase/migrations/004_workspace.sql [more files...]
 * Needs SUPABASE_URL and SUPABASE_ACCESS_TOKEN (a personal access token) in .env.local.
 * Migrations here only CREATE new objects (IF NOT EXISTS); none alter existing tables.
 */
import { readFileSync } from "node:fs";

const url = process.env.SUPABASE_URL ?? "";
const ref = url.match(/https:\/\/([a-z0-9]+)\.supabase\.co/)?.[1];
const token = process.env.SUPABASE_ACCESS_TOKEN;
if (!ref || !token) throw new Error("Set SUPABASE_URL and SUPABASE_ACCESS_TOKEN in .env.local");

for (const file of process.argv.slice(2)) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query: readFileSync(file, "utf8") }),
  });
  console.log(file, res.ok ? "OK" : `FAILED ${res.status} ${await res.text()}`);
  if (!res.ok) process.exit(1);
}
