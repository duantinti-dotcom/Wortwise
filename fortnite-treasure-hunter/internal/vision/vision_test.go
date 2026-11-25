package vision

import (
	"image"
	"image/color"
	"math"
	"math/rand"
	"testing"
)

// cena sintética: fundo com textura e ruído, imitando um quadro de jogo.
func scene(w, h int, seed int64) *image.RGBA {
	rng := rand.New(rand.NewSource(seed))
	img := image.NewRGBA(image.Rect(0, 0, w, h))
	for y := 0; y < h; y++ {
		for x := 0; x < w; x++ {
			v := 60 + 40*math.Sin(float64(x)/37+float64(seed)) + 30*math.Cos(float64(y)/23) + float64(rng.Intn(20))
			img.Set(x, y, color.RGBA{uint8(v * 0.6), uint8(v * 0.8), uint8(v), 255})
		}
	}
	return img
}

// carimbo: um "botão" com texto simulado (barras) e borda, desenhado em (x, y) com escala s.
func stamp(img *image.RGBA, x, y int, s float64, c color.RGBA) {
	w, h := int(220*s), int(64*s)
	for yy := 0; yy < h; yy++ {
		for xx := 0; xx < w; xx++ {
			col := color.RGBA{20, 22, 30, 255}
			if xx < int(4*s) || yy < int(4*s) || xx >= w-int(4*s) || yy >= h-int(4*s) {
				col = c
			}
			// "letras": barras verticais de larguras variadas
			lx := float64(xx) / s
			ly := float64(yy) / s
			if ly > 18 && ly < 46 && lx > 24 && lx < 196 {
				k := int(lx-24) % 22
				if k < 4 || (k > 9 && k < 12) || (int(lx)%44 < 22 && ly < 24) {
					col = color.RGBA{250, 245, 230, 255}
				}
			}
			img.Set(x+xx, y+yy, col)
		}
	}
}

func smallOf(img *image.RGBA) *Small { return Downscale(FrameFromImage(img), nil) }

func newLib(t *testing.T) *Library {
	l, err := NewLibrary(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	return l
}

// calibra um template a partir de uma cena 1920x1080 com o carimbo em (x, y).
func calibrate(t *testing.T, l *Library, target Target, x, y int, c color.RGBA, extra TemplateMeta) *Template {
	img := scene(1920, 1080, 1)
	stamp(img, x, y, 1, c)
	s := smallOf(img)
	extra.Target = target
	extra.Box = Rect{float64(x) / 1920, float64(y) / 1080, 220.0 / 1920, 64.0 / 1080}
	extra.SourceW, extra.SourceH = 1920, 1080
	tp, err := l.Add(s, extra)
	if err != nil {
		t.Fatal(err)
	}
	return tp
}

func TestDetectsTemplateWithNoiseAndBrightness(t *testing.T) {
	l := newLib(t)
	calibrate(t, l, TargetLobby, 1500, 900, color.RGBA{246, 207, 116, 255}, TemplateMeta{Label: "JOGAR"})
	d := &Detector{Lib: l}
	// Nova cena (outro fundo), mesma posição com leve deslocamento e brilho diferente.
	img := scene(1920, 1080, 7)
	stamp(img, 1512, 893, 1, color.RGBA{230, 190, 100, 255})
	for i := range img.Pix {
		if i%4 != 3 {
			img.Pix[i] = uint8(math.Min(255, float64(img.Pix[i])*1.15))
		}
	}
	obs := d.Analyze(smallOf(img), AllRequest())
	if !obs.Has(TargetLobby) {
		t.Fatalf("lobby não reconhecido: %+v", obs.Hits[TargetLobby])
	}
}

func TestNoFalsePositiveOnDifferentScreen(t *testing.T) {
	l := newLib(t)
	calibrate(t, l, TargetLobby, 1500, 900, color.RGBA{246, 207, 116, 255}, TemplateMeta{Label: "JOGAR"})
	d := &Detector{Lib: l, AutoScale: true}
	for seed := int64(10); seed < 20; seed++ {
		obs := d.Analyze(smallOf(scene(1920, 1080, seed)), AllRequest())
		if obs.Has(TargetLobby) {
			t.Fatalf("falso positivo na cena %d (score %.3f)", seed, obs.Hits[TargetLobby].Score)
		}
	}
}

func TestResolutionIndependence(t *testing.T) {
	l := newLib(t)
	calibrate(t, l, TargetInMatch, 1500, 900, color.RGBA{79, 179, 255, 255}, TemplateMeta{Label: "HUD"})
	d := &Detector{Lib: l, AutoScale: true}
	// Mesma proporção 16:9, resolução menor (1280x720): posição relativa idêntica.
	img := scene(1280, 720, 3)
	stamp(img, 1000, 600, 1280.0/1920, color.RGBA{79, 179, 255, 255})
	if obs := d.Analyze(smallOf(img), AllRequest()); !obs.Has(TargetInMatch) {
		t.Fatalf("não reconhecido em 1280x720: %+v", obs.Hits[TargetInMatch])
	}
	// 4K
	img = scene(3840, 2160, 4)
	stamp(img, 3000, 1800, 2, color.RGBA{79, 179, 255, 255})
	if obs := d.Analyze(smallOf(img), AllRequest()); !obs.Has(TargetInMatch) {
		t.Fatalf("não reconhecido em 4K: %+v", obs.Hits[TargetInMatch])
	}
}

func TestAutoScaleHandlesHUDScale(t *testing.T) {
	l := newLib(t)
	calibrate(t, l, TargetInMatch, 1400, 860, color.RGBA{79, 179, 255, 255}, TemplateMeta{Label: "HUD"})
	img := scene(1920, 1080, 5)
	stamp(img, 1400, 860, 0.85, color.RGBA{79, 179, 255, 255}) // HUD 85%
	s := smallOf(img)
	without := (&Detector{Lib: l}).Analyze(s, AllRequest())
	dd := &Detector{Lib: l, AutoScale: true}
	var with Observation
	for i := 0; i < 3; i++ { // o rodízio de escalas cobre todas em poucas varreduras completas
		with = dd.Analyze(s, AllRequest())
	}
	if !with.Has(TargetInMatch) {
		t.Fatalf("ajuste de escala não reconheceu HUD a 85%%: sem=%.3f com=%.3f", without.Hits[TargetInMatch].Score, with.Hits[TargetInMatch].Score)
	}
}

func TestUncertainBand(t *testing.T) {
	l := newLib(t)
	tp := calibrate(t, l, TargetReward, 1500, 700, color.RGBA{255, 211, 77, 255}, TemplateMeta{Label: "Token", Category: CategoryPirateToken, Scope: ScopeOwn})
	img := scene(1920, 1080, 9)
	stamp(img, 1500, 700, 1, color.RGBA{255, 211, 77, 255})
	rng := rand.New(rand.NewSource(1))
	for i := range img.Pix {
		if i%4 != 3 {
			v := int(img.Pix[i]) + rng.Intn(120) - 60
			img.Pix[i] = uint8(max(0, min(255, v)))
		}
	}
	score := (&Detector{Lib: l}).Detect(smallOf(img), tp).Score
	// Limiar logo acima da pontuação obtida: deve cair na faixa "não confirmada".
	tp.Threshold = score + UncertainBand/2
	obs := (&Detector{Lib: l}).Analyze(smallOf(img), AllRequest())
	if len(obs.Rewards) != 1 {
		t.Fatalf("esperava 1 recompensa (incerta), veio %d", len(obs.Rewards))
	}
	if obs.Rewards[0].Confirmed || !obs.Rewards[0].Uncertain {
		t.Fatalf("deveria ser não confirmada: %+v", obs.Rewards[0])
	}
}

func TestSquadRewardFinder(t *testing.T) {
	l := newLib(t)
	calibrate(t, l, TargetReward, 1500, 500, color.RGBA{255, 211, 77, 255}, TemplateMeta{Label: "Token", Category: CategoryPirateToken, Scope: ScopeSquad})
	// nome do integrante calibrado à esquerda da notificação
	base := scene(1920, 1080, 1)
	nameStamp(base, 1200, 510)
	s := smallOf(base)
	if _, err := l.Add(s, TemplateMeta{Target: TargetTeammate, Label: "Capitã_Nina", Box: Rect{1200.0 / 1920, 510.0 / 1080, 200.0 / 1920, 40.0 / 1080}, ROI: Rect{0.55, 0, 0.2, 1}, SourceW: 1920, SourceH: 1080}); err != nil {
		t.Fatal(err)
	}
	// Notificação aparece mais abaixo (feed empilhado)
	img := scene(1920, 1080, 12)
	stamp(img, 1500, 700, 1, color.RGBA{255, 211, 77, 255})
	nameStamp(img, 1200, 710)
	lib2 := l
	for _, tp := range lib2.Snapshot() {
		if tp.Target == TargetReward {
			tp.ROI = Rect{0.7, 0, 0.3, 1} // coluna
		}
	}
	obs := (&Detector{Lib: l}).Analyze(smallOf(img), AllRequest())
	if len(obs.Rewards) != 1 || !obs.Rewards[0].Confirmed {
		t.Fatalf("recompensa do Squad não reconhecida: %+v", obs.Rewards)
	}
	if obs.Rewards[0].Finder != "Capitã_Nina" || obs.Rewards[0].Scope != ScopeSquad {
		t.Fatalf("integrante não identificado: %+v", obs.Rewards[0])
	}
}

func nameStamp(img *image.RGBA, x, y int) {
	for yy := 0; yy < 40; yy++ {
		for xx := 0; xx < 200; xx++ {
			c := color.RGBA{10, 10, 14, 255}
			if yy > 10 && yy < 30 && (xx%17 < 3 || (xx%31 < 5 && yy < 16)) {
				c = color.RGBA{120, 230, 240, 255}
			}
			img.Set(x+xx, y+yy, c)
		}
	}
}

func TestRejectsFlatSelection(t *testing.T) {
	l := newLib(t)
	img := image.NewRGBA(image.Rect(0, 0, 1920, 1080))
	for i := range img.Pix {
		img.Pix[i] = 128
	}
	_, err := l.Add(smallOf(img), TemplateMeta{Target: TargetLobby, Box: Rect{0.4, 0.4, 0.1, 0.05}})
	if err == nil {
		t.Fatal("deveria recusar área sem detalhes")
	}
}

func TestLibraryPersistence(t *testing.T) {
	dir := t.TempDir()
	l, _ := NewLibrary(dir)
	img := scene(1920, 1080, 1)
	stamp(img, 300, 300, 1, color.RGBA{200, 100, 50, 255})
	if _, err := l.Add(smallOf(img), TemplateMeta{Target: TargetVictory, Label: "Vitória", Box: Rect{300.0 / 1920, 300.0 / 1080, 220.0 / 1920, 64.0 / 1080}}); err != nil {
		t.Fatal(err)
	}
	l2, err := NewLibrary(dir)
	if err != nil || len(l2.List()) != 1 || !l2.Has(TargetVictory) {
		t.Fatalf("template não persistiu: %v %v", err, l2.List())
	}
}

func TestRarityByColor(t *testing.T) {
	cases := map[Rarity]color.RGBA{
		RarityLegendary: {233, 131, 52, 255}, RarityMythic: {255, 211, 77, 255}, RarityEpic: {177, 91, 226, 255},
		RarityRare: {73, 172, 242, 255}, RarityUncommon: {96, 170, 58, 255},
	}
	for want, c := range cases {
		img := scene(640, 360, 2)
		for y := 100; y < 200; y++ {
			for x := 100; x < 300; x++ {
				img.Set(x, y, c)
			}
		}
		s := smallOf(img)
		got := EstimateRarity(s, image.Rect(100, 100, 300, 200))
		if got.Rarity != want {
			t.Errorf("cor %v: esperava %s, veio %s", c, want, got.Rarity)
		}
	}
}

func TestSignatureDiff(t *testing.T) {
	a := smallOf(scene(1920, 1080, 1))
	b := smallOf(scene(1920, 1080, 1))
	c := smallOf(scene(1920, 1080, 2))
	sa, sb, sc := Sign(a), Sign(b), Sign(c)
	if sa.Diff(&sb) > 0.5 {
		t.Fatal("quadros iguais deveriam ter diferença ~0")
	}
	if sa.Diff(&sc) < 1 {
		t.Fatal("quadros diferentes deveriam ter diferença alta")
	}
}

func TestDHash(t *testing.T) {
	a := smallOf(scene(640, 360, 1)).Gray
	b := smallOf(scene(640, 360, 1)).Gray
	if HammingDistance(DHash(a), DHash(b)) != 0 {
		t.Fatal("hash deveria ser estável")
	}
}
