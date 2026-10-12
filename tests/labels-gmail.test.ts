import { describe, expect, it } from "vitest";
import { keepUnmatchedThread, shapeLabels } from "@/lib/google/labels";
import { ENTITIES, cleanValues } from "@/lib/workspace/entities";

const raw = [
  { id: "CHAT", name: "CHAT", type: "system" }, { id: "INBOX", name: "INBOX", type: "system" }, { id: "SENT", name: "SENT", type: "system" },
  { id: "SPAM", name: "SPAM", type: "system" }, { id: "STARRED", name: "STARRED", type: "system" }, { id: "IMPORTANT", name: "IMPORTANT", type: "system" },
  { id: "Label_2", name: "Investors", type: "user" }, { id: "Label_1", name: "Archive", type: "user" },
];

describe("Gmail labels offered for syncing", () => {
  it("works on a mailbox with no custom labels: built-in labels are offered, junk labels are not", () => {
    const opts = shapeLabels(raw.filter((l) => l.type === "system"));
    expect(opts.map((o) => o.id)).toEqual(["INBOX", "SENT", "STARRED", "IMPORTANT"]);
    expect(opts.every((o) => o.kind === "built_in")).toBe(true);
    expect(opts.map((o) => o.id)).not.toContain("SPAM");
  });
  it("the user's own labels come first, alphabetically, with plain names", () => {
    const opts = shapeLabels(raw);
    expect(opts.slice(0, 2).map((o) => o.name)).toEqual(["Archive", "Investors"]);
    expect(opts.find((o) => o.id === "INBOX")!.name).toMatch(/investor emails only/);
  });
  it("broad built-in labels keep only matched threads; the user's own label keeps unmatched ones for assignment", () => {
    expect(keepUnmatchedThread([["INBOX", "UNREAD"]], ["INBOX", "SENT"])).toBe(false);
    expect(keepUnmatchedThread([["INBOX", "Label_2"]], ["INBOX", "Label_2"])).toBe(true);
    expect(keepUnmatchedThread([["INBOX"]], ["Label_2"])).toBe(false); // thread is not in the user's label
  });
});

describe("investor email addresses", () => {
  it("only the allow-listed columns can be written", () => {
    expect(() => cleanValues(ENTITIES.contact, { email: "a@b.com", vc_id: "11111111-1111-4111-8111-111111111111", source: "gmail" })).toThrow(/not editable/);
    expect(cleanValues(ENTITIES.contact, { email: "a@b.com" })).toEqual({ email: "a@b.com" });
  });
});
