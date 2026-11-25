//go:build windows

package winsys

import (
	"os"
	"path/filepath"
	"testing"
	"time"
)

func TestWindowsIntegration(t *testing.T) {
	mons := Monitors()
	if len(mons) == 0 || mons[0].W <= 0 {
		t.Fatalf("monitores: %+v", mons)
	}
	t.Logf("monitores: %+v", mons)
	exe, _ := os.Executable()
	pid, ok := FindProcess([]string{filepath.Base(exe)})
	if !ok || pid == 0 {
		t.Fatal("não encontrou o próprio processo")
	}
	if _, ok := FindProcess([]string{"processo-que-nao-existe.exe"}); ok {
		t.Fatal("falso positivo de processo")
	}
	if gw := FindGameWindow(999999); gw.Found {
		t.Fatal("janela inexistente encontrada")
	}
	u := NewUsageMeter()
	u.Sample()
	x := 0
	for i := 0; i < 3e7; i++ {
		x += i
	}
	time.Sleep(200 * time.Millisecond)
	s := u.Sample()
	t.Logf("consumo: %+v (%d)", s, x%2)
	if s.RAMMB <= 0 || s.Processes < 1 {
		t.Fatalf("medição de consumo falhou: %+v", s)
	}
	u.Close()

	got := make(chan TrayCommand, 1)
	tr, err := StartTray("teste", func(c TrayCommand) { got <- c })
	if err != nil {
		t.Fatalf("bandeja: %v", err)
	}
	hk, _ := ParseHotkey("Ctrl+Alt+F12")
	if errs := tr.SetHotkeys(map[TrayCommand]Hotkey{CmdEmergency: hk}); len(errs) != 0 {
		t.Logf("atalhos (pode falhar sob Wine): %v", errs)
	}
	tr.Notify("Teste", "mensagem", false)
	tr.SetTooltip("outro")
	time.Sleep(200 * time.Millisecond)
	tr.Close()
}
