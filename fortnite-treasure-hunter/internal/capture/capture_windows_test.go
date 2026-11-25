//go:build windows

package capture

import "testing"

func TestGrab(t *testing.T) {
	c := New()
	defer c.Close()
	for i := 0; i < 3; i++ {
		f, err := c.Grab(0, 0, 320, 200)
		if err != nil {
			t.Fatal(err)
		}
		if f.W != 320 || f.H != 200 || len(f.BGRA) != 320*200*4 {
			t.Fatalf("quadro inválido %dx%d", f.W, f.H)
		}
	}
	if _, err := c.Grab(0, 0, 640, 400); err != nil { // muda o tamanho: realoca
		t.Fatal(err)
	}
}
