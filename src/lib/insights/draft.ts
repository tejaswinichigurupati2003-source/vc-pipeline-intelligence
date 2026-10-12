/**
 * Suggested outreach message. Built only from the investor's strongest verified signal and the founder's APPROVED
 * claims. It restates the sourced summary and never claims the investor is interested in this company or adds facts
 * that are not in the source. Missing profile details become [placeholders] so the draft always reads completely.
 */

export type DraftStyle = "standard" | "short";

export interface DraftSignal {
  title: string;
  evidence_summary: string;
  source_url: string;
  date: string | null;
  signal_type: string;
}

export interface DraftInput {
  founderName: string;
  companyName: string;
  oneLiner: string;
  vc: { investor_name: string; firm_name: string };
  signal: DraftSignal | null;
  materials: { title: string; claim_text: string | null; approved: boolean }[];
  relationship: string | null; // e.g. deck_requested
  style?: DraftStyle;
}

export interface Draft {
  subject: string;
  body: string;
  usedMaterials: string[];
  warnings: string[];
  hook: string | null;
}

// The opening line depends on what kind of signal it is.
const HOOK: Record<string, string> = {
  investor_thesis: "I read your recent take on this space:",
  portfolio_investment: "I saw the recent news:",
  investor_commentary: "I enjoyed your recent comments:",
  event_appearance: "I noticed your appearance:",
  fund_activity: "Congratulations on the recent news:",
  portfolio_activity: "I saw the latest from your portfolio:",
  other: "I came across this recently:",
};

const orPlaceholder = (value: string, placeholder: string) => (value.trim() ? value.trim() : placeholder);

export function composeDraft(i: DraftInput): Draft {
  const style = i.style ?? "standard";
  const warnings: string[] = [];
  const name = orPlaceholder(i.founderName, "[your name]");
  const company = orPlaceholder(i.companyName, "[your company]");
  const oneLiner = orPlaceholder(i.oneLiner, "[one line on what you build]");
  if (!i.founderName.trim() || !i.companyName.trim() || !i.oneLiner.trim()) {
    warnings.push("Add your name, company and one-liner in the Data room, and this draft will fill itself in.");
  }

  const first = i.vc.investor_name === i.vc.firm_name ? "there" : i.vc.investor_name.split(" ")[0];
  const claims = i.materials.filter((m) => m.approved && m.claim_text).slice(0, style === "short" ? 1 : 3);
  const lines: string[] = [`Hi ${first},`, ""];
  let hook: string | null = null;

  if (i.relationship === "deck_requested") {
    lines.push(`Thanks for asking. I'm happy to share the ${company} deck.`);
  } else if (i.relationship === "meeting_requested") {
    lines.push(`Thanks for the note. I'd be glad to find a time to talk about ${company}.`);
  } else {
    if (i.signal) {
      const summary = i.signal.evidence_summary.trim().replace(/\s+/g, " ");
      hook = `${HOOK[i.signal.signal_type] ?? HOOK.other} ${summary}`;
      lines.push(hook, i.signal.source_url, "");
    } else {
      warnings.push("No recent signal for this investor yet, so this draft has no personal opening. Add one yourself or wait for a signal.");
    }
    lines.push(`I'm ${name}, founder of ${company}. ${oneLiner}`);
  }

  if (claims.length) {
    lines.push("", style === "short" ? claims[0].claim_text! : "A few facts about us:");
    if (style !== "short") for (const c of claims) lines.push(`- ${c.claim_text}`);
  } else {
    warnings.push("No approved company facts yet: add and approve some in the Data room so drafts carry real proof points.");
  }

  const ask =
    i.relationship === "deck_requested" ? "Deck attached for your review. Would a short call next week work?"
    : style === "short" ? "Open to a quick call?"
    : "Would you be open to a 20-minute call in the next couple of weeks?";
  lines.push("", ask, "", "Best,", name);

  return {
    subject: i.relationship === "deck_requested" ? `${company}: deck` : `${company} × ${i.vc.firm_name}`,
    body: lines.join("\n"),
    usedMaterials: claims.map((c) => c.title),
    warnings,
    hook,
  };
}
