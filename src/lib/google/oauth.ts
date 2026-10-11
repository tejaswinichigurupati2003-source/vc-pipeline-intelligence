import { db } from "@/lib/db/client";
import { decrypt, encrypt } from "@/lib/crypto";
import { requireEnv } from "@/lib/config";

export type GoogleProvider = "gmail" | "calendar";

/**
 * Least-privilege scopes.
 *  gmail:    gmail.metadata (headers/labels/snippet, NO message bodies) + gmail.compose (create drafts; this app never sends).
 *  calendar: events read-only + calendar list read-only.
 * Both are sensitive/restricted scopes: while the Google OAuth app is in "Testing" mode only listed test users can connect.
 * Public distribution needs Google verification (gmail.metadata is a restricted scope).
 */
export const GOOGLE_SCOPES: Record<GoogleProvider, string[]> = {
  gmail: ["openid", "email", "https://www.googleapis.com/auth/gmail.metadata", "https://www.googleapis.com/auth/gmail.compose"],
  calendar: ["openid", "email", "https://www.googleapis.com/auth/calendar.events.readonly", "https://www.googleapis.com/auth/calendar.calendarlist.readonly"],
};

export const redirectUri = () => `${process.env.APP_URL ?? "http://localhost:3000"}/api/integrations/google/callback`;

export function googleConfigured(): boolean {
  return !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
}

export function buildAuthUrl(provider: GoogleProvider, state: string): string {
  const p = new URLSearchParams({
    client_id: requireEnv("GOOGLE_CLIENT_ID"),
    redirect_uri: redirectUri(),
    response_type: "code",
    scope: GOOGLE_SCOPES[provider].join(" "),
    access_type: "offline",
    prompt: "consent", // ensures a refresh token is issued
    state,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${p}`;
}

interface TokenResponse { access_token: string; refresh_token?: string; expires_in: number; scope?: string; id_token?: string }

async function tokenRequest(body: Record<string, string>): Promise<TokenResponse> {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: requireEnv("GOOGLE_CLIENT_ID"), client_secret: requireEnv("GOOGLE_CLIENT_SECRET"), ...body }),
    signal: AbortSignal.timeout(10_000),
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Google token error: ${j.error_description ?? j.error ?? res.status}`);
  return j as TokenResponse;
}

export function emailFromIdToken(idToken: string | undefined): string | null {
  try {
    const payload = JSON.parse(Buffer.from(idToken!.split(".")[1], "base64url").toString());
    return typeof payload.email === "string" ? payload.email : null;
  } catch {
    return null;
  }
}

/** Complete the OAuth flow: store ONLY the encrypted refresh token and the granted scopes. */
export async function completeConnection(provider: GoogleProvider, code: string) {
  const t = await tokenRequest({ grant_type: "authorization_code", code, redirect_uri: redirectUri() });
  if (!t.refresh_token) throw new Error("Google did not return a refresh token. Remove the app at myaccount.google.com/permissions and reconnect.");
  const granted = (t.scope ?? "").split(" ").filter(Boolean);
  const required = GOOGLE_SCOPES[provider].filter((s) => s.startsWith("https://"));
  const missing = required.filter((s) => !granted.includes(s));
  if (missing.length) throw new Error(`Required permission not granted: ${missing.join(", ")}`);
  const row = {
    provider, account_label: emailFromIdToken(t.id_token), scopes: granted, status: "connected",
    token_enc: encrypt(JSON.stringify({ refresh_token: t.refresh_token })), last_error: null, connected_at: new Date().toISOString(),
  };
  const { error } = await db().from("integration_accounts").upsert(row, { onConflict: "provider" });
  if (error) throw new Error(error.message);
}

const cache = new Map<string, { token: string; exp: number }>();

export async function getAccessToken(provider: GoogleProvider): Promise<{ token: string; account: AccountRow }> {
  const account = await getAccount(provider);
  if (!account || account.status === "disconnected" || !account.token_enc) throw new Error(`${provider} is not connected`);
  const hit = cache.get(provider);
  if (hit && hit.exp > Date.now() + 30_000) return { token: hit.token, account };
  try {
    const { refresh_token } = JSON.parse(decrypt(account.token_enc));
    const t = await tokenRequest({ grant_type: "refresh_token", refresh_token });
    cache.set(provider, { token: t.access_token, exp: Date.now() + t.expires_in * 1000 });
    return { token: t.access_token, account };
  } catch (e) {
    await db().from("integration_accounts").update({ status: "error", last_error: (e as Error).message.slice(0, 300) }).eq("provider", provider);
    throw e;
  }
}

export interface AccountRow {
  id: string; provider: string; account_label: string | null; scopes: string[]; status: string; token_enc: string | null;
  config: Record<string, unknown>; sync_cursor: string | null; last_sync_at: string | null; last_error: string | null; connected_at: string;
}

export async function getAccount(provider: string): Promise<AccountRow | null> {
  const { data } = await db().from("integration_accounts").select("*").eq("provider", provider).maybeSingle();
  return (data as AccountRow) ?? null;
}

/** Revoke at Google (best effort) and delete the stored token. Imported data stays until the founder deletes it. */
export async function disconnect(provider: GoogleProvider | "hubspot") {
  const account = await getAccount(provider);
  if (account?.token_enc && provider !== "hubspot") {
    try {
      const { refresh_token } = JSON.parse(decrypt(account.token_enc));
      await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(refresh_token)}`, { method: "POST", signal: AbortSignal.timeout(8000) });
    } catch { /* revoke is best effort */ }
  }
  cache.delete(provider);
  await db().from("integration_accounts").delete().eq("provider", provider);
}
