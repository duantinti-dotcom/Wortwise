# Worthwise

**Encontre produtos que realmente valem a pena.** Plataforma brasileira de inteligência comercial para quem vende online: pesquisa de produtos em fontes autorizadas, comparação de fornecedores pelo custo total, histórico de preços, calculadora de lucro, monitoramento e assistente de IA fundamentado em dados reais.

> Regra do projeto: nenhum dado comercial é inventado. Campo ausente na fonte aparece como "Não disponível"; estimativas são rotuladas como estimativas; integrações não autorizadas mostram o estado real.

## Stack

| Camada | Tecnologia |
| --- | --- |
| Aplicação | Next.js 16 (App Router) · React 19 · TypeScript estrito · Tailwind CSS 4 |
| Interface | Radix UI (acessibilidade) · Motion · Recharts · Geist |
| Hospedagem | **Cloudflare Workers** via `@opennextjs/cloudflare` (assets estáticos, Cron Triggers, Workers AI) |
| Dados e login | Supabase (PostgreSQL + Auth + Row Level Security) |
| Pagamentos | HeroPay (checkout hospedado, assinatura mensal, webhooks assinados) |
| Testes | Vitest (unidade), PostgreSQL embarcado (banco), Playwright (ponta a ponta) |

**Por que OpenNext e não vinext?** A documentação da Cloudflare recomenda o vinext para projetos novos, mas o descreve como beta, e o próprio vinext aponta o OpenNext como opção mais madura. Como a prioridade é estabilidade, o projeto usa OpenNext (testado aqui no `workerd`). O código não usa APIs incompatíveis com Workers (sem filesystem persistente, sem processos locais).

## Começando

```bash
npm install
cp .env.example .env.local   # preencha as variáveis
npm run dev                  # http://localhost:3000
```

| Script | O que faz |
| --- | --- |
| `npm run dev` | Desenvolvimento local |
| `npm run typecheck` | Verificação de tipos |
| `npm run lint` | ESLint |
| `npm test` | Testes de unidade (cálculo de lucro, Score, normalização, webhook, markdown) |
| `npm run test:db` | Testes do banco em PostgreSQL real e descartável (RLS, créditos, cobrança, cotas) |
| `npm run test:e2e` | Playwright (desktop e mobile). Requer `npm run build` antes |
| `npm run build` | Build do Next.js |
| `npm run preview` | Build OpenNext + execução local no runtime da Cloudflare (`workerd`) |
| `npm run deploy` | Build OpenNext + deploy no Cloudflare Workers |

## Estrutura

```
src/app/(marketing)   páginas públicas: landing, preços, calculadora, metodologia, fontes, blog, legais
src/app/(auth)        entrar, cadastro, recuperação e redefinição de senha
src/app/app           aplicação autenticada (12 áreas da sidebar + análise de produto)
src/app/admin         painel administrativo (autorização no servidor e no banco)
src/app/api           pesquisa, produto, assistente, cobrança, webhook HeroPay, cron, verificação de CNPJ
src/lib/connectors    conectores de marketplaces (um módulo por fonte) e BrasilAPI
src/lib/profit        calculadora de lucro (funções puras)
src/lib/score         Worthwise Score (transparente, com grau de confiança)
src/lib/normalize     normalização de títulos e detecção de variantes
src/lib/ai            provedores de IA (Workers AI / compatível com OpenAI) e agente com ferramentas
src/lib/billing       integração HeroPay
supabase/migrations   esquema versionado (tabelas, RLS, funções)
custom-worker.ts      entrada do Worker: handler do OpenNext + Cron Trigger
```

## Decisões de arquitetura

- **Créditos no banco, de forma atômica.** `record_search` consome 1 crédito somente quando a pesquisa entrega resultados; a mesma pesquisa nunca é cobrada duas vezes, nem com requisições simultâneas (testado com concorrência real).
- **Sem chave de serviço no Worker.** O servidor usa a sessão do usuário (RLS) e, para operações globais (webhooks, cron, histórico de preços), chama funções `server_*` do banco autenticadas por um segredo (`WW_SERVER_SECRET`, cujo hash fica no banco). O segredo dá acesso só a essas funções, não ao banco inteiro.
- **Plano pago só por webhook.** O retorno do checkout não ativa nada. O webhook valida o HMAC do corpo bruto, deduplica o evento e confere o valor pago antes de liberar acesso. Estorno e chargeback revogam imediatamente.
- **Limites aplicados no banco.** Cotas por plano, resultados visíveis no plano grátis e status de verificação de fornecedores não podem ser alterados pelo cliente.
- **Histórico de preços real.** Só observações coletadas pelo Worthwise; um novo ponto é gravado quando o preço muda ou após 6 horas.

## Documentação

- [docs/DEPLOY.md](docs/DEPLOY.md) — Cloudflare, Supabase, segredos, domínio, cron e checklist de lançamento.
- [docs/INTEGRACOES.md](docs/INTEGRACOES.md) — diagnóstico de cada integração (marketplaces, HeroPay, IA, CNPJ).
