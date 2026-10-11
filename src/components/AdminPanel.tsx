"use client";

import { useState } from "react";

const KEY = "vc_admin_token";

/** Private notes + "mark wrong" controls. Notes are fetched only after the admin token is supplied. */
export default function AdminPanel({ vcId }: { vcId: string }) {
  const [notes, setNotes] = useState<{ contact_history?: string | null; personal_notes?: string | null } | null>(null);
  const [err, setErr] = useState("");

  const token = () => {
    let t = "";
    try { t = sessionStorage.getItem(KEY) ?? ""; } catch { /* ignore */ }
    if (!t) {
      t = window.prompt("Admin token") ?? "";
      try { if (t) sessionStorage.setItem(KEY, t); } catch { /* ignore */ }
    }
    return t;
  };

  const load = async () => {
    const t = token();
    if (!t) return;
    const res = await fetch(`/api/vc/${vcId}`, { headers: { "x-admin-token": t }, cache: "no-store" });
    if (!res.ok) return setErr("Could not load");
    const j = await res.json();
    setNotes({ contact_history: j.vc.contact_history, personal_notes: j.vc.personal_notes });
  };

  return (
    <div className="mt-6 rounded-lg border border-slate-200 bg-white p-4">
      <h3 className="font-semibold">Private notes</h3>
      {!notes ? (
        <button onClick={load} className="mt-2 rounded border px-3 py-1 text-sm">Unlock with admin token</button>
      ) : (
        <dl className="mt-2 space-y-2 text-sm">
          <div><dt className="text-xs text-slate-500">Contact history</dt><dd>{notes.contact_history || "none"}</dd></div>
          <div><dt className="text-xs text-slate-500">Personal notes</dt><dd>{notes.personal_notes || "none"}</dd></div>
        </dl>
      )}
      {err && <p className="mt-2 text-xs text-rose-700">{err}</p>}
    </div>
  );
}
