// Package app é o orquestrador: liga captura, visão, máquina de estados, recompensas,
// armazenamento e configurações, e expõe a API usada pela interface.
package app

import (
	"context"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"runtime"
	"runtime/debug"
	"sync"
	"time"

	wr "github.com/wailsapp/wails/v2/pkg/runtime"

	"treasurehunter/internal/capture"
	"treasurehunter/internal/config"
	"treasurehunter/internal/state"
	"treasurehunter/internal/storage"
	"treasurehunter/internal/vision"
	"treasurehunter/internal/winsys"
)

// Version do aplicativo.
const Version = "1.0.0"

// Status da operação.
const (
	OpStopped = "parado"
	OpRunning = "executando"
	OpPaused  = "pausado"
)

// Paths são os diretórios de dados.
type Paths struct {
	Data, Templates, Calib, Logs, DefaultCaptures string
}

// DefaultPaths usa %APPDATA%\TreasureHunter e Imagens\Treasure Hunter.
func DefaultPaths() Paths {
	base, err := os.UserConfigDir()
	if err != nil {
		base = "."
	}
	data := filepath.Join(base, "TreasureHunter")
	home, _ := os.UserHomeDir()
	return Paths{Data: data, Templates: filepath.Join(data, "templates"), Calib: filepath.Join(data, "calibracao"),
		Logs: filepath.Join(data, "logs"), DefaultCaptures: filepath.Join(home, "Pictures", "Treasure Hunter")}
}

type persisted struct {
	Total      Counters        `json:"total"`
	LastReward *storage.Reward `json:"lastReward,omitempty"`
	MatchSeq   int             `json:"matchSeq"`
}

// App é a instância ligada à interface (métodos exportados viram API em JavaScript).
type App struct {
	ctx   context.Context
	paths Paths

	mu        sync.Mutex
	settings  config.Settings
	op        string
	opStarted time.Time
	opAccum   time.Duration // tempo acumulado da sessão (sem pausas)
	session   Counters
	total     Counters
	lastRew   *storage.Reward
	stopMsg   string

	lib      *vision.Library
	det      *vision.Detector
	machine  *state.Machine
	dedup    *state.RewardDeduper
	activity *storage.ActivityLog
	rewards  *storage.RewardStore
	log      *storage.Logger
	capt     *capture.Capturer
	meter    *winsys.UsageMeter
	tray     *winsys.Tray

	// Estado do jogo (atualizado pelo loop).
	gameRunning bool
	gamePID     uint32
	gameWin     winsys.GameWindow
	region      captureRegion
	blankFrames int

	perf     perfStats
	usage    winsys.Usage
	hkErrors map[string]string

	calibMu    sync.Mutex
	calibFrame *vision.Frame
	calibSmall *vision.Small
	pending    *pendingCapture
	uncertain  map[string]string // chave de deduplicação -> id da recompensa não confirmada

	lastEmit time.Time
	wake     chan struct{}
	quit     chan struct{}
	quitting bool
	visible  bool
}

type captureRegion struct {
	X      int    `json:"x"`
	Y      int    `json:"y"`
	W      int    `json:"w"`
	H      int    `json:"h"`
	Source string `json:"source"`
}

type perfStats struct {
	AnalyzeMs, CaptureMs, DownscaleMs float64
	Frames, Skipped                   int
	Scanned                           float64
	LastFrame                         time.Time
	EffectiveFPS                      float64
}

type pendingCapture struct {
	ID    string
	Frame *vision.Frame
	At    time.Time
	Match int
}

// New cria o App e carrega todo o estado persistido.
func New(paths Paths) *App {
	a := &App{paths: paths, op: OpStopped, wake: make(chan struct{}, 1), quit: make(chan struct{}), visible: true, hkErrors: map[string]string{}, uncertain: map[string]string{}}
	for _, d := range []string{paths.Data, paths.Templates, paths.Calib, paths.Logs} {
		_ = os.MkdirAll(d, 0o755)
	}
	a.log = storage.NewLogger(filepath.Join(paths.Logs, "diagnostico.log"))
	a.log.Printf("Treasure Hunter %s iniciando (%s/%s)", Version, runtime.GOOS, runtime.GOARCH)
	s, err := config.Load(a.settingsPath(), paths.DefaultCaptures)
	if err != nil {
		a.log.Printf("configurações: %v", err)
	}
	a.settings = s
	lib, err := vision.NewLibrary(paths.Templates)
	if err != nil {
		a.log.Printf("templates: %v", err)
		lib, _ = vision.NewLibrary(filepath.Join(os.TempDir(), "treasurehunter-templates"))
	}
	a.lib = lib
	a.det = &vision.Detector{Lib: lib, AutoScale: s.AutoScale}
	a.machine = state.New(a.machineConfig(), time.Now())
	a.dedup = state.NewRewardDeduper(90 * time.Second)
	a.activity = storage.OpenActivity(filepath.Join(paths.Data, "atividades.jsonl"), 300)
	a.rewards, err = storage.OpenRewards(filepath.Join(paths.Data, "tesouros.json"))
	if err != nil {
		a.log.Printf("galeria: %v", err)
	}
	var p persisted
	if err := storage.ReadJSON(a.statsPath(), &p); err != nil {
		a.log.Printf("estatísticas: %v", err)
	}
	a.total, a.lastRew = p.Total, p.LastReward
	a.machine.MatchSeq = p.MatchSeq
	a.capt = capture.New()
	// Limita o heap do Go: o app precisa de pouca memória e assim o GC trabalha cedo.
	debug.SetMemoryLimit(160 << 20)
	return a
}

func (a *App) settingsPath() string { return filepath.Join(a.paths.Data, "configuracoes.json") }
func (a *App) statsPath() string    { return filepath.Join(a.paths.Data, "estatisticas.json") }

func (a *App) machineConfig() state.Config {
	c := state.DefaultConfig()
	c.ConfirmFrames = a.settings.EffectiveConfirm()
	c.HasChestOpened = a.lib.Has(vision.TargetChestOpened)
	c.HasModeTemplate = a.lib.Has(vision.TargetMode)
	return c
}

// OnStartup devolve a função chamada pelo Wails quando a janela está pronta.
// (Funções de ciclo de vida ficam fora dos métodos exportados para não virarem API da interface.)
func OnStartup(a *App) func(context.Context) { return a.startup }

// OnShutdown devolve a função de encerramento.
func OnShutdown(a *App) func(context.Context) { return a.shutdown }

func (a *App) startup(ctx context.Context) {
	a.ctx = ctx
	a.meter = winsys.NewUsageMeter()
	tray, err := winsys.StartTray("Treasure Hunter — parado", a.onCommand)
	if err != nil {
		a.log.Printf("bandeja: %v", err)
	}
	a.tray = tray
	a.applyHotkeys()
	if a.settings.StartWithWindows {
		if exe, err := os.Executable(); err == nil {
			_ = winsys.SetAutostart(true, exe)
		}
	}
	go a.loop()
	go a.usageLoop()
}

func (a *App) shutdown(ctx context.Context) {
	a.mu.Lock()
	if a.op != OpStopped {
		a.stopLocked("Aplicativo encerrado")
	}
	a.quitting = true
	a.mu.Unlock()
	close(a.quit)
	a.saveStats()
	a.tray.Close()
	if a.meter != nil {
		a.meter.Close()
	}
	a.capt.Close()
	a.log.Printf("encerrado")
}

func (a *App) onCommand(c winsys.TrayCommand) {
	switch c {
	case winsys.CmdShow:
		a.ShowWindow()
	case winsys.CmdToggle:
		a.mu.Lock()
		op := a.op
		a.mu.Unlock()
		switch op {
		case OpRunning:
			a.PauseOperation()
		case OpPaused:
			a.ResumeOperation()
		default:
			_ = a.StartOperation()
		}
	case winsys.CmdEmergency:
		a.EmergencyStop()
	case winsys.CmdChest:
		_ = a.RegisterManualChest()
	case winsys.CmdReward:
		if p, err := a.CaptureForManualReward(); err == nil {
			a.emit("fth:manualPending", p)
			a.tray.Notify("Captura guardada", "Abra o Treasure Hunter para informar o item encontrado.", false)
		}
	case winsys.CmdQuit:
		a.Quit()
	}
}

func (a *App) applyHotkeys() {
	a.mu.Lock()
	hk := a.settings.Hotkeys
	a.mu.Unlock()
	want := map[winsys.TrayCommand]winsys.Hotkey{}
	errs := map[string]string{}
	for cmd, txt := range map[winsys.TrayCommand]string{winsys.CmdToggle: hk.Toggle, winsys.CmdEmergency: hk.Emergency, winsys.CmdChest: hk.Chest, winsys.CmdReward: hk.Reward} {
		if txt == "" {
			continue
		}
		h, err := winsys.ParseHotkey(txt)
		if err != nil {
			errs[string(cmd)] = err.Error()
			continue
		}
		want[cmd] = h
	}
	for cmd, err := range a.tray.SetHotkeys(want) {
		errs[string(cmd)] = err.Error()
	}
	a.mu.Lock()
	a.hkErrors = errs
	a.mu.Unlock()
	for k, v := range errs {
		a.log.Printf("atalho %s: %s", k, v)
	}
}

// ---------- Controle da operação ----------

func (a *App) addActivity(kind, level, text string, match int) {
	it := storage.Activity{At: time.Now(), Kind: kind, Level: level, Text: text, Match: match}
	a.activity.Add(it)
	a.emit("fth:activity", it)
}

// StartOperation inicia (ou reinicia) o monitoramento.
func (a *App) StartOperation() error {
	a.mu.Lock()
	if a.op == OpRunning {
		a.mu.Unlock()
		return nil
	}
	if a.op == OpPaused {
		a.mu.Unlock()
		a.ResumeOperation()
		return nil
	}
	if len(a.lib.List()) == 0 {
		a.mu.Unlock()
		return errors.New("calibre ao menos os elementos principais (Lobby e Partida) na aba Visão antes de iniciar")
	}
	a.op = OpRunning
	a.opStarted = time.Now()
	a.opAccum = 0
	a.session = Counters{}
	a.stopMsg = ""
	a.dedup.Reset()
	a.uncertain = map[string]string{}
	a.machine.SetConfig(a.machineConfig())
	autoLaunch := a.settings.AutoLaunch
	running := a.gameRunning
	a.mu.Unlock()
	a.addActivity("operacao", "ok", "Monitoramento iniciado (modo acompanhamento — sem controle do jogo)", 0)
	a.log.Printf("operação iniciada")
	if autoLaunch && !running {
		if _, ok := winsys.FindProcess([]string{winsys.FortniteProcess}); !ok {
			if err := winsys.LaunchFortnite(); err == nil {
				a.addActivity("launcher", "info", "Fortnite solicitado ao Epic Games Launcher", 0)
			} else {
				a.addActivity("launcher", "aviso", err.Error(), 0)
			}
		}
	}
	a.poke()
	a.emitUpdate(true)
	return nil
}

// PauseOperation pausa sem perder a sessão.
func (a *App) PauseOperation() {
	a.mu.Lock()
	if a.op != OpRunning {
		a.mu.Unlock()
		return
	}
	a.opAccum += time.Since(a.opStarted)
	a.op = OpPaused
	a.mu.Unlock()
	a.addActivity("operacao", "info", "Monitoramento pausado", 0)
	a.emitUpdate(true)
}

// ResumeOperation retoma após pausa.
func (a *App) ResumeOperation() {
	a.mu.Lock()
	if a.op != OpPaused {
		a.mu.Unlock()
		return
	}
	a.op = OpRunning
	a.opStarted = time.Now()
	a.mu.Unlock()
	a.addActivity("operacao", "ok", "Monitoramento retomado", 0)
	a.poke()
	a.emitUpdate(true)
}

// StopOperation encerra a operação.
func (a *App) StopOperation() {
	a.mu.Lock()
	if a.op == OpStopped {
		a.mu.Unlock()
		return
	}
	a.stopLocked("Encerrado pelo usuário")
	a.mu.Unlock()
	a.addActivity("operacao", "info", "Monitoramento encerrado", 0)
	a.saveStats()
	a.emitUpdate(true)
}

// EmergencyStop interrompe imediatamente qualquer operação.
func (a *App) EmergencyStop() {
	a.mu.Lock()
	was := a.op
	if a.op != OpStopped {
		a.stopLocked("Parada de emergência")
	}
	a.mu.Unlock()
	a.addActivity("emergencia", "erro", "PARADA DE EMERGÊNCIA acionada — todas as operações interrompidas", 0)
	a.log.Printf("parada de emergência (estado anterior: %s)", was)
	a.saveStats()
	a.emit("fth:alert", map[string]any{"kind": "emergency", "title": "Parada de emergência", "message": "Todas as operações foram interrompidas."})
	a.emitUpdate(true)
}

func (a *App) stopLocked(reason string) {
	if a.op == OpRunning {
		a.opAccum += time.Since(a.opStarted)
	}
	a.session.OperationSeconds = a.opAccum.Seconds()
	a.total.OperationSeconds += a.opAccum.Seconds()
	a.opAccum = 0
	a.op = OpStopped
	a.stopMsg = reason
	a.machine.Force(state.Idle, time.Now())
}

func (a *App) elapsedLocked() time.Duration {
	d := a.opAccum
	if a.op == OpRunning {
		d += time.Since(a.opStarted)
	}
	return d
}

func (a *App) poke() {
	select {
	case a.wake <- struct{}{}:
	default:
	}
}

func (a *App) saveStats() {
	a.mu.Lock()
	p := persisted{Total: a.total, LastReward: a.lastRew, MatchSeq: a.machine.MatchSeq}
	a.mu.Unlock()
	if err := storage.WriteJSON(a.statsPath(), p); err != nil {
		a.log.Printf("salvar estatísticas: %v", err)
	}
}

// ---------- Janela ----------

// ShowWindow traz a janela do app de volta (da bandeja).
func (a *App) ShowWindow() {
	if a.ctx == nil {
		return
	}
	wr.WindowShow(a.ctx)
	wr.WindowUnminimise(a.ctx)
	a.mu.Lock()
	a.visible = true
	a.mu.Unlock()
	a.emitUpdate(true)
}

// HideToTray esconde a janela; o monitoramento continua em segundo plano.
func (a *App) HideToTray() {
	if a.ctx == nil {
		return
	}
	if a.tray == nil {
		wr.WindowMinimise(a.ctx) // sem bandeja disponível: apenas minimiza
		return
	}
	wr.WindowHide(a.ctx)
	a.mu.Lock()
	a.visible = false
	a.mu.Unlock()
	a.tray.Notify("Treasure Hunter continua ativo", "O monitoramento segue na bandeja. Clique no ícone para abrir.", false)
}

// CloseRequested decide entre bandeja ou sair (botão fechar da barra de título).
func (a *App) CloseRequested() {
	a.mu.Lock()
	toTray := a.settings.MinimizeToTray && a.tray != nil
	a.mu.Unlock()
	if toTray {
		a.HideToTray()
		return
	}
	a.Quit()
}

// Quit encerra o aplicativo.
func (a *App) Quit() {
	if a.ctx != nil {
		wr.Quit(a.ctx)
	}
}

// SetVisible é chamado pela interface (visibilitychange) para reduzir trabalho quando oculta.
func (a *App) SetVisible(v bool) {
	a.mu.Lock()
	a.visible = v
	a.mu.Unlock()
}

// ---------- Eventos ----------

func (a *App) emit(name string, data any) {
	if a.ctx == nil {
		return
	}
	wr.EventsEmit(a.ctx, name, data)
}

// emitUpdate envia o painel em tempo real (no máximo 4 por segundo, exceto se forçado).
func (a *App) emitUpdate(force bool) {
	a.mu.Lock()
	if !force && (time.Since(a.lastEmit) < 250*time.Millisecond || !a.visible) {
		a.mu.Unlock()
		return
	}
	a.lastEmit = time.Now()
	a.mu.Unlock()
	a.emit("fth:update", a.Live())
	a.updateTooltip()
}

func (a *App) updateTooltip() {
	a.mu.Lock()
	op := a.op
	st := state.Labels[a.machine.State()]
	a.mu.Unlock()
	label := map[string]string{OpRunning: "monitorando", OpPaused: "pausado", OpStopped: "parado"}[op]
	a.tray.SetTooltip(fmt.Sprintf("Treasure Hunter — %s\n%s", label, st))
}
