-- 005_user_rpcs.sql : narrow, explicit, USER-initiated writes to vc_pipeline (import merge rules).
-- These are NOT used by the signal scanner. They exist so import/merge/delete stay behind allow-listed functions.
-- The four signal columns (last_signal_date, signal_summary, follow_up_score, recommended_action) are NOT in any allow-list here.

-- Merge rule 1: fill BLANK fields only. Never overwrites a non-empty value.
create or replace function public.import_fill_blanks(p_vc_id uuid, p_patch jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.vc_pipeline set
    firm_domain       = case when coalesce(firm_domain,'') = '' and p_patch ? 'firm_domain' then nullif(p_patch->>'firm_domain','') else firm_domain end,
    investment_thesis = case when coalesce(investment_thesis,'') = '' and p_patch ? 'investment_thesis' then nullif(p_patch->>'investment_thesis','') else investment_thesis end,
    contact_history   = case when coalesce(contact_history,'') = '' and p_patch ? 'contact_history' then nullif(p_patch->>'contact_history','') else contact_history end,
    personal_notes    = case when coalesce(personal_notes,'') = '' and p_patch ? 'personal_notes' then nullif(p_patch->>'personal_notes','') else personal_notes end,
    last_contact_at   = case when last_contact_at is null and p_patch ? 'last_contact_at' then (p_patch->>'last_contact_at')::timestamptz else last_contact_at end,
    sector_keywords   = case when coalesce(cardinality(sector_keywords),0) = 0 and p_patch ? 'sector_keywords'
                             then array(select jsonb_array_elements_text(p_patch->'sector_keywords')) else sector_keywords end
  where id = p_vc_id;
  if not found then raise exception 'VC % not found', p_vc_id; end if;
end;
$$;

-- Merge rule 2: apply ONE value the founder explicitly chose while resolving a conflict.
create or replace function public.import_apply_resolution(p_vc_id uuid, p_field text, p_value text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_field = 'firm_domain' then
    update public.vc_pipeline set firm_domain = nullif(p_value,'') where id = p_vc_id;
  elsif p_field = 'investment_thesis' then
    update public.vc_pipeline set investment_thesis = nullif(p_value,'') where id = p_vc_id;
  elsif p_field = 'contact_history' then
    update public.vc_pipeline set contact_history = nullif(p_value,'') where id = p_vc_id;
  elsif p_field = 'personal_notes' then
    update public.vc_pipeline set personal_notes = nullif(p_value,'') where id = p_vc_id;
  elsif p_field = 'last_contact_at' then
    update public.vc_pipeline set last_contact_at = nullif(p_value,'')::timestamptz where id = p_vc_id;
  elsif p_field = 'contact_status' then
    if p_value not in ('yet_to_reach_out','waiting_for_response','in_conversation','closed') then
      raise exception 'invalid contact_status %', p_value;
    end if;
    update public.vc_pipeline set contact_status = p_value where id = p_vc_id;
  elsif p_field = 'sector_keywords' then
    update public.vc_pipeline set sector_keywords = string_to_array(p_value, '|') where id = p_vc_id;
  else
    raise exception 'field % is not importable', p_field;
  end if;
  if not found then raise exception 'VC % not found', p_vc_id; end if;
end;
$$;

-- Founder-initiated removal of a VC row (used to undo an import batch). Cascades to its evidence.
create or replace function public.user_delete_vc(p_vc_id uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  delete from public.vc_pipeline where id = p_vc_id;
$$;

revoke all on function public.import_fill_blanks(uuid, jsonb) from public, anon, authenticated;
revoke all on function public.import_apply_resolution(uuid, text, text) from public, anon, authenticated;
revoke all on function public.user_delete_vc(uuid) from public, anon, authenticated;
grant execute on function public.import_fill_blanks(uuid, jsonb) to service_role;
grant execute on function public.import_apply_resolution(uuid, text, text) to service_role;
grant execute on function public.user_delete_vc(uuid) to service_role;
