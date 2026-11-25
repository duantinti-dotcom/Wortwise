// Package vision implementa o reconhecimento visual leve usado pelo Treasure Hunter.
//
// Tudo roda sobre uma cópia reduzida do quadro (largura de análise fixa), o que
// torna o custo praticamente independente da resolução do jogo.
package vision

import (
	"image"
	"image/color"
)

// AnalysisWidth é a largura (px) da imagem de análise. Templates são salvos nessa escala.
const AnalysisWidth = 640

// Frame é um quadro bruto capturado da tela em BGRA (formato nativo do GDI).
type Frame struct {
	W, H   int
	Stride int
	BGRA   []byte
}

// FrameFromImage converte uma image.Image qualquer em Frame (usado em testes e calibração por arquivo).
func FrameFromImage(img image.Image) *Frame {
	b := img.Bounds()
	f := &Frame{W: b.Dx(), H: b.Dy(), Stride: b.Dx() * 4}
	f.BGRA = make([]byte, f.Stride*f.H)
	if rgba, ok := img.(*image.RGBA); ok {
		for y := 0; y < f.H; y++ {
			src := rgba.Pix[(y)*rgba.Stride : y*rgba.Stride+f.W*4]
			dst := f.BGRA[y*f.Stride:]
			for x := 0; x < f.W; x++ {
				dst[x*4], dst[x*4+1], dst[x*4+2], dst[x*4+3] = src[x*4+2], src[x*4+1], src[x*4], 255
			}
		}
		return f
	}
	for y := 0; y < f.H; y++ {
		for x := 0; x < f.W; x++ {
			r, g, bb, _ := img.At(b.Min.X+x, b.Min.Y+y).RGBA()
			i := y*f.Stride + x*4
			f.BGRA[i], f.BGRA[i+1], f.BGRA[i+2], f.BGRA[i+3] = byte(bb>>8), byte(g>>8), byte(r>>8), 255
		}
	}
	return f
}

// ToRGBA devolve uma cópia em RGBA (para salvar capturas em PNG).
func (f *Frame) ToRGBA() *image.RGBA {
	img := image.NewRGBA(image.Rect(0, 0, f.W, f.H))
	for y := 0; y < f.H; y++ {
		src := f.BGRA[y*f.Stride:]
		dst := img.Pix[y*img.Stride:]
		for x := 0; x < f.W; x++ {
			dst[x*4], dst[x*4+1], dst[x*4+2], dst[x*4+3] = src[x*4+2], src[x*4+1], src[x*4], 255
		}
	}
	return img
}

// Clone copia o quadro (o buffer de captura é reutilizado entre quadros).
func (f *Frame) Clone() *Frame {
	c := *f
	c.BGRA = append([]byte(nil), f.BGRA...)
	return &c
}

// Small é a imagem reduzida usada na análise: RGB e escala de cinza.
type Small struct {
	W, H int
	RGB  []uint8 // 3 bytes por pixel
	Gray *Gray
}

// Gray é uma imagem em tons de cinza.
type Gray struct {
	W, H int
	Pix  []uint8
}

// At devolve o pixel (sem verificação de limites).
func (g *Gray) At(x, y int) uint8 { return g.Pix[y*g.W+x] }

// Crop recorta uma região (em pixels) já limitada à imagem.
func (g *Gray) Crop(r image.Rectangle) *Gray {
	r = r.Intersect(image.Rect(0, 0, g.W, g.H))
	out := &Gray{W: r.Dx(), H: r.Dy(), Pix: make([]uint8, r.Dx()*r.Dy())}
	for y := 0; y < out.H; y++ {
		copy(out.Pix[y*out.W:(y+1)*out.W], g.Pix[(r.Min.Y+y)*g.W+r.Min.X:])
	}
	return out
}

// Half reduz a imagem pela metade (média 2x2), usada na busca grossa.
func (g *Gray) Half() *Gray {
	w, h := g.W/2, g.H/2
	if w < 1 || h < 1 {
		return &Gray{W: 0, H: 0}
	}
	out := &Gray{W: w, H: h, Pix: make([]uint8, w*h)}
	for y := 0; y < h; y++ {
		r0 := g.Pix[(2*y)*g.W:]
		r1 := g.Pix[(2*y+1)*g.W:]
		for x := 0; x < w; x++ {
			s := int(r0[2*x]) + int(r0[2*x+1]) + int(r1[2*x]) + int(r1[2*x+1])
			out.Pix[y*w+x] = uint8((s + 2) / 4)
		}
	}
	return out
}

// ToImage converte para image.Gray (para salvar templates).
func (g *Gray) ToImage() *image.Gray {
	img := image.NewGray(image.Rect(0, 0, g.W, g.H))
	for y := 0; y < g.H; y++ {
		copy(img.Pix[y*img.Stride:y*img.Stride+g.W], g.Pix[y*g.W:(y+1)*g.W])
	}
	return img
}

// GrayFromImage converte uma imagem qualquer em Gray.
func GrayFromImage(img image.Image) *Gray {
	b := img.Bounds()
	g := &Gray{W: b.Dx(), H: b.Dy(), Pix: make([]uint8, b.Dx()*b.Dy())}
	for y := 0; y < g.H; y++ {
		for x := 0; x < g.W; x++ {
			c := color.GrayModel.Convert(img.At(b.Min.X+x, b.Min.Y+y)).(color.Gray)
			g.Pix[y*g.W+x] = c.Y
		}
	}
	return g
}

// Downscale reduz o quadro para a largura de análise usando média por área.
// O buffer de destino é reutilizado quando possível para evitar alocações.
func Downscale(f *Frame, reuse *Small) *Small {
	if f.W <= 0 || f.H <= 0 {
		return &Small{Gray: &Gray{}}
	}
	dw := AnalysisWidth
	if f.W < dw {
		dw = f.W
	}
	dh := f.H * dw / f.W
	if dh < 1 {
		dh = 1
	}
	s := reuse
	if s == nil || s.W != dw || s.H != dh {
		s = &Small{W: dw, H: dh, RGB: make([]uint8, dw*dh*3), Gray: &Gray{W: dw, H: dh, Pix: make([]uint8, dw*dh)}}
	}
	// Limites das caixas em x pré-calculados.
	xs := make([]int, dw+1)
	for i := 0; i <= dw; i++ {
		xs[i] = i * f.W / dw
	}
	for dy := 0; dy < dh; dy++ {
		y0, y1 := dy*f.H/dh, (dy+1)*f.H/dh
		if y1 <= y0 {
			y1 = y0 + 1
		}
		// Amostragem em passo 2 nas linhas/colunas de caixas grandes: custo menor, qualidade suficiente.
		ystep := 1
		if y1-y0 >= 3 {
			ystep = 2
		}
		for dx := 0; dx < dw; dx++ {
			x0, x1 := xs[dx], xs[dx+1]
			if x1 <= x0 {
				x1 = x0 + 1
			}
			xstep := 1
			if x1-x0 >= 3 {
				xstep = 2
			}
			var sr, sg, sb, n int
			for y := y0; y < y1; y += ystep {
				row := f.BGRA[y*f.Stride:]
				for x := x0; x < x1; x += xstep {
					i := x * 4
					sb += int(row[i])
					sg += int(row[i+1])
					sr += int(row[i+2])
					n++
				}
			}
			r, g, b := uint8(sr/n), uint8(sg/n), uint8(sb/n)
			o := (dy*dw + dx)
			s.RGB[o*3], s.RGB[o*3+1], s.RGB[o*3+2] = r, g, b
			s.Gray.Pix[o] = uint8((299*int(r) + 587*int(g) + 114*int(b)) / 1000)
		}
	}
	return s
}

// Rect é um retângulo normalizado (0..1) em relação à tela.
type Rect struct {
	X float64 `json:"x"`
	Y float64 `json:"y"`
	W float64 `json:"w"`
	H float64 `json:"h"`
}

// Full é a tela inteira.
var Full = Rect{0, 0, 1, 1}

// Pixels converte para pixels em uma imagem w x h.
func (r Rect) Pixels(w, h int) image.Rectangle {
	x0 := int(r.X * float64(w))
	y0 := int(r.Y * float64(h))
	x1 := int((r.X + r.W) * float64(w))
	y1 := int((r.Y + r.H) * float64(h))
	return image.Rect(x0, y0, x1, y1).Intersect(image.Rect(0, 0, w, h))
}

// Expand aumenta o retângulo em `pad` (fração da tela) em todas as direções.
func (r Rect) Expand(pad float64) Rect {
	out := Rect{r.X - pad, r.Y - pad, r.W + 2*pad, r.H + 2*pad}
	if out.X < 0 {
		out.W += out.X
		out.X = 0
	}
	if out.Y < 0 {
		out.H += out.Y
		out.Y = 0
	}
	if out.X+out.W > 1 {
		out.W = 1 - out.X
	}
	if out.Y+out.H > 1 {
		out.H = 1 - out.Y
	}
	return out
}

// Valid indica se o retângulo tem área positiva dentro da tela.
func (r Rect) Valid() bool {
	return r.W > 0 && r.H > 0 && r.X >= 0 && r.Y >= 0 && r.X+r.W <= 1.0001 && r.Y+r.H <= 1.0001
}

// Signature é uma miniatura 32x18 usada para detectar quadros idênticos rapidamente.
type Signature [32 * 18]uint8

// Sign calcula a assinatura do quadro reduzido.
func Sign(s *Small) Signature {
	var sig Signature
	if s.W == 0 || s.H == 0 {
		return sig
	}
	for y := 0; y < 18; y++ {
		sy := y * s.H / 18
		for x := 0; x < 32; x++ {
			sx := x * s.W / 32
			sig[y*32+x] = s.Gray.Pix[sy*s.W+sx]
		}
	}
	return sig
}

// Diff é a diferença média absoluta entre duas assinaturas (0..255).
func (a *Signature) Diff(b *Signature) float64 {
	t := 0
	for i := range a {
		d := int(a[i]) - int(b[i])
		if d < 0 {
			d = -d
		}
		t += d
	}
	return float64(t) / float64(len(a))
}

// DHash é um hash perceptual de 64 bits de uma região (para evitar registros duplicados).
func DHash(g *Gray) uint64 {
	if g.W < 2 || g.H < 1 {
		return 0
	}
	var h uint64
	bit := 0
	for y := 0; y < 8; y++ {
		sy := y * g.H / 8
		for x := 0; x < 8; x++ {
			a := g.Pix[sy*g.W+x*(g.W-1)/9]
			b := g.Pix[sy*g.W+(x+1)*(g.W-1)/9]
			if a > b {
				h |= 1 << uint(bit)
			}
			bit++
		}
	}
	return h
}

// HammingDistance conta bits diferentes.
func HammingDistance(a, b uint64) int {
	x := a ^ b
	n := 0
	for x != 0 {
		x &= x - 1
		n++
	}
	return n
}
