package winsys

import "testing"

func TestParseHotkey(t *testing.T) {
	h, err := ParseHotkey("Ctrl+Alt+F12")
	if err != nil || h.Mods != ModControl|ModAlt || h.VK != 0x7B {
		t.Fatalf("%+v %v", h, err)
	}
	if _, err := ParseHotkey("A"); err == nil {
		t.Fatal("tecla sem modificador deve ser recusada")
	}
	if h, err := ParseHotkey("F9"); err != nil || h.VK != 0x78 {
		t.Fatal("F9 sozinha é permitida")
	}
	if _, err := ParseHotkey("Ctrl+Banana"); err == nil {
		t.Fatal("tecla inválida")
	}
}

func TestParseGameSettings(t *testing.T) {
	gs := ParseGameSettings(`[/Script/FortniteGame.FortGameUserSettings]
ResolutionSizeX=2560
ResolutionSizeY=1440
FullscreenMode=1
HUDScale=0.850000
`)
	if !gs.Found || gs.ResX != 2560 || gs.ResY != 1440 || gs.ModeLabel != "Janela sem bordas" || gs.HUDScale != 0.85 {
		t.Fatalf("%+v", gs)
	}
}
