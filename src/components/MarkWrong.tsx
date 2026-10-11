"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function MarkWrong({ vcId, signalId }: { vcId: string; signalId: string }) {
  const router = useRouter();
  const [state, setState] = useState<"idle" | "done" | "error">("idle");
  const click = async () => {
    let t = "";
    try { t = sessionStorage.getItem("vc_admin_token") ?? ""; } catch { /* ignore */ }
    if (!t) t = window.prompt("Admin token") ?? "";
    if (!t) return;
    const res = await fetch(`/api/vc/${vcId}`, {
      method: "PATCH",
      headers: { "x-admin-token": t, "Content-Type": "application/json" },
      body: JSON.stringify({ signal_id: signalId }),
    });
    if (res.ok) { setState("done"); router.refresh(); } else setState("error");
  };
  if (state === "done") return <span className="text-xs text-slate-500">Marked wrong (excluded from next run)</span>;
  return <button onClick={click} className="text-xs text-rose-700 underline">{state === "error" ? "Failed, retry" : "Mark wrong"}</button>;
}
