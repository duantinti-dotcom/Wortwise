-- Plano grátis: a limitação de resultados visíveis é aplicada no banco, para que não possa ser
-- contornada lendo a tabela `searches` diretamente pela API.

revoke select on public.searches from authenticated;
grant select (id, user_id, fingerprint, query, filters, result_count, sources, charged, created_at, last_opened_at)
  on public.searches to authenticated;

create or replace function app_private.visible_results(p_plan text, p_results jsonb)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_visible integer;
begin
  if p_plan <> 'free' then return p_results; end if;
  select coalesce((value ->> 'free_visible_results')::integer, 6) into v_visible
    from public.app_settings where key = 'trial_policy';
  return coalesce((select jsonb_agg(e order by n) from jsonb_array_elements(p_results) with ordinality t(e, n)
    where n <= coalesce(v_visible, 6)), '[]'::jsonb);
end $$;
revoke all on function app_private.visible_results(text, jsonb) from public, anon, authenticated;

create or replace function public.search_precheck(p_fingerprint text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := (select auth.uid()); v_search public.searches; v_rem integer; v_plan text; v_vis jsonb;
begin
  perform app_private.assert_active_user(v_uid);
  v_plan := public.plan_of(v_uid);
  select * into v_search from public.searches where user_id = v_uid and fingerprint = p_fingerprint;
  if found then
    update public.searches set last_opened_at = now() where id = v_search.id;
    v_vis := app_private.visible_results(v_plan, v_search.results);
    return jsonb_build_object('status', 'cached', 'search_id', v_search.id, 'results', v_vis,
      'locked', v_search.result_count - jsonb_array_length(v_vis),
      'sources', v_search.sources, 'created_at', v_search.created_at,
      'remaining', app_private.remaining(v_uid, 'search'), 'plan', v_plan);
  end if;
  v_rem := coalesce(app_private.remaining(v_uid, 'search'), 0);
  if v_rem <= 0 then
    return jsonb_build_object('status', 'quota_exceeded', 'remaining', 0, 'plan', v_plan);
  end if;
  return jsonb_build_object('status', 'proceed', 'remaining', v_rem, 'plan', v_plan);
end $$;
revoke execute on function public.search_precheck(text) from public, anon;
grant execute on function public.search_precheck(text) to authenticated;

-- Reabrir uma pesquisa salva pelo id (histórico), com a mesma regra de visibilidade.
create or replace function public.open_search(p_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := (select auth.uid()); v_search public.searches; v_plan text; v_vis jsonb;
begin
  perform app_private.assert_active_user(v_uid);
  select * into v_search from public.searches where id = p_id and user_id = v_uid;
  if not found then return null; end if;
  v_plan := public.plan_of(v_uid);
  v_vis := app_private.visible_results(v_plan, v_search.results);
  update public.searches set last_opened_at = now() where id = p_id;
  return jsonb_build_object('search_id', v_search.id, 'query', v_search.query, 'results', v_vis,
    'locked', v_search.result_count - jsonb_array_length(v_vis), 'sources', v_search.sources,
    'created_at', v_search.created_at, 'plan', v_plan, 'remaining', app_private.remaining(v_uid, 'search'));
end $$;
revoke execute on function public.open_search(uuid) from public, anon;
grant execute on function public.open_search(uuid) to authenticated;
