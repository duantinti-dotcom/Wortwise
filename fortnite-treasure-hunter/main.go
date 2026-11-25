// Treasure Hunter — acompanhamento de tesouros no Fortnite.
package main

import (
	"context"
	"embed"
	"os"

	"github.com/wailsapp/wails/v2"
	"github.com/wailsapp/wails/v2/pkg/options"
	"github.com/wailsapp/wails/v2/pkg/options/assetserver"
	"github.com/wailsapp/wails/v2/pkg/options/windows"

	"treasurehunter/internal/app"
	"treasurehunter/internal/config"
	"treasurehunter/internal/winsys"
)

//go:embed all:frontend/dist
var assets embed.FS

func main() {
	paths := app.DefaultPaths()
	a := app.New(paths)
	s, _ := config.Load(paths.Data+string(os.PathSeparator)+"configuracoes.json", paths.DefaultCaptures)

	startHidden := false
	for _, arg := range os.Args[1:] {
		if arg == "--minimizado" {
			startHidden = true
		}
	}
	// Vidro nativo (Acrylic) somente no Windows 11 e quando os efeitos não foram reduzidos.
	glass := s.WindowGlass && !s.ReduceEffects && winsys.IsWindows11()
	app.Translucent = glass

	winOpts := &windows.Options{
		WebviewIsTransparent:              glass,
		WindowIsTranslucent:               glass,
		Theme:                             windows.Dark,
		DisableFramelessWindowDecorations: false,
		WebviewUserDataPath:               paths.Data + string(os.PathSeparator) + "webview",
	}
	if glass {
		winOpts.BackdropType = windows.Acrylic
	}
	bg := &options.RGBA{R: 9, G: 11, B: 18, A: 255}
	if glass {
		bg = &options.RGBA{R: 0, G: 0, B: 0, A: 0}
	}

	err := wails.Run(&options.App{
		Title:            "Treasure Hunter",
		Width:            1320,
		Height:           840,
		MinWidth:         1080,
		MinHeight:        700,
		Frameless:        true,
		StartHidden:      startHidden,
		BackgroundColour: bg,
		AssetServer: &assetserver.Options{
			Assets:  assets,
			Handler: app.MediaHandler(a),
		},
		OnStartup:     app.OnStartup(a),
		OnShutdown:    app.OnShutdown(a),
		OnBeforeClose: func(ctx context.Context) bool { return false },
		SingleInstanceLock: &options.SingleInstanceLock{
			UniqueId:               "treasurehunter-7d1f6c2e",
			OnSecondInstanceLaunch: func(options.SecondInstanceData) { a.ShowWindow() },
		},
		Bind:    []interface{}{a},
		Windows: winOpts,
	})
	if err != nil {
		println("Erro:", err.Error())
	}
}
