-- Worthwise Control: visitas com horário (anônimas, 30 dias) e lista de cadastros para o dono.
create table if not exists app_private.visit_events (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  vhash text not null,
  path text,
  country text,
  device text,
  referrer text
);
create index if not exists visit_events_at_idx on app_private.visit_events (at desc);
revoke all on app_private.visit_events from public, anon, authenticated;

drop function if exists public.server_track_visit(text, text, text);
create or replace function public.server_track_visit(p_secret text, p_vhash text, p_country text,
  p_path text default null, p_device text default null, p_referrer text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare v_day date := app_private.sp_today(); v_new integer;
begin
  perform app_private.check_secret(p_secret);
  if p_vhash is null or p_vhash !~ '^[a-f0-9]{16,64}$' then return; end if;
  insert into app_private.visitor_days (day, vhash) values (v_day, left(p_vhash, 32)) on conflict do nothing;
  get diagnostics v_new = row_count;
  if v_new > 0 then
    perform app_private.metric_add(v_day, 'visitors', '', 1);
    if p_country ~ '^[A-Z]{2}$' then perform app_private.metric_add(v_day, 'visitors_country', p_country, 1); end if;
  end if;
  perform app_private.metric_add(v_day, 'pageviews', '', 1);
  insert into app_private.visit_events (vhash, path, country, device, referrer)
    values (left(p_vhash, 12), left(p_path, 160), case when p_country ~ '^[A-Z]{2}$' then p_country end,
            case when p_device in ('mobile', 'desktop', 'tablet') then p_device end, left(p_referrer, 120));
  if random() < 0.02 then
    delete from app_private.visit_events where id in (select id from app_private.visit_events where at < now() - interval '30 days' limit 2000);
  end if;
end $$;
revoke all on function public.server_track_visit(text, text, text, text, text, text) from public;
grant execute on function public.server_track_visit(text, text, text, text, text, text) to anon, authenticated;

create or replace function public.control_visitors(p_from timestamptz, p_to timestamptz)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  perform app_private.ctl_require('overview');
  perform app_private.ctl_check_range(p_from, p_to, null);
  return jsonb_build_object(
    'visits', (select coalesce(jsonb_agg(to_jsonb(v) order by v.at desc), '[]') from (
        select at, vhash, path, country, device, referrer from app_private.visit_events
        where at >= p_from and at < p_to order by at desc limit 2000) v),
    'visits_total', (select count(*) from app_private.visit_events where at >= p_from and at < p_to),
    'visitors_total', (select count(distinct vhash) from app_private.visit_events where at >= p_from and at < p_to),
    'tracking_since', (select min(at) from app_private.visit_events),
    'by_hour', (select coalesce(jsonb_agg(jsonb_build_object('hour', h, 'visits', coalesce(n, 0)) order by h), '[]')
      from generate_series(0, 23) h left join (select extract(hour from at at time zone 'America/Sao_Paulo')::integer hr, count(*) n
        from app_private.visit_events where at >= p_from and at < p_to group by 1) x on x.hr = h),
    'top_pages', (select coalesce(jsonb_agg(jsonb_build_object('path', path, 'n', n) order by n desc), '[]') from (
        select path, count(*) n from app_private.visit_events where at >= p_from and at < p_to group by path order by 2 desc limit 15) x),
    'top_referrers', (select coalesce(jsonb_agg(jsonb_build_object('referrer', referrer, 'n', n) order by n desc), '[]') from (
        select coalesce(referrer, 'Direto') referrer, count(*) n from app_private.visit_events where at >= p_from and at < p_to group by 1 order by 2 desc limit 10) x),
    'devices', (select coalesce(jsonb_agg(jsonb_build_object('device', coalesce(device, 'outro'), 'n', n)), '[]') from (
        select device, count(*) n from app_private.visit_events where at >= p_from and at < p_to group by 1) x),
    'signups', (select coalesce(jsonb_agg(jsonb_build_object('id', u.id, 'email', u.email, 'name', p.full_name, 'at', u.created_at,
        'provider', coalesce(u.raw_app_meta_data ->> 'provider', 'email'), 'confirmed', u.email_confirmed_at is not null,
        'last_sign_in', u.last_sign_in_at, 'plan', public.plan_of(u.id)) order by u.created_at desc), '[]')
      from auth.users u left join public.profiles p on p.id = u.id
      where u.created_at >= p_from and u.created_at < p_to),
    'signups_total', (select count(*) from auth.users),
    'generated_at', now());
end $$;
revoke all on function public.control_visitors(timestamptz, timestamptz) from public, anon;
grant execute on function public.control_visitors(timestamptz, timestamptz) to authenticated;
