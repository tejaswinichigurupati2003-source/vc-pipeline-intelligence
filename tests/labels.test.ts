import { describe, expect, it } from "vitest";
import { cleanSummary, toBoardRows } from "@/lib/view/board";
import { avatarStyle, formatAction, initials, signalStrength, STAGES, timeAgo } from "@/lib/view/labels";
import { ACTIONS } from "@/lib/scoring/recommend";
import type { PipelineRow } from "@/lib/db/read";

describe("action labels: stored spec strings become clean product language", () => {
  it("maps every action the scorer can write", () => {
    for (const stored of Object.values(ACTIONS)) {
      const v = formatAction(stored);
      expect(v.label).not.toMatch(/[A-Z]{4,}/); // no SHOUTING
      expect(v.label.length).toBeGreaterThan(2);
      expect(v.hint.length).toBeGreaterThan(5);
    }
    expect(formatAction(ACTIONS.REACH_OUT)).toMatchObject({ label: "Reach out", tone: "go" });
    expect(formatAction(ACTIONS.REVIEW_TIMING).label).toBe("Check timing");
    expect(formatAction(ACTIONS.SKIP).label).toBe("Skip this week");
    expect(formatAction(ACTIONS.HOLD).tone).toBe("muted");
  });
  it("a failed scan is never presented as quiet, even if the stored action says SKIP", () => {
    expect(formatAction(ACTIONS.SKIP, "stale")).toMatchObject({ label: "Needs refresh", tone: "alert" });
  });
  it("handles unscanned and unknown text gracefully", () => {
    expect(formatAction(null).label).toBe("Not scanned");
    expect(formatAction("WAIT: something new")).toMatchObject({ label: "Wait", hint: "Something new" });
  });
});

describe("signal strength bands", () => {
  it.each([[null, "none"], [0, "quiet"], [39, "quiet"], [40, "warm"], [69, "warm"], [70, "hot"], [100, "hot"]])("%s -> %s", (score, band) => {
    expect(signalStrength(score as number | null).band).toBe(band);
  });
});

describe("summaries read as prose on cards", () => {
  it("strips the date prefix, source suffix and '+n more' marker", () => {
    expect(cleanSummary("[5 Oct] Route Ventures led a $6M round. Source: economictimes.com. (+2 more)")).toEqual({ text: "Route Ventures led a $6M round.", quiet: false, extra: 2 });
  });
  it("quiet summaries show the last known item or a plain fallback", () => {
    expect(cleanSummary("No verified public signal in the last 30 days. Last known: [3 Jul] Fund closes at 100cr.")).toMatchObject({ quiet: true, text: "Last seen: Fund closes at 100cr" });
    expect(cleanSummary("No verified public signal in the last 30 days. No signal ever found.").text).toBe("No public signal found yet");
    expect(cleanSummary(null).quiet).toBe(true);
  });
});

describe("small helpers", () => {
  it("initials ignore parentheses and handle single words", () => {
    expect(initials("Z47 (Matrix Partners India)")).toBe("Z");
    expect(initials("Blume Ventures")).toBe("BV");
    expect(initials("")).toBe("?");
  });
  it("avatar colours are stable per name", () => {
    expect(avatarStyle("Blume Ventures")).toEqual(avatarStyle("Blume Ventures"));
    expect(avatarStyle("Blume Ventures")).not.toEqual(avatarStyle("Accel India"));
  });
  it("relative time", () => {
    const now = new Date("2026-10-12T12:00:00Z");
    expect(timeAgo("2026-10-12T11:59:40Z", now)).toBe("just now");
    expect(timeAgo("2026-10-12T09:00:00Z", now)).toBe("3h ago");
    expect(timeAgo("2026-10-09T12:00:00Z", now)).toBe("3d ago");
    expect(timeAgo(null, now)).toBe("never");
  });
  it("board stages match the four statuses the database accepts, in funnel order", () => {
    expect(STAGES.map((s) => s.key)).toEqual(["yet_to_reach_out", "waiting_for_response", "in_conversation", "closed"]);
  });
  it("board rows never carry private notes or history", () => {
    const row = { id: "1", investor_name: "A", firm_name: "A", firm_domain: null, investment_thesis: "Seed India", contact_status: "yet_to_reach_out", last_contact_at: null,
      last_signal_date: null, signal_summary: null, follow_up_score: null, recommended_action: null, contact_history: "SECRET HISTORY", personal_notes: "SECRET NOTE",
      latest_item_status: null, latest_item_error: null, latest_scan_mode: null, last_success_at: null, top_signal: null, bucket: "unscanned" } as PipelineRow;
    expect(JSON.stringify(toBoardRows([row]))).not.toMatch(/SECRET/);
  });
});
