package vision

import (
	"image"
	"math"
)

// Rarity representa as raridades de itens.
type Rarity string

const (
	RarityUnknown   Rarity = "desconhecida"
	RarityCommon    Rarity = "comum"
	RarityUncommon  Rarity = "incomum"
	RarityRare      Rarity = "raro"
	RarityEpic      Rarity = "epico"
	RarityLegendary Rarity = "lendario"
	RarityMythic    Rarity = "mitico"
	RarityExotic    Rarity = "exotico"
)

// Rarities em ordem crescente.
var Rarities = []Rarity{RarityCommon, RarityUncommon, RarityRare, RarityEpic, RarityLegendary, RarityMythic, RarityExotic}

// IsLegendaryTier indica raridades que disparam o efeito dourado especial.
func (r Rarity) IsLegendaryTier() bool {
	return r == RarityLegendary || r == RarityMythic || r == RarityExotic
}

// ValidRarity verifica se a string é uma raridade conhecida.
func ValidRarity(s string) bool {
	if Rarity(s) == RarityUnknown {
		return true
	}
	for _, r := range Rarities {
		if string(r) == s {
			return true
		}
	}
	return false
}

func rgbToHSV(r, g, b uint8) (h, s, v float64) {
	rf, gf, bf := float64(r)/255, float64(g)/255, float64(b)/255
	mx := math.Max(rf, math.Max(gf, bf))
	mn := math.Min(rf, math.Min(gf, bf))
	v = mx
	d := mx - mn
	if mx > 0 {
		s = d / mx
	}
	if d == 0 {
		return 0, s, v
	}
	switch mx {
	case rf:
		h = math.Mod((gf-bf)/d, 6)
	case gf:
		h = (bf-rf)/d + 2
	default:
		h = (rf-gf)/d + 4
	}
	h *= 60
	if h < 0 {
		h += 360
	}
	return
}

// hueRarity classifica um matiz saturado na paleta de raridades do jogo.
func hueRarity(h, s, v float64) Rarity {
	switch {
	case h >= 15 && h < 38:
		return RarityLegendary // laranja/dourado
	case h >= 38 && h < 62:
		return RarityMythic // amarelo-ouro
	case h >= 75 && h < 150:
		return RarityUncommon // verde
	case h >= 175 && h < 195 && v > 0.75:
		return RarityExotic // ciano claro
	case h >= 195 && h < 245:
		return RarityRare // azul
	case h >= 260 && h < 310:
		return RarityEpic // roxo
	}
	return RarityUnknown
}

// RarityEstimate é o resultado da estimativa de raridade pela cor.
type RarityEstimate struct {
	Rarity     Rarity  `json:"rarity"`
	Confidence float64 `json:"confidence"` // fração dos pixels coloridos que votaram na raridade vencedora
	Coverage   float64 `json:"coverage"`   // fração da região com pixels saturados
}

// EstimateRarity estima a raridade pela cor dominante saturada de uma região.
// É uma heurística: o resultado deve ser tratado como "não confirmado" sem template.
func EstimateRarity(s *Small, r image.Rectangle) RarityEstimate {
	r = r.Intersect(image.Rect(0, 0, s.W, s.H))
	votes := map[Rarity]int{}
	colored, total, gray := 0, 0, 0
	for y := r.Min.Y; y < r.Max.Y; y++ {
		for x := r.Min.X; x < r.Max.X; x++ {
			i := (y*s.W + x) * 3
			h, sat, v := rgbToHSV(s.RGB[i], s.RGB[i+1], s.RGB[i+2])
			total++
			if sat > 0.45 && v > 0.35 {
				if rr := hueRarity(h, sat, v); rr != RarityUnknown {
					votes[rr]++
					colored++
				}
			} else if sat < 0.12 && v > 0.55 && v < 0.85 {
				gray++
			}
		}
	}
	if total == 0 {
		return RarityEstimate{Rarity: RarityUnknown}
	}
	best, bestN := RarityUnknown, 0
	for _, rr := range Rarities {
		if votes[rr] > bestN {
			best, bestN = rr, votes[rr]
		}
	}
	cov := float64(colored) / float64(total)
	if cov < 0.04 {
		if float64(gray)/float64(total) > 0.3 {
			return RarityEstimate{Rarity: RarityCommon, Confidence: 0.3, Coverage: cov}
		}
		return RarityEstimate{Rarity: RarityUnknown, Coverage: cov}
	}
	return RarityEstimate{Rarity: best, Confidence: float64(bestN) / float64(colored), Coverage: cov}
}
