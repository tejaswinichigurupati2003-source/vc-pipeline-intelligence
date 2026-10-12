import { beforeAll, describe, expect, it } from "vitest";
import { buildMime } from "@/lib/google/gmail";
import { classifyThread, suggestContactStatus } from "@/lib/relationships/classify";
import { extractCommitments, resolveDatePhrase } from "@/lib/relationships/commitments";
import { buildMatchIndex, matchAddresses, parseAddresses } from "@/lib/relationships/match";
import { decrypt, encrypt, signState, verifyState } from "@/lib/crypto";
import { hasAdminSession, isAdmin, sessionValue } from "@/lib/auth";
import { ENTITIES, cleanValues, coerce } from "@/lib/workspace/entities";

const c = (snippet: string, fromFounder = false, subject = "") => classifyThread({ lastFromFounder: fromFounder, lastInvestorSnippet: snippet, subject });

describe("relationship state classifier", () => {
  it.each([
    ["Could you send over the deck?", "deck_requested"],
    ["Happy to chat, are you free Thursday? calendly.com/x", "meeting_requested"],
    ["This is interesting, I'd love to learn more", "interested"],
    ["Unfortunately this isn't a fit for us right now", "pass"],
    ["Too early for us, let's reconnect next quarter", "reconnect_later"],
    ["Thanks for sharing.", "awaiting_founder"],
  ])("%s -> %s", (text, state) => expect(c(text).state).toBe(state));
  it("a polite pass beats interested words later in the same note", () => {
    expect(c("Interested in the space but unfortunately we will pass").state).toBe("pass");
  });
  it("founder last = waiting_for_investor, regardless of old investor words", () => {
    expect(c("send the deck", true).state).toBe("waiting_for_investor");
  });
  it("suggests (never applies) a contact status", () => {
    expect(suggestContactStatus("pass")).toBe("closed");
    expect(suggestContactStatus("reconnect_later")).toBeNull();
  });
});

describe("commitments", () => {
  const ref = new Date("2026-10-12T00:00:00Z"); // a Monday
  it("resolves relative and absolute phrases", () => {
    expect(resolveDatePhrase("by tomorrow", ref)?.toISOString().slice(0, 10)).toBe("2026-10-13");
    expect(resolveDatePhrase("next week", ref)?.toISOString().slice(0, 10)).toBe("2026-10-19");
    expect(resolveDatePhrase("on Friday", ref)?.toISOString().slice(0, 10)).toBe("2026-10-16");
    expect(resolveDatePhrase("by 20 Oct", ref)?.toISOString().slice(0, 10)).toBe("2026-10-20");
    expect(resolveDatePhrase("2026-11-02", ref)?.toISOString().slice(0, 10)).toBe("2026-11-02");
    expect(resolveDatePhrase("sometime soon", ref)).toBeNull();
  });
  it("proposes only sentences that contain a promise AND a date", () => {
    const out = extractCommitments("Great meeting. I'll send the data room by Friday. Thanks again.", true, ref);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ who: "founder" });
    expect(extractCommitments("I will think about it.", false, ref)).toHaveLength(0);
  });
});

describe("matching emails to investors", () => {
  const idx = buildMatchIndex([{ id: "a", firm_domain: "blume.vc" }, { id: "b", firm_domain: "shared.com" }, { id: "c", firm_domain: "shared.com" }, { id: "g", firm_domain: "gmail.com" }], [{ vc_id: "b", email: "Jane@Shared.com" }]);
  it("exact email wins, domain works, generic and ambiguous domains never match", () => {
    expect(matchAddresses(["jane@shared.com"], idx)?.basis).toBe("email");
    expect(matchAddresses(["x@blume.vc"], idx)).toMatchObject({ vcId: "a", basis: "domain" });
    expect(matchAddresses(["x@shared.com"], idx)).toBeNull();      // two VCs share the domain
    expect(matchAddresses(["someone@gmail.com"], idx)).toBeNull(); // free mail
    expect(matchAddresses(["me@blume.vc"], idx, ["me@blume.vc"])).toBeNull(); // own address skipped
  });
  it("parses display-name headers", () => {
    expect(parseAddresses('"Doe, Jane" <Jane.Doe@Blume.vc>, bob@x.io')).toEqual(["jane.doe@blume.vc", "bob@x.io"]);
  });
});

describe("gmail draft MIME", () => {
  it("strips CR/LF from headers (no header injection) and encodes non-ASCII subjects", () => {
    const mime = buildMime({ to: "a@b.com\r\nBcc: evil@x.com", subject: "Hi\r\nBcc: evil@x.com", body: "Body" });
    expect(mime.split("\r\n").filter((l) => /^bcc:/i.test(l))).toHaveLength(0);
    expect(buildMime({ to: "", subject: "Café", body: "x" })).toMatch(/Subject: =\?UTF-8\?B\?/);
    expect(buildMime({ to: "", subject: "x", body: "x" })).not.toMatch(/^To:/m);
  });
});

describe("crypto + auth", () => {
  beforeAll(() => { process.env.INTEGRATION_ENC_KEY = "test-key"; process.env.ADMIN_TOKEN = "admin-secret"; });
  it("encrypts round-trip and detects tampering", () => {
    const e = encrypt("refresh-token-123");
    expect(e).not.toContain("refresh-token");
    expect(decrypt(e)).toBe("refresh-token-123");
    const bad = Buffer.from(e, "base64"); bad[bad.length - 1] ^= 1;
    expect(() => decrypt(bad.toString("base64"))).toThrow();
  });
  it("signed OAuth state verifies, rejects tampering and expiry", () => {
    expect(verifyState(signState("gmail:abc"))).toBe("gmail:abc");
    expect(verifyState(signState("gmail:abc") + "x")).toBeNull();
    expect(verifyState(signState("gmail:abc", -1))).toBeNull();
  });
  it("admin accepts the header token or a valid session cookie; cookie writes must be same-origin", () => {
    const sv = sessionValue()!;
    expect(isAdmin(new Request("http://x/api", { headers: { "x-admin-token": "admin-secret" } }))).toBe(true);
    expect(isAdmin(new Request("http://x/api", { headers: { "x-admin-token": "nope" } }))).toBe(false);
    expect(isAdmin(new Request("http://x/api", { headers: { cookie: `vcpi_admin=${sv}` } }))).toBe(true);
    expect(isAdmin(new Request("http://x/api", { method: "POST", headers: { cookie: `vcpi_admin=${sv}`, host: "x", origin: "http://evil.com" } }))).toBe(false);
    expect(isAdmin(new Request("http://x/api", { method: "POST", headers: { cookie: `vcpi_admin=${sv}`, host: "x", origin: "http://x" } }))).toBe(true);
    expect(hasAdminSession("wrong")).toBe(false);
  });
});

describe("workspace mutation allow-list", () => {
  it("cannot reach vc_pipeline, tokens or scoring tables", () => {
    const tables = Object.values(ENTITIES).map((e) => e.table);
    for (const forbidden of ["vc_pipeline", "integration_accounts", "vc_signals", "signal_runs", "import_conflicts"]) expect(tables).not.toContain(forbidden);
  });
  it("rejects unknown fields and bad values", () => {
    expect(() => cleanValues(ENTITIES.materials, { title: "x", kind: "claim", token_enc: "x" })).toThrow(/not editable/);
    expect(() => coerce({ enum: ["a"] }, "b")).toThrow();
    expect(() => coerce("uuid", "not-a-uuid")).toThrow();
    expect(() => coerce("num", 7)).toThrow();
    expect(coerce("time", "2026-10-12")).toBe("2026-10-12T00:00:00.000Z");
  });
  it("notes can only be created as user-provenance, user-confirmed state", () => {
    expect(() => cleanValues(ENTITIES.note, { provenance: "gmail" })).toThrow();
    expect(() => cleanValues(ENTITIES.note, { state_confidence: "rule" })).toThrow();
  });
});
