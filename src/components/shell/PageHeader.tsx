export default function PageHeader({ title, subtitle, actions, eyebrow }: { title: string; subtitle?: React.ReactNode; actions?: React.ReactNode; eyebrow?: string }) {
  return (
    <header className="mb-7">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="max-w-3xl">
          {eyebrow && <div className="eyebrow mb-2 flex items-center gap-2"><span className="inline-block h-2 w-2 grad-cherry" />{eyebrow}</div>}
          <h1>{title}</h1>
          {subtitle && <p className="mt-2 text-[0.95rem] leading-relaxed text-slate-500">{subtitle}</p>}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
      <div className="rule-cherry mt-4" />
    </header>
  );
}
