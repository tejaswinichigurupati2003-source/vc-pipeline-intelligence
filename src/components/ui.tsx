"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export async function postJson(url: string, body: unknown, method = "POST") {
  const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(j.error ?? `Request failed (${res.status})`);
  return j;
}

export function LoginForm() {
  const router = useRouter();
  const [err, setErr] = useState("");
  return (
    <form
      className="mx-auto mt-16 max-w-sm space-y-3 rounded-lg border border-slate-200 bg-white p-6"
      onSubmit={async (e) => {
        e.preventDefault();
        const token = new FormData(e.currentTarget).get("token");
        try { await postJson("/api/auth/login", { token }); router.refresh(); } catch (x) { setErr((x as Error).message); }
      }}
    >
      <h1 className="text-lg font-semibold">Workspace login</h1>
      <p className="text-sm text-slate-600">This area holds private notes and connected account data. Enter your admin token.</p>
      <input name="token" type="password" autoComplete="current-password" className="w-full rounded border px-3 py-2 text-sm" placeholder="Admin token" />
      <button className="rounded bg-indigo-600 px-4 py-2 text-sm font-medium text-white">Sign in</button>
      {err && <p className="text-sm text-rose-700">{err}</p>}
    </form>
  );
}

export function LogoutButton() {
  const router = useRouter();
  return <button className="text-xs text-slate-500 underline" onClick={async () => { await fetch("/api/auth/login", { method: "DELETE" }); router.refresh(); }}>Sign out</button>;
}

export interface Field { name: string; label: string; type?: "text" | "textarea" | "select" | "date" | "number" | "checkbox"; options?: { value: string; label: string }[]; placeholder?: string; required?: boolean; defaultValue?: string }

/** Generic JSON form: POST/PUT to an API route, then refresh the server components. */
export function ApiForm(props: { url: string; method?: string; fields: Field[]; submit: string; extra?: Record<string, unknown>; className?: string; onDone?: (j: unknown) => void; envelope?: { entity: string; op: "insert" | "update" | "delete"; id?: string; static?: Record<string, unknown> }; collectChecked?: string; extraTop?: Record<string, unknown> }) {
  const router = useRouter();
  const [state, setState] = useState<{ msg: string; ok: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <form
      className={props.className ?? "space-y-2"}
      onSubmit={async (e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        const values: Record<string, unknown> = { ...(props.extra ?? {}) };
        for (const f of props.fields) {
          const raw = fd.get(f.name);
          if (f.type === "checkbox") values[f.name] = raw === "on";
          else if (raw !== null && String(raw).trim() !== "") values[f.name] = f.type === "number" ? Number(raw) : String(raw);
        }
        setBusy(true); setState(null);
        try {
          let body: unknown = values;
          if (props.collectChecked) {
            const checked = props.fields.filter((f) => f.type === "checkbox" && values[f.name] === true).map((f) => f.name);
            body = { ...(props.extraTop ?? {}), [props.collectChecked]: checked };
          } else if (props.envelope) {
            const { entity, op, id, static: st } = props.envelope;
            body = { entity, op, ...(id ? { id } : {}), values: { ...(st ?? {}), ...values } };
          }
          const j = await postJson(props.url, body, props.method ?? "POST");
          setState({ msg: "Saved", ok: true });
          (e.target as HTMLFormElement).reset();
          props.onDone?.(j);
          router.refresh();
        } catch (x) { setState({ msg: (x as Error).message, ok: false }); }
        setBusy(false);
      }}
    >
      {props.fields.map((f) => (
        <label key={f.name} className="block text-sm">
          <span className="text-xs text-slate-500">{f.label}</span>
          {f.type === "textarea" ? <textarea name={f.name} rows={3} required={f.required} placeholder={f.placeholder} defaultValue={f.defaultValue} className="mt-1 w-full rounded border px-2 py-1" />
            : f.type === "select" ? (
              <select name={f.name} required={f.required} defaultValue={f.defaultValue} className="mt-1 w-full rounded border px-2 py-1">
                {!f.required && <option value="">-</option>}
                {f.options?.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            ) : f.type === "checkbox" ? <input type="checkbox" name={f.name} defaultChecked={f.defaultValue === "true"} className="ml-2" />
            : <input name={f.name} type={f.type ?? "text"} step={f.type === "number" ? "0.05" : undefined} required={f.required} placeholder={f.placeholder} defaultValue={f.defaultValue} className="mt-1 w-full rounded border px-2 py-1" />}
        </label>
      ))}
      <button disabled={busy} className="rounded bg-slate-800 px-3 py-1.5 text-sm text-white disabled:opacity-50">{busy ? "Saving…" : props.submit}</button>
      {state && <span className={`ml-2 text-xs ${state.ok ? "text-emerald-700" : "text-rose-700"}`}>{state.msg}</span>}
    </form>
  );
}

export function ApiButton(props: { url: string; body?: unknown; method?: string; label: string; confirm?: string; tone?: "default" | "danger" | "quiet"; onDone?: (j: unknown) => void; className?: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const tone = props.tone === "danger" ? "text-rose-700 border-rose-300" : props.tone === "quiet" ? "text-slate-500 border-transparent underline" : "text-slate-800 border-slate-300";
  return (
    <span className={props.className}>
      <button
        disabled={busy}
        className={`rounded border px-2 py-1 text-xs disabled:opacity-50 ${tone}`}
        onClick={async () => {
          if (props.confirm && !window.confirm(props.confirm)) return;
          setBusy(true); setMsg("");
          try { const j = await postJson(props.url, props.body ?? {}, props.method ?? "POST"); props.onDone?.(j); setMsg(typeof (j as { message?: string }).message === "string" ? (j as { message: string }).message : ""); router.refresh(); }
          catch (x) { setMsg((x as Error).message); }
          setBusy(false);
        }}
      >{busy ? "…" : props.label}</button>
      {msg && <span className="ml-2 text-xs text-rose-700">{msg}</span>}
    </span>
  );
}

export function Badge({ kind, children }: { kind: "public" | "private" | "note" | "verified" | "inferred" | "confirmed" | "warn" | "neutral"; children: React.ReactNode }) {
  const c: Record<string, string> = {
    public: "bg-sky-100 text-sky-800", private: "bg-violet-100 text-violet-800", note: "bg-emerald-100 text-emerald-800",
    verified: "bg-emerald-100 text-emerald-800", inferred: "bg-amber-100 text-amber-800", confirmed: "bg-indigo-100 text-indigo-800",
    warn: "bg-rose-100 text-rose-800", neutral: "bg-slate-100 text-slate-600",
  };
  return <span className={`rounded px-1.5 py-0.5 text-[11px] font-medium ${c[kind]}`}>{children}</span>;
}
