package app

import (
	"encoding/csv"
	"errors"
	"fmt"
	"image"
	_ "image/jpeg" // decodificação para calibração por arquivo
	_ "image/png"
	"io"
	"os"
	"path/filepath"
	"runtime"
	"sort"
	"strings"
	"time"

	wr "github.com/wailsapp/wails/v2/pkg/runtime"

	"treasurehunter/internal/config"
	"treasurehunter/internal/state"
	"treasurehunter/internal/storage"
	"treasurehunter/internal/vision"
	"treasurehunter/internal/winsys"
)

// LiveData é o estado em tempo real enviado ao painel.
type LiveData struct {
	Op           string            `json:"op"`
	State        string            `json:"state"`
	StateLabel   string            `json:"stateLabel"`
	StateSince   time.Time         `json:"stateSince"`
	MatchSeq     int               `json:"matchSeq"`
	MatchActive  bool              `json:"matchActive"`
	GameRunning  bool              `json:"gameRunning"`
	GameWindow   winsys.GameWindow `json:"gameWindow"`
	Region       captureRegion     `json:"region"`
	Session      CounterView       `json:"session"`
	Total        CounterView       `json:"total"`
	Elapsed      float64           `json:"elapsed"`
	TotalSeconds float64           `json:"totalSeconds"`
	LastReward   *storage.Reward   `json:"lastReward"`
	StopMsg      string            `json:"stopMsg"`
	Objective    string            `json:"objective"`
	ObjectiveTxt string            `json:"objectiveLabel"`
	Perf         PerfView          `json:"perf"`
	Usage        winsys.Usage      `json:"usage"`
	Calibrated   map[string]int    `json:"calibrated"`
	BlankCapture bool              `json:"blankCapture"`
}

// CounterView inclui os campos calculados.
type CounterView struct {
	Counters
	Chests    int     `json:"chests"`
	AvgChests float64 `json:"avgChests"`
}

// PerfView são as métricas de desempenho do reconhecimento.
type PerfView struct {
	AnalyzeMs   float64 `json:"analyzeMs"`
	CaptureMs   float64 `json:"captureMs"`
	DownscaleMs float64 `json:"downscaleMs"`
	FPS         float64 `json:"fps"`
	TargetFPS   float64 `json:"targetFps"`
	Frames      int     `json:"frames"`
	SkippedPct  float64 `json:"skippedPct"`
	Templates   float64 `json:"templates"`
	HeapMB      float64 `json:"heapMb"`
	Goroutines  int     `json:"goroutines"`
}

func view(c Counters) CounterView {
	return CounterView{Counters: c, Chests: c.Chests(), AvgChests: c.AvgChests()}
}

// Live devolve o estado atual.
func (a *App) Live() LiveData {
	var m runtime.MemStats
	runtime.ReadMemStats(&m)
	cal := map[string]int{}
	for _, t := range a.lib.List() {
		cal[string(t.Target)]++
	}
	a.mu.Lock()
	defer a.mu.Unlock()
	sess := a.session
	sess.OperationSeconds = a.elapsedLocked().Seconds()
	st := a.machine.State()
	p := a.perf
	skipped := 0.0
	if p.Frames > 0 {
		skipped = float64(p.Skipped) / float64(p.Frames) * 100
	}
	return LiveData{
		Op: a.op, State: string(st), StateLabel: state.Labels[st], StateSince: a.machine.Since(),
		MatchSeq: a.machine.MatchSeq, MatchActive: a.machine.MatchActive(),
		GameRunning: a.gameRunning, GameWindow: a.gameWin, Region: a.region,
		Session: view(sess), Total: view(a.total), Elapsed: sess.OperationSeconds,
		TotalSeconds: a.total.OperationSeconds + sess.OperationSeconds*boolF(a.op != OpStopped),
		LastReward:   a.lastRew, StopMsg: a.stopMsg, Objective: a.settings.Objective, ObjectiveTxt: config.Objectives[a.settings.Objective],
		Perf: PerfView{AnalyzeMs: p.AnalyzeMs, CaptureMs: p.CaptureMs, DownscaleMs: p.DownscaleMs, FPS: p.EffectiveFPS,
			TargetFPS: a.settings.EffectiveFPS(), Frames: p.Frames, SkippedPct: skipped, Templates: p.Scanned,
			HeapMB: float64(m.HeapAlloc) / (1 << 20), Goroutines: runtime.NumGoroutine()},
		Usage: a.usage, Calibrated: cal, BlankCapture: a.blankFrames >= 5,
	}
}

func boolF(b bool) float64 {
	if b {
		return 1
	}
	return 0
}

// Snapshot devolve tudo o que a interface precisa ao abrir.
type Snapshot struct {
	Version     string              `json:"version"`
	Live        LiveData            `json:"live"`
	Settings    config.Settings     `json:"settings"`
	Activity    []storage.Activity  `json:"activity"`
	Templates   []TemplateView      `json:"templates"`
	Monitors    []winsys.Monitor    `json:"monitors"`
	Resolutions []config.Resolution `json:"resolutions"`
	Objectives  map[string]string   `json:"objectives"`
	Targets     []TargetInfo        `json:"targets"`
	Translucent bool                `json:"translucent"`
	HotkeyErr   map[string]string   `json:"hotkeyErrors"`
	Pending     *PendingView        `json:"pending"`
	DataDir     string              `json:"dataDir"`
	Platform    string              `json:"platform"`
}

// TargetInfo descreve um alvo de calibração.
type TargetInfo struct {
	ID       string `json:"id"`
	Label    string `json:"label"`
	Hint     string `json:"hint"`
	Required bool   `json:"required"`
}

// Targets com instruções de calibração.
var Targets = []TargetInfo{
	{"lobby", "Lobby", "Um elemento fixo do lobby, como o botão JOGAR.", true},
	{"modo_correto", "Modo correto", "O nome do modo quando 'Sem Construção — Squad' está selecionado.", false},
	{"fila", "Procurando partida", "O indicador de matchmaking exibido após clicar em JOGAR.", false},
	{"carregando", "Carregamento", "Um elemento da tela de carregamento (ex.: dica ou barra).", false},
	{"partida", "Em partida (HUD)", "Um elemento do HUD sempre visível em jogo, como o ícone do minimapa ou a barra de vida.", true},
	{"espectando", "Espectando", "O aviso exibido ao assistir um colega depois de ser eliminado.", false},
	{"squad_eliminado", "Squad eliminado", "A tela/placa de colocação exibida quando todo o Squad cai.", true},
	{"vitoria", "Vitória Royale", "O letreiro de Vitória Royale.", false},
	{"erro", "Erro / desconexão", "A caixa de mensagem de erro ou desconexão.", false},
	{"bau_prompt", "Aviso de baú", "O aviso de interação que aparece ao mirar em um baú.", false},
	{"bau_aberto", "Baú aberto (confirmação)", "Algo que só aparece ao abrir um baú, para confirmar a contagem.", false},
	{"recompensa", "Recompensa especial", "O ícone/nome do item na notificação (sua ou do Squad).", false},
	{"integrante", "Nome de integrante", "O nome de um colega como aparece no feed do Squad (para saber quem encontrou).", false},
}

// TemplateView é o template exibido na calibração.
type TemplateView struct {
	vision.TemplateMeta
	Preview string `json:"preview"`
}

// PendingView é uma captura aguardando os dados da recompensa manual.
type PendingView struct {
	ID      string    `json:"id"`
	At      time.Time `json:"at"`
	Match   int       `json:"match"`
	Preview string    `json:"preview"`
}

// GetSnapshot devolve o estado completo para a interface.
func (a *App) GetSnapshot() Snapshot {
	a.mu.Lock()
	s := a.settings
	hk := map[string]string{}
	for k, v := range a.hkErrors {
		hk[k] = v
	}
	var pv *PendingView
	if a.pending != nil {
		pv = &PendingView{ID: a.pending.ID, At: a.pending.At, Match: a.pending.Match, Preview: "/media/calibracao/" + a.pending.ID + ".jpg"}
	}
	a.mu.Unlock()
	return Snapshot{Version: Version, Live: a.Live(), Settings: s, Activity: a.activity.Recent(120), Templates: a.templateViews(),
		Monitors: winsys.Monitors(), Resolutions: config.Resolutions, Objectives: config.Objectives, Targets: Targets,
		Translucent: Translucent, HotkeyErr: hk, Pending: pv, DataDir: a.paths.Data, Platform: runtime.GOOS}
}

// Translucent é definido em main conforme o vidro nativo do Windows foi ativado.
var Translucent bool

func (a *App) templateViews() []TemplateView {
	var out []TemplateView
	for _, t := range a.lib.List() {
		out = append(out, TemplateView{TemplateMeta: t, Preview: "/media/templates/" + t.ID + ".png"})
	}
	return out
}

// GetActivity devolve o histórico.
func (a *App) GetActivity(n int) []storage.Activity {
	if n <= 0 || n > 300 {
		n = 300
	}
	return a.activity.Recent(n)
}

// ClearActivity apaga o histórico de atividades.
func (a *App) ClearActivity() error { return a.activity.Clear() }

// ResetTotals zera as estatísticas acumuladas (a galeria é mantida).
func (a *App) ResetTotals() {
	a.mu.Lock()
	a.total = Counters{}
	a.lastRew = nil
	a.mu.Unlock()
	a.saveStats()
	a.addActivity("estatisticas", "info", "Estatísticas totais zeradas", 0)
	a.emitUpdate(true)
}

// ---------- Configurações ----------

// SaveSettings valida e salva as configurações.
func (a *App) SaveSettings(s config.Settings) (config.Settings, error) {
	s.Normalize(a.paths.DefaultCaptures)
	if err := os.MkdirAll(s.CapturesDir, 0o755); err != nil {
		return s, fmt.Errorf("não foi possível usar a pasta de capturas: %w", err)
	}
	a.mu.Lock()
	old := a.settings
	a.settings = s
	a.det.AutoScale = s.AutoScale
	a.machine.SetConfig(a.machineConfig())
	a.mu.Unlock()
	if err := config.Save(a.settingsPath(), s); err != nil {
		return s, err
	}
	if old.Hotkeys != s.Hotkeys {
		a.applyHotkeys()
	}
	if old.StartWithWindows != s.StartWithWindows {
		exe, _ := os.Executable()
		if err := winsys.SetAutostart(s.StartWithWindows, exe); err != nil {
			a.log.Printf("autostart: %v", err)
			return s, fmt.Errorf("configurações salvas, mas a inicialização com o Windows falhou: %w", err)
		}
	}
	a.poke()
	a.emitUpdate(true)
	return s, nil
}

// GetHotkeyErrors devolve os atalhos que não puderam ser registrados.
func (a *App) GetHotkeyErrors() map[string]string {
	a.mu.Lock()
	defer a.mu.Unlock()
	out := map[string]string{}
	for k, v := range a.hkErrors {
		out[k] = v
	}
	return out
}

// ChooseCapturesDir abre o seletor de pasta.
func (a *App) ChooseCapturesDir() (string, error) {
	a.mu.Lock()
	cur := a.settings.CapturesDir
	a.mu.Unlock()
	return wr.OpenDirectoryDialog(a.ctx, wr.OpenDialogOptions{Title: "Pasta das capturas de tesouros", DefaultDirectory: cur})
}

// OpenCapturesFolder abre a pasta no Explorer.
func (a *App) OpenCapturesFolder() error {
	a.mu.Lock()
	d := a.settings.CapturesDir
	a.mu.Unlock()
	_ = os.MkdirAll(d, 0o755)
	return winsys.OpenPath(d)
}

// OpenLogsFolder abre a pasta de logs.
func (a *App) OpenLogsFolder() error { return winsys.OpenPath(a.paths.Logs) }

// LaunchFortnite abre o jogo pelo launcher oficial.
func (a *App) LaunchFortnite() error {
	if _, ok := winsys.FindProcess([]string{winsys.FortniteProcess}); ok {
		return errors.New("o Fortnite já está aberto")
	}
	if err := winsys.LaunchFortnite(); err != nil {
		return err
	}
	a.addActivity("launcher", "info", "Fortnite solicitado ao Epic Games Launcher", 0)
	return nil
}

// VideoInfo é o resultado da detecção automática de vídeo.
type VideoInfo struct {
	Game         winsys.GameSettings `json:"game"`
	Window       winsys.GameWindow   `json:"window"`
	Monitors     []winsys.Monitor    `json:"monitors"`
	Region       captureRegion       `json:"region"`
	Running      bool                `json:"running"`
	Detected     string              `json:"detected"`
	Warnings     []string            `json:"warnings"`
	CalibratedAt []string            `json:"calibratedAt"`
}

// DetectVideo detecta resolução, modo de exibição e escala do Fortnite.
func (a *App) DetectVideo() VideoInfo {
	a.mu.Lock()
	s := a.settings
	a.mu.Unlock()
	a.checkGame(s)
	gs := winsys.ReadGameSettings(winsys.GameSettingsPath())
	a.mu.Lock()
	vi := VideoInfo{Game: gs, Window: a.gameWin, Region: a.region, Running: a.gameRunning, Monitors: winsys.Monitors()}
	a.mu.Unlock()
	switch {
	case vi.Window.Found && !vi.Window.Minimized:
		vi.Detected = fmt.Sprintf("%d×%d (janela do jogo)", vi.Window.W, vi.Window.H)
	case gs.Found:
		vi.Detected = fmt.Sprintf("%d×%d (configuração do Fortnite)", gs.ResX, gs.ResY)
	default:
		vi.Detected = "Não detectada — abra o Fortnite ou escolha manualmente"
	}
	if gs.FullscreenMode == 0 {
		vi.Warnings = append(vi.Warnings, "O Fortnite está em tela cheia exclusiva: a captura pode ficar preta. Prefira \"Janela sem bordas\".")
	}
	if vi.Window.Minimized {
		vi.Warnings = append(vi.Warnings, "A janela do Fortnite está minimizada; o reconhecimento fica em espera até ela voltar.")
	}
	seen := map[string]bool{}
	for _, t := range a.lib.List() {
		k := fmt.Sprintf("%d×%d", t.SourceW, t.SourceH)
		if t.SourceW > 0 && !seen[k] {
			seen[k] = true
			vi.CalibratedAt = append(vi.CalibratedAt, k)
		}
	}
	sort.Strings(vi.CalibratedAt)
	if vi.Region.W > 0 && len(vi.CalibratedAt) > 0 {
		cur := fmt.Sprintf("%d×%d", vi.Region.W, vi.Region.H)
		if !seen[cur] {
			if s.AutoScale {
				vi.Warnings = append(vi.Warnings, "A calibração foi feita em "+strings.Join(vi.CalibratedAt, ", ")+"; o ajuste automático de escala está compensando a diferença para "+cur+".")
			} else {
				vi.Warnings = append(vi.Warnings, "A calibração foi feita em outra resolução. Ative o ajuste automático de escala ou recalibre em "+cur+".")
			}
		}
	}
	return vi
}

// ---------- Calibração e testes de reconhecimento ----------

// CalibFrame é a captura usada para calibrar.
type CalibFrame struct {
	Preview string `json:"preview"`
	W       int    `json:"w"`
	H       int    `json:"h"`
	Source  string `json:"source"`
	Blank   bool   `json:"blank"`
}

// CalibCapture captura a tela atual do jogo para calibração/pré-visualização.
func (a *App) CalibCapture() (CalibFrame, error) {
	a.mu.Lock()
	s := a.settings
	a.mu.Unlock()
	a.checkGame(s)
	a.mu.Lock()
	reg := a.region
	a.mu.Unlock()
	f, err := a.capt.Grab(reg.X, reg.Y, reg.W, reg.H)
	if err != nil {
		return CalibFrame{}, err
	}
	return a.setCalib(f.Clone(), reg.Source)
}

// CalibFromFile usa uma captura salva (PNG/JPG) para calibrar — útil para capturas feitas
// durante o jogo com Win+PrintScreen.
func (a *App) CalibFromFile() (CalibFrame, error) {
	p, err := wr.OpenFileDialog(a.ctx, wr.OpenDialogOptions{Title: "Escolha uma captura do Fortnite",
		Filters: []wr.FileFilter{{DisplayName: "Imagens (*.png;*.jpg)", Pattern: "*.png;*.jpg;*.jpeg"}}})
	if err != nil || p == "" {
		return CalibFrame{}, err
	}
	return a.CalibFromPath(p)
}

// CalibFromPath carrega uma imagem do disco para calibração.
func (a *App) CalibFromPath(p string) (CalibFrame, error) {
	file, err := os.Open(p)
	if err != nil {
		return CalibFrame{}, err
	}
	defer file.Close()
	img, _, err := image.Decode(file)
	if err != nil {
		return CalibFrame{}, fmt.Errorf("imagem inválida: %w", err)
	}
	return a.setCalib(vision.FrameFromImage(img), "arquivo "+filepath.Base(p))
}

func (a *App) setCalib(f *vision.Frame, source string) (CalibFrame, error) {
	small := vision.Downscale(f, nil)
	name := fmt.Sprintf("previa-%d.jpg", time.Now().UnixNano())
	// Mantém apenas as prévias recentes.
	if old, _ := filepath.Glob(filepath.Join(a.paths.Calib, "previa-*.jpg")); len(old) > 5 {
		sort.Strings(old)
		for _, o := range old[:len(old)-5] {
			_ = os.Remove(o)
		}
	}
	if err := writeJPEG(filepath.Join(a.paths.Calib, name), shrink(f.ToRGBA(), 1600), 88); err != nil {
		return CalibFrame{}, err
	}
	a.calibMu.Lock()
	a.calibFrame, a.calibSmall = f, small
	a.calibMu.Unlock()
	blank := isBlankSmall(small)
	return CalibFrame{Preview: "/media/calibracao/" + name, W: f.W, H: f.H, Source: source, Blank: blank}, nil
}

func isBlankSmall(s *vision.Small) bool {
	var mn, mx uint8 = 255, 0
	for _, v := range s.Gray.Pix {
		if v < mn {
			mn = v
		}
		if v > mx {
			mx = v
		}
	}
	return mx-mn < 3
}

// TemplateRequest são os dados de um novo template.
type TemplateRequest struct {
	Target    string      `json:"target"`
	Label     string      `json:"label"`
	Category  string      `json:"category"`
	Rarity    string      `json:"rarity"`
	Scope     string      `json:"scope"`
	Box       vision.Rect `json:"box"`
	Area      string      `json:"area"` // proxima | coluna | linha | tela
	Threshold float64     `json:"threshold"`
}

// SaveTemplate recorta a seleção da captura de calibração e cria o template.
func (a *App) SaveTemplate(req TemplateRequest) (TemplateView, error) {
	a.calibMu.Lock()
	f, small := a.calibFrame, a.calibSmall
	a.calibMu.Unlock()
	if small == nil {
		return TemplateView{}, errors.New("capture a tela ou abra uma imagem antes de selecionar")
	}
	label := strings.TrimSpace(req.Label)
	if label == "" {
		for _, t := range Targets {
			if t.ID == req.Target {
				label = t.Label
			}
		}
	}
	if len(label) > 60 {
		label = label[:60]
	}
	roi := req.Box.Expand(0.06)
	switch req.Area {
	case "coluna":
		roi = vision.Rect{X: req.Box.X, Y: 0, W: req.Box.W, H: 1}.Expand(0.04)
		roi.Y, roi.H = 0, 1
	case "linha":
		roi = vision.Rect{X: 0, Y: req.Box.Y, W: 1, H: req.Box.H}.Expand(0.03)
		roi.X, roi.W = 0, 1
	case "tela":
		roi = vision.Full
	}
	t, err := a.lib.Add(small, vision.TemplateMeta{Target: vision.Target(req.Target), Label: label, Category: req.Category,
		Rarity: vision.Rarity(req.Rarity), Scope: req.Scope, Box: req.Box, ROI: roi, Threshold: req.Threshold,
		SourceW: f.W, SourceH: f.H})
	if err != nil {
		return TemplateView{}, err
	}
	a.mu.Lock()
	a.machine.SetConfig(a.machineConfig())
	a.mu.Unlock()
	a.addActivity("calibracao", "ok", fmt.Sprintf("Elemento calibrado: %s", t.Label), 0)
	return TemplateView{TemplateMeta: t.TemplateMeta, Preview: "/media/templates/" + t.ID + ".png"}, nil
}

// DeleteTemplate remove um template.
func (a *App) DeleteTemplate(id string) error {
	if err := a.lib.Delete(id); err != nil {
		return err
	}
	a.mu.Lock()
	a.machine.SetConfig(a.machineConfig())
	a.mu.Unlock()
	return nil
}

// SetTemplateThreshold altera o limiar de confiança.
func (a *App) SetTemplateThreshold(id string, thr float64) error {
	return a.lib.UpdateThreshold(id, thr)
}

// ListTemplates devolve os templates.
func (a *App) ListTemplates() []TemplateView { return a.templateViews() }

// TestResult é o resultado do teste de reconhecimento.
type TestResult struct {
	Source     string             `json:"source"`
	Ms         float64            `json:"ms"`
	Detections []vision.Detection `json:"detections"`
	State      string             `json:"state"`
	Frame      *CalibFrame        `json:"frame,omitempty"` // captura usada (teste ao vivo)
}

// TestRecognition roda todos os templates na captura de calibração atual (ou numa captura nova
// se live=true) e devolve a pontuação de cada um.
func (a *App) TestRecognition(live bool) (TestResult, error) {
	src := "captura de calibração"
	var cf *CalibFrame
	if live {
		f, err := a.CalibCapture()
		if err != nil {
			return TestResult{}, err
		}
		cf = &f
		src = "captura ao vivo"
	}
	a.calibMu.Lock()
	small := a.calibSmall
	a.calibMu.Unlock()
	if small == nil {
		return TestResult{}, errors.New("nenhuma captura carregada")
	}
	res := TestResult{Source: src, Frame: cf}
	start := time.Now()
	for _, t := range a.lib.Snapshot() {
		res.Detections = append(res.Detections, a.det.Detect(small, t))
	}
	res.Ms = ms(time.Since(start))
	// Estado que a máquina inferiria desta tela.
	mc := a.machineConfig()
	mc.ConfirmFrames = 1
	m := state.New(mc, time.Now())
	m.Update(a.det.Analyze(small, vision.AllRequest()), time.Now())
	res.State = state.Labels[m.State()]
	return res, nil
}

// ---------- Recompensas (galeria Tesouros) ----------

// RewardView inclui as URLs para a interface.
type RewardView struct {
	storage.Reward
	ImageURL string `json:"imageUrl"`
	ThumbURL string `json:"thumbUrl"`
	Special  bool   `json:"special"`
}

// ListRewards devolve a galeria.
func (a *App) ListRewards() []RewardView {
	list := a.rewards.List()
	out := make([]RewardView, 0, len(list))
	for _, r := range list {
		v := RewardView{Reward: r, Special: IsSpecial(r)}
		if r.Image != "" {
			v.ImageURL = "/media/tesouros/" + r.Image
		}
		if r.Thumb != "" {
			v.ThumbURL = "/media/tesouros/" + r.Thumb
		}
		out = append(out, v)
	}
	return out
}

// DeleteReward remove uma recompensa e seus arquivos.
func (a *App) DeleteReward(id string) error {
	r, err := a.rewards.Delete(id)
	if err != nil {
		return err
	}
	a.mu.Lock()
	dir := a.settings.CapturesDir
	if a.lastRew != nil && a.lastRew.ID == id {
		a.lastRew = nil
	}
	a.mu.Unlock()
	for _, f := range []string{r.Image, r.Thumb} {
		if f != "" {
			_ = os.Remove(filepath.Join(dir, filepath.FromSlash(f)))
		}
	}
	a.saveStats()
	return nil
}

// UpdateReward permite corrigir nome/raridade/categoria de um registro.
func (a *App) UpdateReward(id, name, rarity, category string) error {
	if !vision.ValidRarity(rarity) {
		return errors.New("raridade inválida")
	}
	if category != "" && !vision.ValidCategory(category) {
		return errors.New("categoria inválida")
	}
	_, err := a.rewards.Update(id, func(r *storage.Reward) {
		if n := strings.TrimSpace(name); n != "" {
			r.Name = n
		}
		r.Rarity = rarity
		if category != "" {
			r.Category = category
		}
	})
	return err
}

// ExportReward salva a captura original onde o usuário escolher.
func (a *App) ExportReward(id string) (string, error) {
	r, ok := a.rewards.Get(id)
	if !ok || r.Image == "" {
		return "", errors.New("captura não encontrada")
	}
	a.mu.Lock()
	dir := a.settings.CapturesDir
	a.mu.Unlock()
	def := fmt.Sprintf("%s - partida %d - %s.png", sanitize(r.Name), r.Match, r.At.Format("2006-01-02 15-04-05"))
	dst, err := wr.SaveFileDialog(a.ctx, wr.SaveDialogOptions{Title: "Exportar captura", DefaultFilename: def,
		Filters: []wr.FileFilter{{DisplayName: "PNG", Pattern: "*.png"}}})
	if err != nil || dst == "" {
		return "", err
	}
	return dst, copyFile(filepath.Join(dir, r.Image), dst)
}

// ExportRewards exporta várias recompensas (capturas + planilha CSV) para uma pasta.
func (a *App) ExportRewards(ids []string) (string, error) {
	if len(ids) == 0 {
		return "", errors.New("nenhuma recompensa selecionada")
	}
	dst, err := wr.OpenDirectoryDialog(a.ctx, wr.OpenDialogOptions{Title: "Exportar tesouros para a pasta"})
	if err != nil || dst == "" {
		return "", err
	}
	a.mu.Lock()
	dir := a.settings.CapturesDir
	a.mu.Unlock()
	cf, err := os.Create(uniqueName(dst, "tesouros.csv"))
	if err != nil {
		return "", err
	}
	defer cf.Close()
	cf.Write([]byte{0xEF, 0xBB, 0xBF}) // BOM para o Excel abrir com acentos
	w := csv.NewWriter(cf)
	w.Comma = ';'
	w.Write([]string{"Data", "Item", "Categoria", "Raridade", "Origem", "Encontrado por", "Confirmado", "Confiança", "Partida", "Baús até então", "Arquivo"})
	n := 0
	for _, id := range ids {
		r, ok := a.rewards.Get(id)
		if !ok {
			continue
		}
		file := ""
		if r.Image != "" {
			name := fmt.Sprintf("%s - partida %d - %s.png", sanitize(r.Name), r.Match, r.At.Format("2006-01-02 15-04-05"))
			out := uniqueName(dst, name)
			if err := copyFile(filepath.Join(dir, r.Image), out); err == nil {
				file = filepath.Base(out)
			}
		}
		origin := map[string]string{vision.ScopeOwn: "Própria conta", vision.ScopeSquad: "Anunciado pelo Squad"}[r.Scope]
		conf := "Não"
		if r.Confirmed {
			conf = "Sim"
		}
		w.Write([]string{r.At.Format("02/01/2006 15:04:05"), r.Name, r.Category, r.Rarity, origin, r.Finder, conf,
			fmt.Sprintf("%.0f%%", r.Confidence*100), fmt.Sprint(r.Match), fmt.Sprint(r.ChestsSoFar), file})
		n++
	}
	w.Flush()
	return fmt.Sprintf("%d tesouro(s) exportado(s) para %s", n, dst), w.Error()
}

func sanitize(s string) string {
	s = strings.Map(func(r rune) rune {
		if strings.ContainsRune(`<>:"/\|?*`, r) || r < 32 {
			return '_'
		}
		return r
	}, s)
	if s == "" {
		return "tesouro"
	}
	return s
}

func copyFile(src, dst string) error {
	in, err := os.Open(src)
	if err != nil {
		return err
	}
	defer in.Close()
	out, err := os.Create(dst)
	if err != nil {
		return err
	}
	if _, err := io.Copy(out, in); err != nil {
		out.Close()
		return err
	}
	return out.Close()
}

// ---------- Acompanhamento manual ----------

// RegisterManualChest soma um baú aberto informado pelo usuário.
func (a *App) RegisterManualChest() error {
	a.mu.Lock()
	if a.op == OpStopped {
		a.mu.Unlock()
		return errors.New("inicie o monitoramento para registrar baús")
	}
	a.session.ChestsManual++
	a.total.ChestsManual++
	match := a.machine.MatchSeq
	sc := a.settings.Stop
	sess := a.session
	a.mu.Unlock()
	a.addActivity("bau", "ok", "Baú registrado manualmente", match)
	a.saveStats()
	if stop, why := CheckStop(sc, sess, nil); stop {
		a.conditionReached(why, nil)
	}
	a.emitUpdate(true)
	return nil
}

// CaptureForManualReward captura a tela agora; os dados do item são informados depois.
func (a *App) CaptureForManualReward() (PendingView, error) {
	a.mu.Lock()
	s := a.settings
	a.mu.Unlock()
	a.checkGame(s)
	a.mu.Lock()
	reg := a.region
	match := a.machine.MatchSeq
	a.mu.Unlock()
	f, err := a.capt.Grab(reg.X, reg.Y, reg.W, reg.H)
	if err != nil {
		return PendingView{}, err
	}
	p := &pendingCapture{ID: fmt.Sprintf("manual-%d", time.Now().UnixNano()), Frame: f.Clone(), At: time.Now(), Match: match}
	if err := writeJPEG(filepath.Join(a.paths.Calib, p.ID+".jpg"), shrink(p.Frame.ToRGBA(), 900), 80); err != nil {
		return PendingView{}, err
	}
	a.mu.Lock()
	a.pending = p
	a.mu.Unlock()
	return PendingView{ID: p.ID, At: p.At, Match: p.Match, Preview: "/media/calibracao/" + p.ID + ".jpg"}, nil
}

// ManualReward são os dados informados pelo usuário.
type ManualReward struct {
	PendingID string `json:"pendingId"`
	Name      string `json:"name"`
	Category  string `json:"category"`
	Rarity    string `json:"rarity"`
	Scope     string `json:"scope"`
	Finder    string `json:"finder"`
}

// SaveManualReward registra uma recompensa informada pelo usuário (confirmada por ele).
func (a *App) SaveManualReward(m ManualReward) error {
	a.mu.Lock()
	p := a.pending
	if p == nil || p.ID != m.PendingID {
		a.mu.Unlock()
		return errors.New("a captura pendente não foi encontrada; capture novamente")
	}
	a.pending = nil
	chests := a.session.Chests()
	a.mu.Unlock()
	if strings.TrimSpace(m.Name) == "" {
		return errors.New("informe o nome do item")
	}
	if !vision.ValidCategory(m.Category) {
		return errors.New("categoria inválida")
	}
	if !vision.ValidRarity(m.Rarity) {
		m.Rarity = string(vision.RarityUnknown)
	}
	if m.Scope != vision.ScopeSquad {
		m.Scope = vision.ScopeOwn
	}
	_ = os.Remove(filepath.Join(a.paths.Calib, p.ID+".jpg"))
	r := storage.Reward{ID: fmt.Sprintf("r%d", time.Now().UnixNano()), Name: strings.TrimSpace(m.Name), Category: m.Category,
		Rarity: m.Rarity, Scope: m.Scope, Finder: strings.TrimSpace(m.Finder), Confirmed: true, Confidence: 1,
		Match: p.Match, ChestsSoFar: chests, At: p.At, Source: "manual"}
	a.recordReward(r, p.Frame)
	return nil
}

// DiscardManualReward descarta a captura pendente.
func (a *App) DiscardManualReward() {
	a.mu.Lock()
	p := a.pending
	a.pending = nil
	a.mu.Unlock()
	if p != nil {
		_ = os.Remove(filepath.Join(a.paths.Calib, p.ID+".jpg"))
	}
}

// ---------- Diagnóstico ----------

// Diagnostics são as informações da aba Diagnóstico.
type Diagnostics struct {
	Log     []string `json:"log"`
	LogPath string   `json:"logPath"`
	DataDir string   `json:"dataDir"`
	Version string   `json:"version"`
	OS      string   `json:"os"`
	CPUs    int      `json:"cpus"`
	Win11   bool     `json:"win11"`
	Glass   bool     `json:"glass"`
}

// GetDiagnostics devolve o log e informações do sistema.
func (a *App) GetDiagnostics() Diagnostics {
	return Diagnostics{Log: a.log.Tail(150), LogPath: a.log.Path(), DataDir: a.paths.Data, Version: Version,
		OS: runtime.GOOS + "/" + runtime.GOARCH, CPUs: runtime.NumCPU(), Win11: winsys.IsWindows11(), Glass: Translucent}
}
