package app

import (
	"image"
	"image/color"
	"image/png"
	"math"
	"os"
	"path/filepath"
	"testing"
	"time"

	"treasurehunter/internal/config"
	"treasurehunter/internal/state"
	"treasurehunter/internal/vision"
)

// Telas sintéticas: fundo com textura + elementos característicos em posições fixas.
func bg(seed int) *image.RGBA {
	img := image.NewRGBA(image.Rect(0, 0, 1920, 1080))
	for y := 0; y < 1080; y++ {
		for x := 0; x < 1920; x++ {
			v := 70 + 40*math.Sin(float64(x)/41+float64(seed)) + 30*math.Cos(float64(y)/29+float64(seed)/3)
			img.Set(x, y, color.RGBA{uint8(v * .5), uint8(v * .7), uint8(v), 255})
		}
	}
	return img
}

func badge(img *image.RGBA, x, y, kind int, c color.RGBA) {
	for yy := 0; yy < 60; yy++ {
		for xx := 0; xx < 200; xx++ {
			col := color.RGBA{18, 20, 28, 255}
			if xx < 4 || yy < 4 || xx > 195 || yy > 55 {
				col = c
			}
			if yy > 16 && yy < 44 && xx > 20 && xx < 180 && ((xx+kind*7)%(13+kind*3) < 4 || (yy < 22 && xx%(29+kind) < 9)) {
				col = color.RGBA{245, 240, 225, 255}
			}
			img.Set(x+xx, y+yy, col)
		}
	}
}

const (
	kLobby = iota + 1
	kHUD
	kSquadOut
	kToken
	kName
)

var pos = map[int][2]int{kLobby: {1600, 950}, kHUD: {80, 80}, kSquadOut: {860, 200}, kToken: {1650, 600}, kName: {1400, 600}}
var cols = map[int]color.RGBA{kLobby: {246, 207, 116, 255}, kHUD: {79, 179, 255, 255}, kSquadOut: {255, 107, 107, 255}, kToken: {255, 211, 77, 255}, kName: {120, 230, 240, 255}}

func screen(seed int, kinds ...int) *image.RGBA {
	img := bg(seed)
	for _, k := range kinds {
		badge(img, pos[k][0], pos[k][1], k, cols[k])
	}
	return img
}

func savePNG(t *testing.T, img image.Image) string {
	p := filepath.Join(t.TempDir(), "tela.png")
	f, _ := os.Create(p)
	png.Encode(f, img)
	f.Close()
	return p
}

func box(k int) vision.Rect {
	return vision.Rect{X: float64(pos[k][0]) / 1920, Y: float64(pos[k][1]) / 1080, W: 200.0 / 1920, H: 60.0 / 1080}
}

func TestEndToEndTrackingWithSquadReward(t *testing.T) {
	dir := t.TempDir()
	a := New(Paths{Data: dir, Templates: filepath.Join(dir, "tpl"), Calib: filepath.Join(dir, "cal"), Logs: filepath.Join(dir, "log"), DefaultCaptures: filepath.Join(dir, "caps")})
	a.settings.Stop = config.StopConditions{PirateToken: true, IncludeSquad: true}

	// 1) Calibração a partir de "capturas" salvas, como o usuário faria.
	calib := []struct {
		k   int
		req TemplateRequest
	}{
		{kLobby, TemplateRequest{Target: "lobby", Label: "JOGAR"}},
		{kHUD, TemplateRequest{Target: "partida", Label: "Minimapa"}},
		{kSquadOut, TemplateRequest{Target: "squad_eliminado", Label: "Squad eliminado"}},
		{kToken, TemplateRequest{Target: "recompensa", Label: "Token da Loja Pirata", Category: "token_pirata", Rarity: "mitico", Scope: "squad", Area: "coluna"}},
		{kName, TemplateRequest{Target: "integrante", Label: "Capitã_Nina", Area: "coluna"}},
	}
	for _, c := range calib {
		if _, err := a.CalibFromPath(savePNG(t, screen(1, c.k))); err != nil {
			t.Fatal(err)
		}
		c.req.Box = box(c.k)
		if _, err := a.SaveTemplate(c.req); err != nil {
			t.Fatalf("calibrar %s: %v", c.req.Target, err)
		}
	}
	// Teste de reconhecimento embutido (botão "Testar nesta captura").
	if _, err := a.CalibFromPath(savePNG(t, screen(4, kLobby))); err != nil {
		t.Fatal(err)
	}
	tr, err := a.TestRecognition(false)
	if err != nil || tr.State != state.Labels[state.Lobby] {
		t.Fatalf("teste de reconhecimento: %v %+v", err, tr.State)
	}

	// 2) Operação: sequência de telas como num jogo real.
	if err := a.StartOperation(); err != nil {
		t.Fatal(err)
	}
	var ls loopState
	now := time.Now()
	feed := func(img *image.RGBA, n int) {
		f := vision.FrameFromImage(img)
		for i := 0; i < n; i++ {
			now = now.Add(500 * time.Millisecond)
			a.process(f, &ls, a.settings, now)
		}
	}
	feed(screen(2, kLobby), 3)
	feed(screen(3, kHUD), 4)
	if a.machine.State() != state.InMatch || a.session.MatchesStarted != 1 {
		t.Fatalf("partida não iniciou: %s %+v", a.machine.State(), a.session)
	}
	// Colega encontra o Token: notificação no feed do Squad, mais abaixo que na calibração.
	tok := screen(5, kHUD)
	badge(tok, pos[kToken][0], 760, kToken, cols[kToken])
	badge(tok, pos[kName][0], 760, kName, cols[kName])
	feed(tok, 6) // visível por 3 s: deve registrar uma vez só

	rs := a.rewards.List()
	if len(rs) != 1 {
		t.Fatalf("esperava 1 recompensa, veio %d", len(rs))
	}
	r := rs[0]
	if !r.Confirmed || r.Scope != vision.ScopeSquad || r.Finder != "Capitã_Nina" || r.Category != "token_pirata" || r.Match != 1 {
		t.Fatalf("recompensa incorreta: %+v", r)
	}
	if _, err := os.Stat(filepath.Join(a.settings.CapturesDir, r.Image)); err != nil {
		t.Fatalf("captura original não salva: %v", err)
	}
	if _, err := os.Stat(filepath.Join(a.settings.CapturesDir, filepath.FromSlash(r.Thumb))); err != nil {
		t.Fatalf("miniatura não salva: %v", err)
	}
	// Condição de parada acionada por item encontrado por outro integrante.
	if a.op != OpStopped || a.stopMsg == "" {
		t.Fatalf("condição de parada não acionada (op=%s)", a.op)
	}
	if a.total.Tokens != 1 || a.total.SquadRewards != 1 {
		t.Fatalf("contadores: %+v", a.total)
	}

	// 3) Persistência: reabrir o app preserva histórico, galeria e estatísticas.
	b := New(a.paths)
	if len(b.rewards.List()) != 1 || b.total.Tokens != 1 || len(b.activity.Recent(50)) == 0 || len(b.lib.List()) != 5 {
		t.Fatalf("estado não persistiu: rewards=%d tokens=%d act=%d tpl=%d", len(b.rewards.List()), b.total.Tokens, len(b.activity.Recent(50)), len(b.lib.List()))
	}
}

func TestSquadEliminationCompletesMatchOnce(t *testing.T) {
	dir := t.TempDir()
	a := New(Paths{Data: dir, Templates: filepath.Join(dir, "tpl"), Calib: filepath.Join(dir, "cal"), Logs: filepath.Join(dir, "log"), DefaultCaptures: filepath.Join(dir, "caps")})
	a.settings.Stop = config.StopConditions{Continuous: true}
	for _, c := range []struct {
		k int
		t string
	}{{kHUD, "partida"}, {kSquadOut, "squad_eliminado"}, {kLobby, "lobby"}} {
		a.CalibFromPath(savePNG(t, screen(1, c.k)))
		if _, err := a.SaveTemplate(TemplateRequest{Target: c.t, Box: box(c.k)}); err != nil {
			t.Fatal(err)
		}
	}
	a.StartOperation()
	var ls loopState
	now := time.Now()
	feed := func(img *image.RGBA, n int) {
		f := vision.FrameFromImage(img)
		for i := 0; i < n; i++ {
			now = now.Add(500 * time.Millisecond)
			a.process(f, &ls, a.settings, now)
		}
	}
	for m := 0; m < 3; m++ {
		feed(screen(2+m, kLobby), 3)
		feed(screen(5+m, kHUD), 5)
		feed(screen(8+m, kSquadOut), 6)
	}
	if a.session.MatchesStarted != 3 || a.session.MatchesCompleted != 3 {
		t.Fatalf("contagem de partidas: %+v", a.session)
	}
}
