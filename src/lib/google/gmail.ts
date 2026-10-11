import pLimit from "p-limit";
import { db } from "@/lib/db/client";
import { classifyThread } from "@/lib/relationships/classify";
import { extractCommitments } from "@/lib/relationships/commitments";
import { buildMatchIndex, matchAddresses, parseAddresses } from "@/lib/relationships/match";
import { getAccessToken } from "./oauth";

const API = "https://gmail.googleapis.com/gmail/v1/users/me";

async function gfetch<T>(provider: "gmail", path: string, init: RequestInit = {}): Promise<T> {
  const { token } = await getAccessToken(provider);
  const res = await fetch(`${API}${path}`, { ...init, headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...init.headers }, signal: AbortSignal.timeout(15_000) });
  if (!res.ok) throw new Error(`Gmail API ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return res.json() as Promise<T>;
}

export interface GmailLabel { id: string; name: string; type: string }

export async function listLabels(): Promise<GmailLabel[]> {
  const j = await gfetch<{ labels?: GmailLabel[] }>("gmail", "/labels");
  return (j.labels ?? []).filter((l) => l.type === "user").sort((a, b) => a.name.localeCompare(b.name));
}

interface GMessage { id: string; threadId: string; snippet?: string; internalDate?: string; labelIds?: string[]; payload?: { headers?: { name: string; value: string }[] } }
interface GThread { id: string; messages?: GMessage[] }

const header = (m: GMessage, n: string) => m.payload?.headers?.find((h) => h.name.toLowerCase() === n.toLowerCase())?.value ?? "";

export function threadLink(threadId: string) {
  return `https://mail.google.com/mail/u/0/#all/${threadId}`;
}

export interface SyncResult { threads: number; matched: number; unmatched: number; commitments: number; skippedConfirmed: number }

/**
 * Sync the founder-selected labels only. Metadata format: headers + snippet, never full bodies.
 * Stored per thread: subject, participants, a classification reason, a deep link to Gmail. Snippets are used in memory only
 * (state rules + commitment sentences the founder must confirm).
 */
export async function syncGmail(maxThreads = 40): Promise<SyncResult> {
  const { account } = await getAccessToken("gmail");
  const labelIds = (account.config.labelIds as string[] | undefined) ?? [];
  if (!labelIds.length) throw new Error("Choose at least one Gmail label to sync first");
  const own = (account.account_label ?? "").toLowerCase();

  const { data: vcs } = await db().from("vc_pipeline").select("id, firm_domain");
  const { data: contacts } = await db().from("vc_contacts").select("vc_id, email");
  const idx = buildMatchIndex(vcs ?? [], contacts ?? []);

  const ids = new Set<string>();
  for (const label of labelIds) {
    const j = await gfetch<{ threads?: { id: string }[] }>("gmail", `/threads?labelIds=${encodeURIComponent(label)}&maxResults=${maxThreads}`);
    for (const t of j.threads ?? []) ids.add(t.id);
  }

  const limit = pLimit(4);
  const res: SyncResult = { threads: 0, matched: 0, unmatched: 0, commitments: 0, skippedConfirmed: 0 };
  await Promise.all([...ids].slice(0, maxThreads).map((id) => limit(async () => {
    const t = await gfetch<GThread>("gmail", `/threads/${id}?format=metadata&metadataHeaders=From&metadataHeaders=To&metadataHeaders=Cc&metadataHeaders=Subject&metadataHeaders=Date`);
    const msgs = t.messages ?? [];
    if (!msgs.length) return;
    res.threads++;
    const last = msgs[msgs.length - 1];
    const addrs = [...new Set(msgs.flatMap((m) => [...parseAddresses(header(m, "From")), ...parseAddresses(header(m, "To")), ...parseAddresses(header(m, "Cc"))]))];
    const others = addrs.filter((a) => a !== own);
    const match = matchAddresses(addrs, idx, [own]);
    const lastFromFounder = parseAddresses(header(last, "From")).includes(own);
    const lastInvestorMsg = [...msgs].reverse().find((m) => !parseAddresses(header(m, "From")).includes(own)) ?? last;
    const subject = header(msgs[0], "Subject") || "(no subject)";
    const { state, reason } = classifyThread({ lastFromFounder, lastInvestorSnippet: lastInvestorMsg.snippet ?? "", subject });
    const occurredAt = new Date(Number(last.internalDate ?? Date.now())).toISOString();
    const ref = `gmail:thread:${id}`;

    const { data: prev } = await db().from("relationship_events").select("id, state, state_confidence, vc_id").eq("external_ref", ref).maybeSingle();
    const confirmed = prev?.state_confidence === "user_confirmed";
    if (confirmed) res.skippedConfirmed++;
    const row = {
      vc_id: prev?.vc_id ?? match?.vcId ?? null, kind: "email", provenance: "gmail", external_ref: ref, link_url: threadLink(id),
      title: subject.slice(0, 200), participants: others.slice(0, 10), occurred_at: occurredAt,
      ...(confirmed ? {} : { state, state_confidence: "rule", summary: reason }),
    };
    const { data: ev } = await db().from("relationship_events").upsert(row, { onConflict: "external_ref" }).select("id, vc_id").single();
    if (ev?.vc_id) res.matched++; else res.unmatched++;

    if (ev) {
      for (const c of extractCommitments(last.snippet ?? "", lastFromFounder, new Date(Number(last.internalDate ?? Date.now())))) {
        const { data: dup } = await db().from("commitments").select("id").eq("event_id", ev.id).eq("text", c.text).maybeSingle();
        if (dup) continue;
        await db().from("commitments").insert({ vc_id: ev.vc_id, event_id: ev.id, text: c.text, due_at: c.dueAt, who: c.who, status: "proposed" });
        res.commitments++;
      }
    }
  })));
  await db().from("integration_accounts").update({ last_sync_at: new Date().toISOString(), last_error: null, status: "connected" }).eq("provider", "gmail");
  return res;
}

function b64url(s: string) {
  return Buffer.from(s, "utf8").toString("base64url");
}

/** RFC 2822 message for drafts.create. Header values are stripped of CR/LF to prevent header injection. */
export function buildMime(args: { to: string; subject: string; body: string }): string {
  const clean = (s: string) => s.replace(/[\r\n]+/g, " ").trim();
  const subj = /^[\x20-\x7e]*$/.test(args.subject) ? clean(args.subject) : `=?UTF-8?B?${Buffer.from(clean(args.subject)).toString("base64")}?=`;
  return [
    args.to ? `To: ${clean(args.to)}` : null,
    `Subject: ${subj}`,
    "MIME-Version: 1.0",
    "Content-Type: text/plain; charset=UTF-8",
    "Content-Transfer-Encoding: 8bit",
    "",
    args.body,
  ].filter((l) => l !== null).join("\r\n");
}

/** Creates a Gmail DRAFT only. There is deliberately no send function anywhere in this codebase. */
export async function createGmailDraft(args: { to: string; subject: string; body: string; threadId?: string }) {
  const j = await gfetch<{ id: string; message?: { id: string; threadId: string } }>("gmail", "/drafts", {
    method: "POST",
    body: JSON.stringify({ message: { raw: b64url(buildMime(args)), ...(args.threadId ? { threadId: args.threadId } : {}) } }),
  });
  return { draftId: j.id, url: `https://mail.google.com/mail/u/0/#drafts?compose=${j.message?.id ?? ""}` };
}
