"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Icon from "@/components/shell/Icon";

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
      setMsg(`${s.processed ?? 0}/${s.run.vcs_targeted}`);
      if (s.run.status !== "running") {
        if (timer.current) clearInterval(timer.current);
        setBusy(false);
        setMsg(s.run.status === "completed" ? "Done" : `Run ${s.run.status}`);
        router.refresh();
        setTimeout(() => setMsg(""), 6000);
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
    <div className="flex items-center gap-2">
      {stalled && runId && (
        <button onClick={() => call("/api/scan/batch", { run_id: runId })} className="btn-ghost !border-amber-300 !bg-amber-50 !text-amber-900">Resume scan</button>
      )}
      <button onClick={() => call("/api/scan/start")} disabled={busy} className="btn-primary">
        <Icon name="refresh" className={`h-4 w-4 ${busy ? "animate-spin" : ""}`} />
        {busy ? "Refreshing" : "Refresh"}
      </button>
      {msg && <span className="min-w-12 text-xs font-semibold text-slate-500">{msg}</span>}
    </div>
  );
}
