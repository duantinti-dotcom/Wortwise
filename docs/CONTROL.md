# Worthwise Control — painel administrativo (`admin.worthwise.site`)

Central privada de monitoramento comercial, financeiro, operacional e de segurança. Roda no **mesmo Worker** do Worthwise (rotas `/control/*`) e usa o mesmo Supabase, HeroPay e GeckoAPI. Nada do site principal muda de comportamento.

## Acesso
- **Somente os donos**: `duantinti@gmail.com` e o login curto `admin` (conta interna `admin@worthwise.site`). Não há outros papéis nem gerenciamento de equipe pela interface.
- Regra no banco: `public.is_admin()` = papel `admin` em `user_roles` **e** e-mail confirmado em `app_private.admin_emails`. Toda função `control_*` repete a checagem e exige **MFA (aal2 no JWT)**.
- MFA (TOTP) obrigatório no primeiro acesso; a verificação vale 12 h. Login limitado a 5 tentativas por origem a cada 15 min.
- O painel só responde em `CONTROL_HOST`; em `worthwise.site/control` responde 404.
- Senhas nunca ficam no código: a conta `admin` existe só no Supabase Auth.

## Ativação (uma vez)
1. **Banco**: aplicar `supabase/migrations/20261118000000_control_center.sql` (SQL Editor ou `supabase db push`). É aditiva; também estende `rate_hit` e as leituras do cache GeckoAPI só para contar eventos/economia, sem mudar o resultado.
2. **Conta `admin`**: Supabase → Authentication → Users → *Add user* → `admin@worthwise.site`, senha escolhida, *Auto confirm*. Depois, no SQL Editor:
   ```sql
   insert into public.user_roles (user_id, role) select id, 'admin' from auth.users where email = 'admin@worthwise.site' on conflict do nothing;
   insert into app_private.admin_emails (email) values ('admin@worthwise.site') on conflict do nothing;
   ```
3. **Supabase → Authentication → Multi-Factor**: TOTP habilitado (padrão). Para o botão Google, adicione `https://admin.worthwise.site/auth/callback` em *Redirect URLs*.
4. **Cloudflare → Workers & Pages → worthwise → Domains & Routes → Add Custom Domain**: `admin.worthwise.site`. (`CONTROL_HOST` já está em `wrangler.jsonc`.)
5. Deploy normal (`npm run deploy` ou o build automático ligado ao GitHub).

### Segredos opcionais (cada um libera uma parte; sem eles o painel mostra a limitação)
| Segredo | Libera |
| --- | --- |
| `CLOUDFLARE_API_TOKEN` (Zone Analytics: Read + Account Analytics: Read), `CLOUDFLARE_ZONE_ID`, `CLOUDFLARE_ACCOUNT_ID` | tráfego, ameaças, erros 401/403/404/429, países, firewall, picos, métricas do Worker |
| `SUPABASE_ACCESS_TOKEN` | falhas de login do site principal (força bruta). Atenção: token pessoal com acesso amplo à conta. |
| `RESEND_API_KEY` + `CONTROL_ALERT_EMAIL` | alertas por e-mail |

### Proteção extra recomendada
Cloudflare Zero Trust → Access → Application para `admin.worthwise.site`, política "e-mails = duantinti@gmail.com". Fica antes do login do painel.

## Fontes de dados
- **Financeiro/assinantes**: tabelas `payments`, `subscriptions`, `webhook_events` (webhooks HeroPay). A API v1 documentada da HeroPay não tem relatório de vendas; isso é dito na tela.
- **GeckoAPI**: saldo e consumo oficiais em `GET /v1/me/credits` (lido 1x/hora pelo Cron); consumo por marketplace/funcionalidade e economia por cache medidos pelo Worthwise.
- **Visitantes**: `/api/track`, anônimo e sem cookie (hash com sal diário), respeita DNT/GPC. Coleta começa com o deploy; nenhum período anterior é estimado.
- **Segurança**: eventos próprios (varredura, limite de requisições, login negado, MFA, webhook forjado, abuso do acesso grátis) com IP só em hash + Cloudflare.
- **IA**: contadores por requisição (modelo, tokens, tempo, erro), nunca conteúdo.

## Retenção
`control_events` 90 dias · `ai_usage_events` 180 dias · `visitor_days` 2 dias · saldo GeckoAPI horário por 14 dias (depois 1/dia) · `metrics_daily` ~2 anos. O Cron de 30 min (`/api/cron/control`) consolida, avalia alertas e aplica a retenção.

## Alertas
11 regras configuráveis (limite, prioridade, intervalo de lembrete). Um incidente aberto não gera aviso repetido e é resolvido sozinho quando a condição some. Avisos: painel, sino do Worthwise e, opcionalmente, e-mail.

## Testes
`npm test` (unitários: período, custos/CAC/LTV, CSV, hashes, varredura, GeckoAPI) · `npm run test:db` (permissões/MFA, coleta, alertas com deduplicação, relatórios, retenção).
