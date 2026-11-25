package app

import (
	"fmt"
	"runtime"
	"time"

	"treasurehunter/internal/capture"
	"treasurehunter/internal/config"
	"treasurehunter/internal/state"
	"treasurehunter/internal/storage"
	"treasurehunter/internal/vision"
	"treasurehunter/internal/winsys"
)

// loop é o laço de monitoramento. Ele só captura a tela quando a operação está ativa,
// o Fortnite está aberto e a janela do jogo não está minimizada.
func (a *App) loop() {
	defer func() {
		if r := recover(); r != nil {
			a.log.Printf("FALHA no monitoramento: %v — reiniciando o laço", r)
			a.addActivity("falha", "erro", "Falha interna no reconhecimento; o monitoramento foi reiniciado automaticamente", 0)
			time.Sleep(time.Second)
			go a.loop()
		}
	}()
	var (
		ls         loopState
		lastProc   time.Time
		lastLimits time.Time
	)
	for {
		a.mu.Lock()
		op := a.op
		s := a.settings
		a.mu.Unlock()

		interval := time.Duration(float64(time.Second) / s.EffectiveFPS())
		now := time.Now()

		// Verificação do processo a cada 2 s (barata), mesmo parado, para o status do painel.
		if now.Sub(lastProc) >= 2*time.Second {
			lastProc = now
			a.checkGame(s)
		}

		if op != OpRunning {
			a.emitUpdate(false)
			if !a.wait(time.Second) {
				return
			}
			continue
		}

		a.mu.Lock()
		running, gw, reg := a.gameRunning, a.gameWin, a.region
		a.mu.Unlock()
		if !running {
			a.mu.Lock()
			evs := a.machine.Force(state.WaitingGame, now)
			a.mu.Unlock()
			a.applyEvents(evs, nil)
			a.tickLimits(&lastLimits)
			a.emitUpdate(false)
			if !a.wait(2 * time.Second) {
				return
			}
			continue
		}
		if gw.Found && gw.Minimized {
			a.tickLimits(&lastLimits)
			a.emitUpdate(false)
			if !a.wait(time.Second) {
				return
			}
			continue
		}

		t0 := time.Now()
		frame, err := a.capt.Grab(reg.X, reg.Y, reg.W, reg.H)
		if err != nil {
			a.log.Printf("captura: %v", err)
			if !a.wait(2 * time.Second) {
				return
			}
			continue
		}
		t1 := time.Now()
		if capture.IsBlank(frame) {
			a.mu.Lock()
			a.blankFrames++
			n := a.blankFrames
			a.mu.Unlock()
			if n == 5 {
				a.addActivity("captura", "aviso", "A captura está vindo preta. Use \"Janela sem bordas\" no Fortnite (tela cheia exclusiva não pode ser capturada)", 0)
			}
			if !a.wait(interval) {
				return
			}
			continue
		}
		a.mu.Lock()
		a.blankFrames = 0
		a.mu.Unlock()

		t2, t3, skipped, scanned := a.process(frame, &ls, s, time.Now())
		a.tickLimits(&lastLimits)

		a.mu.Lock()
		p := &a.perf
		ema := func(old, v float64) float64 {
			if old == 0 {
				return v
			}
			return old*0.9 + v*0.1
		}
		p.CaptureMs = ema(p.CaptureMs, ms(t1.Sub(t0)))
		p.DownscaleMs = ema(p.DownscaleMs, ms(t2.Sub(t1)))
		if !skipped {
			p.AnalyzeMs = ema(p.AnalyzeMs, ms(t3.Sub(t2)))
			p.Scanned = ema(p.Scanned, float64(scanned))
		} else {
			p.Skipped++
		}
		p.Frames++
		if !p.LastFrame.IsZero() {
			p.EffectiveFPS = ema(p.EffectiveFPS, 1/t3.Sub(p.LastFrame).Seconds())
		}
		p.LastFrame = t3
		a.mu.Unlock()
		a.emitUpdate(false)

		// Mantém a frequência: desconta o tempo gasto no processamento.
		if !a.wait(interval - time.Since(t0)) {
			return
		}
	}
}

// loopState guarda o que é reaproveitado entre quadros.
type loopState struct {
	small   *vision.Small
	lastSig vision.Signature
	hasSig  bool
	lastObs vision.Observation
	frameN  int
}

// process analisa um quadro: redução, reconhecimento orientado pelo estado, máquina de estados
// e recompensas. Devolve os instantes de fim da redução e da análise.
func (a *App) process(frame *vision.Frame, ls *loopState, s config.Settings, now time.Time) (t2, t3 time.Time, skipped bool, scanned int) {
	ls.small = vision.Downscale(frame, ls.small)
	t2 = time.Now()
	ls.frameN++
	params := config.Params(s.Profile)
	full := ls.frameN%params.FullScanEvery == 0
	sig := vision.Sign(ls.small)
	var obs vision.Observation
	if ls.hasSig && !full && sig.Diff(&ls.lastSig) < 0.5 {
		// Quadro praticamente idêntico ao anterior: reaproveita o resultado.
		obs = ls.lastObs
		skipped = true
	} else {
		a.mu.Lock()
		req := a.machine.Wanted(full)
		a.mu.Unlock()
		if !full && ls.frameN%3 != 0 {
			// Entre varreduras, recompensas do objetivo selecionado têm prioridade.
			if cats := objectiveCategories(s.Objective); cats != nil {
				req.RewardCategories = cats
			}
		}
		obs = a.det.Analyze(ls.small, req)
	}
	ls.lastSig, ls.hasSig, ls.lastObs = sig, true, obs
	t3 = time.Now()
	a.mu.Lock()
	evs := a.machine.Update(obs, now)
	a.mu.Unlock()
	a.applyEvents(evs, nil)
	if !skipped && len(obs.Rewards) > 0 {
		a.handleRewards(obs, frame, ls.small)
	}
	return t2, t3, skipped, obs.Scanned
}

func ms(d time.Duration) float64 { return float64(d.Microseconds()) / 1000 }

func (a *App) wait(d time.Duration) bool {
	if d < 10*time.Millisecond {
		d = 10 * time.Millisecond
	}
	t := time.NewTimer(d)
	defer t.Stop()
	select {
	case <-a.quit:
		return false
	case <-a.wake:
		return true
	case <-t.C:
		return true
	}
}

func objectiveCategories(obj string) map[string]bool {
	switch obj {
	case vision.CategoryPirateToken, vision.CategoryGoldSkin, vision.CategoryElemental, vision.CategoryRare:
		return map[string]bool{obj: true}
	}
	return nil
}

// checkGame detecta o processo, a janela e a região de captura.
func (a *App) checkGame(s config.Settings) {
	pid, ok := winsys.FindProcess([]string{winsys.FortniteProcess})
	var gw winsys.GameWindow
	if ok {
		gw = winsys.FindGameWindow(pid)
	}
	mons := winsys.Monitors()
	mi := s.Monitor
	if mi >= len(mons) {
		mi = 0
	}
	mon := mons[mi]
	reg := captureRegion{X: mon.X, Y: mon.Y, W: mon.W, H: mon.H, Source: "monitor " + fmt.Sprint(mi+1)}
	switch s.ResolutionMode {
	case "auto":
		if gw.Found && !gw.Minimized && gw.W > 0 && gw.H > 0 {
			reg = captureRegion{X: gw.X, Y: gw.Y, W: gw.W, H: gw.H, Source: "janela do Fortnite"}
		}
	default:
		w, h := s.ResolutionW, s.ResolutionH
		x, y := mon.X, mon.Y
		if s.DisplayMode == "janela" && gw.Found && !gw.Minimized {
			x, y = gw.X, gw.Y // modo janela: a área do jogo começa na janela, com o tamanho informado
		} else if w < mon.W || h < mon.H {
			// Resolução menor que o monitor sem janela: centraliza (escala sem esticar).
			x, y = mon.X+(mon.W-w)/2, mon.Y+(mon.H-h)/2
		}
		if w > mon.W {
			w = mon.W
		}
		if h > mon.H {
			h = mon.H
		}
		reg = captureRegion{X: x, Y: y, W: w, H: h, Source: fmt.Sprintf("%d×%d manual", w, h)}
	}
	a.mu.Lock()
	changed := a.gameRunning != ok
	a.gameRunning, a.gamePID, a.gameWin, a.region = ok, pid, gw, reg
	a.mu.Unlock()
	if changed {
		if ok {
			a.addActivity("jogo", "ok", "Fortnite detectado", 0)
		} else {
			a.addActivity("jogo", "info", "Fortnite não está aberto", 0)
		}
		a.emitUpdate(true)
	}
}

func (a *App) tickLimits(last *time.Time) {
	if time.Since(*last) < time.Second {
		return
	}
	*last = time.Now()
	a.mu.Lock()
	a.session.OperationSeconds = a.elapsedLocked().Seconds()
	sc := a.settings.Stop
	sess := a.session
	a.mu.Unlock()
	if stop, why := CheckStop(sc, sess, nil); stop {
		a.conditionReached(why, nil)
	}
}

// applyEvents converte eventos da máquina em contadores, histórico e verificações de parada.
func (a *App) applyEvents(evs []state.Event, _ *storage.Reward) {
	if len(evs) == 0 {
		return
	}
	for _, e := range evs {
		switch e.Kind {
		case state.EvState:
			a.log.Printf("estado: %s -> %s", e.From, e.To)
			if e.To == state.WrongMode {
				a.addActivity("modo", "aviso", "O modo selecionado no lobby não é Battle Royale Sem Construção — Squad", 0)
			}
			if e.To == state.ErrorScreen {
				a.addActivity("erro", "erro", "Mensagem de erro ou desconexão identificada na tela", e.Match)
			}
		case state.EvMatchStart:
			a.mu.Lock()
			a.session.MatchesStarted++
			a.total.MatchesStarted++
			a.mu.Unlock()
			a.addActivity("partida", "ok", e.Message, e.Match)
		case state.EvMatchEnd:
			a.mu.Lock()
			a.session.MatchesCompleted++
			a.total.MatchesCompleted++
			if e.Result == "vitoria" {
				a.session.Victories++
				a.total.Victories++
			}
			a.mu.Unlock()
			lvl := "info"
			if e.Result == "vitoria" {
				lvl = "ouro"
			}
			a.addActivity("partida", lvl, e.Message, e.Match)
			a.saveStats()
		case state.EvMatchAbandon:
			a.mu.Lock()
			a.session.MatchesInterrupted++
			a.total.MatchesInterrupted++
			a.mu.Unlock()
			a.addActivity("partida", "aviso", e.Message, e.Match)
			a.saveStats()
		case state.EvChest:
			a.mu.Lock()
			if e.Confirmed {
				a.session.ChestsConfirmed++
				a.total.ChestsConfirmed++
			} else {
				a.session.ChestsUnconfirmed++
				a.total.ChestsUnconfirmed++
			}
			a.mu.Unlock()
			lvl := "ok"
			if !e.Confirmed {
				lvl = "info"
			}
			a.addActivity("bau", lvl, e.Message, e.Match)
		case state.EvWarning:
			a.log.Printf("aviso: %s", e.Message)
			a.addActivity("aviso", "aviso", e.Message, e.Match)
		}
	}
	a.emitUpdate(true)
}

// handleRewards registra as recompensas detectadas (própria conta ou anunciadas pelo Squad).
func (a *App) handleRewards(obs vision.Observation, frame *vision.Frame, small *vision.Small) {
	now := time.Now()
	a.mu.Lock()
	st := a.machine.State()
	if st != state.InMatch && st != state.Spectating {
		a.mu.Unlock()
		return
	}
	saveUncertain := a.settings.SaveUncertain
	chests := a.session.Chests()
	match := a.machine.MatchSeq
	a.mu.Unlock()
	var shot *vision.Frame
	for _, d := range obs.Rewards {
		if !d.Confirmed && !saveUncertain {
			continue
		}
		key := state.Key(match, d.TemplateID, d.Scope, d.Finder)
		if !a.dedup.Accept(key, now) {
			// Já registrada. Se antes era incerta e agora foi confirmada, promove o registro.
			if d.Confirmed {
				a.promoteUncertain(key, d.Score)
			}
			continue
		}
		if shot == nil {
			shot = frame.Clone()
		}
		est := vision.EstimateRarity(small, d.Pixels())
		r := storage.Reward{
			ID: fmt.Sprintf("r%d", now.UnixNano()), Name: d.Label, Category: d.Category, Rarity: string(d.Rarity),
			ColorRarity: string(est.Rarity), Scope: d.Scope, Finder: d.Finder, Confirmed: d.Confirmed,
			Confidence: d.Score, Match: match, ChestsSoFar: chests, At: now, TemplateID: d.TemplateID, Source: "automatico",
		}
		if r.Rarity == "" || r.Rarity == string(vision.RarityUnknown) {
			r.Rarity = string(est.Rarity)
		}
		if !r.Confirmed {
			a.mu.Lock()
			a.uncertain[key] = r.ID
			a.mu.Unlock()
		}
		a.recordReward(r, shot)
	}
}

// promoteUncertain confirma um registro que havia sido salvo como não confirmado.
func (a *App) promoteUncertain(key string, score float64) {
	a.mu.Lock()
	id, ok := a.uncertain[key]
	delete(a.uncertain, key)
	a.mu.Unlock()
	if !ok {
		return
	}
	r, err := a.rewards.Update(id, func(r *storage.Reward) {
		r.Confirmed = true
		if score > r.Confidence {
			r.Confidence = score
		}
	})
	if err != nil {
		return
	}
	a.mu.Lock()
	a.session.RareUnconfirmed--
	a.total.RareUnconfirmed--
	a.session.ApplyReward(r)
	a.total.ApplyReward(r)
	rr := r
	a.lastRew = &rr
	sc := a.settings.Stop
	sess := a.session
	a.mu.Unlock()
	a.saveStats()
	a.addActivity("recompensa", "ok", fmt.Sprintf("Recompensa confirmada: %s (%.0f%%)", r.Name, r.Confidence*100), r.Match)
	a.emit("fth:reward", r)
	if IsSpecial(r) {
		a.emit("fth:alert", map[string]any{"kind": "legendary", "title": r.Name, "message": "Recompensa lendária identificada", "reward": r})
	}
	if stop, why := CheckStop(sc, sess, &r); stop {
		a.conditionReached(why, &r)
	}
}

// recordReward salva a captura e registra a recompensa na galeria.
func (a *App) recordReward(r storage.Reward, shot *vision.Frame) {
	a.mu.Lock()
	dir := a.settings.CapturesDir
	a.mu.Unlock()
	if shot != nil {
		img, thumb, w, h, err := saveCapture(dir, r.ID, shot)
		if err != nil {
			a.log.Printf("salvar captura: %v", err)
			a.addActivity("captura", "erro", "Não foi possível salvar a captura: "+err.Error(), r.Match)
		}
		r.Image, r.Thumb, r.Width, r.Height = img, thumb, w, h
	}
	if err := a.rewards.Add(r); err != nil {
		a.log.Printf("galeria: %v", err)
	}
	a.mu.Lock()
	a.session.ApplyReward(r)
	a.total.ApplyReward(r)
	if r.Confirmed {
		rr := r
		a.lastRew = &rr
	}
	sc := a.settings.Stop
	sess := a.session
	notify := a.settings.WindowsNotifications
	a.mu.Unlock()
	a.saveStats()

	who := ""
	if r.Scope == vision.ScopeSquad {
		who = " — anunciado pelo Squad"
		if r.Finder != "" {
			who = " — encontrado por " + r.Finder
		}
	}
	if r.Confirmed {
		lvl := "ok"
		if IsSpecial(r) {
			lvl = "ouro"
		}
		a.addActivity("recompensa", lvl, fmt.Sprintf("Recompensa: %s%s (%.0f%% de confiança)", r.Name, who, r.Confidence*100), r.Match)
	} else {
		a.addActivity("recompensa", "aviso", fmt.Sprintf("Possível recompensa NÃO CONFIRMADA: %s%s (%.0f%%)", r.Name, who, r.Confidence*100), r.Match)
	}
	a.emit("fth:reward", r)
	if IsSpecial(r) {
		a.emit("fth:alert", map[string]any{"kind": "legendary", "title": r.Name, "message": "Recompensa lendária identificada" + who, "reward": r})
	}
	if notify && r.Confirmed {
		a.tray.Notify("Tesouro encontrado: "+r.Name, "Partida #"+fmt.Sprint(r.Match)+who, false)
	}
	if stop, why := CheckStop(sc, sess, &r); stop {
		a.conditionReached(why, &r)
	}
	a.emitUpdate(true)
}

func (a *App) conditionReached(why string, r *storage.Reward) {
	a.mu.Lock()
	if a.op == OpStopped {
		a.mu.Unlock()
		return
	}
	a.stopLocked(why)
	notify := a.settings.WindowsNotifications
	a.mu.Unlock()
	a.saveStats()
	a.addActivity("parada", "ouro", "Condição de parada atingida: "+why, 0)
	a.emit("fth:alert", map[string]any{"kind": "stop", "title": "Condição de parada atingida", "message": why, "reward": r})
	if notify {
		a.tray.Notify("Condição de parada atingida", why, true)
	}
	a.emitUpdate(true)
}

// usageLoop mede CPU/GPU/RAM a cada 2 s.
func (a *App) usageLoop() {
	t := time.NewTicker(2 * time.Second)
	defer t.Stop()
	for {
		select {
		case <-a.quit:
			return
		case <-t.C:
			u := a.meter.Sample()
			if u.RAMMB == 0 { // fora do Windows: pelo menos a memória do próprio processo
				var m runtime.MemStats
				runtime.ReadMemStats(&m)
				u.RAMMB = float64(m.Sys) / (1 << 20)
			}
			a.mu.Lock()
			a.usage = u
			a.mu.Unlock()
		}
	}
}
