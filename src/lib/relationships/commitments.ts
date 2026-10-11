/** Extract dated commitments from a message snippet for founder review (spec 26.2). Deterministic, conservative. */

export interface ProposedCommitment { text: string; dueAt: string | null; who: "founder" | "investor" }

const WEEKDAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

const utc = (y: number, m: number, d: number) => new Date(Date.UTC(y, m, d));

/** Resolve a relative/absolute date phrase against a reference date (UTC). Returns null if none found. */
export function resolveDatePhrase(text: string, ref: Date): Date | null {
  const t = text.toLowerCase();
  const base = utc(ref.getUTCFullYear(), ref.getUTCMonth(), ref.getUTCDate());
  const addDays = (n: number) => new Date(base.getTime() + n * 86_400_000);

  const iso = t.match(/\b(20\d{2})-(\d{2})-(\d{2})\b/);
  if (iso) return utc(+iso[1], +iso[2] - 1, +iso[3]);

  const dm = t.match(new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+(${MONTHS.join("|")})[a-z]*\\b`)) ;
  const md = t.match(new RegExp(`\\b(${MONTHS.join("|")})[a-z]*\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?\\b`));
  const pick = dm ? { d: +dm[1], m: MONTHS.indexOf(dm[2]) } : md ? { d: +md[2], m: MONTHS.indexOf(md[1]) } : null;
  if (pick && pick.d >= 1 && pick.d <= 31 && pick.m >= 0) {
    let cand = utc(base.getUTCFullYear(), pick.m, pick.d);
    if (cand.getTime() < base.getTime() - 30 * 86_400_000) cand = utc(base.getUTCFullYear() + 1, pick.m, pick.d);
    return cand;
  }
  if (/\btomorrow\b/.test(t)) return addDays(1);
  if (/\b(today|tonight|eod)\b/.test(t)) return base;
  if (/\bnext week\b/.test(t)) return addDays(7);
  if (/\bend of (the )?week\b/.test(t)) return addDays((5 - base.getUTCDay() + 7) % 7 || 7);
  if (/\bend of (the )?month\b/.test(t)) return utc(base.getUTCFullYear(), base.getUTCMonth() + 1, 0);
  for (let i = 0; i < 7; i++) {
    if (new RegExp(`\\b(by|on|this|next)?\\s*${WEEKDAYS[i]}\\b`).test(t)) {
      const delta = (i - base.getUTCDay() + 7) % 7 || 7; // always the NEXT occurrence
      return addDays(/\bnext\s+/.test(t.slice(Math.max(0, t.indexOf(WEEKDAYS[i]) - 6))) ? delta + 7 : delta);
    }
  }
  return null;
}

const PROMISE = /\b(i'?ll|i will|we'?ll|we will|let me|i can|we can|will (send|share|follow up|revert|get back|come back|intro|introduce|loop in|schedule|set up|circle back))\b/i;

/** Sentences with a promise AND a resolvable date become proposed commitments. The founder confirms or dismisses them. */
export function extractCommitments(snippet: string, fromFounder: boolean, ref: Date): ProposedCommitment[] {
  const out: ProposedCommitment[] = [];
  for (const sentence of snippet.split(/(?<=[.!?])\s+|\n+/)) {
    const s = sentence.trim();
    if (s.length < 12 || !PROMISE.test(s)) continue;
    const due = resolveDatePhrase(s, ref);
    if (!due) continue;
    out.push({ text: s.slice(0, 240), dueAt: due.toISOString(), who: fromFounder ? "founder" : "investor" });
  }
  return out;
}
