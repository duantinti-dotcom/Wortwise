// Package storage cuida da persistência local: histórico de atividades, estatísticas,
// galeria de recompensas e logs de diagnóstico. Tudo em arquivos JSON locais.
package storage

import (
	"bufio"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"sync"
	"time"
)

// WriteJSON grava JSON de forma atômica (arquivo temporário + rename).
func WriteJSON(path string, v any) error {
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		return err
	}
	b, err := json.MarshalIndent(v, "", "  ")
	if err != nil {
		return err
	}
	tmp := path + ".tmp"
	if err := os.WriteFile(tmp, b, 0o644); err != nil {
		return err
	}
	return os.Rename(tmp, path)
}

// ReadJSON lê JSON; arquivo ausente não é erro.
func ReadJSON(path string, v any) error {
	b, err := os.ReadFile(path)
	if errors.Is(err, os.ErrNotExist) {
		return nil
	}
	if err != nil {
		return err
	}
	if err := json.Unmarshal(b, v); err != nil {
		_ = os.Rename(path, path+".corrompido")
		return fmt.Errorf("%s corrompido (cópia preservada): %w", filepath.Base(path), err)
	}
	return nil
}

// Activity é um item do histórico.
type Activity struct {
	At    time.Time `json:"at"`
	Kind  string    `json:"kind"`
	Level string    `json:"level"` // info | ok | aviso | erro | ouro
	Text  string    `json:"text"`
	Match int       `json:"match,omitempty"`
}

// ActivityLog guarda o histórico em JSON Lines e mantém os últimos itens em memória.
type ActivityLog struct {
	mu    sync.Mutex
	path  string
	items []Activity
	max   int
}

// OpenActivity abre o histórico e carrega os últimos itens.
func OpenActivity(path string, keep int) *ActivityLog {
	a := &ActivityLog{path: path, max: keep}
	if f, err := os.Open(path); err == nil {
		sc := bufio.NewScanner(f)
		for sc.Scan() {
			var it Activity
			if json.Unmarshal(sc.Bytes(), &it) == nil {
				a.items = append(a.items, it)
				if len(a.items) > keep*2 {
					a.items = a.items[len(a.items)-keep:]
				}
			}
		}
		f.Close()
		if len(a.items) > keep {
			a.items = a.items[len(a.items)-keep:]
		}
	}
	return a
}

// Add registra um item (memória + disco).
func (a *ActivityLog) Add(it Activity) {
	a.mu.Lock()
	defer a.mu.Unlock()
	a.items = append(a.items, it)
	if len(a.items) > a.max {
		a.items = a.items[len(a.items)-a.max:]
	}
	_ = os.MkdirAll(filepath.Dir(a.path), 0o755)
	if fi, err := os.Stat(a.path); err == nil && fi.Size() > 8<<20 {
		_ = os.Rename(a.path, a.path+".1")
	}
	f, err := os.OpenFile(a.path, os.O_CREATE|os.O_APPEND|os.O_WRONLY, 0o644)
	if err != nil {
		return
	}
	b, _ := json.Marshal(it)
	f.Write(append(b, '\n'))
	f.Close()
}

// Recent devolve os itens mais recentes primeiro.
func (a *ActivityLog) Recent(n int) []Activity {
	a.mu.Lock()
	defer a.mu.Unlock()
	if n > len(a.items) {
		n = len(a.items)
	}
	out := make([]Activity, 0, n)
	for i := len(a.items) - 1; i >= 0 && len(out) < n; i-- {
		out = append(out, a.items[i])
	}
	return out
}

// Clear apaga o histórico.
func (a *ActivityLog) Clear() error {
	a.mu.Lock()
	defer a.mu.Unlock()
	a.items = nil
	err := os.Remove(a.path)
	if errors.Is(err, os.ErrNotExist) {
		return nil
	}
	return err
}

// Reward é uma recompensa registrada na galeria Tesouros.
type Reward struct {
	ID          string    `json:"id"`
	Name        string    `json:"name"`
	Category    string    `json:"category"`
	Rarity      string    `json:"rarity"`
	ColorRarity string    `json:"colorRarity,omitempty"` // estimativa pela cor (heurística)
	Scope       string    `json:"scope"`                 // propria | squad
	Finder      string    `json:"finder,omitempty"`
	Confirmed   bool      `json:"confirmed"`
	Confidence  float64   `json:"confidence"`
	Match       int       `json:"match"`
	ChestsSoFar int       `json:"chestsSoFar"`
	At          time.Time `json:"at"`
	Image       string    `json:"image"`
	Thumb       string    `json:"thumb"`
	Width       int       `json:"width"`
	Height      int       `json:"height"`
	TemplateID  string    `json:"templateId,omitempty"`
	Source      string    `json:"source"` // automatico | manual
}

// RewardStore é a galeria persistida em rewards.json.
type RewardStore struct {
	mu    sync.Mutex
	path  string
	items []Reward
}

// OpenRewards carrega a galeria.
func OpenRewards(path string) (*RewardStore, error) {
	r := &RewardStore{path: path}
	err := ReadJSON(path, &r.items)
	return r, err
}

// Add inclui uma recompensa.
func (r *RewardStore) Add(it Reward) error {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.items = append(r.items, it)
	return WriteJSON(r.path, r.items)
}

// Update altera os campos editáveis (nome, raridade, categoria).
func (r *RewardStore) Update(id string, fn func(*Reward)) (Reward, error) {
	r.mu.Lock()
	defer r.mu.Unlock()
	for i := range r.items {
		if r.items[i].ID == id {
			fn(&r.items[i])
			return r.items[i], WriteJSON(r.path, r.items)
		}
	}
	return Reward{}, errors.New("recompensa não encontrada")
}

// Delete remove a recompensa e devolve o registro removido (para apagar os arquivos).
func (r *RewardStore) Delete(id string) (Reward, error) {
	r.mu.Lock()
	defer r.mu.Unlock()
	for i, it := range r.items {
		if it.ID == id {
			r.items = append(r.items[:i], r.items[i+1:]...)
			return it, WriteJSON(r.path, r.items)
		}
	}
	return Reward{}, errors.New("recompensa não encontrada")
}

// Get busca pelo id.
func (r *RewardStore) Get(id string) (Reward, bool) {
	r.mu.Lock()
	defer r.mu.Unlock()
	for _, it := range r.items {
		if it.ID == id {
			return it, true
		}
	}
	return Reward{}, false
}

// List devolve as recompensas, mais recentes primeiro.
func (r *RewardStore) List() []Reward {
	r.mu.Lock()
	defer r.mu.Unlock()
	out := append([]Reward(nil), r.items...)
	sort.Slice(out, func(i, j int) bool { return out[i].At.After(out[j].At) })
	return out
}

// Logger grava o log de diagnóstico com rotação simples.
type Logger struct {
	mu   sync.Mutex
	path string
	tail []string
}

// NewLogger cria o log.
func NewLogger(path string) *Logger {
	_ = os.MkdirAll(filepath.Dir(path), 0o755)
	return &Logger{path: path}
}

// Path devolve o arquivo de log.
func (l *Logger) Path() string { return l.path }

// Printf registra uma linha.
func (l *Logger) Printf(format string, args ...any) {
	line := time.Now().Format("2006-01-02 15:04:05.000") + "  " + fmt.Sprintf(format, args...)
	l.mu.Lock()
	defer l.mu.Unlock()
	l.tail = append(l.tail, line)
	if len(l.tail) > 200 {
		l.tail = l.tail[len(l.tail)-200:]
	}
	if fi, err := os.Stat(l.path); err == nil && fi.Size() > 5<<20 {
		_ = os.Rename(l.path, l.path+".1")
	}
	f, err := os.OpenFile(l.path, os.O_CREATE|os.O_APPEND|os.O_WRONLY, 0o644)
	if err != nil {
		return
	}
	f.WriteString(line + "\n")
	f.Close()
}

// Tail devolve as últimas linhas.
func (l *Logger) Tail(n int) []string {
	l.mu.Lock()
	defer l.mu.Unlock()
	if n > len(l.tail) {
		n = len(l.tail)
	}
	return append([]string(nil), l.tail[len(l.tail)-n:]...)
}
