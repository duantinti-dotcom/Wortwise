# Diagnóstico das integrações

Situação em 13/11/2026. "Verificado" significa que foi exercitado de ponta a ponta neste projeto; o restante foi implementado a partir da documentação oficial e precisa de credenciais para ser confirmado.

## Resumo

| Integração | Estado | O que falta |
| --- | --- | --- |
| Supabase (banco + login por e-mail) | **Conectada e verificada** | Google OAuth, SMTP e Turnstile no painel |
| BrasilAPI (CNPJ) | **Conectada e verificada** | — |
| Mercado Livre | Implementada, **não verificada ao vivo** | Client ID e Client Secret do aplicativo |
| HeroPay | Implementada; webhook verificado localmente | Token do sandbox, segredo do webhook, ciclo real |
| Assistente (Workers AI) | Implementado, **não verificado ao vivo** | Deploy com o binding `AI` (ou `AI_BASE_URL`) |
| Amazon | Conector pronto (Product Advertising API 5.0) | Credenciais de Associado |
| Shopee, TikTok Shop | Estado real exposto; sem dados | Credenciamento em cada plataforma |

## Mercado Livre

- **Fonte**: API oficial (`api.mercadolibre.com`), autenticada com as credenciais do aplicativo (OAuth `client_credentials`). Sem scraping.
- **Constatação de hoje**: sem token, todos os recursos testados (`/sites/MLB/search`, `/products/search`, `/trends/MLB`, `/sites/MLB/categories`, `/sites/MLB/listing_prices`) respondem **403**. O portal de documentação também bloqueou leitura automatizada, então os contratos abaixo vêm do conhecimento da API pública e **devem ser confirmados com a primeira chamada autenticada**.
- **Implementado** (`src/lib/connectors/mercadolivre.ts`):
  - Busca de anúncios (`/sites/MLB/search`). Se o aplicativo não tiver acesso (401/403), o conector passa automaticamente para a busca no catálogo (`/products/search`) e obtém o preço da oferta vencedora em `/products/{id}`.
  - Detalhe de ficha de catálogo e ofertas concorrentes (`/products/{id}`, `/products/{id}/items`), detalhe de anúncio (`/items/{id}`), avaliações (`/reviews/item/{id}`).
  - Tarifas oficiais de venda (`/sites/MLB/listing_prices`) e posição no ranking de mais vendidos da categoria (`/highlights/MLB/category/{id}`).
  - Timeout de 8 s, validação de formato com Zod, registro de cada chamada (Admin → Logs), respeito a 429.
- **Não disponível pela API para terceiros**: unidades vendidas e faturamento de anúncios de outros vendedores; histórico de preços. O Worthwise não exibe nem estima esses números.
- **Limites e custo**: API gratuita; os limites dependem do aplicativo e não são publicados em valor fixo. O monitoramento agrupa verificações por produto para reduzir chamadas.
- **Atenção aos termos**: leia os Termos e Condições de Desenvolvedores antes do lançamento, em especial as regras sobre armazenamento e exibição de dados a terceiros.

## Amazon (Product Advertising API 5.0)

- Conector: `src/lib/connectors/amazon.ts`. A assinatura AWS Signature V4 fica em `sigv4.ts` e foi conferida contra o botocore.
- Segredos no Cloudflare:
  - `AMAZON_PAAPI_ACCESS_KEY`;
  - `AMAZON_PAAPI_SECRET_KEY`;
  - `AMAZON_PARTNER_TAG` (ex.: `minhaloja-20`).
- Opcionais: `AMAZON_PAAPI_HOST` (padrão `webservices.amazon.com.br`) e `AMAZON_MARKETPLACE` (padrão `www.amazon.com.br`).
- **SearchItems** (busca): filtros na origem (preço, avaliação mínima, frete grátis, condição, ordenação). Traz até 2 páginas de 10 itens, 1 requisição por segundo.
- **GetItems** (detalhe): todas as fotos (principal e variações), tópicos de descrição, marca, EAN, preço, preço de referência (desconto), frete grátis/Prime, avaliações e posição no ranking de vendas (`WebsiteSalesRank`).
- O link do produto (`DetailPageURL`) já vem com a tag de Associado.
- Se a API recusar os recursos `Offers.*`, o conector passa a usar `OffersV2.*` automaticamente.
- Conta sem acesso liberado (a Amazon exige vendas qualificadas no programa) aparece como "em credenciamento". Nenhum dado é inventado.
- A PA-API não fornece a descrição longa da página, só os tópicos (Features).

## Shopee e TikTok Shop

Nenhuma oferece busca pública de catálogo sem aprovação. Os conectores existem para exibir o estado real ("Aguardando credenciamento") e **nunca retornam produtos**.

| Plataforma | Caminho oficial | Exigência | O que permitiria |
| --- | --- | --- | --- |
| Shopee | API de afiliados | Conta de afiliado aprovada e acesso à API | Ofertas com foto, preço, link e vendas |
| TikTok Shop | Partner API / afiliados | Aplicativo aprovado. A API de loja só acessa a loja que autorizou | Produtos de afiliado, se aprovado |

A SHEIN foi removida do produto.

APIs de gestão de loja **não** dão acesso a vendas ou produtos de concorrentes.

## HeroPay

Lido em `heropay.ai/developers`, `/webhooks`, `/subscriptions` e `/faq` (o site `docs.heropay.tech` é renderizado no navegador e não pôde ser lido integralmente).

- **Bases**: `https://api.heropay.tech` (produção) e `https://api.beta.heropay.tech` (sandbox). Headers: `Authorization: Bearer <JWT>` e `Accept: application/vnd.herospark.com; version=1`.
- **Assinatura**: `POST /payment_links` com `period: "monthly"` devolve o checkout em `data.offer.url` (Pix Automático, cartão ou boleto). Valores em centavos, mínimo de R$ 5,00.
- **Identificação do pagador**: o Worthwise cria um token por tentativa (`checkout_intents`) e o envia em `?src=`; a HeroPay o devolve em `cart.src` em todos os webhooks. Reserva: assinatura já conhecida e, por último, e-mail confirmado do comprador.
- **Webhooks**: 9 gatilhos; tratamos 7. Assinatura HMAC SHA-256 do corpo bruto em `X-HeroPay-Signature` (aceita hexadecimal ou base64). O payload não traz ID de evento nem o nome do gatilho, por isso cada webhook é cadastrado com `?trigger=<gatilho>` na URL e a deduplicação usa gatilho + pagamento + assinatura + status.
- **Cancelamento**: `POST /recurring_payment/cancel` — imediato e irreversível no provedor; o acesso no Worthwise segue até o fim do período pago.
- **Limitações confirmadas da v1**: sem trial, sem validação de cartão sem cobrança, sem troca de plano com pró-rata. Por isso as três pesquisas gratuitas não exigem cartão, e a troca de plano é "cancelar e assinar o novo". A opção "exigir meio de pagamento" aparece desabilitada no painel.
- **A confirmar no sandbox** (a HeroPay recomenda validar com payloads reais):
  1. se `subscription.id` do webhook é o `recurring_payment_id` aceito pelo cancelamento;
  2. o formato de `payment.value`, das datas e dos status;
  3. a codificação da assinatura na sua conta e onde obter o segredo do webhook;
  4. se o parâmetro `src` na URL do checkout substitui o `src` do link.
- **Custos publicados**: cartão 3,49% por transação aprovada; Pix e boleto R$ 0 em caráter promocional (até 500 por mês, sujeito a mudança); sem mensalidade.

## Assistente de IA

- **Provedores** (`src/lib/ai/provider.ts`): Workers AI pelo binding `AI` (padrão) ou qualquer API compatível com OpenAI (`AI_PROVIDER=openai-compatible`, `AI_BASE_URL`, `AI_API_KEY`), o que inclui um Ollama hospedado à parte. Nenhum servidor Ollama roda dentro do Worker.
- **Modelo padrão**: `@cf/meta/llama-3.3-70b-instruct-fp8-fast` (configurável em `AI_MODEL`). Confira no catálogo da Cloudflare os modelos com *function calling* e os preços vigentes antes de definir o de produção.
- **Fundamentação**: o modelo só obtém números por ferramentas do servidor (pesquisa, detalhe, cálculo de lucro, histórico, tarifas, cotações). Saídas de ferramentas entram no contexto truncadas e rotuladas como dados, não como instruções.
- **Controles**: cota por plano consumida no banco, limite de requisições por minuto, teto de tokens, de histórico e de rodadas de ferramentas (Admin → Configurações), timeout de 45 s.
- **Sem IA configurada**: a tela informa a indisponibilidade e o restante da plataforma funciona.
- **Não verificado ao vivo**: o formato exato de `tool_calls` do Workers AI varia entre modelos; valide a primeira conversa após o deploy.

## BrasilAPI (CNPJ)

Consulta pública e gratuita de CNPJ (`brasilapi.com.br/api/cnpj/v1/{cnpj}`), usada para a "Verificação documental realizada". Verificado de ponta a ponta. Sem contrato de disponibilidade: se cair, a verificação informa a indisponibilidade e nada é alterado.

## Worthwise Lens (pesquisa por imagem)

Planejado para uma etapa posterior; depende de uma fonte que aceite busca por imagem com licença comercial. Não aparece na interface.

## Vitrine "Em alta" (mais vendidos)

- Tela `/app/em-alta`, faixa no painel e seção "Em alta agora" da página inicial (`/api/trending`, público, top 10).
- Fonte: API oficial do Mercado Livre, com as mesmas credenciais do conector (`MELI_CLIENT_ID` / `MELI_CLIENT_SECRET`):
  - `GET /highlights/MLB/category/{id}`: posições do ranking "Mais vendidos" da categoria;
  - `GET /products/{id}` e `GET /items?ids=`: foto, preço, frete e link de cada posição;
  - `GET /trends/MLB/{id}`: buscas em alta;
  - `GET /sites/MLB/categories`: lista de categorias.
- Cache de 30 minutos em memória por instância: visitas não multiplicam chamadas à API.
- Plano grátis vê as primeiras posições (mesmo limite de `trial_policy.free_visible_results`); o restante não é enviado ao navegador.
- Sem credenciais, o app mostra o aviso de integração pendente. A página inicial mostra itens ilustrativos com o selo "Demonstração". Nada é inventado como se fosse real.
- O Mercado Livre não informa a terceiros a quantidade vendida de anúncios de outros vendedores. Por isso a vitrine mostra a **posição** no ranking oficial, não um número de vendas.
