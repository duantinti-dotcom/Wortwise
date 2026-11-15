# Worthwise: o que fazer (resumido)

Faça na ordem. Nunca cole senhas ou chaves no chat.

---

## ✅ PASSO 1: Ligar o domínio (Hostinger) · 3 min
1. Entre em **hpanel.hostinger.com** → **Domínios** → **worthwise.site**.
2. Clique em **DNS / Nameservers** → **Alterar nameservers** → **Usar nameservers personalizados**.
3. Apague os que estão lá e coloque:
   - `crystal.ns.cloudflare.com`
   - `darwin.ns.cloudflare.com`
4. **Salvar.** Espere o e-mail da Cloudflare dizendo que o domínio está **ativo** (15 min a algumas horas).
5. Me escreva **"domínio ativo"**. Eu ajusto o site para o novo endereço.

---

## ✅ PASSO 2: Supabase (cadastro e login) · 2 min
1. Entre em **supabase.com** → projeto **Worthwise** → **Authentication** → **URL Configuration**.
2. **Site URL:** `https://worthwise.site`
3. **Redirect URLs** → **Add URL**. Adicione os dois:
   - `https://worthwise.site/auth/callback`
   - `https://www.worthwise.site/auth/callback`
4. **Save.**

---

## ✅ PASSO 3: Login com Google · 10 min

**A) No Google** (console.cloud.google.com)
1. No topo, clique em **Selecionar projeto** → **Novo projeto** → nome **Worthwise** → **Criar**.
2. No menu: **APIs e serviços** → **Tela de permissão OAuth**.
   - Tipo **Externo**.
   - Nome do app: **Worthwise**.
   - Coloque o seu e-mail nos campos de e-mail.
   - Clique em **Salvar e continuar** até o fim.
   - Depois clique em **Publicar app** (assim qualquer pessoa consegue entrar).
3. No menu: **APIs e serviços** → **Credenciais** → **+ Criar credenciais** → **ID do cliente OAuth**.
   - **Tipo:** Aplicativo da Web.
   - **Origens JavaScript autorizadas** → adicione:
     `https://worthwise.site`
   - **URIs de redirecionamento autorizados** → adicione (exatamente assim):
     `https://uahetwewcuhcmpikvnzp.supabase.co/auth/v1/callback`
   - Clique em **Criar**.
4. Copie o **ID do cliente** e a **Chave secreta do cliente**.

**B) No Supabase**
1. Vá em **Authentication** → **Sign In / Providers** → **Google**.
2. Ligue a chave **Enable**.
3. Cole o **ID do cliente** em *Client ID* e a **Chave secreta** em *Client Secret*.
4. **Save.**

✅ Pronto: em até 5 minutos, o botão "Continuar com Google" do site passa a funcionar.

---

## ✅ PASSO 4: Fotos e produtos (Mercado Livre) · 10 min
1. Entre em **developers.mercadolivre.com.br** → **Criar aplicação**.
   - **Nome:** Worthwise
   - **URI de redirect:** `https://worthwise.site`
   - **Permissão:** só leitura
2. Copie o **Client ID** e o **Client Secret**.
3. Na Cloudflare: **Workers & Pages** → **worthwise** → **Settings** → **Variables and Secrets** → **+ Add**. Adicione duas, ambas com **Type: Secret**:
   - Nome `MELI_CLIENT_ID`: cole o Client ID.
   - Nome `MELI_CLIENT_SECRET`: cole o Client Secret.
4. Clique em **Deploy**.

---

## ✅ PASSO 5: Virar administrador · 2 min
1. Crie a sua conta no site.
2. No Supabase, abra **SQL Editor** → **New query**.
3. Cole o comando abaixo (troque pelo seu e-mail) e clique em **Run**:
```sql
insert into public.user_roles (user_id, role)
select id, 'admin' from auth.users where email = 'SEU-EMAIL@exemplo.com'
on conflict do nothing;
```

---

## ⏳ Depois (quando quiser)
- **Receber pagamentos (HeroPay):**
  - crie a conta em app.heropay.tech;
  - na Cloudflare (mesmo lugar do passo 4), adicione `HEROPAY_JWT_TOKEN` e `HEROPAY_WEBHOOK_SECRET`;
  - me avise.
- **Arquivo de histórico (R2):** dash.cloudflare.com → **R2** → ativar. Depois me avise.
- **Segurança:** troque as chaves da Cloudflare que foram coladas no chat. É em **My Profile** → **API Tokens**: clique em **Change** na *Global API Key*.

---

### Me mande no chat
- **"domínio ativo"**: quando chegar o e-mail da Cloudflare.
- **"pode aplicar"**: para eu ativar a limpeza automática do banco (vai pedir sua aprovação na tela).
- Um **print** se travar em qualquer passo.
