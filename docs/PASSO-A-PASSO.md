# Worthwise: o passo a passo para deixar tudo funcionando

Siga na ordem. Cada passo diz **onde clicar**, **o que colar** e **como saber que deu certo**.
Nunca cole chaves e senhas no chat: elas vão direto no painel de cada serviço.

Endereço atual do site: **https://worthwise.duantinti.workers.dev**

---

## Passo 1: Colocar a versão nova no ar (Cloudflare)
*Obrigatório. Leva 3 minutos.*

1. Entre em **dash.cloudflare.com**.
2. Clique no seu ícone (canto superior direito) e depois em **My Profile → API Tokens**.
3. **Apague os tokens antigos** que você colou no chat: botão **⋯ → Delete** em cada um.
4. Clique em **Create Token** e, no modelo **"Edit Cloudflare Workers"**, clique em **Use template**.
5. Em *Account Resources*, escolha a sua conta. Em *Zone Resources*, deixe **All zones**.
6. Clique em **Continue to summary → Create Token** e copie o token.
7. Volte ao chat, escreva **"token pronto"** e cole o token **no formulário seguro que vai abrir** (não no chat).

✅ **Deu certo quando:** eu confirmar a publicação e o site mostrar o título "Encontre o produto…".

---

## Passo 2: Ajustes no banco de dados (Supabase)
*Obrigatório. Leva 5 minutos.*

### 2.1: Endereço do site (para os e-mails de cadastro funcionarem)
1. Entre em **supabase.com/dashboard** e abra o projeto do Worthwise.
2. Vá em **Authentication → URL Configuration**.
3. Em **Site URL**, coloque: `https://worthwise.duantinti.workers.dev`
4. Em **Redirect URLs**, clique em **Add URL** e adicione: `https://worthwise.duantinti.workers.dev/auth/callback`
5. Clique em **Save**.

### 2.2: Virar administrador, remover a SHEIN e fazer a limpeza
1. **Crie a sua conta no site** primeiro (página "Começar grátis") e confirme o e-mail.
2. No Supabase, abra **SQL Editor → New query**.
3. Cole o comando abaixo **trocando o e-mail pelo seu** e clique em **Run**:

```sql
-- 1) Tornar a sua conta administradora (troque o e-mail)
insert into public.user_roles (user_id, role)
select id, 'admin' from auth.users where email = 'SEU-EMAIL@exemplo.com'
on conflict do nothing;

-- 2) Remover a SHEIN e atualizar o estado da Amazon
delete from public.data_sources where id = 'shein';
update public.data_sources
   set status = 'not_configured',
       status_detail = 'Conector implementado (Product Advertising API 5.0). Aguardando Access Key, Secret Key e Partner Tag de uma conta de Associado.',
       updated_at = now()
 where id = 'amazon';
update public.data_sources
   set status_detail = 'A API do TikTok Shop só dá acesso à loja que autorizou o aplicativo; busca de produtos de terceiros depende de aplicativo de afiliado aprovado pelo TikTok.',
       updated_at = now()
 where id = 'tiktokshop';

-- 3) Limpeza da instalação
drop function if exists public._ww_bootstrap_exec(text, text);
```

✅ **Deu certo quando:** aparecer "Success" e, ao entrar no site, o menu da esquerda mostrar o item **Administração** no final.

---

## Passo 3: Conectar o Mercado Livre (fotos, preços e mais vendidos)
*Obrigatório para as pesquisas e para a tela "Mais vendidos". Leva 10 minutos.*

1. Entre em **developers.mercadolivre.com.br** com a sua conta do Mercado Livre.
2. Clique em **Minhas aplicações → Criar aplicação**.
3. Preencha:
   - **Nome**: Worthwise.
   - **Descrição curta**: Pesquisa de produtos e preços.
   - **URI de redirect**: `https://worthwise.duantinti.workers.dev`
   - **Permissões**: deixe só **leitura**.
4. Salve e copie o **Client ID** (número) e o **Client Secret** (chave secreta).
5. Na Cloudflare: **Workers & Pages → worthwise → Settings → Variables and Secrets → + Add**.
6. Crie dois itens, ambos com **Type: Secret**:

   | Variable name | Value |
   | --- | --- |
   | `MELI_CLIENT_ID` | o Client ID |
   | `MELI_CLIENT_SECRET` | o Client Secret |

7. Clique em **Deploy** (ou **Save and deploy**).

✅ **Deu certo quando:** a tela **Mais vendidos** do app mostrar produtos com foto e preço, e em **Administração → Integrações** o Mercado Livre aparecer como "Em operação".

---

## Passo 4: Receber pagamentos (HeroPay)
*Obrigatório para vender os planos Pro e Business. Sem isso, ninguém é cobrado.*

1. Crie a conta em **app.heropay.tech**.
2. No painel da HeroPay, copie o **token de API (JWT)** do ambiente de testes (sandbox) e o **segredo de assinatura dos webhooks**.
3. Na Cloudflare (mesmo lugar do Passo 3), crie dois itens com **Type: Secret**:

   | Variable name | Value |
   | --- | --- |
   | `HEROPAY_JWT_TOKEN` | o token |
   | `HEROPAY_WEBHOOK_SECRET` | o segredo |

4. No site, entre como administrador e vá em **Administração → Integrações**.
5. Clique em **Criar link na HeroPay** (para o Pro e para o Business) e depois em **Cadastrar webhooks**.
6. Faça uma assinatura de teste com os dados de teste da HeroPay e confira em **Administração → Logs**.
7. **Para começar a cobrar de verdade:** me avise. Eu troco o endereço da HeroPay de teste para produção, e você troca o token pelo de produção.

✅ **Deu certo quando:** a assinatura de teste mudar o plano da conta para Pro (isso só acontece depois que a HeroPay confirma o pagamento).

---

## Passo 5: Domínio próprio (ex.: worthwise.com.br)
*Recomendado antes de divulgar.*

1. Compre o domínio. O mais simples é pela própria Cloudflare: **Domain Registration → Register Domains**. Se for `.com.br`, compre no **registro.br** e aponte para a Cloudflare.
2. Me diga o domínio. Eu ligo o site a ele e atualizo os endereços no código.
3. Depois que eu confirmar, repita com o domínio novo:
   - o **Passo 2.1** (Site URL e Redirect URLs);
   - a **URI de redirect** do Mercado Livre (Passo 3);
   - os webhooks da HeroPay (Passo 4, item 5).

---

## Passo 6: Opcionais (melhoram muito a experiência)

### Login com Google
1. Em **console.cloud.google.com**, vá em **APIs e serviços → Credenciais → Criar credenciais → ID do cliente OAuth** (tipo: *Aplicativo da Web*).
2. Em **URIs de redirecionamento autorizados**, cole: `https://uahetwewcuhcmpikvnzp.supabase.co/auth/v1/callback`
3. Copie o **Client ID** e o **Client Secret**.
4. No Supabase: **Authentication → Sign In / Providers → Google**. Ligue, cole as duas chaves e salve.

✅ O botão **"Continuar com Google"** aparece sozinho na tela de login em até 5 minutos.

### E-mails de cadastro sem limite (SMTP)
O Supabase gratuito envia só alguns e-mails por hora, então configure um serviço de e-mail próprio antes de divulgar:
1. Crie a conta no **Resend** (ou outro serviço) e valide o seu domínio.
2. No Supabase, em **Authentication → Emails → SMTP Settings**, coloque os dados do serviço.

### Amazon (Associados)
A Amazon só libera a API depois que a conta de Associado tem vendas pelo seu link.
1. Cadastre-se em **associados.amazon.com.br**.
2. Quando liberar, vá em **Ferramentas → Product Advertising API** e gere as chaves.
3. Na Cloudflare, crie três itens com **Type: Secret**:

   | Variable name | Value |
   | --- | --- |
   | `AMAZON_PAAPI_ACCESS_KEY` | a Access Key |
   | `AMAZON_PAAPI_SECRET_KEY` | a Secret Key |
   | `AMAZON_PARTNER_TAG` | a sua tag (ex.: `sualoja-20`) |

### Shopee e TikTok Shop
Dependem de aprovação como afiliado/parceiro em cada plataforma. Quando tiver o acesso à API, me avise que eu faço a conexão.

### E-mail de contato (LGPD)
Me diga o e-mail que deve aparecer nas páginas de Privacidade e Termos. Eu coloco no site.

---

## Resumo rápido

| # | O quê | Obrigatório? | Quem faz |
| --- | --- | --- | --- |
| 1 | Token da Cloudflare + apagar os antigos | Sim | Você cria, eu publico |
| 2 | Supabase: endereço do site + comando SQL | Sim | Você |
| 3 | Mercado Livre (Client ID e Secret) | Sim | Você |
| 4 | HeroPay (token e segredo) | Para vender | Você, e eu troco para produção |
| 5 | Domínio próprio | Recomendado | Você compra, eu ligo |
| 6 | Google, SMTP, Amazon, e-mail de contato | Opcional | Você |
