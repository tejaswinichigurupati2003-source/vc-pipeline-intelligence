import { NextResponse } from "next/server";
import type { z } from "zod";
import { isAdmin } from "@/lib/auth";

export const dynamicRoute = "force-dynamic" as const;

/** Admin-gated JSON route wrapper: 401 without admin, 400 on bad input, 500 with a message on failure. */
export function adminRoute<S extends z.ZodTypeAny>(
  schema: S | null,
  handler: (input: z.infer<S>, req: Request) => Promise<unknown>,
) {
  return async (req: Request) => {
    if (!isAdmin(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    let input: unknown = {};
    if (schema) {
      const parsed = schema.safeParse(await req.json().catch(() => ({})));
      if (!parsed.success) return NextResponse.json({ error: "invalid input", details: parsed.error.issues.slice(0, 3) }, { status: 400 });
      input = parsed.data;
    }
    try {
      const out = await handler(input as z.infer<S>, req);
      return out instanceof Response ? out : NextResponse.json(out ?? { ok: true });
    } catch (e) {
      return NextResponse.json({ error: (e as Error).message }, { status: 500 });
    }
  };
}
