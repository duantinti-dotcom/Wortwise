package config

import (
	"path/filepath"
	"testing"
)

func TestLoadSaveNormalize(t *testing.T) {
	p := filepath.Join(t.TempDir(), "c.json")
	s := Defaults("C:/caps")
	s.Profile = "inexistente"
	s.ScanFPS = 99
	s.Stop.ChestLimit = -4
	if err := Save(p, s); err != nil {
		t.Fatal(err)
	}
	got, err := Load(p, "C:/caps")
	if err != nil {
		t.Fatal(err)
	}
	if got.Profile != ProfileBalanced || got.ScanFPS != 10 || got.Stop.ChestLimit != 0 {
		t.Fatalf("normalização falhou: %+v", got)
	}
	if got.EffectiveFPS() != 10 || Params(ProfileEco).FPS != 1 || Params(ProfileMax).FPS != 5 {
		t.Fatal("perfis")
	}
}
