import { firmNameForms, normText } from "@/lib/discovery/normalize";

/**
 * Finds people who are named WITH their role at a specific firm, in the text of an article already accepted as evidence.
 * Deterministic and quote-backed: a person is only returned when the exact phrase tying them to the firm is in the text.
 */
export interface FoundPerson { name: string; role: string; quote: string }

const NAME = "[A-Z][a-z]+(?:[’'-][A-Z][a-z]+)?(?:\\s+[A-Z]\\.?)?(?:\\s+[A-Z][a-z]+(?:[’'-][A-Z][a-z]+)?){1,2}";
const ROLE = "(?:(?:Managing|General|Founding|Venture|Senior|Operating|Investment)\\s+)?(?:Partner|Director|Principal|Investor|Co-?founder|Founder|CEO|CIO|Vice President|VP)|Managing Director|Head of Investments";

const NOT_NAME = new Set(["the", "our", "said", "says", "new", "fund", "india", "indian", "venture", "ventures", "capital", "partners", "managing", "general", "series", "seed", "round", "firm", "head", "chief", "lead", "led", "sector", "also", "while", "and", "for", "its", "his", "her", "their", "mr", "ms", "dr"]);

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const clean = (s: string) => s.replace(/\s+/g, " ").trim();
export const roleLabel = (r: string) =>
  clean(r).replace(/\b(\w)(\w*)/g, (_, a: string, b: string) => a.toUpperCase() + b.toLowerCase()).replace(/^Ceo$/, "CEO").replace(/^Cio$/, "CIO").replace(/^Vp$/, "VP");

function plausible(name: string, firmWords: Set<string>): boolean {
  const words = normText(name).split(" ").filter(Boolean);
  if (words.length < 2) return false;
  return !words.some((w) => NOT_NAME.has(w) || firmWords.has(w));
}

export function extractPeople(text: string, firmName: string, aliases: string[] = []): FoundPerson[] {
  const forms = [...new Set([...firmNameForms(firmName), ...aliases.map(normText)])].filter(Boolean);
  const paren = /\(([^)]+)\)/.exec(firmName);
  const raw = [firmName, firmName.replace(/\([^)]*\)/, ""), ...(paren ? [paren[1]] : []), ...aliases].map(clean).filter((f) => f.length >= 3);
  if (!raw.length) return [];
  const firmAlt = [...new Set(raw)].map(esc).sort((a, b) => b.length - a.length).join("|");
  const firmWords = new Set(forms.flatMap((f) => f.split(" ")).filter((w) => w.length >= 3));
  const T = text.replace(/\s+/g, " ");
  const found = new Map<string, FoundPerson>();
  const add = (name: string, role: string, quote: string) => {
    const n = clean(name);
    if (!plausible(n, firmWords)) return;
    const key = normText(n);
    if (!found.has(key)) found.set(key, { name: n, role: roleLabel(role), quote: clean(quote) });
  };

  // "Neeraj Arora, Managing Partner at Lightspeed" / "Neeraj Arora, a partner with Lightspeed India"
  for (const m of T.matchAll(new RegExp(`(${NAME}),?\\s+(?:a |an |the |our )?(${ROLE})\\s+(?:at|of|with|in)\\s+(?:${firmAlt})`, "g"))) add(m[1], m[2], m[0]);
  // "Lightspeed India Partners Neeraj Arora" / "Lightspeed partner Neeraj Arora"
  for (const m of T.matchAll(new RegExp(`(?:${firmAlt})(?:’s|'s)?\\s+(?:\\w+\\s+)?(${ROLE})s?\\s+(${NAME})`, "g"))) add(m[2], m[1], m[0]);
  // "Partner Neeraj Arora of Lightspeed"
  for (const m of T.matchAll(new RegExp(`(${ROLE})\\s+(${NAME})\\s+(?:at|of|with)\\s+(?:${firmAlt})`, "g"))) add(m[2], m[1], m[0]);
  return [...found.values()];
}

/** Which known person (if any) is the signal about? Used to say "via Neeraj Arora" with a checkable reason. */
export function attributePerson(text: string, people: { name: string; role?: string | null }[]): { name: string; role: string | null } | null {
  const t = " " + normText(text) + " ";
  for (const p of people) {
    const n = normText(p.name);
    if (n.split(" ").length >= 2 && t.includes(" " + n + " ")) return { name: p.name, role: p.role ?? null };
  }
  return null;
}
