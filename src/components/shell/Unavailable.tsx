/** Visitor-facing fallback. The technical reason is logged on the server, never shown on screen. */
export default function Unavailable({ onRetry }: { onRetry?: () => void }) {
  return (
    <main className="blueprint grid min-h-screen place-items-center p-6">
      <div className="card max-w-md p-8">
        <h1>We&apos;ll be right back</h1>
        <div className="rule-cherry my-4" />
        <p className="text-[0.95rem] leading-relaxed text-slate-600">Something went wrong while loading your investors. Please try again in a moment.</p>
        {onRetry
          ? <button onClick={onRetry} className="btn-primary mt-5">Try again</button>
          : <a href="/" className="btn-primary mt-5 no-underline hover:no-underline">Try again</a>}
      </div>
    </main>
  );
}
