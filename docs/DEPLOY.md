# Deploy e configuração

## 1. Supabase

O projeto `worthwise` (região sa-east-1) já está criado e com o esquema aplicado. Para um ambiente novo, execute os arquivos de `supabase/migrations` em ordem (SQL Editor ou `supabase db push`).

> As duas primeiras migrações foram aplicadas no projeto atual fora do histórico de migrações do Supabase. O conteúdo do banco corresponde aos arquivos do repositório; se for usar `supabase db push`, marque-as antes como aplicadas com `supabase migration repair`.

Passos manuais no painel do Supabase:

1. **Segredo do servidor** — gere um valor e registre o hash (SQL Editor):
   ```sql
   select app_private.set_server_secret('<valor gerado com openssl rand -hex 32>');
   ```
   O mesmo valor vai para o Worker como `WW_SERVER_SECRET`. O hash atual no banco é de um segredo de desenvolvimento: **troque antes do lançamento**.
2. **Authentication → URL Configuration** — Site URL = domínio de produção; adicione `https://SEU-DOMINIO/auth/callback` (e `http://localhost:3000/auth/callback`) em Redirect URLs.
3. **Authentication → Providers → Google** — crie credenciais OAuth no Google Cloud (tipo "Aplicativo da Web", URI de redirecionamento = a URL de callback mostrada pelo Supabase) e cole o Client ID e o Client Secret.
4. **Authentication → Emails** — configure um SMTP próprio (o serviço padrão é limitado a poucos e-mails por hora) e, se quiser, traduza os modelos.
5. **Authentication → Attack Protection** — habilite o CAPTCHA com Cloudflare Turnstile (a chave secreta fica no Supabase; a chave pública vai em `NEXT_PUBLIC_TURNSTILE_SITE_KEY`).
6. **Primeiro administrador** (SQL Editor):
   ```sql
   insert into public.user_roles (user_id, role)
   select id, 'admin' from auth.users where email = 'seu-email@exemplo.com';
   ```
7. **Limpeza pendente** — remova a função temporária usada na instalação (já sem nenhuma permissão de execução):
   ```sql
   drop function if exists public._ww_bootstrap_exec(text, text);
   ```
8. **Backups** — o plano gratuito do Supabase não inclui backups automáticos com restauração pontual. Para produção, use o plano Pro (backups diários) ou agende `pg_dump`. Teste a restauração em um projeto separado.

## 2. Cloudflare Workers

Requer o plano **Workers Paid** (Cron Triggers frequentes, mais CPU por requisição e Workers AI além da cota gratuita).

```bash
npx wrangler login                      # ou defina CLOUDFLARE_API_TOKEN
# segredos (um por vez)
npx wrangler secret put WW_SERVER_SECRET
npx wrangler secret put CRON_SECRET
npx wrangler secret put HEROPAY_JWT_TOKEN
npx wrangler secret put HEROPAY_WEBHOOK_SECRET
npx wrangler secret put MELI_CLIENT_ID
npx wrangler secret put MELI_CLIENT_SECRET
npm run deploy
```

Antes do deploy, ajuste:

- `.env.production` → `NEXT_PUBLIC_APP_URL` (domínio definitivo; é usado em canonical, sitemap e Open Graph) e `NEXT_PUBLIC_CONTACT_EMAIL`.
- `wrangler.jsonc` → `vars.APP_URL` / `vars.NEXT_PUBLIC_APP_URL` e, em produção, `HEROPAY_API_URL=https://api.heropay.tech`.

Depois do deploy, confira `https://SEU-DOMINIO/api/health` (mostra o que está configurado, sem expor segredos).

### Domínio, DNS e SSL

No painel da Cloudflare: Workers & Pages → `worthwise` → Settings → Domains & Routes → **Add Custom Domain**. Com o domínio na Cloudflare, o registro DNS e o certificado SSL são criados automaticamente. Ative "Always Use HTTPS".

### Deploy automático

Workers & Pages → `worthwise` → Settings → **Builds** → conecte o repositório GitHub. Comando de build: `npx opennextjs-cloudflare build`; comando de deploy: `npx opennextjs-cloudflare deploy`. Variáveis `NEXT_PUBLIC_*` vêm de `.env.production`.

### Cron Triggers

Definidos em `wrangler.jsonc`: monitoramento a cada 30 minutos e retenção diária. O Worker chama `/api/cron/*` internamente com `CRON_SECRET`. O intervalo mínimo por produto e o tamanho do lote são configuráveis em Admin → Configurações.

### Segurança na borda (recomendado)

- **WAF → Rate limiting rules**: limite `/api/*` por IP (por exemplo, 60 requisições por minuto) e `/entrar`, `/cadastro` com limite menor.
- **Bot Fight Mode** ligado; Turnstile no cadastro (item 5 acima).
- A aplicação já aplica limites por usuário no banco (pesquisa, assistente, checkout, verificação de CNPJ).

## 3. HeroPay

1. Crie a conta em app.heropay.tech e copie o token JWT do **sandbox** → `HEROPAY_JWT_TOKEN`. Mantenha `HEROPAY_API_URL=https://api.beta.heropay.tech`.
2. Defina `HEROPAY_WEBHOOK_SECRET` com o segredo de assinatura de webhooks da sua conta.
3. Em **Admin → Integrações**: "Criar link na HeroPay" para os planos Pro e Business e "Cadastrar webhooks".
4. Faça um ciclo completo no sandbox (assinar, renovar, recusar, cancelar, estornar) e confira os eventos em **Admin → Logs**. Veja em `docs/INTEGRACOES.md` os pontos que precisam ser confirmados com payloads reais.
5. Para produção: troque o token e a URL, recrie os links e recadastre os webhooks.

## 4. Mercado Livre

Crie um aplicativo no DevCenter (developers.mercadolivre.com.br), copie Client ID e Client Secret para `MELI_CLIENT_ID` / `MELI_CLIENT_SECRET`. A fonte passa a "Em operação" após a primeira resposta bem-sucedida.

## 5. Testes ponta a ponta

`tests/e2e/app.spec.ts` usa um usuário já confirmado: defina `E2E_EMAIL` e `E2E_PASSWORD` em `.env.local` (junto com `WW_SERVER_SECRET`, `CRON_SECRET` e `HEROPAY_WEBHOOK_SECRET` locais). Use um projeto Supabase de homologação: os testes gravam eventos de webhook de teste.

## Checklist de lançamento

- [ ] Domínio definitivo em `.env.production` e `wrangler.jsonc`
- [ ] `WW_SERVER_SECRET` e `CRON_SECRET` novos, registrados no Worker e no banco
- [ ] Google OAuth, SMTP e Turnstile configurados no Supabase
- [ ] Administrador criado; função temporária removida
- [ ] Mercado Livre respondendo (Admin → Integrações)
- [ ] Ciclo HeroPay validado no sandbox e chaves de produção trocadas
- [ ] E-mail de contato/encarregado em `NEXT_PUBLIC_CONTACT_EMAIL`; textos legais revisados por um advogado
- [ ] Regras de WAF e backups ativos
