import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/auth";
import { signState } from "@/lib/crypto";
import { buildAuthUrl, googleConfigured } from "@/lib/google/oauth";

export const dynamic = "force-dynamic";

/** Begins OAuth for one provider at a time (separate consent per feature = least privilege). */
export async function GET(req: Request) {
  if (!isAdmin(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const provider = new URL(req.url).searchParams.get("provider");
  if (provider !== "gmail" && provider !== "calendar") return NextResponse.json({ error: "provider must be gmail or calendar" }, { status: 400 });
  if (!googleConfigured()) return NextResponse.json({ error: "GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET are not set" }, { status: 400 });
  const nonce = randomBytes(16).toString("hex");
  const res = NextResponse.redirect(buildAuthUrl(provider, signState(`${provider}:${nonce}`)));
  // Lax (not Strict) so the cookie is sent when Google redirects back; binds the callback to THIS browser.
  res.cookies.set("vcpi_oauth", nonce, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/api/integrations/google", maxAge: 600 });
  return res;
}
