package vision

import (
	"image"
	"sync"
	"time"
)

// Detection é o resultado de um template em um quadro.
type Detection struct {
	Target     Target  `json:"target"`
	TemplateID string  `json:"templateId"`
	Label      string  `json:"label"`
	Category   string  `json:"category,omitempty"`
	Rarity     Rarity  `json:"rarity,omitempty"`
	Scope      string  `json:"scope,omitempty"`
	Score      float64 `json:"score"`
	Threshold  float64 `json:"threshold"`
	Confirmed  bool    `json:"confirmed"` // score >= limiar
	Uncertain  bool    `json:"uncertain"` // logo abaixo do limiar: não confirmado
	Box        Rect    `json:"box"`
	Finder     string  `json:"finder,omitempty"` // integrante do Squad identificado ao lado da notificação
	px         image.Rectangle
}

// Pixels devolve a caixa em pixels de análise.
func (d Detection) Pixels() image.Rectangle { return d.px }

// Observation é tudo o que foi reconhecido em um quadro.
type Observation struct {
	Hits     map[Target]Detection // melhor detecção confirmada (ou incerta) por alvo
	Rewards  []Detection          // recompensas confirmadas ou incertas
	Scanned  int                  // templates avaliados
	Duration time.Duration
	FullScan bool
}

// Has indica se o alvo foi confirmado no quadro.
func (o Observation) Has(t Target) bool {
	d, ok := o.Hits[t]
	return ok && d.Confirmed
}

// Request define o que deve ser verificado neste quadro (varredura orientada pelo estado).
type Request struct {
	Targets map[Target]bool
	// RewardCategories limita a busca de recompensas; nil = todas.
	RewardCategories map[string]bool
	// Full marca uma varredura completa (permite busca em escalas alternativas).
	Full bool
}

// AllRequest verifica todos os alvos.
func AllRequest() Request {
	r := Request{Targets: map[Target]bool{}, Full: true}
	for _, t := range AllTargets {
		r.Targets[t] = true
	}
	return r
}

// Detector executa os templates da biblioteca sobre um quadro reduzido.
type Detector struct {
	Lib *Library
	// AutoScale testa escalas vizinhas quando o template não é encontrado na escala esperada
	// (interface do Fortnite com outra escala ou outra proporção de tela).
	AutoScale bool
	mu        sync.Mutex
}

// Analyze avalia os templates pedidos.
func (d *Detector) Analyze(s *Small, req Request) Observation {
	d.mu.Lock()
	defer d.mu.Unlock()
	start := time.Now()
	obs := Observation{Hits: map[Target]Detection{}, FullScan: req.Full}
	if s == nil || s.W == 0 {
		return obs
	}
	half := s.Gray.Half()
	var teammates []*Template
	for _, t := range d.Lib.Snapshot() {
		if t.Target == TargetTeammate {
			teammates = append(teammates, t)
			continue
		}
		if !req.Targets[t.Target] {
			continue
		}
		if t.Target == TargetReward && req.RewardCategories != nil && !req.RewardCategories[t.Category] {
			continue
		}
		det := d.run(s, half, t, t.ROI.Pixels(s.W, s.H), req.Full)
		obs.Scanned++
		if !det.Confirmed && !det.Uncertain {
			continue
		}
		if t.Target == TargetReward {
			obs.Rewards = append(obs.Rewards, det)
			continue
		}
		if prev, ok := obs.Hits[t.Target]; !ok || better(det, prev) {
			obs.Hits[t.Target] = det
		}
	}
	// Identifica quem encontrou o item: procura nomes calibrados na mesma linha da notificação.
	if len(teammates) > 0 {
		for i := range obs.Rewards {
			r := &obs.Rewards[i]
			if r.Scope != ScopeSquad {
				continue
			}
			bestScore := 0.0
			for _, tm := range teammates {
				h := r.px.Dy()
				roi := tm.ROI.Pixels(s.W, s.H)
				band := image.Rect(roi.Min.X, r.px.Min.Y-h, roi.Max.X, r.px.Max.Y+h).Intersect(image.Rect(0, 0, s.W, s.H))
				det := d.run(s, half, tm, band, false)
				obs.Scanned++
				if det.Confirmed && det.Score > bestScore {
					bestScore = det.Score
					r.Finder = tm.Label
				}
			}
		}
	}
	obs.Duration = time.Since(start)
	return obs
}

var neighborScales = []float64{0.92, 1.08, 0.85, 1.15, 0.78, 1.22}

func better(a, b Detection) bool {
	if a.Confirmed != b.Confirmed {
		return a.Confirmed
	}
	return a.Score > b.Score
}

func (d *Detector) run(s *Small, half *Gray, t *Template, roi image.Rectangle, full bool) Detection {
	base := t.baseScale(s.W, s.H)
	if base < 0.97 || base > 1.03 {
		// Proporção diferente da calibração: elementos ancorados nas bordas se deslocam na horizontal.
		roi = image.Rect(roi.Min.X-s.W/8, roi.Min.Y, roi.Max.X+s.W/8, roi.Max.Y)
	}
	scale := base
	if t.bestScale > 0 {
		scale = t.bestScale
	}
	m := t.scaledPattern(scale).Find(s.Gray, half, roi)
	if d.AutoScale && full && m.Score < t.Threshold {
		// Rodízio: cada varredura completa testa duas escalas vizinhas, mantendo o custo baixo.
		// A escala que funcionar fica memorizada para os próximos quadros.
		t.scaleTurn = (t.scaleTurn + 1) % (len(neighborScales) / 2)
		for _, f := range neighborScales[t.scaleTurn*2 : t.scaleTurn*2+2] {
			sc := base * f
			r := t.scaledPattern(sc).Find(s.Gray, half, roi.Inset(-int(float64(roi.Dy())*0.1)))
			if r.Score > m.Score {
				m = r
				if r.Score >= t.Threshold {
					t.bestScale = sc
					break
				}
			}
		}
	} else if m.Score >= t.Threshold && t.bestScale == 0 {
		t.bestScale = scale
	}
	det := Detection{
		Target: t.Target, TemplateID: t.ID, Label: t.Label, Category: t.Category, Rarity: t.Rarity, Scope: t.Scope,
		Score: m.Score, Threshold: t.Threshold, px: m.Box,
	}
	det.Confirmed = m.Score >= t.Threshold
	det.Uncertain = !det.Confirmed && m.Score >= t.Threshold-UncertainBand
	if s.W > 0 && s.H > 0 {
		det.Box = Rect{float64(m.Box.Min.X) / float64(s.W), float64(m.Box.Min.Y) / float64(s.H), float64(m.Box.Dx()) / float64(s.W), float64(m.Box.Dy()) / float64(s.H)}
	}
	return det
}

// Detect avalia um único template na imagem inteira de sua área de busca (teste de reconhecimento).
func (d *Detector) Detect(s *Small, t *Template) Detection {
	d.mu.Lock()
	defer d.mu.Unlock()
	return d.run(s, s.Gray.Half(), t, t.ROI.Pixels(s.W, s.H), true)
}
