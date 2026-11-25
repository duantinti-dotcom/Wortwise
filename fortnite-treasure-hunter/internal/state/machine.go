// Package state contém a máquina de estados que acompanha a sessão de jogo.
//
// Ela consome Observations do reconhecimento visual e produz eventos (partida
// iniciada, concluída, baú, recompensa, avisos). Não envia nenhuma entrada ao jogo.
package state

import (
	"fmt"
	"time"

	"treasurehunter/internal/vision"
)

// State é o estado atual identificado.
type State string

const (
	Idle        State = "inativo"
	WaitingGame State = "aguardando_fortnite"
	Unknown     State = "desconhecido"
	Lobby       State = "lobby"
	WrongMode   State = "modo_incorreto"
	Queue       State = "fila"
	Loading     State = "carregando"
	InMatch     State = "em_partida"
	Spectating  State = "espectando"
	SquadOut    State = "squad_eliminado"
	Victory     State = "vitoria"
	ErrorScreen State = "erro"
)

// Labels em português para exibição.
var Labels = map[State]string{
	Idle: "Inativo", WaitingGame: "Aguardando o Fortnite", Unknown: "Tela não identificada", Lobby: "Lobby",
	WrongMode: "Lobby — modo diferente do selecionado", Queue: "Procurando partida", Loading: "Carregando partida",
	InMatch: "Em partida", Spectating: "Eliminado — Squad ainda vivo", SquadOut: "Squad eliminado",
	Victory: "Vitória Royale", ErrorScreen: "Erro ou desconexão",
}

// EventKind identifica o tipo de evento.
type EventKind string

const (
	EvState        EventKind = "estado"
	EvMatchStart   EventKind = "partida_iniciada"
	EvMatchEnd     EventKind = "partida_concluida"
	EvMatchAbandon EventKind = "partida_interrompida"
	EvChest        EventKind = "bau"
	EvWarning      EventKind = "aviso"
)

// Event é produzido pela máquina.
type Event struct {
	Kind      EventKind
	At        time.Time
	From, To  State
	Match     int
	Result    string // vitoria | squad_eliminado | desconexao | saiu
	Confirmed bool   // para baús
	Score     float64
	Message   string
}

// Config controla a sensibilidade.
type Config struct {
	ConfirmFrames   int           // quadros consecutivos para aceitar uma transição
	LoadingTimeout  time.Duration // carregamento travado
	NoHudTimeout    time.Duration // partida sem HUD
	UnknownWarn     time.Duration // tela inesperada
	ChestCooldown   time.Duration // impede contagem dupla do mesmo baú
	ModeRecheck     time.Duration // intervalo de revalidação do modo no lobby
	HasChestOpened  bool          // existe template de "baú aberto" (confirmação)
	HasModeTemplate bool          // existe template de modo correto
}

// DefaultConfig devolve valores equilibrados.
func DefaultConfig() Config {
	return Config{ConfirmFrames: 2, LoadingTimeout: 4 * time.Minute, NoHudTimeout: 90 * time.Second,
		UnknownWarn: 45 * time.Second, ChestCooldown: 4 * time.Second, ModeRecheck: 10 * time.Second}
}

// Machine é a máquina de estados. Não é segura para uso concorrente.
type Machine struct {
	cfg      Config
	cur      State
	since    time.Time
	pending  State
	pendingN int
	lastSeen time.Time // último quadro com algum alvo reconhecido
	warnedAt time.Time

	MatchSeq    int // número da partida atual/última
	matchActive bool
	sawError    bool

	modeOK      bool
	modeChecked time.Time

	promptFrames int
	promptLastAt time.Time
	lastChestAt  time.Time
	openedPrev   bool
}

// New cria a máquina no estado Unknown.
func New(cfg Config, now time.Time) *Machine {
	if cfg.ConfirmFrames < 1 {
		cfg.ConfirmFrames = 1
	}
	return &Machine{cfg: cfg, cur: Unknown, since: now, lastSeen: now}
}

// SetConfig atualiza a configuração sem perder o estado.
func (m *Machine) SetConfig(c Config) {
	if c.ConfirmFrames < 1 {
		c.ConfirmFrames = 1
	}
	m.cfg = c
}

// State devolve o estado atual.
func (m *Machine) State() State { return m.cur }

// Since devolve o momento de entrada no estado atual.
func (m *Machine) Since() time.Time { return m.since }

// MatchActive indica se há uma partida em andamento.
func (m *Machine) MatchActive() bool { return m.matchActive }

// Force define o estado diretamente (Fortnite fechado, operação parada).
func (m *Machine) Force(s State, now time.Time) []Event {
	if s == m.cur {
		return nil
	}
	var evs []Event
	if s == WaitingGame && m.matchActive {
		m.matchActive = false
		evs = append(evs, Event{Kind: EvMatchAbandon, At: now, Match: m.MatchSeq, Result: "jogo_fechado", Message: "O Fortnite foi fechado durante a partida"})
	}
	evs = append(evs, m.transition(s, now)...)
	return evs
}

// Wanted devolve os alvos a verificar neste quadro: só o que é plausível no estado atual,
// com varredura completa periódica ou quando a tela não é reconhecida.
func (m *Machine) Wanted(full bool) vision.Request {
	r := vision.Request{Targets: map[vision.Target]bool{}}
	add := func(ts ...vision.Target) {
		for _, t := range ts {
			r.Targets[t] = true
		}
	}
	if full || m.cur == Unknown || m.cur == WaitingGame || m.cur == Idle {
		return vision.AllRequest()
	}
	add(vision.TargetError)
	switch m.cur {
	case Lobby, WrongMode:
		add(vision.TargetLobby, vision.TargetQueue, vision.TargetLoading, vision.TargetInMatch)
		if m.cur == WrongMode || time.Since(m.modeChecked) >= m.cfg.ModeRecheck {
			add(vision.TargetMode)
		}
	case Queue:
		add(vision.TargetQueue, vision.TargetLoading, vision.TargetLobby, vision.TargetInMatch)
	case Loading:
		add(vision.TargetLoading, vision.TargetInMatch, vision.TargetLobby)
	case InMatch:
		add(vision.TargetInMatch, vision.TargetSpectating, vision.TargetSquadOut, vision.TargetVictory,
			vision.TargetChestPrompt, vision.TargetChestOpened, vision.TargetReward)
	case Spectating:
		add(vision.TargetSpectating, vision.TargetInMatch, vision.TargetSquadOut, vision.TargetVictory, vision.TargetReward, vision.TargetLobby)
	case SquadOut, Victory:
		add(vision.TargetSquadOut, vision.TargetVictory, vision.TargetLobby, vision.TargetLoading)
	case ErrorScreen:
		add(vision.TargetLobby, vision.TargetInMatch, vision.TargetLoading)
	}
	return r
}

// candidate escolhe o estado sugerido pelo quadro, por prioridade.
func (m *Machine) candidate(o vision.Observation, now time.Time) (State, bool) {
	switch {
	case o.Has(vision.TargetError):
		return ErrorScreen, true
	case o.Has(vision.TargetVictory):
		return Victory, true
	case o.Has(vision.TargetSquadOut):
		return SquadOut, true
	case o.Has(vision.TargetSpectating):
		return Spectating, true
	case o.Has(vision.TargetInMatch):
		return InMatch, true
	case o.Has(vision.TargetLoading):
		return Loading, true
	case o.Has(vision.TargetQueue):
		return Queue, true
	case o.Has(vision.TargetLobby):
		if _, checked := o.Hits[vision.TargetMode]; checked || o.Has(vision.TargetMode) {
			m.modeChecked = now
			m.modeOK = o.Has(vision.TargetMode)
		} else if m.cfg.HasModeTemplate && m.modeChecked.IsZero() {
			// Ainda não verificado: assume modo incorreto até confirmar.
			m.modeOK = false
		}
		if !m.cfg.HasModeTemplate || m.modeOK {
			return Lobby, true
		}
		return WrongMode, true
	}
	return "", false
}

// Update processa uma observação e devolve os eventos gerados.
func (m *Machine) Update(o vision.Observation, now time.Time) []Event {
	var evs []Event
	// Lobby: o template de modo foi pedido mas não encontrado => modo incorreto confirmado.
	if o.Has(vision.TargetLobby) && m.cfg.HasModeTemplate && !o.Has(vision.TargetMode) {
		if _, asked := o.Hits[vision.TargetMode]; !asked && m.cur != Lobby && m.cur != WrongMode {
			m.modeOK = false
		}
	}
	cand, ok := m.candidate(o, now)
	if ok {
		m.lastSeen = now
		if cand == m.cur {
			m.pending, m.pendingN = "", 0
		} else {
			if cand == m.pending {
				m.pendingN++
			} else {
				m.pending, m.pendingN = cand, 1
			}
			if m.pendingN >= m.cfg.ConfirmFrames {
				evs = append(evs, m.transition(cand, now)...)
				m.pending, m.pendingN = "", 0
			}
		}
	} else {
		m.pending, m.pendingN = "", 0
	}

	if m.cur == InMatch {
		evs = append(evs, m.chests(o, now)...)
	} else {
		m.promptFrames = 0
		m.openedPrev = false
	}
	evs = append(evs, m.watchdog(now)...)
	return evs
}

func (m *Machine) chests(o vision.Observation, now time.Time) []Event {
	var evs []Event
	cool := now.Sub(m.lastChestAt) >= m.cfg.ChestCooldown
	if m.cfg.HasChestOpened {
		opened := o.Has(vision.TargetChestOpened)
		// Borda de subida: conta uma vez por aparição, respeitando o intervalo mínimo.
		if opened && !m.openedPrev && cool {
			d := o.Hits[vision.TargetChestOpened]
			m.lastChestAt = now
			evs = append(evs, Event{Kind: EvChest, At: now, Match: m.MatchSeq, Confirmed: true, Score: d.Score, Message: "Baú aberto identificado"})
			m.promptFrames = 0
		}
		m.openedPrev = opened
		return evs
	}
	if o.Has(vision.TargetChestPrompt) {
		m.promptFrames++
		m.promptLastAt = now
		return nil
	}
	// O aviso de interação sumiu após ser visto de forma estável: provável abertura (não confirmada).
	if m.promptFrames >= m.cfg.ConfirmFrames && now.Sub(m.promptLastAt) < 3*time.Second && cool {
		m.lastChestAt = now
		evs = append(evs, Event{Kind: EvChest, At: now, Match: m.MatchSeq, Confirmed: false, Message: "Provável baú aberto (não confirmado)"})
	}
	m.promptFrames = 0
	return evs
}

func (m *Machine) transition(to State, now time.Time) []Event {
	from := m.cur
	if from == to {
		return nil
	}
	evs := []Event{{Kind: EvState, At: now, From: from, To: to, Match: m.MatchSeq}}
	inGame := func(s State) bool { return s == InMatch || s == Spectating }
	switch {
	case inGame(to) && !m.matchActive:
		m.MatchSeq++
		m.matchActive = true
		m.sawError = false
		msg := fmt.Sprintf("Partida #%d iniciada", m.MatchSeq)
		if from == Unknown || from == WaitingGame {
			msg = fmt.Sprintf("Partida #%d em andamento detectada", m.MatchSeq)
		}
		evs = append(evs, Event{Kind: EvMatchStart, At: now, Match: m.MatchSeq, Message: msg})
	case (to == SquadOut || to == Victory) && m.matchActive:
		m.matchActive = false
		res := "squad_eliminado"
		msg := fmt.Sprintf("Partida #%d concluída — Squad eliminado", m.MatchSeq)
		if to == Victory {
			res = "vitoria"
			msg = fmt.Sprintf("Partida #%d concluída — Vitória Royale!", m.MatchSeq)
		}
		evs = append(evs, Event{Kind: EvMatchEnd, At: now, Match: m.MatchSeq, Result: res, Message: msg})
	case to == ErrorScreen:
		m.sawError = true
	case (to == Lobby || to == WrongMode || to == Queue || to == Loading) && m.matchActive:
		m.matchActive = false
		res, msg := "saiu", fmt.Sprintf("Partida #%d interrompida antes do fim", m.MatchSeq)
		if m.sawError {
			res, msg = "desconexao", fmt.Sprintf("Partida #%d interrompida por erro/desconexão", m.MatchSeq)
		}
		evs = append(evs, Event{Kind: EvMatchAbandon, At: now, Match: m.MatchSeq, Result: res, Message: msg})
	}
	m.cur = to
	m.since = now
	return evs
}

func (m *Machine) watchdog(now time.Time) []Event {
	var evs []Event
	warn := func(msg string) {
		if now.Sub(m.warnedAt) > 30*time.Second {
			m.warnedAt = now
			evs = append(evs, Event{Kind: EvWarning, At: now, Message: msg})
		}
	}
	switch {
	case m.cur == Loading && now.Sub(m.since) > m.cfg.LoadingTimeout:
		warn("Carregamento demorando além do normal — reavaliando a tela")
		evs = append(evs, m.transition(Unknown, now)...)
	case (m.cur == InMatch || m.cur == Spectating) && now.Sub(m.lastSeen) > m.cfg.NoHudTimeout:
		warn("HUD da partida não aparece há muito tempo — reavaliando a tela")
		evs = append(evs, m.transition(Unknown, now)...)
	case m.cur == Unknown && now.Sub(m.lastSeen) > m.cfg.UnknownWarn:
		warn("Tela inesperada: nenhum elemento calibrado reconhecido. Verifique a calibração ou o monitor selecionado")
	}
	return evs
}
