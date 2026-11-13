-- Dados de referência (não são dados comerciais: planos, cotas, fontes e configuração).

insert into public.plans (id, name, description, price_cents, features, sort_order) values
  ('free', 'Grátis', 'Para conhecer a plataforma.', 0,
   '["3 pesquisas de produtos no total","Calculadora de lucro","Visualização parcial dos resultados","5 mensagens no assistente"]', 0),
  ('pro', 'Pro', 'Para quem vende e precisa decidir com dados.', 4990,
   '["300 pesquisas por mês","Comparação de fornecedores","Histórico de preços observado","Calculadora avançada e cenários","200 mensagens no assistente por mês","25 produtos monitorados","Favoritos e 20 coleções","30 exportações por mês"]', 1),
  ('business', 'Business', 'Para operação comercial intensiva.', 9990,
   '["1.000 pesquisas por mês","600 mensagens no assistente por mês","100 produtos monitorados","100 coleções","Relatórios completos","200 exportações por mês"]', 2)
on conflict (id) do nothing;

insert into public.plan_quotas (plan_id, resource, limit_value, period) values
  ('free', 'search', 3, 'total'), ('free', 'ai_message', 5, 'total'), ('free', 'watch', 0, 'count'),
  ('free', 'collection', 1, 'count'), ('free', 'simulation_saved', 3, 'count'), ('free', 'export', 0, 'month'),
  ('pro', 'search', 300, 'month'), ('pro', 'ai_message', 200, 'month'), ('pro', 'watch', 25, 'count'),
  ('pro', 'collection', 20, 'count'), ('pro', 'simulation_saved', 100, 'count'), ('pro', 'export', 30, 'month'),
  ('business', 'search', 1000, 'month'), ('business', 'ai_message', 600, 'month'), ('business', 'watch', 100, 'count'),
  ('business', 'collection', 100, 'count'), ('business', 'simulation_saved', 500, 'count'), ('business', 'export', 200, 'month')
on conflict (plan_id, resource) do nothing;

insert into public.data_sources (id, name, kind, status, status_detail, docs_url) values
  ('mercadolivre', 'Mercado Livre', 'marketplace', 'not_configured',
   'Conector implementado. Aguardando credenciais do aplicativo (client_id e client_secret).',
   'https://developers.mercadolivre.com.br'),
  ('shopee', 'Shopee', 'marketplace', 'pending_approval',
   'A Open Platform exige credenciamento como parceiro; a API de afiliados exige conta aprovada.',
   'https://open.shopee.com'),
  ('amazon', 'Amazon', 'marketplace', 'pending_approval',
   'A Product Advertising API exige conta de Associado aprovada e com vendas qualificadas.',
   'https://webservices.amazon.com/paapi5/documentation/'),
  ('tiktokshop', 'TikTok Shop', 'marketplace', 'pending_approval',
   'A Partner API exige aprovação do aplicativo e autorização de cada vendedor.',
   'https://partner.tiktokshop.com'),
  ('shein', 'SHEIN', 'marketplace', 'pending_approval',
   'A Open Platform é restrita a vendedores e parceiros aprovados; não há API pública de catálogo.',
   'https://open.sheincorp.com'),
  ('brasilapi', 'BrasilAPI (CNPJ)', 'registry', 'connected',
   'Consulta cadastral de CNPJ com dados públicos da Receita Federal.', 'https://brasilapi.com.br/docs'),
  ('assistant', 'Assistente (IA)', 'ai', 'not_configured',
   'Aguardando binding do Workers AI ou provedor compatível com OpenAI.', 'https://developers.cloudflare.com/workers-ai/')
on conflict (id) do nothing;

insert into public.app_settings (key, value) values
  ('trial_policy', '{"require_payment_method": false, "require_verified_email": true, "free_visible_results": 6}'),
  ('monitoring', '{"min_interval_minutes": 360, "batch_size": 40}'),
  ('assistant', '{"max_output_tokens": 900, "max_history_messages": 12, "max_tool_rounds": 4}')
on conflict (key) do nothing;
