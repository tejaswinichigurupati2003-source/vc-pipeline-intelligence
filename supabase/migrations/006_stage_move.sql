-- 006_stage_move.sql : founder moves an investor between pipeline stages (drag and drop on the board).
-- User-initiated, allow-listed: changes contact_status only. Moving into "awaiting reply" for the first time also stamps
-- last_contact_at (so follow-up reminders work) but never overwrites an existing contact date.
-- The four signal-derived columns are not touched.

create or replace function public.user_set_contact_status(p_vc_id uuid, p_status text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_status not in ('yet_to_reach_out','waiting_for_response','in_conversation','closed') then
    raise exception 'invalid contact_status %', p_status;
  end if;
  update public.vc_pipeline
     set contact_status  = p_status,
         last_contact_at = case when p_status = 'waiting_for_response' and last_contact_at is null then now() else last_contact_at end
   where id = p_vc_id;
  if not found then raise exception 'VC % not found', p_vc_id; end if;
end;
$$;

revoke all on function public.user_set_contact_status(uuid, text) from public, anon, authenticated;
grant execute on function public.user_set_contact_status(uuid, text) to service_role;
