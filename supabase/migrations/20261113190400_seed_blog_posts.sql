-- Artigos iniciais do blog (conteúdo educacional próprio; sem números de mercado inventados).
insert into public.blog_posts (slug, title, excerpt, category, status, published_at, content_md) values
('como-calcular-lucro-no-mercado-livre', 'Como calcular o lucro real de uma venda no Mercado Livre',
 'Preço de venda menos custo do produto não é lucro. Veja todas as despesas que entram na conta e como chegar ao preço mínimo.',
 'precificação', 'published', now(), $md$
Quem começa a vender costuma fazer uma conta simples: comprei por um valor, vendi por outro, a diferença é lucro. Na prática, entre o pagamento do cliente e o dinheiro que sobra existem várias despesas. Ignorá-las é a forma mais comum de vender muito e não ganhar nada.

## O que entra na conta

- **Custo do produto e frete de compra.** Divida o frete do lote pela quantidade para chegar ao custo real por unidade.
- **Comissão do marketplace.** Varia conforme a categoria e o tipo de anúncio. Consulte sempre a tabela oficial, porque ela muda.
- **Tarifa fixa por venda.** Alguns canais cobram um valor fixo em produtos de menor preço.
- **Frete de venda.** Quando o anúncio oferece frete grátis, parte do custo é do vendedor.
- **Impostos.** Dependem do seu regime tributário. Em caso de dúvida, fale com um contador.
- **Publicidade.** Se você usa anúncios pagos, reserve um percentual do preço.
- **Embalagem, devoluções e perdas.** Pequenas individualmente, relevantes no total.

## A fórmula

Receita é o preço de venda multiplicado pelas unidades realmente vendidas (descontadas perdas e devoluções). Lucro é a receita menos todos os custos acima. A **margem** é o lucro dividido pela receita.

## Dois números que evitam prejuízo

1. **Preço mínimo**: o preço em que o lucro é zero. Abaixo dele, cada venda aumenta o prejuízo.
2. **Ponto de equilíbrio**: quantas unidades você precisa vender para pagar os custos fixos do lote.

## Simule cenários antes de comprar

Refaça a conta supondo um preço de venda um pouco menor e um custo de anúncios um pouco maior. Se o resultado continuar positivo, a operação tem folga. Se virar prejuízo com uma variação pequena, o risco é alto.

A [calculadora de lucro do Worthwise](/calculadora-de-lucro) faz todas essas contas e mostra os cenários lado a lado.
$md$),
('como-encontrar-fornecedores-confiaveis', 'Como encontrar e avaliar fornecedores para revenda',
 'Preço baixo não é sinal de confiança. Um roteiro para verificar um fornecedor e comparar propostas pelo custo total.',
 'fornecedores', 'published', now(), $md$
Escolher fornecedor só pelo menor preço anunciado é um erro frequente. O que importa é quanto o produto custa **na sua mão** e se a empresa do outro lado entrega o que promete.

## Verifique quem é a empresa

- **Consulte o CNPJ.** A situação cadastral na Receita Federal é pública. Um CNPJ ativo, com atividade compatível com o que a empresa vende e algum tempo de existência, é o mínimo.
- **Procure o site e os canais oficiais.** Desconfie de quem só atende por aplicativo de mensagens e não informa endereço.
- **Peça nota fiscal.** Além de obrigatória, ela é necessária para vender em vários marketplaces.

Verificação documental mostra que a empresa existe e está regular. Ela não garante qualidade, prazo nem bom atendimento.

## Compare pelo custo total

Para cada proposta, some o preço dos produtos, o frete, os impostos e outras despesas, e divida pela quantidade. É comum a proposta com o menor preço unitário perder quando o frete entra na conta.

Anote também o **pedido mínimo** e o **prazo de envio**: um lote grande demais imobiliza capital, e um prazo longo pode deixar seu anúncio sem estoque.

## Comece pequeno

Antes de um pedido grande, faça um pedido de teste. Avalie a embalagem, a conformidade com o anunciado e o tempo real de entrega. Guarde as evidências: elas ajudam em uma eventual negociação.

## Sinais de alerta

- Preço muito abaixo de todos os concorrentes sem explicação.
- Pressão para pagar rápido ou apenas por transferência para pessoa física.
- Recusa em emitir nota fiscal ou em informar o CNPJ.

No Worthwise você cadastra cotações, vê o custo final por unidade e verifica o CNPJ de cada fornecedor na base pública da Receita Federal.
$md$),
('como-escolher-produtos-para-revender', 'Como analisar um produto antes de decidir revender',
 'Cinco perguntas para avaliar um produto com evidências: demanda, concorrência, preço, margem e risco.',
 'guias', 'published', now(), $md$
Listas de "produtos em alta" envelhecem rápido. Mais útil do que uma lista é um método para avaliar qualquer produto com as informações que você consegue verificar.

## 1. Existe procura?

Marketplaces raramente divulgam quantas unidades um anúncio vendeu. O que dá para observar são sinais indiretos: presença em rankings de mais vendidos da categoria e volume de avaliações. Trate esses sinais como indícios de interesse, não como número de vendas.

## 2. Quantos vendedores disputam o mesmo cliente?

Conte as ofertas do mesmo produto. Muitos vendedores com o mesmo item costumam levar à disputa por preço. Poucos vendedores podem indicar espaço, ou então pouca procura: cruze com a pergunta anterior.

## 3. Como o preço se comporta?

Compare o preço com a mediana de anúncios realmente comparáveis: mesma marca, mesmo modelo, mesma capacidade ou quantidade. Acompanhe por algumas semanas. Preços que caem continuamente apertam a margem de quem entra depois.

## 4. Sobra margem depois de tudo?

Use o custo total de aquisição e inclua comissão, frete, impostos, publicidade e devoluções. Uma margem pequena não resiste a uma promoção do concorrente.

## 5. Quais são os riscos?

- Produto frágil, com muitas variações ou alto índice de devolução.
- Dependência de um único fornecedor.
- Exigência de certificação ou restrições de venda na categoria.
- Sazonalidade: o que vende em dezembro pode ficar parado em fevereiro.

## Decida com o que você sabe

Nenhuma análise elimina a incerteza. O objetivo é evitar erros previsíveis e começar com um lote pequeno, medindo o resultado antes de ampliar. Quando faltar informação, registre isso como risco em vez de preencher a lacuna com otimismo.
$md$)
on conflict (slug) do nothing;
