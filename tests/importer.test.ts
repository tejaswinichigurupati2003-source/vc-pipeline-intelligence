import { describe, expect, it } from "vitest";
import { autoMap, normalizeDomain, normalizeRow, normalizeStatus, parseDateLoose } from "@/lib/importer/mapping";
import { planImport, type ExistingVc } from "@/lib/importer/plan";
import { toCsv } from "@/lib/export";

const existing = (over: Partial<ExistingVc> = {}): ExistingVc => ({
  id: "v1", investor_name: "Blume Ventures", firm_name: "Blume Ventures", firm_domain: null, investment_thesis: "Seed India",
  sector_keywords: [], contact_status: "waiting_for_response", last_contact_at: "2026-10-06T00:00:00.000Z",
  contact_history: "Intro sent", personal_notes: "Strong fit", emails: [], profile_urls: [], ...over,
});
const M = { investor_name: "Investor", firm_name: "Firm", firm_domain: "Website", contact_status: "Status", personal_notes: "Notes", email: "Email", last_contact_at: "Last" };

describe("column mapping", () => {
  it("auto-maps common header names and uses each header once", () => {
    const m = autoMap(["Partner", "Fund", "Website", "Status", "Notes", "Email Address", "Last Contacted"]);
    expect(m).toMatchObject({ investor_name: "Partner", firm_name: "Fund", firm_domain: "Website", contact_status: "Status", personal_notes: "Notes", email: "Email Address", last_contact_at: "Last Contacted" });
  });
  it("normalises status, domain, dates (day-first)", () => {
    expect(normalizeStatus("In talks")).toBe("in_conversation");
    expect(normalizeStatus("Passed")).toBe("closed");
    expect(normalizeStatus("???")).toBeNull();
    expect(normalizeDomain("https://www.Blume.vc/about")).toBe("blume.vc");
    expect(normalizeDomain("nonsense")).toBeNull();
    expect(parseDateLoose("06/10/2026")).toBe("2026-10-06T00:00:00.000Z");
    expect(parseDateLoose("2026-10-06")).toBe("2026-10-06T00:00:00.000Z");
  });
  it("validates rows: needs a name, flags bad email/status/date but keeps the row", () => {
    expect(normalizeRow({}, M).row).toBeNull();
    const { row, issues } = normalizeRow({ Investor: "A", Firm: "", Email: "not-an-email", Status: "weird", Last: "zzz" }, M);
    expect(row?.firm_name).toBe("A");
    expect(row?.email).toBeNull();
    expect(issues.map((i) => i.message).join("|")).toMatch(/Invalid email.*Unrecognised status.*Unreadable date|No firm name/s);
  });
});

describe("import plan: merge rules never overwrite", () => {
  it("fills blanks, flags conflicts, keeps existing values", () => {
    const plan = planImport([{ Investor: "Blume Ventures", Firm: "Blume Ventures", Website: "blume.vc", Status: "in talks", Notes: "Different note" }], M, [existing()]);
    const r = plan.rows[0];
    expect(r.action).toBe("merge");
    expect(r.fill).toEqual({ firm_domain: "blume.vc" });
    expect(r.conflicts.map((c) => c.field).sort()).toEqual(["contact_status", "personal_notes"]);
    expect(r.conflicts.find((c) => c.field === "personal_notes")).toMatchObject({ existing: "Strong fit", incoming: "Different note" });
  });
  it("re-importing the same data is a no-op (idempotent)", () => {
    const plan = planImport([{ Investor: "Blume Ventures", Firm: "Blume Ventures", Status: "waiting", Notes: "strong fit", Last: "2026-10-06" }], M, [existing()]);
    expect(plan.rows[0].action).toBe("skip");
    expect(plan.summary.conflicts).toBe(0);
  });
  it("matches by email even when the name differs", () => {
    const plan = planImport([{ Investor: "B. Partner", Firm: "Blume", Email: "x@blume.vc", Notes: "hi" }], M, [existing({ emails: ["x@blume.vc"] })]);
    expect(plan.rows[0]).toMatchObject({ action: "merge", matchBasis: "email", vcId: "v1" });
  });
  it("same firm under a different person is inserted but flagged as a possible duplicate", () => {
    const plan = planImport([{ Investor: "Jane Doe", Firm: "Blume Ventures" }], M, [existing()]);
    expect(plan.rows[0].action).toBe("insert");
    expect(plan.rows[0].possibleDuplicateOf?.reason).toMatch(/already tracked/);
    expect(plan.summary.ambiguous).toBe(1);
  });
  it("skips duplicates inside the file and reports invalid rows", () => {
    const plan = planImport([{ Investor: "New VC", Firm: "New VC" }, { Investor: "new vc", Firm: "NEW VC" }, { Investor: "", Firm: "" }], M, []);
    expect(plan.rows.map((r) => r.action)).toEqual(["insert", "skip", "invalid"]);
  });
  it("sector keywords blank in DB are filled; non-blank are conflicts only when different", () => {
    const m = { ...M, sector_keywords: "Sectors" };
    expect(planImport([{ Investor: "Blume Ventures", Firm: "Blume Ventures", Sectors: "logistics|freight" }], m, [existing()]).rows[0].fill.sector_keywords).toEqual(["logistics", "freight"]);
    const same = planImport([{ Investor: "Blume Ventures", Firm: "Blume Ventures", Sectors: "freight|logistics" }], m, [existing({ sector_keywords: ["logistics", "freight"] })]);
    expect(same.rows[0].conflicts).toHaveLength(0);
  });
});

describe("CSV export", () => {
  it("quotes properly and neutralises spreadsheet formula injection", () => {
    const csv = toCsv([{ a: '=HYPERLINK("http://evil")', b: "x,y", c: ["p", "q"] }], ["a", "b", "c"]);
    expect(csv.split("\n")[1]).toBe(`"'=HYPERLINK(""http://evil"")","x,y",p|q`);
  });
});
