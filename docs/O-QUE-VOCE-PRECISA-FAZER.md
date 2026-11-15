# Worthwise: só o que depende de você

Eu já deixei pronto:
- site no ar;
- login com Google;
- seu plano Ilimitado;
- painel administrativo só seu;
- banco de dados com limpeza automática;
- HeroPay com links do Pro e do Business e avisos de pagamento cadastrados.

O que sobrou precisa do **seu login** ou do **seu cartão**. Nunca cole senhas ou chaves no chat.

---

## 1. Liberar o pagamento dos clientes (5 min) · URGENTE
Sem isso, quem pagar não recebe o plano.
1. No painel da **HeroPay**, procure **Webhooks** (ou Integrações) e copie o **segredo / chave de assinatura**.
2. Abra **dash.cloudflare.com** → **Workers & Pages** → **worthwise** → **Settings** → **Variables and Secrets** → **+ Add**.
   - **Type:** Secret
   - **Name:** `HEROPAY_WEBHOOK_SECRET`
   - **Value:** cole o segredo
3. Clique em **Deploy**.

## 2. Mercado Livre com produtos reais, foto e preço (10 min)
Sem isso, a aba Mercado Livre mostra "chegando em breve".
1. Abra **developers.mercadolivre.com.br/devcenter** → **Criar uma aplicação**.
   - **Nome:** Worthwise
   - **URI de redirect:** `https://worthwise.site`
   - **Escopo:** só Leitura
2. Copie o **App ID** e a **Chave secreta**.
3. Na Cloudflare (mesmo lugar do passo 1), adicione duas, ambas como **Secret**:
   - `MELI_CLIENT_ID`: o App ID
   - `MELI_CLIENT_SECRET`: a Chave secreta
4. Clique em **Deploy**.

## 3. IA sem parar no meio do dia (2 min · US$ 5/mês)
A IA busca os produtos da **Shopee, Amazon e TikTok Shop** e responde na **Wise**.
- **No plano grátis:** a IA para quando o limite do dia acaba e só volta às 21h.
- **No plano pago:** ela não para. O limite grátis continua incluído, e o que passar dele é cobrado pelo uso (centavos; veja abaixo).

Para assinar:
1. Abra **dash.cloudflare.com** → **Workers & Pages** → **Plans**.
2. Escolha **Workers Paid** e pague com seu cartão.

**Quanto custa o uso da IA (estimativa):**
- Cada lista de produtos fica guardada por 3 dias para todos os clientes: a IA só trabalha 1 vez por loja e categoria.
- Uma resposta da Wise sai por menos de R$ 0,02.
- Com uso normal, o extra fica em poucos dólares por mês além dos US$ 5.

## 4. Google (2 min)
1. Abra **console.cloud.google.com** → **Google Auth Platform** → **Público-alvo**.
2. Clique em **Publicar app** (sem isso, só e-mails de teste entram com Google).
3. Apague do iPad o arquivo `client_secret…json`.

## 5. Segurança: trocar as chaves que foram coladas no chat (10 min)
Faça quando não precisar mais que eu publique mudanças (ou me mande um token novo pelo formulário seguro).
- **Cloudflare:**
  - **My Profile** → **API Tokens** → **Global API Key** → **Change**;
  - apague o token que começa com `cfut_`.
- **HeroPay:**
  - gere um token novo;
  - coloque em `HEROPAY_JWT_TOKEN` na Cloudflare (mesmo lugar do passo 1) e clique em **Deploy**;
  - apague o token antigo.
- **Google:**
  - em **Clientes** → seu cliente, adicione uma chave secreta nova;
  - me peça para atualizar no Supabase;
  - depois desative a antiga.

---

### Opcional, quando quiser
- **Shopee com foto e preço reais:**
  1. Crie a conta em affiliate.shopee.com.br → Open API.
  2. Na Cloudflare, adicione `SHOPEE_AFFILIATE_APP_ID` e `SHOPEE_AFFILIATE_SECRET` (ambas como Secret) e clique em **Deploy**.
  3. A aba Shopee troca sozinha da IA para os dados oficiais.
- **Nome e logo na tela do Google:** verificar o domínio no Search Console (o Google pede).
