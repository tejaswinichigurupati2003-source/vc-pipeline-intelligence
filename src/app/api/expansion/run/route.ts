import { adminRoute } from "@/lib/api";
import { runExpansion } from "@/lib/expansion/run";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export const POST = adminRoute(null, async () => runExpansion("manual"));
