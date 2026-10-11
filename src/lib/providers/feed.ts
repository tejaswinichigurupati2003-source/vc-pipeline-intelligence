import { XMLParser } from "fast-xml-parser";
import { canonicalizeUrl, domainOf } from "@/lib/discovery/normalize";
import type { Candidate, Provider } from "@/lib/types";

const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "@_", textNodeName: "#text" });

const arr = <T>(v: T | T[] | undefined): T[] => (v === undefined ? [] : Array.isArray(v) ? v : [v]);
const txt = (v: unknown): string => {
  if (v == null) return "";
  if (typeof v === "string" || typeof v === "number") return String(v);
  if (typeof v === "object") return String((v as Record<string, unknown>)["#text"] ?? "");
  return "";
};
const stripHtml = (s: string) => s.replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();

function toIso(s: string): string | null {
  if (!s) return null;
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d.toISOString();
}

/** Parse RSS 2.0 or Atom into candidates. Pure; shared by Google News RSS and known-feed monitor. */
export function parseFeed(xml: string, provider: Provider, isFeedItem: boolean): Omit<Candidate, "id">[] {
  const doc = parser.parse(xml);
  const out: Omit<Candidate, "id">[] = [];

  for (const it of arr(doc?.rss?.channel?.item)) {
    const link = txt(it.link) || txt(it.guid);
    if (!link) continue;
    // Google News appends " - Publisher" to the title; keep it, the publisher is evidence context.
    out.push({
      url: link,
      canonicalUrl: canonicalizeUrl(link),
      title: stripHtml(txt(it.title)),
      snippet: stripHtml(txt(it.description)).slice(0, 600),
      provider,
      sourceDomain: domainOf(txt(it.source?.["@_url"]) || link),
      providerDate: toIso(txt(it.pubDate)),
      isFeedItem,
    });
  }

  for (const e of arr(doc?.feed?.entry)) {
    const links = arr(e.link) as Array<Record<string, string> | string>;
    const alt = links.find((l) => typeof l === "object" && (l["@_rel"] ?? "alternate") === "alternate") ?? links[0];
    const href = typeof alt === "string" ? alt : alt?.["@_href"];
    if (!href) continue;
    out.push({
      url: href,
      canonicalUrl: canonicalizeUrl(href),
      title: stripHtml(txt(e.title)),
      snippet: stripHtml(txt(e.summary) || txt(e.content)).slice(0, 600),
      provider,
      sourceDomain: domainOf(href),
      providerDate: toIso(txt(e.published) || txt(e.updated)),
      isFeedItem,
    });
  }
  return out;
}
