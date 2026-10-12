import { db } from "@/lib/db/client";

type Col = "text" | "bool" | "uuid" | "time" | "num" | { enum: string[] };
interface Entity { table: string; cols: Record<string, Col>; insert?: boolean; update?: boolean; delete?: boolean; required?: string[]; pk?: string }

/**
 * Allow-list for the generic workspace mutation endpoint. Only the listed tables and columns can be written, with typed
 * validation. vc_pipeline, vc_signals scoring fields and integration tokens are NOT reachable through here.
 */
export const ENTITIES: Record<string, Entity> = {
  materials: {
    table: "materials", insert: true, update: true, delete: true, required: ["kind", "title"],
    cols: { kind: { enum: ["claim", "document"] }, title: "text", claim_text: "text", source_url: "text", approved: "bool", approved_at: "time" },
  },
  diligence: {
    table: "diligence_requests", insert: true, update: true, delete: true, required: ["request_text"],
    cols: { vc_id: "uuid", request_text: "text", status: { enum: ["open", "provided", "blocked"] }, material_id: "uuid", due_at: "time" },
  },
  commitment: {
    table: "commitments", insert: true, update: true, delete: true, required: ["text"],
    cols: { vc_id: "uuid", text: "text", due_at: "time", status: { enum: ["proposed", "open", "done", "dismissed"] }, who: { enum: ["founder", "investor"] } },
  },
  note: {
    table: "relationship_events", insert: true, update: true, delete: true, required: ["vc_id", "title"],
    cols: {
      vc_id: "uuid", kind: { enum: ["note", "email", "meeting"] }, provenance: { enum: ["user"] }, title: "text", summary: "text", occurred_at: "time",
      state: { enum: ["interested", "meeting_requested", "deck_requested", "awaiting_founder", "waiting_for_investor", "pass", "reconnect_later"] },
      state_confidence: { enum: ["user_confirmed"] },
    },
  },
  meeting: {
    table: "calendar_events", update: true, delete: true,
    cols: { included: "bool", notes: "text", notes_confirmed: "bool", followup_done: "bool", vc_id: "uuid" },
  },
  feedback: {
    table: "user_feedback", insert: true,
    cols: { vc_id: "uuid", target_type: { enum: ["signal", "action", "vc_match", "edge", "relationship_event"] }, target_id: "text", verdict: { enum: ["dismissed", "wrong", "corrected", "confirmed"] }, note: "text" },
    required: ["target_type", "target_id", "verdict"],
  },
  edge: {
    table: "warm_edges", update: true, delete: true,
    cols: { user_confirmed: "bool", can_act: "bool", confidence: "num", visibility: { enum: ["founder_only", "team"] } },
  },
  contact: {
    table: "vc_contacts", insert: true, delete: true, required: ["vc_id", "email"],
    cols: { vc_id: "uuid", person_name: "text", email: "text" },
  },
  node: {
    table: "warm_nodes", insert: true, delete: true, required: ["kind", "label"],
    cols: { kind: { enum: ["contact", "portfolio_founder", "vc_partner"] }, label: "text", email: "text", company: "text", vc_id: "uuid", note: "text" },
  },
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function coerce(col: Col, v: unknown): unknown {
  if (v === null || v === "") return null;
  if (col === "text") { if (typeof v !== "string") throw new Error("expected text"); return v.slice(0, 4000); }
  if (col === "bool") { if (typeof v !== "boolean") throw new Error("expected boolean"); return v; }
  if (col === "uuid") { if (typeof v !== "string" || !UUID.test(v)) throw new Error("expected uuid"); return v; }
  if (col === "time") { const d = new Date(String(v)); if (isNaN(d.getTime())) throw new Error("expected date"); return d.toISOString(); }
  if (col === "num") { const n = Number(v); if (!Number.isFinite(n) || n < 0 || n > 1) throw new Error("expected number between 0 and 1"); return n; }
  if (!col.enum.includes(String(v))) throw new Error(`expected one of ${col.enum.join(", ")}`);
  return v;
}

export function cleanValues(e: Entity, values: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(values)) {
    if (!(k in e.cols)) throw new Error(`field "${k}" is not editable`);
    out[k] = coerce(e.cols[k], v);
  }
  return out;
}

export async function mutate(entity: string, op: "insert" | "update" | "delete", id: string | undefined, values: Record<string, unknown> = {}) {
  const e = ENTITIES[entity];
  if (!e) throw new Error("unknown entity");
  if (!e[op]) throw new Error(`${op} not allowed on ${entity}`);
  if (op === "delete") {
    if (!id) throw new Error("id required");
    const { error } = await db().from(e.table).delete().eq("id", id);
    if (error) throw new Error(error.message);
    return { ok: true };
  }
  const clean = cleanValues(e, values);
  if (entity === "materials" && "approved" in clean) clean.approved_at = clean.approved ? new Date().toISOString() : null;
  if (op === "insert") {
    for (const r of e.required ?? []) if (clean[r] == null) throw new Error(`${r} is required`);
    if (entity === "contact") {
      const email = String(clean.email ?? "").trim().toLowerCase();
      if (!/^[^s@]+@[^s@]+.[^s@]+$/.test(email)) throw new Error("Enter a valid email address");
      clean.email = email; clean.source = "user";
    }
    if (entity === "note") {
      if (clean.state) clean.state_confidence = "user_confirmed"; // a state the founder picks is their own word
      clean.kind ??= "note"; clean.provenance = "user"; clean.occurred_at ??= new Date().toISOString();
    }
    const { data, error } = await db().from(e.table).insert(clean).select("id").single();
    if (error) throw new Error(error.message);
    return { ok: true, id: data.id };
  }
  if (!id) throw new Error("id required");
  if (!Object.keys(clean).length) throw new Error("nothing to update");
  const { error } = await db().from(e.table).update(clean).eq("id", id);
  if (error) throw new Error(error.message);
  return { ok: true };
}
