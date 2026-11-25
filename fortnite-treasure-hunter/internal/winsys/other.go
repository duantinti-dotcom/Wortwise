//go:build !windows

package winsys

import "errors"

var errNotWindows = errors.New("disponível apenas no Windows")

// FindProcess procura um processo pelo nome.
func FindProcess(names []string) (uint32, bool) { return 0, false }

// FindGameWindow procura a janela principal do processo.
func FindGameWindow(pid uint32) GameWindow { return GameWindow{} }

// Monitors lista os monitores.
func Monitors() []Monitor {
	return []Monitor{{Index: 0, Name: "Monitor 1", W: 1920, H: 1080, Primary: true}}
}

// LaunchFortnite abre o jogo pelo launcher.
func LaunchFortnite() error { return errNotWindows }

// OpenPath abre uma pasta/arquivo no Explorer.
func OpenPath(p string) error { return errNotWindows }

// SetAutostart liga/desliga a inicialização com o Windows.
func SetAutostart(enable bool, exe string) error { return errNotWindows }

// IsWindows11 indica Windows 11 ou superior.
func IsWindows11() bool { return false }

// UsageMeter mede o consumo.
type UsageMeter struct{}

// NewUsageMeter cria o medidor.
func NewUsageMeter() *UsageMeter { return &UsageMeter{} }

// Sample mede o consumo atual.
func (u *UsageMeter) Sample() Usage { return Usage{} }

// Close libera recursos.
func (u *UsageMeter) Close() {}

// Tray é o ícone da bandeja.
type Tray struct{}

// StartTray inicia o ícone da bandeja e o laço de mensagens dos atalhos.
func StartTray(tooltip string, onCmd func(TrayCommand)) (*Tray, error) { return nil, errNotWindows }

// Notify mostra uma notificação do Windows.
func (t *Tray) Notify(title, msg string, sound bool) {}

// SetTooltip altera o texto do ícone.
func (t *Tray) SetTooltip(s string) {}

// SetHotkeys registra os atalhos globais.
func (t *Tray) SetHotkeys(m map[TrayCommand]Hotkey) map[TrayCommand]error { return nil }

// Close remove o ícone.
func (t *Tray) Close() {}
