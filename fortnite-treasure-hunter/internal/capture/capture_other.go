//go:build !windows

// Package capture faz a captura de tela (implementação real apenas no Windows).
package capture

import (
	"errors"

	"treasurehunter/internal/vision"
)

// Capturer é um stub fora do Windows.
type Capturer struct{}

// New cria o capturador.
func New() *Capturer { return &Capturer{} }

// Grab não é suportado fora do Windows.
func (c *Capturer) Grab(x, y, w, h int) (*vision.Frame, error) {
	return nil, errors.New("captura de tela disponível apenas no Windows")
}

// Close não faz nada.
func (c *Capturer) Close() {}
