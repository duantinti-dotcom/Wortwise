-- Novos preços: Pro R$ 29,90 e Business R$ 59,90 (mesma proporção de antes: 49,90 → 29,90 ≈ 0,6).
-- Atenção: os links de checkout da HeroPay guardam o valor; recrie-os em Admin → Integrações.
update public.plans set price_cents = 2990, updated_at = now() where id = 'pro';
update public.plans set price_cents = 5990, updated_at = now() where id = 'business';
