"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

interface Status {
  run: { id: string; status: string; vcs_targeted: number } | null;
  processed?: number;
  stalled?: boolean;
}

const KEY = "vc_admin_token";
const getToken = () => { try { return sessionStorage.getItem(KEY) ?? ""; } catch { return ""; } };

export default function RefreshControls({ stalled, runId, open }: { stalled: boolean; runId: string | null; open?: boolean }) {
  const router = useRouter();
  const [msg, setMsg] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const ask = (): string | null => {
    if (open) return "open"; // login switched off: the server ignores the token
    let t = getToken();
    if (!t) {
      t = window.prompt("Admin token") ?? "";
      if (!t) return null;
      try { sessionStorage.setItem(KEY, t); } catch { /* storage unavailable */ }
    }
    return t;
  };

  const poll = () => {
    if (timer.current) clearInterval(timer.current);
    timer.current = setInterval(async () => {
      const s: Status = await fetch("/api/scan/status", { cache: "no-store" }).then((r) => r.json()).catch(() => ({ run: null }));
      if (!s.run) return;
      setMsg(`Scanning: ${s.processed ?? 0} of ${s.run.vcs_targeted} VCs`);
      if (s.run.status !== "running") {
        if (timer.current) clearInterval(timer.current);
        setBusy(false);
        setMsg(`Run ${s.run.status}`);
        router.refresh();
      }
    }, 4000);
  };

  useEffect(() => () => { if (timer.current) clearInterval(timer.current); }, []);

  const call = async (url: string, body?: object) => {
    const token = ask();
    if (!token) return;
    setBusy(true);
    setMsg("Starting…");
    const res = await fetch(url, {
      method: "POST",
      headers: { "x-admin-token": token, "Content-Type": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (res.status === 401) {
      try { sessionStorage.removeItem(KEY); } catch { /* ignore */ }
      setBusy(false);
      setMsg("Wrong admin token");
      return;
    }
    const j = await res.json().catch(() => ({}));
    if (!res.ok) {
      setBusy(false);
      setMsg(j.error ?? "Failed");
      return;
    }
    poll();
  };

  return (
    <div className="flex flex-wrap items-center gap-3">
      <button
        onClick={() => call("/api/scan/start")}
        disabled={busy}
        className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
      >
        {busy ? "Refreshing…" : "Refresh"}
      </button>
      {stalled && runId && (
        <button
          onClick={() => call("/api/scan/batch", { run_id: runId })}
          className="rounded-md border border-amber-500 bg-amber-50 px-3 py-2 text-sm text-amber-900"
        >
          Resume stalled run
        </button>
      )}
      {msg && <span className="text-sm text-slate-600">{msg}</span>}
    </div>
  );
}
