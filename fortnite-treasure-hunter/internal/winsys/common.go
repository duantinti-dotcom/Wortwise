// Package winsys reúne as integrações com o Windows: processos, janela do jogo,
// monitores, bandeja, atalhos globais, inicialização automática e medição de consumo.
//
// Nada aqui envia teclas, cliques ou foco para o jogo ou para outros programas.
package winsys

import (
	"bufio"
	"fmt"
	"os"
	"path/filepath"
	"strconv"
	"strings"
)

// FortniteProcess é o executável do cliente do jogo.
const FortniteProcess = "FortniteClient-Win64-Shipping.exe"

// FortniteLaunchURI abre o Fortnite pelo Epic Games Launcher oficial.
const FortniteLaunchURI = "com.epicgames.launcher://apps/fn%3A4fe75bbc5a674f4f9b356b5c90567da5%3AFortnite?action=launch&silent=true"

// Monitor descreve um monitor (coordenadas físicas da área virtual).
type Monitor struct {
	Index   int    `json:"index"`
	Name    string `json:"name"`
	X       int    `json:"x"`
	Y       int    `json:"y"`
	W       int    `json:"w"`
	H       int    `json:"h"`
	Primary bool   `json:"primary"`
}

// GameWindow descreve a janela do Fortnite encontrada.
type GameWindow struct {
	Found     bool   `json:"found"`
	PID       uint32 `json:"pid"`
	X         int    `json:"x"`
	Y         int    `json:"y"`
	W         int    `json:"w"`
	H         int    `json:"h"`
	Minimized bool   `json:"minimized"`
	// Mode: "tela_cheia" (ocupa o monitor inteiro) ou "janela".
	Mode    string `json:"mode"`
	Monitor int    `json:"monitor"`
}

// Usage é o consumo do aplicativo (processo + WebView2).
type Usage struct {
	CPUPercent   float64 `json:"cpu"`
	GPUPercent   float64 `json:"gpu"`
	GPUAvailable bool    `json:"gpuAvailable"`
	RAMMB        float64 `json:"ramMb"`
	Processes    int     `json:"processes"`
	SystemCPU    float64 `json:"systemCpu"`
	LogicalCPUs  int     `json:"logicalCpus"`
}

// GameSettings são as configurações lidas do GameUserSettings.ini do Fortnite (somente leitura).
type GameSettings struct {
	Found          bool    `json:"found"`
	Path           string  `json:"path"`
	ResX           int     `json:"resX"`
	ResY           int     `json:"resY"`
	FullscreenMode int     `json:"fullscreenMode"` // 0 tela cheia, 1 janela sem bordas, 2 janela
	ModeLabel      string  `json:"modeLabel"`
	HUDScale       float64 `json:"hudScale"`
}

// GameSettingsPath devolve o caminho padrão do arquivo de configurações do Fortnite.
func GameSettingsPath() string {
	base := os.Getenv("LOCALAPPDATA")
	if base == "" {
		return ""
	}
	return filepath.Join(base, "FortniteGame", "Saved", "Config", "WindowsClient", "GameUserSettings.ini")
}

// ReadGameSettings lê o arquivo de configurações do Fortnite, se existir.
func ReadGameSettings(path string) GameSettings {
	gs := GameSettings{Path: path, FullscreenMode: -1}
	if path == "" {
		return gs
	}
	f, err := os.Open(path)
	if err != nil {
		return gs
	}
	defer f.Close()
	return parseGameSettings(bufio.NewScanner(f), path)
}

// ParseGameSettings interpreta o conteúdo do .ini (exposto para testes).
func ParseGameSettings(content string) GameSettings {
	return parseGameSettings(bufio.NewScanner(strings.NewReader(content)), "")
}

func parseGameSettings(sc *bufio.Scanner, path string) GameSettings {
	gs := GameSettings{Path: path, FullscreenMode: -1}
	sc.Buffer(make([]byte, 64*1024), 1024*1024)
	var lastX, lastY int
	for sc.Scan() {
		line := strings.TrimSpace(sc.Text())
		k, v, ok := strings.Cut(line, "=")
		if !ok {
			continue
		}
		k, v = strings.TrimSpace(k), strings.TrimSpace(v)
		switch k {
		case "ResolutionSizeX":
			gs.ResX, _ = strconv.Atoi(v)
		case "ResolutionSizeY":
			gs.ResY, _ = strconv.Atoi(v)
		case "LastUserConfirmedResolutionSizeX":
			lastX, _ = strconv.Atoi(v)
		case "LastUserConfirmedResolutionSizeY":
			lastY, _ = strconv.Atoi(v)
		case "FullscreenMode":
			gs.FullscreenMode, _ = strconv.Atoi(v)
		case "HUDScale":
			gs.HUDScale, _ = strconv.ParseFloat(v, 64)
		}
	}
	if gs.ResX == 0 && lastX > 0 {
		gs.ResX, gs.ResY = lastX, lastY
	}
	gs.Found = gs.ResX > 0 && gs.ResY > 0
	switch gs.FullscreenMode {
	case 0:
		gs.ModeLabel = "Tela cheia"
	case 1:
		gs.ModeLabel = "Janela sem bordas"
	case 2:
		gs.ModeLabel = "Modo janela"
	default:
		gs.ModeLabel = "Não identificado"
	}
	return gs
}

// Hotkey é um atalho global interpretado.
type Hotkey struct {
	Mods uint32
	VK   uint32
	Text string
}

// Modificadores do RegisterHotKey.
const (
	ModAlt      = 0x1
	ModControl  = 0x2
	ModShift    = 0x4
	ModWin      = 0x8
	ModNoRepeat = 0x4000
)

// ParseHotkey interpreta textos como "Ctrl+Alt+F12".
func ParseHotkey(s string) (Hotkey, error) {
	h := Hotkey{Text: s}
	parts := strings.Split(strings.ReplaceAll(s, " ", ""), "+")
	if len(parts) == 0 || s == "" {
		return h, fmt.Errorf("atalho vazio")
	}
	for i, p := range parts {
		up := strings.ToUpper(p)
		last := i == len(parts)-1
		switch up {
		case "CTRL", "CONTROL":
			h.Mods |= ModControl
			continue
		case "ALT":
			h.Mods |= ModAlt
			continue
		case "SHIFT":
			h.Mods |= ModShift
			continue
		case "WIN":
			h.Mods |= ModWin
			continue
		}
		if !last {
			return h, fmt.Errorf("modificador desconhecido: %s", p)
		}
		switch {
		case len(up) >= 2 && up[0] == 'F':
			n, err := strconv.Atoi(up[1:])
			if err != nil || n < 1 || n > 24 {
				return h, fmt.Errorf("tecla inválida: %s", p)
			}
			h.VK = uint32(0x70 + n - 1)
		case len(up) == 1 && up[0] >= 'A' && up[0] <= 'Z', len(up) == 1 && up[0] >= '0' && up[0] <= '9':
			h.VK = uint32(up[0])
		case up == "PAUSE":
			h.VK = 0x13
		case up == "HOME":
			h.VK = 0x24
		case up == "END":
			h.VK = 0x23
		case up == "INSERT":
			h.VK = 0x2D
		case up == "DELETE":
			h.VK = 0x2E
		case up == "PAGEUP":
			h.VK = 0x21
		case up == "PAGEDOWN":
			h.VK = 0x22
		default:
			return h, fmt.Errorf("tecla não suportada: %s", p)
		}
	}
	if h.VK == 0 {
		return h, fmt.Errorf("atalho sem tecla principal")
	}
	if h.Mods&(ModControl|ModAlt|ModWin) == 0 && !(h.VK >= 0x70 && h.VK <= 0x87) {
		return h, fmt.Errorf("use Ctrl, Alt ou Win junto da tecla (exceto teclas F)")
	}
	return h, nil
}

// TrayCommand identifica ações do menu da bandeja e dos atalhos.
type TrayCommand string

const (
	CmdShow      TrayCommand = "mostrar"
	CmdToggle    TrayCommand = "alternar"
	CmdEmergency TrayCommand = "emergencia"
	CmdChest     TrayCommand = "bau_manual"
	CmdReward    TrayCommand = "recompensa_manual"
	CmdQuit      TrayCommand = "sair"
)
