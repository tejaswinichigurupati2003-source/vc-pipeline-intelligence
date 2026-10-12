import { lookup } from "node:dns/promises";
import net from "node:net";
import * as cheerio from "cheerio";
import { config } from "@/lib/config";
import { canonicalizeUrl, isBlockedDomain } from "./normalize";
import type { FetchedPage } from "@/lib/types";

const MAX_BYTES = 1_500_000;
const MAX_REDIRECTS = 3;
const UA = "Mozilla/5.0 (compatible; VCPipelineBot/1.0; research)";

export class FetchError extends Error {
  constructor(public code: string, message: string) {
    super(message);
  }
}

/** Loopback, private, link-local, CGNAT, multicast and cloud-metadata ranges (IPv4 + IPv6). */
export function isPrivateIp(ip: string): boolean {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split(".").map(Number);
    return (
      a === 0 || a === 10 || a === 127 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 192 && b === 0) ||
      (a === 198 && (b === 18 || b === 19)) ||
      a >= 224
    );
  }
  if (net.isIPv6(ip)) {
    const l = ip.toLowerCase();
    if (l === "::1" || l === "::") return true;
    if (l.startsWith("fc") || l.startsWith("fd") || l.startsWith("fe8") || l.startsWith("fe9") || l.startsWith("fea") || l.startsWith("feb")) return true;
    const mapped = l.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (mapped) return isPrivateIp(mapped[1]);
    return false;
  }
  return true; // unparseable: refuse
}

/** Validates scheme and resolves DNS; rejects if ANY resolved address is private. */
export async function assertSafeUrl(raw: string): Promise<URL> {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    throw new FetchError("bad_url", "Invalid URL");
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") throw new FetchError("bad_scheme", "Only http/https allowed");
  if (u.username || u.password) throw new FetchError("bad_url", "Credentials in URL not allowed");
  const host = u.hostname.replace(/^\[|\]$/g, "");
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".internal") || host === "metadata.google.internal") {
    throw new FetchError("ssrf", "Blocked host");
  }
  if (net.isIP(host)) {
    if (isPrivateIp(host)) throw new FetchError("ssrf", "Blocked address");
    return u;
  }
  let addrs: { address: string }[];
  try {
    addrs = await Promise.race([
      lookup(host, { all: true }),
      new Promise<never>((_, rej) => setTimeout(() => rej(new Error("dns timeout")), 4000)),
    ]);
  } catch {
    throw new FetchError("dns", `DNS lookup failed for ${host}`);
  }
  if (!addrs.length || addrs.some((a) => isPrivateIp(a.address))) throw new FetchError("ssrf", "Resolves to a blocked address");
  return u;
}

// ~1 request per host per second
const lastHit = new Map<string, number>();
async function politeDelay(host: string) {
  const wait = (lastHit.get(host) ?? 0) + 1000 - Date.now();
  lastHit.set(host, Math.max(Date.now(), (lastHit.get(host) ?? 0) + 1000));
  if (wait > 0) await new Promise((r) => setTimeout(r, Math.min(wait, 3000)));
}

const robotsCache = new Map<string, string[]>();
async function robotsAllows(u: URL): Promise<boolean> {
  const origin = u.origin;
  let rules = robotsCache.get(origin);
  if (!rules) {
    rules = [];
    try {
      const res = await fetch(`${origin}/robots.txt`, { signal: AbortSignal.timeout(4000), headers: { "User-Agent": UA } });
      if (res.ok) {
        let applies = false;
        for (const line of (await res.text()).split(/\r?\n/)) {
          const m = line.match(/^\s*([A-Za-z-]+)\s*:\s*(.*?)\s*(#.*)?$/);
          if (!m) continue;
          const k = m[1].toLowerCase();
          if (k === "user-agent") applies = m[2] === "*" || /vcpipelinebot/i.test(m[2]);
          else if (applies && k === "disallow" && m[2]) rules.push(m[2]);
        }
      }
    } catch {
      /* unreachable robots.txt: treat as allowed */
    }
    robotsCache.set(origin, rules);
  }
  return !rules.some((r) => u.pathname.startsWith(r));
}

const HTML_TYPES = ["text/html", "application/xhtml+xml", "text/plain"];
const XML_TYPES = ["application/rss+xml", "application/atom+xml", "application/xml", "text/xml"];

/** SSRF-safe GET with manual redirects (each hop re-validated), size/time/content-type limits. */
export async function safeFetchText(
  rawUrl: string,
  opts: { allowXml?: boolean } = {},
): Promise<{ body: string; finalUrl: string; contentType: string }> {
  let url = rawUrl;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const u = await assertSafeUrl(url);
    if (!opts.allowXml && isBlockedDomain(u.hostname.replace(/^www\./, ""))) throw new FetchError("blocked", "Blocked domain");
    if (!opts.allowXml && !(await robotsAllows(u))) throw new FetchError("robots", "Disallowed by robots.txt");
    await politeDelay(u.hostname);
    let res: Response;
    try {
      res = await fetch(u, {
        redirect: "manual",
        signal: AbortSignal.timeout(config.requestTimeoutMs),
        headers: { "User-Agent": UA, Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.5" },
      });
    } catch (e) {
      throw new FetchError("network", (e as Error).message);
    }
    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.get("location");
      if (!loc) throw new FetchError("redirect", "Redirect without location");
      url = new URL(loc, u).toString();
      continue;
    }
    if (!res.ok) throw new FetchError("http", `HTTP ${res.status}`);
    const ct = (res.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
    const allowed = opts.allowXml ? [...HTML_TYPES, ...XML_TYPES] : HTML_TYPES;
    if (!allowed.includes(ct)) throw new FetchError("content_type", `Unsupported content type ${ct || "unknown"}`);
    const reader = res.body?.getReader();
    if (!reader) throw new FetchError("empty", "No body");
    const chunks: Uint8Array[] = [];
    let total = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > MAX_BYTES) {
        await reader.cancel();
        throw new FetchError("too_large", "Response exceeds 1.5 MB");
      }
      chunks.push(value);
    }
    return { body: Buffer.concat(chunks).toString("utf8"), finalUrl: u.toString(), contentType: ct };
  }
  throw new FetchError("redirect", "Too many redirects");
}

const MONTHS = "(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)";
const TEXT_DATE_RES = [
  new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+(${MONTHS})\\.?,?\\s+(20\\d{2})\\b`, "i"),
  new RegExp(`\\b(${MONTHS})\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?,?\\s+(20\\d{2})\\b`, "i"),
];

/** "5 October 2026" / "October 5, 2026" -> UTC midnight ISO (avoids local-timezone day shifts). */
function textDateUtc(m: RegExpMatchArray): string | null {
  const monthIdx = (s: string) => ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"].indexOf(s.slice(0, 3).toLowerCase());
  const dayFirst = /^\d/.test(m[1]);
  const day = Number(dayFirst ? m[1] : m[2]);
  const mon = monthIdx(dayFirst ? m[2] : m[1]);
  const year = Number(m[3]);
  if (mon < 0 || day < 1 || day > 31) return null;
  return new Date(Date.UTC(year, mon, day)).toISOString();
}

function parseLooseDate(s: string | undefined | null): string | null {
  if (!s) return null;
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d.toISOString();
}

function collectJsonLd($: cheerio.CheerioAPI): { published: string | null; modified: string | null; event: string | null } {
  let published: string | null = null, modified: string | null = null, event: string | null = null;
  const visit = (n: unknown) => {
    if (Array.isArray(n)) return n.forEach(visit);
    if (!n || typeof n !== "object") return;
    const o = n as Record<string, unknown>;
    published ??= parseLooseDate(o.datePublished as string);
    modified ??= parseLooseDate(o.dateModified as string);
    event ??= parseLooseDate(o.startDate as string);
    Object.values(o).forEach((v) => typeof v === "object" && visit(v));
  };
  $('script[type="application/ld+json"]').each((_, el) => {
    try {
      visit(JSON.parse($(el).contents().text()));
    } catch {
      /* ignore malformed JSON-LD */
    }
  });
  return { published, modified, event };
}

/** Pure HTML -> text + dates. Date order: JSON-LD / meta, then visible byline / text. */
export function extractFromHtml(html: string, url: string): FetchedPage {
  const $ = cheerio.load(html);
  const ld = collectJsonLd($);
  const metaPub =
    parseLooseDate($('meta[property="article:published_time"]').attr("content")) ??
    parseLooseDate($('meta[name="date"], meta[name="pubdate"], meta[itemprop="datePublished"]').first().attr("content"));
  const metaMod = parseLooseDate($('meta[property="article:modified_time"]').attr("content"));
  const canonical = $('link[rel="canonical"]').attr("href");

  $("script, style, noscript, nav, footer, header, aside, form, iframe, svg").remove();
  const root = $("article").first().length ? $("article").first() : $("main").first().length ? $("main").first() : $("body");
  const text = root.text().replace(/\s+/g, " ").trim();

  let publishedAt = ld.published ?? metaPub;
  let dateBasis: FetchedPage["dateBasis"] = publishedAt ? "page_meta" : null;
  if (!publishedAt) {
    const timeAttr = parseLooseDate($("time[datetime]").first().attr("datetime"));
    if (timeAttr) {
      publishedAt = timeAttr;
      dateBasis = "page_text";
    } else {
      for (const re of TEXT_DATE_RES) {
        const m = text.slice(0, 1500).match(re);
        const d = m && textDateUtc(m);
        if (d) {
          publishedAt = d;
          dateBasis = "page_text";
          break;
        }
      }
    }
  }

  let canonicalUrl: string | null = null;
  if (canonical) {
    try {
      canonicalUrl = canonicalizeUrl(new URL(canonical, url).toString());
    } catch {
      /* ignore */
    }
  }
  return { text, publishedAt, modifiedAt: ld.modified ?? metaMod, eventAt: ld.event, canonicalUrl, dateBasis };
}

// The same article is often relevant to several investors (a funding round names three funds). Within one scan the page
// is fetched once and shared, which also keeps us well inside the one-request-per-second-per-site courtesy limit.
const PAGE_TTL_MS = 15 * 60_000;
const pageCache = new Map<string, { at: number; page: Promise<FetchedPage> }>();

export function fetchPage(url: string): Promise<FetchedPage> {
  const key = canonicalizeUrl(url);
  const hit = pageCache.get(key);
  if (hit && Date.now() - hit.at < PAGE_TTL_MS) return hit.page;
  if (pageCache.size > 500) for (const [k, v] of pageCache) if (Date.now() - v.at >= PAGE_TTL_MS) pageCache.delete(k);
  const page = safeFetchText(url).then(({ body, finalUrl }) => extractFromHtml(body, finalUrl));
  pageCache.set(key, { at: Date.now(), page });
  page.catch(() => pageCache.delete(key)); // never cache a failure
  return page;
}
