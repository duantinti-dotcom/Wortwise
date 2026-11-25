package app

import (
	"testing"

	"treasurehunter/internal/config"
	"treasurehunter/internal/storage"
	"treasurehunter/internal/vision"
)

func TestStopOnSquadToken(t *testing.T) {
	sc := config.StopConditions{PirateToken: true, IncludeSquad: true}
	r := storage.Reward{Category: vision.CategoryPirateToken, Scope: vision.ScopeSquad, Finder: "Nina", Confirmed: true}
	if stop, why := CheckStop(sc, Counters{}, &r); !stop || why == "" {
		t.Fatal("token encontrado pelo Squad deve parar")
	}
	sc.IncludeSquad = false
	if stop, _ := CheckStop(sc, Counters{}, &r); stop {
		t.Fatal("com IncludeSquad=false não deve parar por item de colega")
	}
}

func TestUnconfirmedNeverStops(t *testing.T) {
	sc := config.StopConditions{PirateToken: true, GoldSkin: true, IncludeSquad: true}
	r := storage.Reward{Category: vision.CategoryGoldSkin, Scope: vision.ScopeOwn, Confirmed: false}
	if stop, _ := CheckStop(sc, Counters{}, &r); stop {
		t.Fatal("não confirmado não pode parar")
	}
}

func TestSelectedRareAndLimits(t *testing.T) {
	sc := config.StopConditions{SelectedRare: true, SelectedIDs: []string{"x"}}
	r := storage.Reward{TemplateID: "x", Name: "Arco", Category: vision.CategoryRare, Scope: vision.ScopeOwn, Confirmed: true}
	if stop, _ := CheckStop(sc, Counters{}, &r); !stop {
		t.Fatal("item selecionado deve parar")
	}
	sc = config.StopConditions{ChestLimit: 10, MatchLimit: 3, TimeLimitMin: 30}
	if stop, _ := CheckStop(sc, Counters{ChestsConfirmed: 9}, nil); stop {
		t.Fatal("abaixo do limite")
	}
	if stop, _ := CheckStop(sc, Counters{ChestsConfirmed: 8, ChestsManual: 2}, nil); !stop {
		t.Fatal("limite de baús (inclui manuais)")
	}
	if stop, _ := CheckStop(sc, Counters{MatchesCompleted: 2, MatchesInterrupted: 1}, nil); !stop {
		t.Fatal("limite de partidas")
	}
	if stop, _ := CheckStop(sc, Counters{OperationSeconds: 1800}, nil); !stop {
		t.Fatal("limite de tempo")
	}
	sc.Continuous = true
	if stop, _ := CheckStop(sc, Counters{ChestsConfirmed: 999}, nil); stop {
		t.Fatal("contínuo ignora condições")
	}
}

func TestCountersAndAverage(t *testing.T) {
	var c Counters
	c.ApplyReward(storage.Reward{Category: vision.CategoryPirateToken, Scope: vision.ScopeSquad, Confirmed: true})
	c.ApplyReward(storage.Reward{Category: vision.CategoryElemental, Scope: vision.ScopeOwn, Confirmed: false})
	if c.Tokens != 1 || c.SquadRewards != 1 || c.RareItems != 1 || c.RareUnconfirmed != 1 || c.Elementals != 0 {
		t.Fatalf("contadores errados: %+v", c)
	}
	c.ChestsConfirmed, c.MatchesCompleted = 12, 4
	if c.AvgChests() != 3 {
		t.Fatalf("média errada: %v", c.AvgChests())
	}
}
