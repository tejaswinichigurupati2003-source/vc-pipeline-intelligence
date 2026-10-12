import Link from "next/link";
import DraftList from "@/components/DraftList";
import PageHeader from "@/components/shell/PageHeader";
import { buildAllDrafts } from "@/lib/workspace/drafts";

export const dynamic = "force-dynamic";

export default async function Drafts() {
  const all = await buildAllDrafts();
  const withSignal = all.filter((d) => d.basedOn).length;
  const needsProfile = all.some((d) => d.draft.warnings.some((w) => /one-liner/.test(w)));
  const noFacts = all.some((d) => d.draft.warnings.some((w) => /approved company facts/.test(w)));

  return (
    <>
      <PageHeader
        title="Drafts"
        subtitle={<>A suggested first message for every open investor, written from their strongest recent signal. <b className="text-slate-800">{withSignal}</b> of {all.length} are based on a signal.</>}
      />
      {(needsProfile || noFacts) && (
        <p className="mb-5 border border-amber-300 bg-amber-50 px-4 py-3 text-[0.9rem] text-amber-900">
          {needsProfile ? "Your name, company and one-liner are missing, so drafts show [placeholders]. " : ""}
          {noFacts ? "Add approved company facts to give drafts real proof points. " : ""}
          <Link href="/data-room" className="font-semibold">Open the Data room</Link>
        </p>
      )}
      <DraftList rows={all.map((d) => ({
        vcId: d.vcId, firm: d.firm, person: d.person, stage: d.stage, score: d.score, subject: d.draft.subject, body: d.draft.body,
        basedOn: d.basedOn ? { title: d.basedOn.title, url: d.basedOn.url, domain: d.basedOn.domain, date: d.basedOn.date } : null,
      }))} />
    </>
  );
}
