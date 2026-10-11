-- 002_safe_update.sql : the ONLY path by which the system writes to vc_pipeline.
-- Updates exactly four signal-derived columns. Manual columns are untouchable from here.

create or replace function public.apply_vc_signal_update(
  p_vc_id uuid,
  p_last_signal_date timestamptz,
  p_signal_summary text,
  p_follow_up_score integer,
  p_recommended_action text
) returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_follow_up_score < 0 or p_follow_up_score > 100 then
    raise exception 'follow_up_score must be between 0 and 100';
  end if;

  update public.vc_pipeline
     set last_signal_date   = p_last_signal_date,
         signal_summary     = p_signal_summary,
         follow_up_score    = p_follow_up_score,
         recommended_action = p_recommended_action
   where id = p_vc_id;

  if not found then
    raise exception 'VC % not found', p_vc_id;
  end if;
end;
$$;

revoke all on function public.apply_vc_signal_update(uuid, timestamptz, text, integer, text)
  from public, anon, authenticated;
grant execute on function public.apply_vc_signal_update(uuid, timestamptz, text, integer, text)
  to service_role;
