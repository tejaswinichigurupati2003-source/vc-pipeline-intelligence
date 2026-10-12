import { describe, expect, it } from "vitest";
import { friendlyIntegrationError } from "@/lib/view/errors";

const GMAIL_403 = `Gmail API 403: {
  "error": {
    "code": 403,
    "message": "Gmail API has not been used in project 885586988129 before or it is disabled. Enable it by visiting https://console.developers.google.com/apis/api/gmail.googleapis.com/overview?project=885586988129 then retry."
  }
}`;

describe("friendly integration errors", () => {
  it("turns a disabled-API blob into one sentence plus a fix link, never showing raw JSON", () => {
    const e = friendlyIntegrationError(GMAIL_403, "gmail")!;
    expect(e.text).toBe("Gmail access isn't switched on for your Google project yet.");
    expect(e.fixUrl).toBe("https://console.developers.google.com/apis/api/gmail.googleapis.com/overview?project=885586988129");
    expect(e.text).not.toMatch(/[{}"]|403|project 8855/);
  });
  it("uses the right API for Calendar", () => {
    const e = friendlyIntegrationError("Calendar API 403: Google Calendar API has not been used in project 123456789012 before or it is disabled.", "calendar")!;
    expect(e.fixUrl).toContain("calendar-json.googleapis.com");
    expect(e.fixLabel).toMatch(/Calendar/);
  });
  it("a missing choice is guidance, not an error", () => {
    expect(friendlyIntegrationError("Choose at least one Gmail label to sync first", "gmail")).toBeNull();
    expect(friendlyIntegrationError(null)).toBeNull();
  });
  it("expired access, rate limits, network and unknown errors each get a plain sentence", () => {
    expect(friendlyIntegrationError("Google token error: invalid_grant")!.text).toMatch(/connect it again/);
    expect(friendlyIntegrationError("Gmail API 429: rate limit")!.text).toMatch(/Too many requests/);
    expect(friendlyIntegrationError("fetch failed")!.text).toMatch(/couldn't reach/);
    expect(friendlyIntegrationError("some weird internal failure xyz")!.text).toBe("Something went wrong. Please try again.");
  });
});
