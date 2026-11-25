//go:build windows

// Package capture faz a captura de tela via GDI (BitBlt), reaproveitando o mesmo
// buffer entre quadros para manter o uso de memória constante.
package capture

import (
	"errors"
	"fmt"
	"sync"
	"unsafe"

	"golang.org/x/sys/windows"

	"treasurehunter/internal/vision"
)

var (
	user32 = windows.NewLazySystemDLL("user32.dll")
	gdi32  = windows.NewLazySystemDLL("gdi32.dll")

	pGetDC              = user32.NewProc("GetDC")
	pReleaseDC          = user32.NewProc("ReleaseDC")
	pCreateCompatibleDC = gdi32.NewProc("CreateCompatibleDC")
	pCreateDIBSection   = gdi32.NewProc("CreateDIBSection")
	pSelectObject       = gdi32.NewProc("SelectObject")
	pBitBlt             = gdi32.NewProc("BitBlt")
	pDeleteObject       = gdi32.NewProc("DeleteObject")
	pDeleteDC           = gdi32.NewProc("DeleteDC")
	pGdiFlush           = gdi32.NewProc("GdiFlush")
)

type bitmapInfoHeader struct {
	Size          uint32
	Width         int32
	Height        int32
	Planes        uint16
	BitCount      uint16
	Compression   uint32
	SizeImage     uint32
	XPelsPerMeter int32
	YPelsPerMeter int32
	ClrUsed       uint32
	ClrImportant  uint32
}

// Capturer captura uma região da área de trabalho virtual.
type Capturer struct {
	mu    sync.Mutex
	memDC uintptr
	bmp   uintptr
	old   uintptr
	bits  unsafe.Pointer
	w, h  int
	frame vision.Frame
}

// New cria o capturador.
func New() *Capturer { return &Capturer{} }

func (c *Capturer) release() {
	if c.memDC != 0 {
		if c.old != 0 {
			pSelectObject.Call(c.memDC, c.old)
		}
		pDeleteDC.Call(c.memDC)
	}
	if c.bmp != 0 {
		pDeleteObject.Call(c.bmp)
	}
	c.memDC, c.bmp, c.old, c.bits, c.w, c.h = 0, 0, 0, nil, 0, 0
}

func (c *Capturer) ensure(w, h int) error {
	if c.bmp != 0 && c.w == w && c.h == h {
		return nil
	}
	c.release()
	screen, _, _ := pGetDC.Call(0)
	if screen == 0 {
		return errors.New("não foi possível acessar a tela")
	}
	defer pReleaseDC.Call(0, screen)
	mem, _, _ := pCreateCompatibleDC.Call(screen)
	if mem == 0 {
		return errors.New("falha ao criar contexto de captura")
	}
	bi := bitmapInfoHeader{Width: int32(w), Height: -int32(h), Planes: 1, BitCount: 32}
	bi.Size = uint32(unsafe.Sizeof(bi))
	var bits unsafe.Pointer
	bmp, _, _ := pCreateDIBSection.Call(screen, uintptr(unsafe.Pointer(&bi)), 0, uintptr(unsafe.Pointer(&bits)), 0, 0)
	if bmp == 0 || bits == nil {
		pDeleteDC.Call(mem)
		return errors.New("falha ao alocar o buffer de captura")
	}
	old, _, _ := pSelectObject.Call(mem, bmp)
	c.memDC, c.bmp, c.old, c.bits, c.w, c.h = mem, bmp, old, bits, w, h
	c.frame = vision.Frame{W: w, H: h, Stride: w * 4, BGRA: unsafe.Slice((*byte)(bits), w*h*4)}
	return nil
}

// Grab captura a região (coordenadas físicas). O quadro devolvido aponta para o buffer
// interno e só é válido até a próxima chamada: use Clone para guardar.
func (c *Capturer) Grab(x, y, w, h int) (*vision.Frame, error) {
	if w <= 0 || h <= 0 {
		return nil, fmt.Errorf("região de captura inválida (%dx%d)", w, h)
	}
	c.mu.Lock()
	defer c.mu.Unlock()
	if err := c.ensure(w, h); err != nil {
		return nil, err
	}
	screen, _, _ := pGetDC.Call(0)
	if screen == 0 {
		return nil, errors.New("não foi possível acessar a tela")
	}
	defer pReleaseDC.Call(0, screen)
	const srcCopy = 0x00CC0020
	if r, _, err := pBitBlt.Call(c.memDC, 0, 0, uintptr(w), uintptr(h), screen, uintptr(x), uintptr(y), srcCopy); r == 0 {
		return nil, fmt.Errorf("falha na captura de tela: %v", err)
	}
	pGdiFlush.Call()
	return &c.frame, nil
}

// Close libera os recursos do GDI.
func (c *Capturer) Close() {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.release()
}
