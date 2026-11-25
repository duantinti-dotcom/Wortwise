package state

import (
	"fmt"
	"time"
)

// RewardDeduper impede registros duplicados da mesma recompensa: a notificação fica
// visível por vários quadros e pode aparecer para a própria conta e para o Squad.
type RewardDeduper struct {
	Window time.Duration
	seen   map[string]time.Time
}

// NewRewardDeduper cria o filtro com a janela informada.
func NewRewardDeduper(window time.Duration) *RewardDeduper {
	return &RewardDeduper{Window: window, seen: map[string]time.Time{}}
}

// Key monta a chave da recompensa. A notificação continua visível enquanto existir,
// então a mesma combinação dentro da janela é a mesma recompensa.
func Key(match int, templateID, scope, finder string) string {
	return fmt.Sprintf("%d|%s|%s|%s", match, templateID, scope, finder)
}

// Accept devolve true se a recompensa ainda não foi registrada na janela. Cada quadro
// em que ela continua visível renova a janela, para não contar duas vezes a mesma notificação.
func (d *RewardDeduper) Accept(key string, now time.Time) bool {
	for k, t := range d.seen {
		if now.Sub(t) > d.Window {
			delete(d.seen, k)
		}
	}
	_, dup := d.seen[key]
	d.seen[key] = now
	return !dup
}

// Reset limpa (nova operação).
func (d *RewardDeduper) Reset() { d.seen = map[string]time.Time{} }
