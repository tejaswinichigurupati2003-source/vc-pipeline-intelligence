"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { postJson } from "./ui";

/** Runs a sync and shows the result counts inline (instead of a silent refresh). */
export default function SyncButton({ url, body, label }: { url: string; body: unknown; label: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);
  return (
    <span>
      <button disabled={busy} className="rounded bg-indigo-600 px-3 py-1 text-xs text-white disabled:opacity-50" onClick={async () => {
        setBusy(true); setMsg(null);
        try { const j = await postJson(url, body); setMsg({ text: Object.entries(j).map(([k, v]) => `${k}: ${typeof v === "object" ? JSON.stringify(v) : v}`).join(" · "), ok: true }); router.refresh(); }
        catch (e) { setMsg({ text: (e as Error).message, ok: false }); }
        setBusy(false);
      }}>{busy ? "Working…" : label}</button>
      {msg && <span className={`ml-2 text-xs ${msg.ok ? "text-emerald-700" : "text-rose-700"}`}>{msg.text}</span>}
    </span>
  );
}
