// Package config define e persiste as configurações do aplicativo.
package config

import (
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"
)

// Perfis de desempenho.
const (
	ProfileEco      = "economico"
	ProfileBalanced = "equilibrado"
	ProfileMax      = "maximo"
)

// ProfileParams são os parâmetros derivados de cada perfil.
type ProfileParams struct {
	FPS           float64 // quadros analisados por segundo
	FullScanEvery int     // a cada N quadros, varredura completa
	ConfirmFrames int
}

// Params devolve os parâmetros do perfil.
func Params(profile string) ProfileParams {
	switch profile {
	case ProfileEco:
		return ProfileParams{FPS: 1, FullScanEvery: 20, ConfirmFrames: 2}
	case ProfileMax:
		return ProfileParams{FPS: 5, FullScanEvery: 15, ConfirmFrames: 3}
	}
	return ProfileParams{FPS: 2, FullScanEvery: 15, ConfirmFrames: 2}
}

// Resolution é uma resolução pré-definida.
type Resolution struct {
	W     int    `json:"w"`
	H     int    `json:"h"`
	Label string `json:"label"`
}

// Resolutions lista as resoluções oferecidas na seleção manual.
var Resolutions = []Resolution{
	{1024, 768, "1024×768"}, {1280, 720, "1280×720 (HD)"}, {1280, 800, "1280×800"}, {1366, 768, "1366×768 (HD)"},
	{1440, 900, "1440×900"}, {1600, 900, "1600×900"}, {1920, 1080, "1920×1080 (Full HD)"}, {2560, 1440, "2560×1440 (QHD)"},
	{3440, 1440, "3440×1440 (Ultrawide)"}, {3840, 2160, "3840×2160 (4K)"},
}

// StopConditions são as condições de parada (várias podem estar ativas).
type StopConditions struct {
	Continuous   bool     `json:"continuous"`
	PirateToken  bool     `json:"pirateToken"`
	GoldSkin     bool     `json:"goldSkin"`
	Elemental    bool     `json:"elemental"`
	SelectedRare bool     `json:"selectedRare"`
	SelectedIDs  []string `json:"selectedIds"`  // templates de recompensa escolhidos
	IncludeSquad bool     `json:"includeSquad"` // considerar itens encontrados por outros integrantes
	ChestLimit   int      `json:"chestLimit"`
	MatchLimit   int      `json:"matchLimit"`
	TimeLimitMin int      `json:"timeLimitMin"`
}

// Hotkeys são os atalhos globais.
type Hotkeys struct {
	Toggle    string `json:"toggle"`
	Emergency string `json:"emergency"`
	Chest     string `json:"chest"`
	Reward    string `json:"reward"`
}

// Settings são todas as configurações persistidas.
type Settings struct {
	Version       int     `json:"version"`
	Profile       string  `json:"profile"`
	ScanFPS       float64 `json:"scanFps"` // 0 = usar o padrão do perfil
	ConfirmFrames int     `json:"confirmFrames"`
	AutoScale     bool    `json:"autoScale"`

	ResolutionMode string `json:"resolutionMode"` // auto | preset | custom
	ResolutionW    int    `json:"resolutionW"`
	ResolutionH    int    `json:"resolutionH"`
	DisplayMode    string `json:"displayMode"` // auto | tela_cheia | sem_bordas | janela
	Monitor        int    `json:"monitor"`

	SoundEnabled         bool    `json:"soundEnabled"`
	SoundVolume          float64 `json:"soundVolume"`
	WindowsNotifications bool    `json:"windowsNotifications"`
	CapturesDir          string  `json:"capturesDir"`
	SaveUncertain        bool    `json:"saveUncertain"`

	Hotkeys          Hotkeys `json:"hotkeys"`
	StartWithWindows bool    `json:"startWithWindows"`
	MinimizeToTray   bool    `json:"minimizeToTray"`
	ReduceEffects    bool    `json:"reduceEffects"`
	WindowGlass      bool    `json:"windowGlass"`
	AutoLaunch       bool    `json:"autoLaunch"`

	Objective string         `json:"objective"`
	Stop      StopConditions `json:"stop"`
}

// Defaults devolve as configurações iniciais.
func Defaults(capturesDir string) Settings {
	return Settings{
		Version: 1, Profile: ProfileBalanced, AutoScale: true,
		ResolutionMode: "auto", ResolutionW: 1920, ResolutionH: 1080, DisplayMode: "auto",
		SoundEnabled: true, SoundVolume: 0.6, WindowsNotifications: true, CapturesDir: capturesDir, SaveUncertain: true,
		Hotkeys:        Hotkeys{Toggle: "Ctrl+Alt+F9", Emergency: "Ctrl+Alt+F12", Chest: "Ctrl+Alt+F10", Reward: "Ctrl+Alt+F11"},
		MinimizeToTray: true, WindowGlass: true,
		Objective: "token_pirata",
		Stop:      StopConditions{PirateToken: true, IncludeSquad: true},
	}
}

// Objectives disponíveis.
var Objectives = map[string]string{
	"token_pirata": "Token da Loja Pirata", "skin_dourada": "Skins douradas", "elemental": "Itens elementais",
	"raro": "Itens raros", "baus": "Abrir o máximo de baús",
}

// Normalize corrige valores fora do intervalo.
func (s *Settings) Normalize(capturesDir string) {
	switch s.Profile {
	case ProfileEco, ProfileBalanced, ProfileMax:
	default:
		s.Profile = ProfileBalanced
	}
	if s.ScanFPS < 0 {
		s.ScanFPS = 0
	}
	if s.ScanFPS > 10 {
		s.ScanFPS = 10
	}
	if s.ConfirmFrames < 0 || s.ConfirmFrames > 6 {
		s.ConfirmFrames = 0
	}
	switch s.ResolutionMode {
	case "auto", "preset", "custom":
	default:
		s.ResolutionMode = "auto"
	}
	if s.ResolutionW < 640 || s.ResolutionW > 7680 || s.ResolutionH < 480 || s.ResolutionH > 4320 {
		s.ResolutionW, s.ResolutionH = 1920, 1080
	}
	switch s.DisplayMode {
	case "auto", "tela_cheia", "sem_bordas", "janela":
	default:
		s.DisplayMode = "auto"
	}
	if s.Monitor < 0 {
		s.Monitor = 0
	}
	if s.SoundVolume < 0 || s.SoundVolume > 1 {
		s.SoundVolume = 0.6
	}
	if strings.TrimSpace(s.CapturesDir) == "" {
		s.CapturesDir = capturesDir
	}
	if _, ok := Objectives[s.Objective]; !ok {
		s.Objective = "token_pirata"
	}
	for _, p := range []*int{&s.Stop.ChestLimit, &s.Stop.MatchLimit, &s.Stop.TimeLimitMin} {
		if *p < 0 {
			*p = 0
		}
	}
}

// EffectiveFPS devolve a frequência de análise em uso.
func (s Settings) EffectiveFPS() float64 {
	if s.ScanFPS > 0 {
		return s.ScanFPS
	}
	return Params(s.Profile).FPS
}

// EffectiveConfirm devolve os quadros de confirmação em uso.
func (s Settings) EffectiveConfirm() int {
	if s.ConfirmFrames > 0 {
		return s.ConfirmFrames
	}
	return Params(s.Profile).ConfirmFrames
}

// Load lê o arquivo; se não existir, devolve os padrões.
func Load(path, capturesDir string) (Settings, error) {
	s := Defaults(capturesDir)
	b, err := os.ReadFile(path)
	if errors.Is(err, os.ErrNotExist) {
		return s, nil
	}
	if err != nil {
		return s, err
	}
	if err := json.Unmarshal(b, &s); err != nil {
		// Arquivo corrompido: preserva uma cópia e volta aos padrões.
		_ = os.Rename(path, path+".corrompido")
		return Defaults(capturesDir), fmt.Errorf("configurações corrompidas foram redefinidas: %w", err)
	}
	s.Normalize(capturesDir)
	return s, nil
}

// Save grava de forma atômica.
func Save(path string, s Settings) error {
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		return err
	}
	b, err := json.MarshalIndent(s, "", "  ")
	if err != nil {
		return err
	}
	tmp := path + ".tmp"
	if err := os.WriteFile(tmp, b, 0o644); err != nil {
		return err
	}
	return os.Rename(tmp, path)
}
