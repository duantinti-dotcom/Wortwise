package capture

import (
	"testing"

	"treasurehunter/internal/vision"
)

func TestIsBlank(t *testing.T) {
	f := &vision.Frame{W: 64, H: 64, Stride: 256, BGRA: make([]byte, 256*64)}
	if !IsBlank(f) {
		t.Fatal("quadro preto deveria ser detectado")
	}
	for i := range f.BGRA {
		f.BGRA[i] = byte(i * 7)
	}
	if IsBlank(f) {
		t.Fatal("quadro com conteúdo não é preto")
	}
}
