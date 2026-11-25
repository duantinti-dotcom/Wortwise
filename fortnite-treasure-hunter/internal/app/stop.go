package app

import (
	"fmt"
	"time"

	"treasurehunter/internal/config"
	"treasurehunter/internal/storage"
	"treasurehunter/internal/vision"
)

// Counters são os contadores (da sessão atual e totais).
type Counters struct {
	MatchesStarted     int     `json:"matchesStarted"`
	MatchesCompleted   int     `json:"matchesCompleted"`
	MatchesInterrupted int     `json:"matchesInterrupted"`
	Victories          int     `json:"victories"`
	ChestsConfirmed    int     `json:"chestsConfirmed"`
	ChestsUnconfirmed  int     `json:"chestsUnconfirmed"`
	ChestsManual       int     `json:"chestsManual"`
	RareItems          int     `json:"rareItems"`
	RareUnconfirmed    int     `json:"rareUnconfirmed"`
	SquadRewards       int     `json:"squadRewards"`
	Tokens             int     `json:"tokens"`
	GoldSkins          int     `json:"goldSkins"`
	Elementals         int     `json:"elementals"`
	OperationSeconds   float64 `json:"operationSeconds"`
}

// Chests devolve os baús identificados com confiança (confirmados + registrados manualmente).
func (c Counters) Chests() int { return c.ChestsConfirmed + c.ChestsManual }

// AvgChests devolve a média de baús por partida concluída ou interrompida.
func (c Counters) AvgChests() float64 {
	n := c.MatchesCompleted + c.MatchesInterrupted
	if n == 0 {
		if c.MatchesStarted > 0 {
			n = c.MatchesStarted
		} else {
			return 0
		}
	}
	return float64(c.Chests()) / float64(n)
}

// ApplyReward atualiza os contadores com uma recompensa.
func (c *Counters) ApplyReward(r storage.Reward) {
	if !r.Confirmed {
		c.RareUnconfirmed++
		return
	}
	c.RareItems++
	if r.Scope == vision.ScopeSquad {
		c.SquadRewards++
	}
	switch r.Category {
	case vision.CategoryPirateToken:
		c.Tokens++
	case vision.CategoryGoldSkin:
		c.GoldSkins++
	case vision.CategoryElemental:
		c.Elementals++
	}
}

// CheckStop avalia as condições de parada. Recompensas não confirmadas nunca param a operação.
// newReward pode ser nil (verificação periódica de limites).
func CheckStop(sc config.StopConditions, session Counters, newReward *storage.Reward) (bool, string) {
	if sc.Continuous {
		return false, ""
	}
	if r := newReward; r != nil && r.Confirmed && (r.Scope != vision.ScopeSquad || sc.IncludeSquad) {
		who := ""
		if r.Scope == vision.ScopeSquad {
			who = " (Squad"
			if r.Finder != "" {
				who += ": " + r.Finder
			}
			who += ")"
		}
		switch {
		case sc.PirateToken && r.Category == vision.CategoryPirateToken:
			return true, "Token da Loja Pirata encontrado" + who
		case sc.GoldSkin && r.Category == vision.CategoryGoldSkin:
			return true, "Skin dourada encontrada" + who
		case sc.Elemental && r.Category == vision.CategoryElemental:
			return true, "Item elemental encontrado" + who
		case sc.SelectedRare && r.TemplateID != "" && contains(sc.SelectedIDs, r.TemplateID):
			return true, fmt.Sprintf("Item selecionado encontrado: %s%s", r.Name, who)
		}
	}
	if sc.ChestLimit > 0 && session.Chests() >= sc.ChestLimit {
		return true, fmt.Sprintf("Limite de %d baús atingido", sc.ChestLimit)
	}
	if sc.MatchLimit > 0 && session.MatchesCompleted+session.MatchesInterrupted >= sc.MatchLimit {
		return true, fmt.Sprintf("Limite de %d partidas atingido", sc.MatchLimit)
	}
	if sc.TimeLimitMin > 0 && time.Duration(session.OperationSeconds*float64(time.Second)) >= time.Duration(sc.TimeLimitMin)*time.Minute {
		return true, fmt.Sprintf("Tempo limite de %d min atingido", sc.TimeLimitMin)
	}
	return false, ""
}

func contains(xs []string, s string) bool {
	for _, x := range xs {
		if x == s {
			return true
		}
	}
	return false
}

// IsSpecial indica recompensas que disparam o efeito dourado.
func IsSpecial(r storage.Reward) bool {
	return r.Confirmed && (r.Category == vision.CategoryPirateToken || r.Category == vision.CategoryGoldSkin ||
		vision.Rarity(r.Rarity).IsLegendaryTier())
}
