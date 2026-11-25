package vision

import (
	"image/color"
	"testing"
	"time"
)

// biblioteca realista: 13 templates distribuídos pela tela, como uma calibração completa.
func perfSetup(b testing.TB) (*Detector, *Frame) {
	l, _ := NewLibrary(b.TempDir())
	img := scene(1920, 1080, 1)
	pos := [][2]int{{1500, 900}, {100, 100}, {800, 500}, {1600, 80}, {60, 900}, {1200, 300}, {400, 700}, {1650, 600}, {900, 950}, {200, 400}, {1400, 450}, {700, 150}, {1000, 750}}
	targets := AllTargets
	for i, p := range pos {
		stamp(img, p[0], p[1], 1, color.RGBA{uint8(40 + i*15), 200, uint8(250 - i*12), 255})
	}
	s := smallOf(img)
	for i, p := range pos {
		meta := TemplateMeta{Target: targets[i], Label: string(targets[i]), Box: Rect{float64(p[0]) / 1920, float64(p[1]) / 1080, 220.0 / 1920, 64.0 / 1080}, SourceW: 1920, SourceH: 1080}
		if targets[i] == TargetReward {
			meta.Category, meta.Scope = CategoryPirateToken, ScopeSquad
		}
		if _, err := l.Add(s, meta); err != nil {
			b.Fatal(err)
		}
	}
	return &Detector{Lib: l, AutoScale: true}, FrameFromImage(scene(1920, 1080, 33))
}

func BenchmarkDownscale1080p(b *testing.B) {
	_, f := perfSetup(b)
	var s *Small
	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		s = Downscale(f, s)
	}
}

func BenchmarkDownscale4K(b *testing.B) {
	f := FrameFromImage(scene(3840, 2160, 3))
	var s *Small
	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		s = Downscale(f, s)
	}
}

func BenchmarkAnalyzeInMatch(b *testing.B) {
	d, f := perfSetup(b)
	s := Downscale(f, nil)
	req := Request{Targets: map[Target]bool{TargetInMatch: true, TargetSpectating: true, TargetSquadOut: true, TargetVictory: true, TargetChestPrompt: true, TargetChestOpened: true, TargetReward: true, TargetError: true}}
	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		d.Analyze(s, req)
	}
}

func BenchmarkAnalyzeFullScan(b *testing.B) {
	d, f := perfSetup(b)
	s := Downscale(f, nil)
	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		d.Analyze(s, AllRequest())
	}
}

// TestFrameBudget garante que o pior caso (varredura completa com ajuste de escala)
// cabe com folga no intervalo do perfil Máximo desempenho (200 ms por quadro).
func TestFrameBudget(t *testing.T) {
	if testing.Short() {
		t.Skip()
	}
	d, f := perfSetup(t)
	var s *Small
	start := time.Now()
	const n = 20
	for i := 0; i < n; i++ {
		s = Downscale(f, s)
		d.Analyze(s, AllRequest())
	}
	per := time.Since(start) / n
	t.Logf("pior caso por quadro (1080p, 13 templates, varredura completa): %v", per)
	if per > 60*time.Millisecond {
		t.Fatalf("quadro levou %v; orçamento é 60 ms", per)
	}
}
