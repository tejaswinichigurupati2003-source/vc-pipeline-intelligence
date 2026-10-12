"use client";

import { useEffect } from "react";
import Unavailable from "@/components/shell/Unavailable";

export default function AppError({ error, reset }: { error: Error; reset: () => void }) {
  useEffect(() => { console.error(`[raise] ${error.message}`); }, [error]);
  return <Unavailable onRetry={reset} />;
}
