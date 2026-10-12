import type { HistoryPoint } from "@/lib/signals/history";
import type { WeekBucket } from "@/lib/signals/timeseries";

/** 26 weekly bars of verified activity, oldest to newest. Hover a bar for the week and what happened. */
export function ActivityBars({ weeks }: { weeks: WeekBucket[] }) {
  const max = Math.max(1, ...weeks.map((w) => w.points));
  const W = 260, H = 44, gap = 2, bw = (W - gap * (weeks.length - 1)) / weeks.length;
  return (
    <svg viewBox={`0 0 ${W} ${H + 12}`} className="h-14 w-full max-w-sm" role="img" aria-label="Verified activity by week over the last 6 months">
      <line x1="0" x2={W} y1={H + 0.5} y2={H + 0.5} stroke="currentColor" className="text-slate-300" />
      {weeks.map((w, i) => {
        const h = w.points > 0 ? Math.max(3, (w.points / max) * H) : 0;
        return (
          <g key={w.start}>
            <title>{`Week of ${w.start}: ${w.count} event${w.count === 1 ? "" : "s"}, ${w.points} points`}</title>
            {h > 0 ? <rect x={i * (bw + gap)} y={H - h} width={bw} height={h} className={i >= weeks.length - 4 ? "fill-indigo-700" : "fill-slate-400"} /> : <rect x={i * (bw + gap)} y={H - 1} width={bw} height={1} className="fill-slate-300" />}
          </g>
        );
      })}
      <text x="0" y={H + 10} className="fill-slate-400" fontSize="7">6 months ago</text>
      <text x={W} y={H + 10} textAnchor="end" className="fill-slate-400" fontSize="7">now (last 4 weeks highlighted)</text>
    </svg>
  );
}

/** The follow-up score after each scan. */
export function ScoreLine({ points }: { points: HistoryPoint[] }) {
  if (points.length < 2) return <p className="text-xs text-slate-400">The score history appears after a few scans.</p>;
  const W = 260, H = 44, max = Math.max(10, ...points.map((p) => p.score));
  const x = (i: number) => (i / (points.length - 1)) * W;
  const y = (v: number) => H - (v / max) * H;
  return (
    <svg viewBox={`0 0 ${W} ${H + 12}`} className="h-14 w-full max-w-sm" role="img" aria-label="Score after each scan">
      <line x1="0" x2={W} y1={H + 0.5} y2={H + 0.5} stroke="currentColor" className="text-slate-300" />
      <polyline fill="none" strokeWidth="1.5" className="stroke-indigo-700" points={points.map((p, i) => `${x(i)},${y(p.score)}`).join(" ")} />
      {points.map((p, i) => <circle key={p.scored_at} cx={x(i)} cy={y(p.score)} r="2" className="fill-indigo-700"><title>{`${p.scored_at.slice(0, 10)}: ${p.score}`}</title></circle>)}
      <text x="0" y={H + 10} className="fill-slate-400" fontSize="7">{points[0].scored_at.slice(0, 10)}</text>
      <text x={W} y={H + 10} textAnchor="end" className="fill-slate-400" fontSize="7">{points[points.length - 1].scored_at.slice(0, 10)}</text>
    </svg>
  );
}
