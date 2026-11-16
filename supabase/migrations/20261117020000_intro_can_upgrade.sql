-- Quem está no primeiro mês (pagamento único, sem recorrência) pode assinar o Essencial ou o Profissional.
create or replace function public.create_checkout_intent(p_plan text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := (select auth.uid()); v_plan public.plans; v_token text; v_current text;
begin
  perform app_private.assert_active_user(v_uid);
  select * into v_plan from public.plans where id = p_plan and active and price_cents > 0;
  if not found then raise exception 'invalid_plan' using errcode = '22023'; end if;
  v_current := public.plan_of(v_uid);
  if v_current <> 'free' and exists (select 1 from public.subscriptions
      where user_id = v_uid and status = 'active' and current_period_end > now() and provider_subscription_id is not null) then
    return jsonb_build_object('status', 'already_subscribed', 'plan', v_current);
  end if;
  if p_plan = 'inicial' and not app_private.intro_eligible(v_uid) then
    return jsonb_build_object('status', 'intro_unavailable');
  end if;
  v_token := 'ww_' || replace(gen_random_uuid()::text, '-', '');
  insert into public.checkout_intents (token, user_id, plan_id) values (v_token, v_uid, p_plan);
  return jsonb_build_object('status', 'ok', 'token', v_token, 'plan', p_plan,
    'price_cents', v_plan.price_cents, 'checkout_url', v_plan.provider_checkout_url);
end $$;
