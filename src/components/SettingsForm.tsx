"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { postJson } from "./ui";

export interface SettingField { key: string; label: string; value: string; type?: "text" | "number"; hint?: string }

/** One form, one Save button, for several app settings (each is saved with PUT /api/workspace). */
export default function SettingsForm({ fields, submit = "Save changes", columns = 1 }: { fields: SettingField[]; submit?: string; columns?: 1 | 2 | 3 }) {
  const router = useRouter();
  const [state, setState] = useState<{ msg: string; ok: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const grid = columns === 3 ? "md:grid-cols-3" : columns === 2 ? "md:grid-cols-2" : "";
  return (
    <form
      className="space-y-4"
      onSubmit={async (e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        setBusy(true); setState(null);
        try {
          for (const f of fields) {
            const v = String(fd.get(f.key) ?? "").trim();
            if (v !== f.value.trim() && v !== "") await postJson("/api/workspace", { key: f.key, value: v }, "PUT");
          }
          setState({ msg: "Saved", ok: true });
          router.refresh();
        } catch (x) { setState({ msg: (x as Error).message, ok: false }); }
        setBusy(false);
      }}
    >
      <div className={`grid gap-4 ${grid}`}>
        {fields.map((f) => (
          <label key={f.key} className="block">
            <span className="text-[0.78rem] font-semibold text-slate-600">{f.label}</span>
            <input name={f.key} type={f.type ?? "text"} defaultValue={f.value} className="mt-1" />
            {f.hint && <span className="mt-1 block text-xs text-slate-400">{f.hint}</span>}
          </label>
        ))}
      </div>
      <div className="flex items-center gap-3">
        <button disabled={busy} className="btn-primary">{busy ? "Saving…" : submit}</button>
        {state && <span className={`text-xs font-semibold ${state.ok ? "text-emerald-700" : "text-rose-700"}`}>{state.msg}</span>}
      </div>
    </form>
  );
}
