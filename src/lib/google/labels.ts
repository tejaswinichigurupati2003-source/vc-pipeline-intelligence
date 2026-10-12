/**
 * Which Gmail labels can be chosen for syncing. Gmail's built-in labels are offered alongside the user's own, so the
 * feature works on a mailbox with no custom labels. Built-in labels are broad (they contain unrelated mail), so for
 * those only threads that match a tracked investor are kept; a label the user created for investors keeps unmatched
 * threads too, so they can be assigned by hand.
 */

export interface RawLabel { id: string; name: string; type: string }
export interface LabelOption { id: string; name: string; kind: "built_in" | "own" }

const BUILT_IN: [string, string][] = [
  ["INBOX", "Inbox"],
  ["SENT", "Sent"],
  ["STARRED", "Starred"],
  ["IMPORTANT", "Important"],
];
export const BUILT_IN_IDS = new Set(BUILT_IN.map(([id]) => id));

export function shapeLabels(labels: RawLabel[]): LabelOption[] {
  const byId = new Map(labels.map((l) => [l.id, l]));
  const builtIn: LabelOption[] = BUILT_IN.filter(([id]) => byId.has(id)).map(([id, name]) => ({ id, name: `${name} (investor emails only)`, kind: "built_in" }));
  const own: LabelOption[] = labels
    .filter((l) => l.type === "user")
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((l) => ({ id: l.id, name: l.name, kind: "own" }));
  return [...own, ...builtIn];
}

/** Keep a thread that did not match an investor only when it carries one of the user's OWN selected labels. */
export function keepUnmatchedThread(threadLabelIds: string[][], selectedLabelIds: string[]): boolean {
  const own = new Set(selectedLabelIds.filter((id) => !BUILT_IN_IDS.has(id)));
  return threadLabelIds.some((labels) => labels.some((l) => own.has(l)));
}
