# Worthwise: o que fazer para tudo funcionar

Site no ar: **https://worthwise.duantinti.workers.dev**

Siga na ordem. Cada passo leva poucos minutos.
⚠️ Nunca cole senhas ou chaves no chat. Elas vão só nos sites indicados.

---

## 1) Fazer os e-mails de cadastro funcionarem
**Por quê:** quando alguém cria a conta, recebe um e-mail de confirmação. Sem este passo, o link do e-mail abre o endereço errado.

1. Entre em **supabase.com** → abra o projeto **Worthwise**.
2. No menu da esquerda: **Authentication** → **URL Configuration**.
3. Em **Site URL**, apague o que tiver e cole:
   `https://worthwise.duantinti.workers.dev`
4. Em **Redirect URLs**, clique em **Add URL** e cole:
   `https://worthwise.duantinti.workers.dev/auth/callback`
5. Clique em **Save**.

---

## 2) Virar o dono (administrador) do site
**Por quê:** é o que libera a área **Administração**, onde você vê usuários e configura os pagamentos.

1. No site, crie a sua conta em **"Começar grátis"** e confirme o e-mail.
2. No Supabase, menu da esquerda: **SQL Editor** → **New query**.
3. Cole o texto abaixo. **Troque `SEU-EMAIL@exemplo.com` pelo seu e-mail** e clique em **Run**:

```sql
insert into public.user_roles (user_id, role)
select id, 'admin' from auth.users where email = 'SEU-EMAIL@exemplo.com'
on conflict do nothing;

delete from public.data_sources where id = 'shein';
update public.data_sources set status = 'not_configured' where id = 'amazon';
drop function if exists public._ww_bootstrap_exec(text, text);
```

✅ Deu certo quando aparece **Success** e, ao entrar no site, surge **Administração** no fim do menu.

---

## 3) Mostrar os produtos com foto (Mercado Livre)
**Por quê:** é isso que faz aparecerem os **mais vendidos** e as **pesquisas** com foto, preço e link. Sem isso, essas telas ficam vazias.

**Parte A: pegar as chaves no Mercado Livre**
1. Entre em **developers.mercadolivre.com.br** com a sua conta do Mercado Livre.
2. Clique em **Criar aplicação**.
3. Preencha:
   - **Nome:** Worthwise
   - **Descrição:** Pesquisa de produtos e preços
   - **URI de redirect:** `https://worthwise.duantinti.workers.dev`
4. Salve. Vão aparecer duas chaves: **Client ID** (um número) e **Client Secret** (letras e números).

**Parte B: colocar as chaves no site**
1. Entre em **dash.cloudflare.com** → **Workers & Pages** → clique em **worthwise**.
2. Vá em **Settings** → **Variables and Secrets** → **+ Add**.
3. Adicione duas, ambas com **Type: Secret**:

   | Nome (copie igual) | Valor |
   | --- | --- |
   | `MELI_CLIENT_ID` | o Client ID |
   | `MELI_CLIENT_SECRET` | o Client Secret |

4. Clique em **Deploy**.

✅ Deu certo quando a tela **Mais vendidos** do app mostra produtos com foto.

---

## 4) Ligar o "Continuar com Google"
**Por quê:** o botão já aparece, mas só funciona depois deste passo. Até lá, quem clicar vê o aviso "ainda está sendo ativado".

**Parte A: criar a chave no Google**
1. Entre em **console.cloud.google.com**. Se pedir, crie um projeto chamado **Worthwise**.
2. Menu: **APIs e serviços** → **Tela de permissão OAuth**.
   - Tipo **Externo**.
   - Preencha o nome (Worthwise) e o seu e-mail.
   - Salve.
3. Menu: **APIs e serviços** → **Credenciais** → **Criar credenciais** → **ID do cliente OAuth**.
   - **Tipo:** Aplicativo da Web.
   - Em **URIs de redirecionamento autorizados**, cole:
     `https://uahetwewcuhcmpikvnzp.supabase.co/auth/v1/callback`
   - Clique em **Criar**. Aparecem o **ID do cliente** e a **Chave secreta do cliente**.

**Parte B: ligar no Supabase**
1. No Supabase: **Authentication** → **Sign In / Providers** → **Google**.
2. Ative a chave, cole o **ID do cliente** e a **Chave secreta** e clique em **Save**.

✅ Deu certo quando o botão "Continuar com Google" do site abre a tela de login do Google.

---

## 5) Receber pagamentos dos planos (HeroPay)
**Por quê:** é o que permite vender o **Pro (R$ 29,90)** e o **Business (R$ 59,90)**. Ninguém é cobrado enquanto isso não estiver pronto.

1. Crie a conta em **app.heropay.tech**.
2. No painel da HeroPay, copie o **token de API** e o **segredo dos webhooks**.
3. Na Cloudflare (mesmo lugar do passo 3, parte B), adicione mais duas, com **Type: Secret**:

   | Nome | Valor |
   | --- | --- |
   | `HEROPAY_JWT_TOKEN` | o token |
   | `HEROPAY_WEBHOOK_SECRET` | o segredo |

4. Clique em **Deploy**.
5. No site, como administrador: **Administração** → **Integrações**.
   - Clique em **Criar link na HeroPay** (no Pro e no Business).
   - Depois clique em **Cadastrar webhooks**.
6. **Me avise.** Eu troco do modo de teste para o modo real de cobrança.

---

## 6) Segurança (5 minutos, importante)
Você colou chaves aqui no chat. Para ninguém conseguir usá-las:
1. **dash.cloudflare.com** → seu ícone → **My Profile** → **API Tokens**.
2. Em **Global API Key**, clique em **Change**.
3. Quando quiser, apague também o token que começa com `cfut_`. Para a próxima publicação, eu peço um novo pelo formulário seguro.

---

## Depois (quando quiser)
- **Domínio próprio** (ex.: worthwise.com.br): compre e me diga o nome. Eu ligo o site a ele.
- **Amazon:** quando a sua conta de Associado for aprovada, me avise que eu explico onde colocar as chaves.
- **E-mail de contato:** me diga qual e-mail deve aparecer nas páginas de Privacidade e Termos.
