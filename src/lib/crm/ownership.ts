/**
 * Field ownership matrix (spec 26.4). One owner per field: the source of truth. Sync never crosses it silently.
 *  - 'crm'     : the CRM owns it. Pulled values fill blanks or become conflicts; this product never pushes it.
 *  - 'product' : this product owns it. Never overwritten from the CRM. Derived fields may be PUSHED if the founder approves them.
 */
export type Owner = "crm" | "product";

export const FIELD_OWNERSHIP: Record<string, { owner: Owner; note: string }> = {
  firm_name: { owner: "crm", note: "Company name" },
  firm_domain: { owner: "crm", note: "Company website domain" },
  email: { owner: "crm", note: "Contact details" },
  investment_thesis: { owner: "product", note: "Founder's own thesis notes" },
  sector_keywords: { owner: "product", note: "Founder's search keywords" },
  contact_status: { owner: "product", note: "Manually maintained relationship status" },
  last_contact_at: { owner: "product", note: "Manually maintained" },
  contact_history: { owner: "product", note: "Manually maintained" },
  personal_notes: { owner: "product", note: "Manually maintained, private" },
  follow_up_score: { owner: "product", note: "Derived from verified signals; pushable" },
  recommended_action: { owner: "product", note: "Derived; pushable" },
  last_signal_date: { owner: "product", note: "Derived; pushable" },
  signal_summary: { owner: "product", note: "Derived; pushable" },
};

/** Derived fields the founder may approve for pushing, and the HubSpot custom property each maps to. */
export const PUSHABLE: Record<string, { property: string; label: string; type: "number" | "string" | "date"; fieldType: string }> = {
  follow_up_score: { property: "vcpi_signal_score", label: "VC signal score", type: "number", fieldType: "number" },
  recommended_action: { property: "vcpi_next_action", label: "VC next action", type: "string", fieldType: "text" },
  last_signal_date: { property: "vcpi_last_signal_date", label: "VC last signal date", type: "date", fieldType: "date" },
  signal_summary: { property: "vcpi_signal_summary", label: "VC signal summary", type: "string", fieldType: "textarea" },
};

/** Fields pulled from the CRM into the import pipeline (crm-owned only). */
export const PULLED_FIELDS = Object.entries(FIELD_OWNERSHIP).filter(([, v]) => v.owner === "crm").map(([k]) => k);

/** Guard: only our own namespaced properties may ever be written to the CRM. */
export function assertPushable(properties: Record<string, unknown>) {
  const allowed = new Set(Object.values(PUSHABLE).map((p) => p.property));
  for (const k of Object.keys(properties)) if (!allowed.has(k)) throw new Error(`Refusing to write CRM property "${k}" (not an approved derived field)`);
}
