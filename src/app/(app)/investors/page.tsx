import Board from "@/components/Board";
import PageHeader from "@/components/shell/PageHeader";
import { toBoardRows } from "@/lib/view/board";
import { getStates, pipeline } from "@/lib/workspace/data";

export const dynamic = "force-dynamic";

export default async function InvestorsPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q } = await searchParams;
  const [rows, states] = await Promise.all([pipeline(), getStates()]);
  return (
    <>
      <PageHeader
        title="Investors"
        subtitle="All your investors by stage. Drag a card to move it."
      />
      <Board rows={toBoardRows(rows, states)} editable detailBase="/workspace/vc" initialQuery={q ?? ""} />
    </>
  );
}
