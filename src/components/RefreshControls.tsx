"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Icon from "@/components/shell/Icon";

interface Status {
  run: { id: string; status: string; vcs_targeted: number } | null;
  processed?: number;
}

const KEY = "vc_admin_token";
const getToken = () => { try { return sessionStorage.getItem(KEY) ?? ""; } catch { return ""; } };
const STALL_MS = 30_000;

export default function RefreshControls({ stalled, runId, open, running }: { stalled: boolean; runId: string | null; open?: boolean; running?: boolean }) {
  const router = useRouter();
  const [msg, setMsg] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const progress = useRef({ n: -1, at: Date.now() });

  const token = (): string | null => {
    if (open) return "open"; // no login required: the server ignores the token
    let t = getToken();
    if (!t) {
      t = window.prompt("Access token") ?? "";
      if (!t) return null;
      try { sessionStorage.setItem(KEY, t); } catch { /* storage unavailable */ }
    }
    return t;
  };

  const headers = (t: string) => ({ "x-admin-token": t, "Content-Type": "application/json" });

  const poll = (id?: string) => {
    if (timer.current) clearInterval(timer.current);
    progress.current = { n: -1, at: Date.now() };
    setBusy(true);
    timer.current = setInterval(async () => {
      const s: Status = await fetch("/api/scan/status", { cache: "no-store" }).then((r) => r.json()).catch(() => ({ run: null }));
      if (!s.run) return;
      setMsg(`${s.processed ?? 0}/${s.run.vcs_targeted}`);
      if (s.run.status !== "running") {
        if (timer.current) clearInterval(timer.current);
        setBusy(false);
        setMsg(s.run.status === "completed" ? "Done" : "Finished with gaps");
        router.refresh();
        setTimeout(() => setMsg(""), 6000);
        return;
      }
      // Safety net: if nothing has finished for a while, nudge the scan along. Claiming is safe to repeat.
      if ((s.processed ?? 0) !== progress.current.n) progress.current = { n: s.processed ?? 0, at: Date.now() };
      else if (Date.now() - progress.current.at > STALL_MS) {
        progress.current.at = Date.now();
        const t = token();
        if (t) fetch("/api/scan/batch", { method: "POST", headers: headers(t), body: JSON.stringify({ run_id: id ?? s.run.id }) }).catch(() => {});
      }
    }, 4000);
  };

  // Opening the page while a scan is running: keep watching it, and nudge it if it has stalled.
  useEffect(() => {
    if (running && runId) poll(runId);
    return () => { if (timer.current) clearInterval(timer.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const call = async (url: string, body?: object) => {
    const t = token();
    if (!t) return;
    setBusy(true);
    setMsg("Starting…");
    const res = await fetch(url, { method: "POST", headers: headers(t), body: body ? JSON.stringify(body) : undefined });
    if (res.status === 401) {
      try { sessionStorage.removeItem(KEY); } catch { /* ignore */ }
      setBusy(false);
      setMsg("Wrong token");
      return;
    }
    const j = await res.json().catch(() => ({}));
    if (res.status === 409 && j.run_id) { poll(j.run_id); return; } // already running: just follow it
    if (!res.ok) {
      setBusy(false);
      setMsg("Couldn't start");
      return;
    }
    poll(j.run_id);
  };

  return (
    <div className="flex items-center gap-2">
      {stalled && !busy && runId && (
        <button onClick={() => poll(runId)} className="btn-ghost !border-amber-300 !bg-amber-50 !text-amber-900">Resume scan</button>
      )}
      <button onClick={() => call("/api/scan/start")} disabled={busy} className="btn-primary">
        <Icon name="refresh" className={`h-4 w-4 ${busy ? "animate-spin" : ""}`} />
        {busy ? "Refreshing" : "Refresh"}
      </button>
      {msg && <span className="min-w-12 text-xs font-semibold text-slate-500">{msg}</span>}
    </div>
  );
}
