# Instalação e primeiros passos

## 1. Instalar

1. Execute **TreasureHunter-Instalador.exe**.
2. O Windows SmartScreen pode avisar "O Windows protegeu o computador", porque o executável não tem assinatura digital comercial. Clique em **Mais informações → Executar assim mesmo**.
3. Siga o instalador. Ele cria atalhos no Menu Iniciar e na Área de Trabalho e instala o **Microsoft WebView2**, caso ainda não esteja presente (o Windows 11 já vem com ele).

Versão portátil: `Portatil\TreasureHunter.exe` roda sem instalar (requer o WebView2).

Requisitos: Windows 10 (64 bits) ou Windows 11.

## 2. Preparar o Fortnite

- Em **Configurações → Vídeo → Modo de janela**, use **Janela sem bordas** (recomendado) ou **Modo janela**. A tela cheia exclusiva pode deixar a captura preta, e o app avisa quando isso acontece.
- A resolução é detectada automaticamente (aba **Vídeo**).

## 3. Calibrar a visão (aba Visão)

O app não traz imagens do jogo: você ensina o que reconhecer, na sua resolução e no seu idioma. Para cada elemento:

1. Deixe a tela desejada visível no Fortnite e clique em **Capturar tela agora**. Também dá para abrir uma captura feita com **Win + PrtScn**.
2. Arraste uma caixa sobre um elemento que **não muda**, como um texto, ícone ou borda, evitando o cenário ao fundo.
3. Escolha o tipo, dê um nome e clique em **Salvar elemento**.

Comece pelos obrigatórios:

| Elemento | Sugestão |
|---|---|
| Lobby | botão JOGAR |
| Em partida (HUD) | moldura do minimapa ou da barra de vida |
| Squad eliminado | placa de colocação ao fim da partida |

Depois, os recomendados:

| Elemento | Sugestão |
|---|---|
| Modo correto | nome "Sem Construção" + "Squad" no lobby |
| Carregamento, Procurando partida, Espectando, Vitória Royale, Erro | a tela correspondente |
| Aviso de baú | aviso de interação ao mirar um baú |
| Baú aberto | algo que só aparece ao abrir, para contagem confirmada |
| Recompensa especial | ícone/nome do item na notificação. Use **Minha conta** para o aviso da sua coleta e **Feed do Squad** para avisos de colegas (área de busca **Coluna**) |
| Nome de integrante | nome de cada colega no feed, para saber quem encontrou |

Use **Testar nesta captura** e **Testar ao vivo** para conferir as pontuações. Ajuste o limiar de cada elemento se necessário.

## 4. Usar

1. Escolha o **objetivo** no Painel e as **condições de parada**.
2. Clique em **Iniciar**. Você pode minimizar para a bandeja e continuar usando o PC normalmente: o app nunca envia comandos a nenhum programa.
3. Jogue normalmente. Partidas, baús e recompensas são registrados, e as especiais vão para **Tesouros** com captura.
4. Atalhos globais (padrão):

| Atalho | Ação |
|---|---|
| **Ctrl+Alt+F9** | iniciar / pausar |
| **Ctrl+Alt+F12** | parada de emergência |
| **Ctrl+Alt+F10** | registrar baú manualmente |
| **Ctrl+Alt+F11** | capturar uma recompensa manualmente |

## Problemas comuns

| Sintoma | Solução |
|---|---|
| Captura preta | Fortnite em **Janela sem bordas**. |
| "Tela não identificada" | calibre o elemento daquela tela ou reduza levemente o limiar. |
| Calibrou em outra resolução | mantenha o **ajuste automático de escala** ligado ou recalibre. |
| Atalho não registra | outro programa já usa a combinação; troque em Configurações. |
| Logs | **Diagnóstico → Abrir pasta de logs** (`%APPDATA%\TreasureHunter\logs`). |

## Desinstalar

Use **Configurações do Windows → Aplicativos → Treasure Hunter → Desinstalar**. Os dados em `%APPDATA%\TreasureHunter` e as capturas são preservados. Apague essas pastas manualmente se quiser removê-los.
