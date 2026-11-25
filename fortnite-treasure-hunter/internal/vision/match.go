package vision

import (
	"image"
	"math"
	"sort"
	"sync"
)

// Pattern é um template pré-processado para correlação cruzada normalizada (NCC).
type Pattern struct {
	full, half *prepared
}

type prepared struct {
	w, h int
	zm   []float32 // template com média zero
	norm float64   // sqrt(soma dos quadrados)
	flat bool      // template sem textura (não confiável)
}

func prepare(g *Gray) *prepared {
	p := &prepared{w: g.W, h: g.H}
	n := g.W * g.H
	if n == 0 {
		p.flat = true
		return p
	}
	var sum float64
	for _, v := range g.Pix {
		sum += float64(v)
	}
	mean := sum / float64(n)
	p.zm = make([]float32, n)
	var ss float64
	for i, v := range g.Pix {
		d := float64(v) - mean
		p.zm[i] = float32(d)
		ss += d * d
	}
	p.norm = math.Sqrt(ss)
	// Desvio padrão < 4 níveis de cinza: região lisa demais para identificação confiável.
	p.flat = math.Sqrt(ss/float64(n)) < 4
	return p
}

// NewPattern prepara um template em escala de análise.
func NewPattern(g *Gray) *Pattern {
	pt := &Pattern{full: prepare(g)}
	if g.W >= 16 && g.H >= 10 {
		pt.half = prepare(g.Half())
	}
	return pt
}

// Flat indica template sem textura suficiente.
func (p *Pattern) Flat() bool { return p.full.flat }

// Size devolve o tamanho do template em pixels de análise.
func (p *Pattern) Size() (int, int) { return p.full.w, p.full.h }

// Match é o resultado de uma busca.
type Match struct {
	Score float64         // NCC em [-1, 1]
	Box   image.Rectangle // posição na imagem de análise
}

// integral guarda somas acumuladas de I e I² para médias/variâncias O(1).
type integral struct {
	w  int
	s  []float64
	s2 []float64
}

var integralPool = sync.Pool{New: func() any { return &integral{} }}

func newIntegral(g *Gray, r image.Rectangle) *integral {
	w, h := r.Dx(), r.Dy()
	in := integralPool.Get().(*integral)
	n := (w + 1) * (h + 1)
	if cap(in.s) < n {
		in.s, in.s2 = make([]float64, n), make([]float64, n)
	}
	in.w, in.s, in.s2 = w+1, in.s[:n], in.s2[:n]
	// A primeira linha precisa ser zero (as demais são sobrescritas).
	for i := 0; i <= w; i++ {
		in.s[i], in.s2[i] = 0, 0
	}
	for y := 0; y <= h; y++ {
		in.s[y*in.w], in.s2[y*in.w] = 0, 0
	}
	for y := 0; y < h; y++ {
		var rs, rs2 float64
		row := g.Pix[(r.Min.Y+y)*g.W+r.Min.X:]
		for x := 0; x < w; x++ {
			v := float64(row[x])
			rs += v
			rs2 += v * v
			i := (y+1)*in.w + x + 1
			in.s[i] = in.s[i-in.w] + rs
			in.s2[i] = in.s2[i-in.w] + rs2
		}
	}
	return in
}

func (in *integral) box(x, y, w, h int) (float64, float64) {
	a := y*in.w + x
	b := a + w
	c := (y+h)*in.w + x
	d := c + w
	return in.s[d] - in.s[b] - in.s[c] + in.s[a], in.s2[d] - in.s2[b] - in.s2[c] + in.s2[a]
}

// nccAt calcula a NCC do template na posição (x, y) relativa à região r da imagem.
func nccAt(g *Gray, r image.Rectangle, in *integral, p *prepared, x, y int) float64 {
	n := float64(p.w * p.h)
	s, s2 := in.box(x, y, p.w, p.h)
	varI := s2 - s*s/n
	if varI < 1e-6 || p.norm < 1e-6 {
		return 0
	}
	var num float32
	for ty := 0; ty < p.h; ty++ {
		row := g.Pix[(r.Min.Y+y+ty)*g.W+r.Min.X+x:]
		tz := p.zm[ty*p.w : (ty+1)*p.w]
		var acc float32
		for tx, t := range tz {
			acc += float32(row[tx]) * t
		}
		num += acc
	}
	return float64(num) / (math.Sqrt(varI) * p.norm)
}

// scan percorre todas as posições da região com um passo e devolve os k melhores.
func scan(g *Gray, r image.Rectangle, p *prepared, step, k int) []Match {
	if r.Dx() < p.w || r.Dy() < p.h {
		return nil
	}
	in := newIntegral(g, r)
	defer integralPool.Put(in)
	best := make([]Match, 0, k+1)
	for y := 0; y+p.h <= r.Dy(); y += step {
		for x := 0; x+p.w <= r.Dx(); x += step {
			sc := nccAt(g, r, in, p, x, y)
			if len(best) < k || sc > best[len(best)-1].Score {
				m := Match{Score: sc, Box: image.Rect(r.Min.X+x, r.Min.Y+y, r.Min.X+x+p.w, r.Min.Y+y+p.h)}
				best = append(best, m)
				sort.Slice(best, func(i, j int) bool { return best[i].Score > best[j].Score })
				if len(best) > k {
					best = best[:k]
				}
			}
		}
	}
	return best
}

// Find procura o template na região roi (pixels de análise) com busca em pirâmide:
// varredura grossa em meia resolução e refinamento local na resolução completa.
func (p *Pattern) Find(g *Gray, half *Gray, roi image.Rectangle) Match {
	roi = roi.Intersect(image.Rect(0, 0, g.W, g.H))
	f := p.full
	if roi.Dx() < f.w || roi.Dy() < f.h {
		return Match{Score: 0}
	}
	positions := (roi.Dx() - f.w + 1) * (roi.Dy() - f.h + 1)
	// Regiões pequenas: busca exaustiva direta.
	if p.half == nil || half == nil || positions < 2500 {
		res := scan(g, roi, f, 1, 1)
		if len(res) == 0 {
			return Match{}
		}
		return res[0]
	}
	hr := image.Rect(roi.Min.X/2, roi.Min.Y/2, roi.Max.X/2, roi.Max.Y/2)
	cands := scan(half, hr, p.half, 1, 3)
	best := Match{Score: -1}
	for _, c := range cands {
		cx, cy := c.Box.Min.X*2, c.Box.Min.Y*2
		local := image.Rect(cx-3, cy-3, cx+f.w+3, cy+f.h+3).Intersect(roi)
		res := scan(g, local, f, 1, 1)
		if len(res) > 0 && res[0].Score > best.Score {
			best = res[0]
		}
	}
	if best.Score < -0.99 {
		best.Score = 0
	}
	return best
}
