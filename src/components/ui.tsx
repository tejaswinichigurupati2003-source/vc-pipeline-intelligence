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
      className="card mx-auto mt-24 max-w-sm space-y-3 p-7"
      onSubmit={async (e) => {
        e.preventDefault();
        const token = new FormData(e.currentTarget).get("token");
        try { await postJson("/api/auth/login", { token }); router.refresh(); } catch (x) { setErr((x as Error).message); }
      }}
    >
      <h1 className="!text-xl">Sign in</h1>
      <p className="text-sm text-slate-600">Enter your access token to continue.</p>
      <input name="token" type="password" autoComplete="current-password" placeholder="Admin token" />
      <button className="btn-primary w-full">Sign in</button>
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
          <span className="text-[0.78rem] font-semibold text-slate-600">{f.label}</span>
          {f.type === "textarea" ? <textarea name={f.name} rows={3} required={f.required} placeholder={f.placeholder} defaultValue={f.defaultValue} className="mt-1" />
            : f.type === "select" ? (
              <select name={f.name} required={f.required} defaultValue={f.defaultValue} className="mt-1">
                {!f.required && <option value="">-</option>}
                {f.options?.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            ) : f.type === "checkbox" ? <input type="checkbox" name={f.name} defaultChecked={f.defaultValue === "true"} className="ml-2 align-middle" />
            : <input name={f.name} type={f.type ?? "text"} step={f.type === "number" ? "0.05" : undefined} required={f.required} placeholder={f.placeholder} defaultValue={f.defaultValue} className="mt-1" />}
        </label>
      ))}
      <button disabled={busy} className="btn-primary !py-1.5">{busy ? "Saving…" : props.submit}</button>
      {state && <span className={`ml-2 text-xs ${state.ok ? "text-emerald-700" : "text-rose-700"}`}>{state.msg}</span>}
    </form>
  );
}

export function ApiButton(props: { url: string; body?: unknown; method?: string; label: string; confirm?: string; tone?: "default" | "danger" | "quiet"; onDone?: (j: unknown) => void; className?: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const tone = props.tone === "danger" ? "border border-rose-200 bg-white text-rose-700 hover:bg-rose-50" : props.tone === "quiet" ? "text-slate-500 hover:text-slate-800" : "border border-slate-200 bg-white text-slate-700 hover:bg-slate-50";
  return (
    <span className={props.className}>
      <button
        disabled={busy}
        className={`btn !px-2.5 !py-1 !text-xs ${tone}`}
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
    public: "bg-sky-50 text-sky-700 border-sky-200", private: "bg-violet-50 text-violet-700 border-violet-200", note: "bg-emerald-50 text-emerald-700 border-emerald-200",
    verified: "bg-emerald-50 text-emerald-700 border-emerald-200", inferred: "bg-amber-50 text-amber-800 border-amber-200", confirmed: "bg-indigo-50 text-indigo-700 border-indigo-200",
    warn: "bg-rose-50 text-rose-700 border-rose-200", neutral: "bg-slate-100 text-slate-600 border-slate-200",
  };
  return <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[0.7rem] font-bold border ${c[kind]}`}>{children}</span>;
}
