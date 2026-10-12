"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { friendlyIntegrationError, type FriendlyError } from "@/lib/view/errors";
import { postJson } from "./ui";

/** Runs a sync and shows a plain-language result. Can be disabled with a hint (e.g. nothing chosen to sync yet). */
export default function SyncButton({ url, body, label, provider, disabled, hint }: { url: string; body: unknown; label: string; provider?: string; disabled?: boolean; hint?: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; err?: FriendlyError } | null>(null);
  return (
    <div>
      <button
        disabled={busy || disabled}
        title={disabled ? hint : undefined}
        className="btn-primary !px-3 !py-1.5 !text-xs"
        onClick={async () => {
          setBusy(true); setMsg(null);
          try { await postJson(url, body); setMsg({ ok: true }); router.refresh(); }
          catch (e) { setMsg({ ok: false, err: friendlyIntegrationError((e as Error).message, provider) ?? { text: "Choose what to include first." } }); }
          setBusy(false);
        }}
      >{busy ? "Working…" : label}</button>
      {disabled && hint && <p className="mt-1.5 text-xs text-slate-500">{hint}</p>}
      {msg?.ok && <p className="mt-1.5 text-xs font-semibold text-emerald-700">Synced.</p>}
      {msg?.err && (
        <p className="mt-1.5 text-xs font-medium text-rose-700">
          {msg.err.text}{" "}
          {msg.err.fixUrl && <a href={msg.err.fixUrl} target="_blank" rel="noopener noreferrer" className="font-semibold underline">{msg.err.fixLabel ?? "Fix it"}</a>}
        </p>
      )}
    </div>
  );
}
