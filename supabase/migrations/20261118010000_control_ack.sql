-- Worthwise Control: alertas "lidos" (reconhecidos) deixam de aparecer na visão executiva e no contador.
create or replace function public.control_ack_all()
returns integer language plpgsql security definer set search_path = '' as $$
declare n integer;
begin
  perform app_private.ctl_require_write('incidents');
  update app_private.control_incidents set status = 'acknowledged' where status = 'open';
  get diagnostics n = row_count;
  perform app_private.ctl_audit('incident.ack_all', null, jsonb_build_object('count', n));
  return n;
end $$;
revoke execute on function public.control_ack_all() from public, anon;
grant execute on function public.control_ack_all() to authenticated;

