# Treasure Hunter

Aplicativo desktop para Windows 10/11 que acompanha suas partidas de **Fortnite Battle Royale Sem Construção — Squad** e registra os tesouros que aparecem na tela: **Token da Loja Pirata**, **skins douradas**, **itens elementais** e outros itens raros, sejam eles recebidos na sua conta ou anunciados por qualquer integrante do Squad.

> Não é afiliado nem endossado pela Epic Games. "Fortnite" é marca da Epic Games, Inc.

## Modo acompanhamento (por que o app não joga por você)

O EULA e os Termos de Serviço do Fortnite proíbem bots, scripts e programas de automação que interfiram no jogo, e a Epic já processou pessoas que usaram bots. Por isso o Treasure Hunter **não automatiza a jogabilidade**: não inicia partidas, não movimenta o personagem e não abre baús. Ele:

- **não** envia teclas, cliques ou movimentos ao jogo nem a outros programas, e não muda o foco das janelas;
- **não** lê memória, **não** injeta DLL, **não** manipula pacotes e **não** interfere no anticheat;
- apenas **captura a imagem da tela** (como um programa de gravação) e **lê** o arquivo de configurações de vídeo do Fortnite.

No lugar da automação ele faz o acompanhamento: identifica cada tela, conta partidas e baús, captura as recompensas, avisa quando o objetivo foi atingido e oferece registro manual por atalhos globais.

## Recursos

| Área | O que faz |
|---|---|
| Painel | Status do Fortnite e da operação, estado atual da partida, partidas iniciadas/concluídas, baús, média por partida, itens raros, tokens, tempo total, última recompensa, objetivo e histórico em tempo real. Iniciar, pausar, encerrar e parada de emergência. |
| Tesouros | Galeria com captura original (PNG), nome, raridade, origem (própria conta ou Squad), quem encontrou, data/hora, partida, baús até então e confiança. Ampliar (zoom/arrastar), exportar PNG ou lote + planilha CSV, filtrar, corrigir e excluir. Efeito dourado e som para lendários. |
| Visão | Calibração visual: capture a tela (ou abra uma captura salva), arraste sobre o elemento e salve. Teste de reconhecimento na captura ou ao vivo, com caixas e pontuações desenhadas na imagem. |
| Vídeo | Detecção automática da resolução (janela do jogo + `GameUserSettings.ini`), 10 resoluções pré-definidas, resolução personalizada, monitor, tela cheia / janela sem bordas / janela, ajuste automático de escala do HUD, pré-visualização da captura. |
| Condições de parada | Token da Loja Pirata, skin dourada, item elemental, itens raros selecionados, limite de baús, de partidas e de tempo, operação contínua — várias ao mesmo tempo, incluindo itens achados por colegas. |
| Desempenho | Perfis Econômico (1 quadro/s), Equilibrado (2) e Máximo desempenho (5); frequência e confirmação ajustáveis; CPU, GPU e RAM do app em tempo real. |
| Configurações | Sons, notificações do Windows, pasta das capturas, atalhos globais, iniciar com o Windows, fechar para a bandeja, abrir o Fortnite pelo Epic Games Launcher, reduzir efeitos, vidro nativo do Windows 11. |
| Diagnóstico | Máquina de estados ao vivo, informações do sistema e log técnico. |

## Como o reconhecimento funciona

1. **Captura** (GDI/BitBlt) só da área da janela do Fortnite, reaproveitando o mesmo buffer de memória.
2. **Redução** para 640 px de largura. Todas as posições são **relativas**, então a calibração vale em outras resoluções.
3. **Correlação cruzada normalizada** (NCC) em pirâmide, procurando só na área de busca de cada elemento. Ela tolera mudanças de brilho e contraste.
4. **Varredura orientada pelo estado**: em partida, procura apenas HUD, espectador, fim de partida, baús e recompensas. A cada 15 quadros faz uma varredura completa, com rodízio de escalas (78 % a 122 %) para compensar a escala do HUD, a resolução ou uma proporção ultrawide. A escala que funcionar fica memorizada.
5. **Quadros idênticos** reaproveitam o resultado anterior.
6. **Máquina de estados** com confirmação em quadros consecutivos, vigia contra travamentos (carregamento longo, HUD ausente, tela inesperada) e contagem única por partida.
7. **Recompensas do Squad**: elementos de recompensa calibrados como "Feed do Squad" são procurados em toda a coluna de notificações. Se nomes de integrantes estiverem calibrados, o app identifica quem encontrou o item na mesma linha da notificação. A deduplicação é feita por partida, item, origem e integrante enquanto a notificação está visível. Uma mesma recompensa recebida na sua conta e anunciada no feed gera registros separados, cada um com sua origem.
8. **Incerteza**: pontuação logo abaixo do limiar gera um registro **"não confirmado"**, que não entra nas estatísticas nem aciona condições de parada. Nada é inventado: sem calibração, nada é reconhecido.

## Arquitetura

```
main.go                     janela Wails (WebView2), vidro Acrylic no Windows 11, instância única
internal/capture            captura GDI com buffer reutilizado; detecção de captura preta
internal/vision             redução, NCC em pirâmide, multiescala, raridade por cor, templates
internal/state              máquina de estados, baús, partidas, deduplicação de recompensas
internal/app                orquestrador, laço de monitoramento, API para a interface, galeria
internal/storage            JSON atômico, histórico JSONL, galeria, log com rotação
internal/config             configurações, perfis, condições de parada
internal/winsys             processos, janela do jogo, monitores, bandeja, atalhos globais,
                            inicialização com o Windows, launcher, medição de CPU/GPU/RAM
frontend/dist               interface (HTML/CSS/JS sem framework, fontes e ícones locais)
build/windows/installer     instalador NSIS em português
```

Os dados ficam em `%APPDATA%\TreasureHunter` (configurações, estatísticas, histórico, calibração e logs). As capturas ficam em `Imagens\Treasure Hunter`, e a pasta pode ser alterada.

## Compilar

Requisitos: Go 1.23+, [Wails v2](https://wails.io) (`go install github.com/wailsapp/wails/v2/cmd/wails@v2.10.1`) e NSIS (`makensis`) para o instalador.

```bash
wails build -platform windows/amd64 -nsis -skipbindings -trimpath -ldflags "-s -w"
```

Saída: `build/bin/TreasureHunter.exe` e `build/bin/TreasureHunter-amd64-installer.exe`. A compilação funciona tanto no Windows quanto no Linux (compilação cruzada).

## Testes

```bash
go test ./...                                 # reconhecimento, estados, parada, armazenamento, integração
go test ./internal/vision -bench . -run xxx   # desempenho
```

No Windows, `go test ./...` também executa os testes de integração do sistema (captura GDI, monitores, processos, bandeja, atalhos e medidor de consumo).
