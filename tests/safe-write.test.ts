import { createHash } from "node:crypto";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const SRC = path.resolve(__dirname, "..", "src");

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = path.join(dir, f);
    return statSync(p).isDirectory() ? walk(p) : /\.(ts|tsx)$/.test(p) ? [p] : [];
  });
}

describe("write boundary (release-blocking)", () => {
  const files = walk(SRC);

  it("no code mutates vc_pipeline except through the RPC (insert-only import is the sole exception)", () => {
    // from('vc_pipeline') / from("vc_pipeline") followed (within the chain) by update/upsert/delete
    const re = /\.from\(\s*['"`]vc_pipeline['"`]\s*\)[\s\S]{0,300}?\.(update|upsert|delete)\s*\(/;
    const offenders = files.filter((f) => re.test(readFileSync(f, "utf8"))).map((f) => path.relative(SRC, f));
    expect(offenders).toEqual([]);
  });

  it("vc_pipeline .insert( appears only in the insert-only import route and the user-writer", () => {
    const re = /\.from\(\s*['"`]vc_pipeline['"`]\s*\)[\s\S]{0,200}?\.insert\s*\(/;
    const offenders = files.filter((f) => re.test(readFileSync(f, "utf8"))).map((f) => path.relative(SRC, f).replace(/\\/g, "/"));
    expect(offenders.sort()).toEqual(["app/api/import/route.ts", "lib/db/user-writer.ts"]);
  });

  it("the RPC is called only from pipeline-writer.ts", () => {
    const callers = files.filter((f) => /apply_vc_signal_update/.test(readFileSync(f, "utf8"))).map((f) => path.basename(f));
    expect(callers).toEqual(["pipeline-writer.ts"]);
  });

  it("user-initiated import RPCs are called only from user-writer.ts, and the scanner never imports it", () => {
    const callers = files.filter((f) => /import_fill_blanks|import_apply_resolution|user_delete_vc|user_set_contact_status/.test(readFileSync(f, "utf8"))).map((f) => path.basename(f));
    expect(callers).toEqual(["user-writer.ts"]);
    const importers = files.filter((f) => /user-writer/.test(readFileSync(f, "utf8"))).map((f) => path.relative(SRC, f).replace(/\\/g, "/"));
    expect(importers.sort()).toEqual(["app/api/investors/status/route.ts", "lib/importer/service.ts"]);
    for (const scanFile of ["lib/scan/scan-vc.ts", "lib/scan/batch.ts"]) expect(readFileSync(path.join(SRC, scanFile), "utf8")).not.toMatch(/user-writer|importer/);
  });

  it("SQL allow-lists for user RPCs never include the four signal columns", () => {
    const sql = readFileSync(path.resolve(__dirname, "../supabase/migrations/005_user_rpcs.sql"), "utf8");
    const body = sql.replace(/--.*$/gm, "");
    for (const col of ["last_signal_date", "signal_summary", "follow_up_score", "recommended_action"]) expect(body).not.toContain(col);
  });

  it("the app can never send email: no send scope, endpoint or function exists", () => {
    const all = files.map((f) => readFileSync(f, "utf8")).join("\n");
    expect(all).not.toMatch(/gmail\.send|gmail\.modify|mail\.google\.com\/"|\/messages\/send|\/drafts\/send|users\.messages\.send/);
    expect(all).not.toMatch(/function\s+send\w*Email|sendGmail/i);
  });

  it("scanner profile reads never select manual notes/history", () => {
    const store = readFileSync(path.join(SRC, "lib/db/store.ts"), "utf8");
    const cols = store.match(/const PROFILE_COLS =\s*"([^"]+)"/)?.[1] ?? "";
    expect(cols).not.toMatch(/contact_history|personal_notes/);
  });

  it("no secret uses a NEXT_PUBLIC_ prefix, and no Claude/Anthropic reference exists in src", () => {
    const all = files.map((f) => readFileSync(f, "utf8")).join("\n");
    expect(all).not.toMatch(/NEXT_PUBLIC_/);
    expect(all).not.toMatch(/anthropic|claude/i);
  });

  it("the migration only touches the four signal columns", () => {
    const sql = readFileSync(path.resolve(__dirname, "../supabase/migrations/002_safe_update.sql"), "utf8");
    const set = sql.match(/update public\.vc_pipeline\s+set\s+([\s\S]*?)where/i)?.[1] ?? "";
    const cols = [...set.matchAll(/(\w+)\s*=/g)].map((m) => m[1]).sort();
    expect(cols).toEqual(["follow_up_score", "last_signal_date", "recommended_action", "signal_summary"]);
  });
});

/**
 * Live regression: hashes every manual column, performs a real RPC write for every VC, re-reads, asserts identical.
 * Runs only when SUPABASE_* and REGRESSION_ALLOW_WRITE=1 are set (it overwrites the four signal columns with
 * synthetic values, so point it at a test project or accept that the next scan will recompute them).
 */
const live = !!(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY && process.env.REGRESSION_ALLOW_WRITE === "1");

describe.skipIf(!live)("manual columns are hash-identical after a signal write (live Supabase)", () => {
  it("passes", async () => {
    const { db } = await import("@/lib/db/client");
    const { applyPipelineSignalUpdate } = await import("@/lib/db/pipeline-writer");
    const MANUAL = "id, contact_status, last_contact_at, contact_history, personal_notes, investor_name, firm_name, investment_thesis";
    const snap = async () => {
      const { data, error } = await db().from("vc_pipeline").select(MANUAL).order("id");
      if (error) throw error;
      return createHash("sha256").update(JSON.stringify(data)).digest("hex");
    };
    const { data: ids } = await db().from("vc_pipeline").select("id");
    expect(ids?.length).toBeGreaterThan(0);
    const before = await snap();
    for (const r of ids!) {
      await applyPipelineSignalUpdate(r.id, {
        last_signal_date: new Date().toISOString(), signal_summary: "regression fixture", follow_up_score: 42, recommended_action: "REVIEW: regression fixture",
      });
    }
    expect(await snap()).toBe(before);
  });
});
