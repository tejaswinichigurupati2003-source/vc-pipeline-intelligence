import DemoTour from "@/components/DemoTour";
import PageHeader from "@/components/shell/PageHeader";
import SettingsForm from "@/components/SettingsForm";
import { db } from "@/lib/db/client";
import { toEmbed } from "@/lib/demo/embed";
import { getSettings, pipeline } from "@/lib/workspace/data";

export const dynamic = "force-dynamic";

export default async function Demo() {
  const [s, rows, { count }] = await Promise.all([
    getSettings(),
    pipeline(),
    db().from("investor_suggestions").select("id", { count: "exact", head: true }).eq("status", "new"),
  ]);
  const embed = toEmbed(s.demo_video_url);
  const band = (f: (n: number) => boolean) => rows.filter((r) => r.bucket !== "stale" && f(r.follow_up_score ?? 0)).length;
  const stats = {
    investors: rows.length,
    hot: band((n) => n >= 30), warm: band((n) => n >= 1 && n < 30), quiet: band((n) => n < 1),
    sources: rows.reduce((t, r) => t + (r.evidence?.sources30d ?? 0), 0), suggestions: count ?? 0,
  };

  return (
    <main className="max-w-5xl">
      <PageHeader eyebrow="Demo" title="How Raise works" subtitle="Watch the one-minute walkthrough, or step through the tour below. The tour numbers are live from your own pipeline." />

      <section className="mb-8">
        <div className="card overflow-hidden">
          {embed?.kind === "iframe" && (
            <div className="aspect-video bg-slate-900"><iframe src={embed.src} title="Raise demo video" className="h-full w-full" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen" allowFullScreen referrerPolicy="strict-origin-when-cross-origin" /></div>
          )}
          {embed?.kind === "video" && <video src={embed.src} controls preload="metadata" className="aspect-video w-full bg-slate-900" />}
          {embed?.kind === "link" && <div className="p-6 text-sm">This link can&apos;t be shown here. <a href={embed.src} target="_blank" rel="noopener noreferrer" className="font-semibold">Open the demo video</a>.</div>}
          {!embed && (
            <video controls preload="metadata" poster="/demo/poster.png" className="aspect-[1280/800] w-full bg-slate-900" aria-label="Raise walkthrough video">
              <source src="/demo/raise-demo.mp4" type="video/mp4" />
              Your browser can&apos;t play this video.
            </video>
          )}
        </div>
        <details className="mt-3 text-sm">
          <summary className="cursor-pointer font-semibold text-slate-600">{embed ? "Change the video link" : "Use a different video"}</summary>
          <div className="mt-3 max-w-xl"><SettingsForm submit="Save link" fields={[{ key: "demo_video_url", label: "Video link", value: s.demo_video_url ?? "", hint: "Optional. A YouTube, Loom or Vimeo link replaces the built-in walkthrough." }]} /></div>
        </details>
      </section>

      <h2 className="mb-3">Guided tour</h2>
      <DemoTour stats={stats} />
    </main>
  );
}
