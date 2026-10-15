import { describe, expect, it } from "vitest";
import { assertSafeUrl, extractFromHtml, isPrivateIp } from "@/lib/discovery/fetch-page";

describe("SSRF guard", () => {
  it.each(["127.0.0.1", "10.1.2.3", "172.16.0.1", "192.168.1.1", "169.254.169.254", "100.64.0.1", "0.0.0.0", "::1", "fd00::1", "fe80::1", "::ffff:127.0.0.1", "192.0.0.1", "192.0.2.10", "198.51.100.7", "203.0.113.9"])(
    "treats %s as private", (ip) => expect(isPrivateIp(ip)).toBe(true));
  it.each(["8.8.8.8", "1.1.1.1", "2606:4700:4700::1111", "192.0.66.103", "192.0.66.138", "192.0.64.1", "192.0.127.254"])("allows public %s", (ip) => expect(isPrivateIp(ip)).toBe(false));

  it.each([
    "file:///etc/passwd", "ftp://example.com", "http://localhost/x", "http://127.0.0.1:3000", "http://169.254.169.254/latest/meta-data",
    "http://[::1]/", "http://metadata.google.internal/", "http://user:pw@example.com", "not a url",
  ])("rejects %s", async (u) => { await expect(assertSafeUrl(u)).rejects.toThrow(); });
});

describe("extractFromHtml date order", () => {
  it("prefers JSON-LD datePublished and event startDate", () => {
    const html = `<html><head>
      <script type="application/ld+json">{"@type":"Event","datePublished":"2026-10-08T05:00:00Z","startDate":"2026-10-20"}</script>
      <meta property="article:published_time" content="2026-09-01T00:00:00Z"></head><body><article>Hello world</article></body></html>`;
    const p = extractFromHtml(html, "https://a.example/x");
    expect(p.publishedAt).toBe("2026-10-08T05:00:00.000Z");
    expect(p.eventAt).toBe("2026-10-20T00:00:00.000Z");
    expect(p.dateBasis).toBe("page_meta");
  });
  it("falls back to meta tag, then <time>, then visible text date", () => {
    expect(extractFromHtml(`<meta property="article:published_time" content="2026-10-02T00:00:00Z"><body>x</body>`, "https://a.example").publishedAt)
      .toBe("2026-10-02T00:00:00.000Z");
    expect(extractFromHtml(`<body><time datetime="2026-10-03">3 Oct</time> body</body>`, "https://a.example").publishedAt).toBe("2026-10-03T00:00:00.000Z");
    const p = extractFromHtml(`<body><p>Published 5 October 2026 by staff</p><p>${"text ".repeat(20)}</p></body>`, "https://a.example");
    expect(p.publishedAt?.startsWith("2026-10-05")).toBe(true);
    expect(p.dateBasis).toBe("page_text");
  });
  it("returns no date when none exists, and strips scripts/nav", () => {
    const p = extractFromHtml(`<body><nav>MENU</nav><script>var a=1</script><main>Real content here</main></body>`, "https://a.example");
    expect(p.publishedAt).toBeNull();
    expect(p.text).toBe("Real content here");
  });
  it("honours rel=canonical", () => {
    const p = extractFromHtml(`<head><link rel="canonical" href="/canon?utm_source=x"></head><body>x</body>`, "https://a.example/page");
    expect(p.canonicalUrl).toBe("https://a.example/canon");
  });
});
