import { NextResponse } from "next/server";
import { verifyState } from "@/lib/crypto";
import { completeConnection } from "@/lib/google/oauth";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const back = (q: string) => NextResponse.redirect(new URL(`/integrations?${q}`, process.env.APP_URL ?? url.origin));
  if (url.searchParams.get("error")) return back(`error=${encodeURIComponent(url.searchParams.get("error")!)}`);

  const payload = verifyState(url.searchParams.get("state") ?? "");
  const [provider, nonce] = (payload ?? "").split(":");
  const cookieNonce = (req.headers.get("cookie") ?? "").split(/;\s*/).find((c) => c.startsWith("vcpi_oauth="))?.split("=")[1];
  if (!payload || (provider !== "gmail" && provider !== "calendar") || !nonce || nonce !== cookieNonce) return back("error=invalid_state");
  const code = url.searchParams.get("code");
  if (!code) return back("error=missing_code");
  try {
    await completeConnection(provider, code);
  } catch (e) {
    return back(`error=${encodeURIComponent((e as Error).message.slice(0, 200))}`);
  }
  const res = back(`connected=${provider}`);
  res.cookies.delete("vcpi_oauth");
  return res;
}
