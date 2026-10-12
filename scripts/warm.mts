/**
 * Pre-compiles every page in the Next dev server so the browser never requests a script that is still compiling
 * (that race is what causes "ChunkLoadError: Loading chunk app/workspace/.../page failed" in dev).
 * Usage: npm run warm -- http://localhost:3002
 */
const base = process.argv[2] ?? "http://localhost:3000";
const rows = (await (await fetch(`${base}/api/pipeline`)).json()).rows as { id: string }[];
const paths = [
  "/", "/workspace", "/workspace/pipeline", "/workspace/signals", "/workspace/timeline", "/workspace/intros",
  "/workspace/materials", "/workspace/round", "/workspace/integrations", "/workspace/import",
  ...(rows[0] ? [`/workspace/vc/${rows[0].id}`, `/vc/${rows[0].id}`] : []),
];
for (const p of paths) {
  const t = Date.now();
  const r = await fetch(base + p).catch(() => null);
  console.log(String(r?.status ?? "ERR").padEnd(4), p.slice(0, 40).padEnd(42), `${Date.now() - t}ms`);
}
