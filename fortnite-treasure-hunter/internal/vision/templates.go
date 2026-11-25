package vision

import (
	"encoding/json"
	"errors"
	"fmt"
	"image"
	"image/png"
	"os"
	"path/filepath"
	"sort"
	"sync"
	"time"
)

// Target é o tipo de elemento de tela que um template identifica.
type Target string

const (
	TargetLobby       Target = "lobby"
	TargetMode        Target = "modo_correto"
	TargetQueue       Target = "fila"
	TargetLoading     Target = "carregando"
	TargetInMatch     Target = "partida"
	TargetSpectating  Target = "espectando"
	TargetSquadOut    Target = "squad_eliminado"
	TargetVictory     Target = "vitoria"
	TargetError       Target = "erro"
	TargetChestPrompt Target = "bau_prompt"
	TargetChestOpened Target = "bau_aberto"
	TargetReward      Target = "recompensa"
	TargetTeammate    Target = "integrante"
)

// AllTargets lista todos os alvos, na ordem exibida na calibração.
var AllTargets = []Target{TargetLobby, TargetMode, TargetQueue, TargetLoading, TargetInMatch, TargetSpectating,
	TargetSquadOut, TargetVictory, TargetError, TargetChestPrompt, TargetChestOpened, TargetReward, TargetTeammate}

// ValidTarget verifica o alvo.
func ValidTarget(t Target) bool {
	for _, x := range AllTargets {
		if x == t {
			return true
		}
	}
	return false
}

// Categorias de recompensa.
const (
	CategoryPirateToken = "token_pirata"
	CategoryGoldSkin    = "skin_dourada"
	CategoryElemental   = "elemental"
	CategoryRare        = "raro"
)

// ValidCategory verifica a categoria.
func ValidCategory(c string) bool {
	switch c {
	case CategoryPirateToken, CategoryGoldSkin, CategoryElemental, CategoryRare:
		return true
	}
	return false
}

// Escopo da recompensa: recebida na própria conta ou apenas anunciada pelo Squad.
const (
	ScopeOwn   = "propria"
	ScopeSquad = "squad"
)

// TemplateMeta descreve um template calibrado pelo usuário.
type TemplateMeta struct {
	ID        string    `json:"id"`
	Target    Target    `json:"target"`
	Label     string    `json:"label"`
	Category  string    `json:"category,omitempty"`
	Rarity    Rarity    `json:"rarity,omitempty"`
	Scope     string    `json:"scope,omitempty"`
	Box       Rect      `json:"box"` // seleção original (normalizada)
	ROI       Rect      `json:"roi"` // área de busca (normalizada)
	Threshold float64   `json:"threshold"`
	Width     int       `json:"width"`
	Height    int       `json:"height"`
	SourceW   int       `json:"sourceW"`
	SourceH   int       `json:"sourceH"`
	CreatedAt time.Time `json:"createdAt"`
}

// Template é um template carregado e pronto para busca.
type Template struct {
	TemplateMeta
	Pattern *Pattern
	Gray    *Gray

	cacheMu   sync.Mutex
	cache     map[int]*Pattern
	scaleTurn int
	bestScale float64 // última escala que gerou detecção confirmada (ajuste automático)
}

// Library guarda os templates em disco (templates.json + PNG em tons de cinza).
type Library struct {
	mu    sync.RWMutex
	dir   string
	items []*Template
}

// DefaultThreshold por alvo. Elementos de texto pequenos pedem limiar maior.
func DefaultThreshold(t Target) float64 {
	switch t {
	case TargetReward, TargetTeammate:
		return 0.82
	case TargetChestPrompt, TargetChestOpened:
		return 0.78
	}
	return 0.8
}

// UncertainBand é a faixa abaixo do limiar em que a detecção é registrada como não confirmada.
const UncertainBand = 0.08

// NewLibrary cria (ou abre) a biblioteca no diretório.
func NewLibrary(dir string) (*Library, error) {
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return nil, err
	}
	l := &Library{dir: dir}
	return l, l.load()
}

func (l *Library) metaPath() string { return filepath.Join(l.dir, "templates.json") }

func (l *Library) load() error {
	b, err := os.ReadFile(l.metaPath())
	if errors.Is(err, os.ErrNotExist) {
		return nil
	}
	if err != nil {
		return err
	}
	var metas []TemplateMeta
	if err := json.Unmarshal(b, &metas); err != nil {
		return fmt.Errorf("templates.json inválido: %w", err)
	}
	for _, m := range metas {
		f, err := os.Open(filepath.Join(l.dir, m.ID+".png"))
		if err != nil {
			continue // imagem ausente: ignora o template em vez de falhar tudo
		}
		img, err := png.Decode(f)
		f.Close()
		if err != nil {
			continue
		}
		g := GrayFromImage(img)
		l.items = append(l.items, &Template{TemplateMeta: m, Gray: g, Pattern: NewPattern(g)})
	}
	return nil
}

func (l *Library) persist() error {
	metas := make([]TemplateMeta, 0, len(l.items))
	for _, t := range l.items {
		metas = append(metas, t.TemplateMeta)
	}
	b, err := json.MarshalIndent(metas, "", "  ")
	if err != nil {
		return err
	}
	tmp := l.metaPath() + ".tmp"
	if err := os.WriteFile(tmp, b, 0o644); err != nil {
		return err
	}
	return os.Rename(tmp, l.metaPath())
}

// Add recorta o template do quadro reduzido e salva.
func (l *Library) Add(s *Small, meta TemplateMeta) (*Template, error) {
	if !ValidTarget(meta.Target) {
		return nil, fmt.Errorf("alvo inválido: %s", meta.Target)
	}
	if !meta.Box.Valid() {
		return nil, errors.New("seleção inválida")
	}
	px := meta.Box.Pixels(s.W, s.H)
	if px.Dx() < 6 || px.Dy() < 4 {
		return nil, errors.New("seleção pequena demais: selecione uma área maior")
	}
	if px.Dx() > s.W*3/4 && px.Dy() > s.H*3/4 {
		return nil, errors.New("seleção grande demais: escolha um elemento característico da tela")
	}
	g := s.Gray.Crop(px)
	pat := NewPattern(g)
	if pat.Flat() {
		return nil, errors.New("a área selecionada não tem detalhes suficientes (cor lisa); escolha um texto, ícone ou borda")
	}
	if meta.Target == TargetReward && !ValidCategory(meta.Category) {
		return nil, errors.New("categoria de recompensa inválida")
	}
	if meta.Target == TargetReward && meta.Scope != ScopeOwn && meta.Scope != ScopeSquad {
		meta.Scope = ScopeOwn
	}
	if meta.Rarity == "" || !ValidRarity(string(meta.Rarity)) {
		meta.Rarity = RarityUnknown
	}
	if meta.Threshold <= 0.3 || meta.Threshold > 0.99 {
		meta.Threshold = DefaultThreshold(meta.Target)
	}
	if !meta.ROI.Valid() {
		meta.ROI = meta.Box.Expand(0.06)
	}
	meta.ID = fmt.Sprintf("%s-%d", meta.Target, time.Now().UnixNano())
	meta.Width, meta.Height = g.W, g.H
	meta.CreatedAt = time.Now()
	f, err := os.Create(filepath.Join(l.dir, meta.ID+".png"))
	if err != nil {
		return nil, err
	}
	if err := png.Encode(f, g.ToImage()); err != nil {
		f.Close()
		return nil, err
	}
	f.Close()
	t := &Template{TemplateMeta: meta, Gray: g, Pattern: pat}
	l.mu.Lock()
	defer l.mu.Unlock()
	l.items = append(l.items, t)
	return t, l.persist()
}

// AddDirect adiciona um template já recortado (usado em testes).
func (l *Library) AddDirect(g *Gray, meta TemplateMeta) *Template {
	t := &Template{TemplateMeta: meta, Gray: g, Pattern: NewPattern(g)}
	if t.Threshold == 0 {
		t.Threshold = DefaultThreshold(meta.Target)
	}
	if !t.ROI.Valid() {
		t.ROI = Full
	}
	if t.ID == "" {
		t.ID = fmt.Sprintf("%s-%d", meta.Target, len(l.items)+1)
	}
	l.mu.Lock()
	l.items = append(l.items, t)
	l.mu.Unlock()
	return t
}

// Delete remove o template.
func (l *Library) Delete(id string) error {
	l.mu.Lock()
	defer l.mu.Unlock()
	for i, t := range l.items {
		if t.ID == id {
			l.items = append(l.items[:i], l.items[i+1:]...)
			_ = os.Remove(filepath.Join(l.dir, id+".png"))
			return l.persist()
		}
	}
	return errors.New("template não encontrado")
}

// UpdateThreshold altera o limiar de confiança.
func (l *Library) UpdateThreshold(id string, thr float64) error {
	if thr < 0.4 || thr > 0.99 {
		return errors.New("limiar deve ficar entre 0,40 e 0,99")
	}
	l.mu.Lock()
	defer l.mu.Unlock()
	for _, t := range l.items {
		if t.ID == id {
			t.Threshold = thr
			return l.persist()
		}
	}
	return errors.New("template não encontrado")
}

// List devolve as metas ordenadas por alvo.
func (l *Library) List() []TemplateMeta {
	l.mu.RLock()
	defer l.mu.RUnlock()
	out := make([]TemplateMeta, 0, len(l.items))
	for _, t := range l.items {
		out = append(out, t.TemplateMeta)
	}
	sort.SliceStable(out, func(i, j int) bool { return out[i].Target < out[j].Target })
	return out
}

// Get devolve um template pelo id.
func (l *Library) Get(id string) *Template {
	l.mu.RLock()
	defer l.mu.RUnlock()
	for _, t := range l.items {
		if t.ID == id {
			return t
		}
	}
	return nil
}

// Snapshot devolve a lista atual (somente leitura).
func (l *Library) Snapshot() []*Template {
	l.mu.RLock()
	defer l.mu.RUnlock()
	return append([]*Template(nil), l.items...)
}

// Has indica se existe ao menos um template para o alvo.
func (l *Library) Has(t Target) bool {
	l.mu.RLock()
	defer l.mu.RUnlock()
	for _, x := range l.items {
		if x.Target == t {
			return true
		}
	}
	return false
}

// SaveGrayPNG utilitário para pré-visualização.
func SaveGrayPNG(path string, g image.Image) error {
	f, err := os.Create(path)
	if err != nil {
		return err
	}
	defer f.Close()
	return png.Encode(f, g)
}

// Resize redimensiona (bilinear) uma imagem em tons de cinza.
func Resize(g *Gray, w, h int) *Gray {
	if w < 1 {
		w = 1
	}
	if h < 1 {
		h = 1
	}
	out := &Gray{W: w, H: h, Pix: make([]uint8, w*h)}
	for y := 0; y < h; y++ {
		fy := (float64(y)+0.5)*float64(g.H)/float64(h) - 0.5
		y0 := int(fy)
		if fy < 0 {
			fy, y0 = 0, 0
		}
		y1 := y0 + 1
		if y1 >= g.H {
			y1 = g.H - 1
		}
		wy := fy - float64(y0)
		for x := 0; x < w; x++ {
			fx := (float64(x)+0.5)*float64(g.W)/float64(w) - 0.5
			x0 := int(fx)
			if fx < 0 {
				fx, x0 = 0, 0
			}
			x1 := x0 + 1
			if x1 >= g.W {
				x1 = g.W - 1
			}
			wx := fx - float64(x0)
			a := float64(g.Pix[y0*g.W+x0])*(1-wx) + float64(g.Pix[y0*g.W+x1])*wx
			b := float64(g.Pix[y1*g.W+x0])*(1-wx) + float64(g.Pix[y1*g.W+x1])*wx
			out.Pix[y*w+x] = uint8(a*(1-wy) + b*wy + 0.5)
		}
	}
	return out
}

// scaledPattern devolve o template redimensionado (com cache) para a escala pedida.
func (t *Template) scaledPattern(s float64) *Pattern {
	if s > 0.97 && s < 1.03 {
		return t.Pattern
	}
	key := int(s*100 + 0.5)
	t.cacheMu.Lock()
	defer t.cacheMu.Unlock()
	if t.cache == nil {
		t.cache = map[int]*Pattern{}
	}
	if p, ok := t.cache[key]; ok {
		return p
	}
	w, h := int(float64(t.Gray.W)*s+0.5), int(float64(t.Gray.H)*s+0.5)
	if w < 4 || h < 3 {
		return t.Pattern
	}
	p := NewPattern(Resize(t.Gray, w, h))
	t.cache[key] = p
	return p
}

// baseScale calcula a escala esperada quando a proporção da tela atual difere da calibração:
// a interface do jogo acompanha a altura da tela, e a análise é normalizada pela largura.
func (t *Template) baseScale(w, h int) float64 {
	if t.SourceW <= 0 || t.SourceH <= 0 || w <= 0 {
		return 1
	}
	src := float64(t.SourceH) / float64(t.SourceW)
	cur := float64(h) / float64(w)
	return cur / src
}
