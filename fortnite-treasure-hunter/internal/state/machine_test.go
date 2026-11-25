package state

import (
	"testing"
	"time"

	"treasurehunter/internal/vision"
)

func obs(ts ...vision.Target) vision.Observation {
	o := vision.Observation{Hits: map[vision.Target]vision.Detection{}}
	for _, t := range ts {
		o.Hits[t] = vision.Detection{Target: t, Confirmed: true, Score: 0.9}
	}
	return o
}

type run struct {
	t   *testing.T
	m   *Machine
	now time.Time
	evs []Event
}

func newRun(t *testing.T, cfg Config) *run {
	now := time.Date(2026, 1, 1, 12, 0, 0, 0, time.UTC)
	return &run{t: t, m: New(cfg, now), now: now}
}

func (r *run) feed(n int, o vision.Observation) {
	for i := 0; i < n; i++ {
		r.now = r.now.Add(500 * time.Millisecond)
		r.evs = append(r.evs, r.m.Update(o, r.now)...)
	}
}

func (r *run) count(k EventKind) int {
	n := 0
	for _, e := range r.evs {
		if e.Kind == k {
			n++
		}
	}
	return n
}

func TestFullMatchCycle(t *testing.T) {
	r := newRun(t, DefaultConfig())
	r.feed(3, obs(vision.TargetLobby))
	if r.m.State() != Lobby {
		t.Fatalf("esperava lobby, veio %s", r.m.State())
	}
	r.feed(3, obs(vision.TargetLoading))
	r.feed(10, obs(vision.TargetInMatch))
	if r.m.State() != InMatch || r.count(EvMatchStart) != 1 {
		t.Fatalf("partida não iniciou: %s %d", r.m.State(), r.count(EvMatchStart))
	}
	r.feed(3, obs(vision.TargetSquadOut))
	if r.count(EvMatchEnd) != 1 {
		t.Fatal("partida não concluiu")
	}
	r.feed(3, obs(vision.TargetLobby))
	r.feed(3, obs(vision.TargetInMatch))
	if r.m.MatchSeq != 2 || r.count(EvMatchStart) != 2 {
		t.Fatalf("segunda partida: seq=%d", r.m.MatchSeq)
	}
}

func TestDebounceIgnoresSingleFrameGlitch(t *testing.T) {
	r := newRun(t, DefaultConfig())
	r.feed(3, obs(vision.TargetInMatch))
	r.feed(1, obs(vision.TargetSquadOut)) // um quadro isolado
	r.feed(3, obs(vision.TargetInMatch))
	if r.count(EvMatchEnd) != 0 || r.m.State() != InMatch {
		t.Fatal("um único quadro não deveria encerrar a partida")
	}
}

func TestSpectatingKeepsMatchAlive(t *testing.T) {
	r := newRun(t, DefaultConfig())
	r.feed(3, obs(vision.TargetInMatch))
	r.feed(5, obs(vision.TargetSpectating)) // jogador eliminado, Squad vivo
	if r.count(EvMatchEnd) != 0 || !r.m.MatchActive() {
		t.Fatal("eliminação individual não pode encerrar a partida")
	}
	r.feed(2, obs(vision.TargetInMatch)) // colega o reviveu / voltou a jogar
	if r.count(EvMatchStart) != 1 {
		t.Fatal("voltar do modo espectador não é uma nova partida")
	}
	r.feed(3, obs(vision.TargetVictory))
	if r.count(EvMatchEnd) != 1 || r.evs[len(r.evs)-1].Result != "vitoria" {
		t.Fatal("vitória não registrada")
	}
}

func TestNoDoubleCountOfMatchEnd(t *testing.T) {
	r := newRun(t, DefaultConfig())
	r.feed(3, obs(vision.TargetInMatch))
	r.feed(3, obs(vision.TargetSquadOut))
	r.feed(2, obs())
	r.feed(3, obs(vision.TargetSquadOut)) // tela de resultado reaparece
	r.feed(3, obs(vision.TargetVictory))
	if r.count(EvMatchEnd) != 1 {
		t.Fatalf("partida contada %d vezes", r.count(EvMatchEnd))
	}
}

func TestWrongMode(t *testing.T) {
	cfg := DefaultConfig()
	cfg.HasModeTemplate = true
	r := newRun(t, cfg)
	o := obs(vision.TargetLobby)
	o.Hits[vision.TargetMode] = vision.Detection{Target: vision.TargetMode, Score: 0.5} // verificado e não encontrado
	r.feed(3, o)
	if r.m.State() != WrongMode {
		t.Fatalf("esperava modo incorreto, veio %s", r.m.State())
	}
	r.feed(3, obs(vision.TargetLobby, vision.TargetMode))
	if r.m.State() != Lobby {
		t.Fatalf("esperava lobby, veio %s", r.m.State())
	}
}

func TestChestPromptHeuristicAndCooldown(t *testing.T) {
	r := newRun(t, DefaultConfig())
	r.feed(3, obs(vision.TargetInMatch))
	r.feed(3, obs(vision.TargetInMatch, vision.TargetChestPrompt))
	r.feed(1, obs(vision.TargetInMatch)) // aviso sumiu => provável baú
	r.feed(2, obs(vision.TargetInMatch, vision.TargetChestPrompt))
	r.feed(1, obs(vision.TargetInMatch)) // dentro do intervalo mínimo => ignorado
	if r.count(EvChest) != 1 {
		t.Fatalf("esperava 1 baú, veio %d", r.count(EvChest))
	}
	if r.evs[len(r.evs)-1].Confirmed {
		for _, e := range r.evs {
			if e.Kind == EvChest && e.Confirmed {
				t.Fatal("heurística do aviso deve ser não confirmada")
			}
		}
	}
}

func TestChestConfirmedTemplateEdge(t *testing.T) {
	cfg := DefaultConfig()
	cfg.HasChestOpened = true
	r := newRun(t, cfg)
	r.feed(3, obs(vision.TargetInMatch))
	r.feed(6, obs(vision.TargetInMatch, vision.TargetChestOpened)) // visível por vários quadros
	r.feed(10, obs(vision.TargetInMatch))
	r.feed(2, obs(vision.TargetInMatch, vision.TargetChestOpened))
	if r.count(EvChest) != 2 {
		t.Fatalf("esperava 2 baús confirmados, veio %d", r.count(EvChest))
	}
}

func TestWatchdogLoadingStuck(t *testing.T) {
	r := newRun(t, DefaultConfig())
	r.feed(3, obs(vision.TargetLoading))
	r.now = r.now.Add(5 * time.Minute)
	r.feed(1, obs(vision.TargetLoading))
	if r.m.State() != Unknown || r.count(EvWarning) == 0 {
		t.Fatalf("vigia não atuou: %s", r.m.State())
	}
}

func TestDisconnectInterruptsMatch(t *testing.T) {
	r := newRun(t, DefaultConfig())
	r.feed(3, obs(vision.TargetInMatch))
	r.feed(3, obs(vision.TargetError))
	r.feed(3, obs(vision.TargetLobby))
	var res string
	for _, e := range r.evs {
		if e.Kind == EvMatchAbandon {
			res = e.Result
		}
	}
	if res != "desconexao" {
		t.Fatalf("esperava interrupção por desconexão, veio %q", res)
	}
}

func TestWantedIsStateAware(t *testing.T) {
	r := newRun(t, DefaultConfig())
	r.feed(3, obs(vision.TargetInMatch))
	w := r.m.Wanted(false)
	if w.Targets[vision.TargetLobby] || !w.Targets[vision.TargetChestPrompt] || !w.Targets[vision.TargetReward] {
		t.Fatalf("alvos em partida incorretos: %v", w.Targets)
	}
	if !r.m.Wanted(true).Targets[vision.TargetLobby] {
		t.Fatal("varredura completa deve incluir tudo")
	}
}

func TestRewardDedup(t *testing.T) {
	d := NewRewardDeduper(90 * time.Second)
	now := time.Now()
	k := Key(3, "tpl", vision.ScopeSquad, "Nina")
	if !d.Accept(k, now) {
		t.Fatal("primeira deve ser aceita")
	}
	for i := 1; i < 20; i++ { // notificação visível por 10 s
		if d.Accept(k, now.Add(time.Duration(i)*500*time.Millisecond)) {
			t.Fatal("duplicada aceita")
		}
	}
	if !d.Accept(Key(3, "tpl", vision.ScopeOwn, ""), now) {
		t.Fatal("recebida na própria conta é um registro diferente do anúncio do Squad")
	}
	if !d.Accept(k, now.Add(3*time.Minute)) {
		t.Fatal("após a janela deve aceitar novamente")
	}
}
