package capture

import "treasurehunter/internal/vision"

// IsBlank detecta quadros pretos/uniformes — típico de jogos em tela cheia exclusiva,
// que o GDI não consegue capturar. Amostra uma grade esparsa (barato).
func IsBlank(f *vision.Frame) bool {
	if f == nil || f.W == 0 {
		return true
	}
	var mn, mx byte = 255, 0
	for gy := 1; gy < 16; gy++ {
		y := gy * f.H / 16
		row := f.BGRA[y*f.Stride:]
		for gx := 1; gx < 16; gx++ {
			x := gx * f.W / 16
			v := row[x*4+1]
			if v < mn {
				mn = v
			}
			if v > mx {
				mx = v
			}
		}
	}
	return mx-mn < 3
}
