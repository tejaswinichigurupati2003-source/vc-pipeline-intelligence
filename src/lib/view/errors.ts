/**
 * Turns raw integration errors (often a JSON blob from a provider's API) into one plain sentence, plus an optional fix link.
 * Pure and shared by server pages and client components. The raw text is never shown to the user.
 */

export interface FriendlyError {
  text: string;
  /** Where to go to fix it, when we can tell. */
  fixUrl?: string;
  fixLabel?: string;
}

const API_HOST: Record<string, { service: string; name: string }> = {
  gmail: { service: "gmail.googleapis.com", name: "Gmail" },
  calendar: { service: "calendar-json.googleapis.com", name: "Google Calendar" },
};

export function friendlyIntegrationError(raw: string | null | undefined, provider?: string): FriendlyError | null {
  if (!raw) return null;
  const m = raw.toLowerCase();

  // Guidance, not a failure: the user just hasn't chosen anything to sync yet.
  if (m.startsWith("choose at least one")) return null;

  // The Google API is switched off for the Google Cloud project behind the connection.
  if (/has not been used|is disabled|accessnotconfigured|api has not been/.test(m)) {
    const api = (provider && API_HOST[provider]) || API_HOST.gmail;
    const project = raw.match(/project[ =](\d{6,})/)?.[1];
    return {
      text: `${api.name} access isn't switched on for your Google project yet.`,
      fixUrl: project ? `https://console.developers.google.com/apis/api/${api.service}/overview?project=${project}` : undefined,
      fixLabel: `Turn on ${api.name} API`,
    };
  }
  if (/invalid_grant|401|unauthorized|token.*(expired|revoked)|insufficient (authentication|permission)|403/.test(m)) {
    return { text: "The connection to your account has expired or lost access. Disconnect and connect it again." };
  }
  if (/429|quota|rate limit|too many/.test(m)) return { text: "Too many requests right now. Please try again in a minute." };
  if (/not connected/.test(m)) return { text: "This account isn't connected yet." };
  if (/timeout|timed out|network|fetch failed|econn/.test(m)) return { text: "We couldn't reach the service. Please try again." };
  return { text: "Something went wrong. Please try again." };
}
