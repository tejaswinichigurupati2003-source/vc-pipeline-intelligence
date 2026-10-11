import { describe, expect, it } from "vitest";
import { parseFeed } from "@/lib/providers/feed";
import { parseLangSearch } from "@/lib/providers/langsearch";
import { parseCsv, toImportRows } from "@/lib/import-csv";
import { bucketFor } from "@/lib/view/buckets";

describe("parsers", () => {
  it("parses LangSearch data.webPages.value defensively", () => {
    const out = parseLangSearch({ data: { webPages: { value: [{ name: "A", url: "https://x.example/a?utm_source=z", snippet: "s", datePublished: "2026-10-01" }, { name: "no url" }] } } });
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ title: "A", canonicalUrl: "https://x.example/a", sourceDomain: "x.example", provider: "langsearch" });
    expect(parseLangSearch({})).toEqual([]);
  });
  it("parses RSS (Google News shape) and Atom", () => {
    const rss = `<rss><channel><item><title>Blume Ventures backs X - Economic Times</title><link>https://news.google.com/rss/articles/abc</link>
      <pubDate>Mon, 05 Oct 2026 10:00:00 GMT</pubDate><description>&lt;a&gt;snippet&lt;/a&gt;</description><source url="https://economictimes.com">ET</source></item></channel></rss>`;
    const r = parseFeed(rss, "google_news_rss", false);
    expect(r[0]).toMatchObject({ sourceDomain: "economictimes.com", providerDate: "2026-10-05T10:00:00.000Z" });
    const atom = `<feed><entry><title>Post</title><link rel="alternate" href="https://blog.example/p"/><published>2026-10-04T00:00:00Z</published><summary>S</summary></entry></feed>`;
    const a = parseFeed(atom, "feed", true);
    expect(a[0]).toMatchObject({ url: "https://blog.example/p", isFeedItem: true, providerDate: "2026-10-04T00:00:00.000Z" });
  });
});

describe("CSV import", () => {
  it("parses the seed format including quoted commas", () => {
    const csv = `investor_name,firm_name,firm_domain,investment_thesis,sector_keywords,contact_status,last_contact_at,contact_history,personal_notes\n` +
      `Blume Ventures,Blume Ventures,blume.vc,"Seed, India",logistics|supply chain,waiting_for_response,2026-10-06,Intro sent,"Strong fit, check"\n`;
    const { rows } = toImportRows(parseCsv(csv));
    expect(rows[0]).toMatchObject({ firm_domain: "blume.vc", sector_keywords: ["logistics", "supply chain"], contact_status: "waiting_for_response", personal_notes: "Strong fit, check" });
    expect(rows[0].last_contact_at).toBe("2026-10-06T00:00:00.000Z");
  });
  it("bad status falls back, missing names are skipped", () => {
    const { rows, skipped } = toImportRows([{ investor_name: "A", firm_name: "B", contact_status: "weird" }, { investor_name: "", firm_name: "x" }]);
    expect(rows[0].contact_status).toBe("yet_to_reach_out");
    expect(skipped).toHaveLength(1);
  });
});

describe("dashboard buckets keep quiet and stale apart", () => {
  it("failed or partial scans are stale, never quiet", () => {
    const base = { contact_status: "yet_to_reach_out", recommended_action: "SKIP THIS WEEK: quiet, no verified public trigger in 30 days" };
    expect(bucketFor({ ...base, latest_item_status: "success" })).toBe("quiet");
    expect(bucketFor({ ...base, latest_item_status: "failed" })).toBe("stale");
    expect(bucketFor({ ...base, latest_item_status: "partial" })).toBe("stale");
    expect(bucketFor({ contact_status: "yet_to_reach_out", recommended_action: null, latest_item_status: null })).toBe("unscanned");
    expect(bucketFor({ contact_status: "waiting_for_response", recommended_action: "HOLD: x", latest_item_status: "success" })).toBe("hold");
  });
});
