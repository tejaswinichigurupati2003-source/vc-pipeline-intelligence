/** Shown instantly while a page's data loads, so navigation never feels stuck. */
export default function Loading() {
  return (
    <div aria-busy="true" aria-label="Loading" className="animate-pulse">
      <div className="mb-2 h-3 w-24 bg-slate-200" />
      <div className="h-8 w-64 bg-slate-200" />
      <div className="rule-cherry mb-7 mt-4" />
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="card space-y-3 p-4">
            <div className="h-9 w-9 bg-slate-100" />
            <div className="h-4 w-2/3 bg-slate-200" />
            <div className="h-3 w-full bg-slate-100" />
            <div className="h-3 w-5/6 bg-slate-100" />
          </div>
        ))}
      </div>
    </div>
  );
}
