# Worthwise: o que falta fazer (lista final)

Nunca cole senhas ou chaves em chat nenhum.

## ✅ Já está pronto
- Site no ar em https://worthwise.site (e www).
- Domínio ligado na Cloudflare.
- Login com e-mail e com Google funcionando.
- A conta duantinti@gmail.com já é administradora.

## 1. Google: publicar o app (1 min). IMPORTANTE
console.cloud.google.com → **Google Auth Platform** → **Público-alvo** → **Publicar app** → Confirmar.
Sem isso, só e-mails de teste conseguem entrar com Google.

## 2. Google: mostrar o nome e a logo (5 min + 2–3 dias)
1. search.google.com/search-console → **Adicionar propriedade** → **Domínio** → `worthwise.site` → Continuar.
2. Copie o código `google-site-verification=...`.
3. dash.cloudflare.com → **worthwise.site** → **DNS** → **Records** → **Add record**:
   - Type: **TXT**
   - Name: **@**
   - Content: cole o código
   - **Save**
4. Volte no Search Console → **Verificar** (se falhar, espere 10 min e tente de novo).
5. Google Cloud → **Google Auth Platform** → **Central de verificação** → **Verificar marca**.

## 3. Mercado Livre (fotos e produtos) · 10 min
1. developers.mercadolivre.com.br → **Criar aplicação**.
   - Nome: Worthwise
   - Redirect: `https://worthwise.site`
   - Permissão: só leitura
2. Na Cloudflare: **Workers & Pages** → **worthwise** → **Settings** → **Variables and Secrets** → **+ Add**. Adicione duas, ambas como **Secret**:
   - `MELI_CLIENT_ID`
   - `MELI_CLIENT_SECRET`
3. Clique em **Deploy**.

## 4. Segurança (5 min). Faça hoje
- Cloudflare → **My Profile** → **API Tokens**:
  - *Global API Key* → **Change**;
  - apague o token que começa com `cfut_`.
- Google Cloud → **Clientes** → seu cliente → **Adicionar chave secreta**.
  - Depois, numa conversa nova com o Claude, peça: "atualize a chave do Google no Supabase".
  - Desative a chave antiga.
- Apague o arquivo `client_secret...json` do iPad.

## 5. Numa próxima conversa com o Claude, diga:
> "pode aplicar a migração de otimização do banco e a de remover SHEIN"

Isso liga:
- a limpeza automática do banco;
- a página **Saúde do Banco** no admin.

O resto do site funciona sem isso.

## Depois (quando quiser)
- **Pagamentos (HeroPay):**
  - crie a conta em app.heropay.tech;
  - na Cloudflare (mesmo lugar do passo 3), adicione `HEROPAY_JWT_TOKEN` e `HEROPAY_WEBHOOK_SECRET`.
- **Arquivo de histórico:** dash.cloudflare.com → **R2** → ativar.
