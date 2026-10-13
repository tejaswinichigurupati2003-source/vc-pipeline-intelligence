/**
 * Turns a pasted demo link into something safe to show. Only YouTube, Vimeo, Loom and direct video files are embedded;
 * anything else is shown as a plain link. The returned URL is always built here, never taken from the pasted text.
 */
export type DemoEmbed = { kind: "iframe"; src: string } | { kind: "video"; src: string } | { kind: "link"; src: string } | null;

export function toEmbed(raw: string | null | undefined): DemoEmbed {
  const v = (raw ?? "").trim();
  if (!v) return null;
  let u: URL;
  try { u = new URL(v); } catch { return null; }
  if (u.protocol !== "https:") return null;
  const host = u.hostname.replace(/^www\./, "");
  if (host === "youtu.be") { const id = u.pathname.slice(1).split("/")[0]; return /^[\w-]{11}$/.test(id) ? { kind: "iframe", src: `https://www.youtube-nocookie.com/embed/${id}` } : { kind: "link", src: u.toString() }; }
  if (host === "youtube.com" || host === "m.youtube.com") {
    const id = u.searchParams.get("v") ?? (/^\/(embed|shorts)\/([\w-]{11})/.exec(u.pathname)?.[2] ?? "");
    return /^[\w-]{11}$/.test(id) ? { kind: "iframe", src: `https://www.youtube-nocookie.com/embed/${id}` } : { kind: "link", src: u.toString() };
  }
  if (host === "loom.com") { const id = /^\/(?:share|embed)\/([a-f0-9]{32})/.exec(u.pathname)?.[1]; return id ? { kind: "iframe", src: `https://www.loom.com/embed/${id}` } : { kind: "link", src: u.toString() }; }
  if (host === "vimeo.com") { const id = /^\/(\d{6,12})/.exec(u.pathname)?.[1]; return id ? { kind: "iframe", src: `https://player.vimeo.com/video/${id}` } : { kind: "link", src: u.toString() }; }
  if (/\.(mp4|webm|mov)$/i.test(u.pathname)) return { kind: "video", src: u.toString() };
  return { kind: "link", src: u.toString() };
}
