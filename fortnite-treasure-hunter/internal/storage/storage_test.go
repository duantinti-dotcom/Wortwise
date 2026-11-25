package storage

import (
	"os"
	"path/filepath"
	"testing"
	"time"
)

func TestRewardsPersistAndDelete(t *testing.T) {
	p := filepath.Join(t.TempDir(), "tesouros.json")
	r, _ := OpenRewards(p)
	r.Add(Reward{ID: "a", Name: "Token", At: time.Now()})
	r.Add(Reward{ID: "b", Name: "Skin", At: time.Now().Add(time.Second)})
	r2, err := OpenRewards(p)
	if err != nil || len(r2.List()) != 2 || r2.List()[0].ID != "b" {
		t.Fatalf("persistência/ordem: %v %v", err, r2.List())
	}
	if _, err := r2.Delete("a"); err != nil || len(r2.List()) != 1 {
		t.Fatal("exclusão")
	}
}

func TestCorruptedFileIsPreserved(t *testing.T) {
	p := filepath.Join(t.TempDir(), "x.json")
	os.WriteFile(p, []byte("{quebrado"), 0o644)
	var v map[string]any
	if err := ReadJSON(p, &v); err == nil {
		t.Fatal("deveria acusar corrupção")
	}
	if _, err := os.Stat(p + ".corrompido"); err != nil {
		t.Fatal("cópia do arquivo corrompido não foi preservada")
	}
}

func TestActivityLogReload(t *testing.T) {
	p := filepath.Join(t.TempDir(), "a.jsonl")
	a := OpenActivity(p, 5)
	for i := 0; i < 8; i++ {
		a.Add(Activity{At: time.Now(), Text: string(rune('A' + i))})
	}
	b := OpenActivity(p, 5)
	got := b.Recent(10)
	if len(got) != 5 || got[0].Text != "H" {
		t.Fatalf("histórico recarregado incorreto: %+v", got)
	}
}
