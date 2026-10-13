"use client";

import { useEffect, useRef, useState } from "react";

/** A number that counts up from zero when it appears. Shows the final value straight away for reduced-motion users. */
export default function CountUp({ value, ms = 700, className }: { value: number; ms?: number; className?: string }) {
  const [n, setN] = useState(value);
  const from = useRef(0);
  useEffect(() => {
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches || value === 0) { setN(value); return; }
    let raf = 0;
    const start = performance.now(), a = from.current;
    const tick = (t: number) => {
      const p = Math.min(1, (t - start) / ms);
      setN(Math.round(a + (value - a) * (1 - Math.pow(1 - p, 3))));
      if (p < 1) raf = requestAnimationFrame(tick); else from.current = value;
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, ms]);
  return <span className={className}>{n}</span>;
}
