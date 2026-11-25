package app

import (
	"fmt"
	"image"
	"image/jpeg"
	"image/png"
	"net/http"
	"os"
	"path/filepath"
	"strings"

	"treasurehunter/internal/vision"
)

// saveCapture grava a captura original (PNG) e uma miniatura (JPEG) para a galeria.
func saveCapture(dir, id string, f *vision.Frame) (img, thumb string, w, h int, err error) {
	if err = os.MkdirAll(filepath.Join(dir, "miniaturas"), 0o755); err != nil {
		return
	}
	rgba := f.ToRGBA()
	img = id + ".png"
	thumb = filepath.ToSlash(filepath.Join("miniaturas", id+".jpg"))
	if err = writePNG(filepath.Join(dir, img), rgba); err != nil {
		return
	}
	err = writeJPEG(filepath.Join(dir, filepath.FromSlash(thumb)), shrink(rgba, 560), 82)
	return img, thumb, f.W, f.H, err
}

func writePNG(path string, im image.Image) error {
	f, err := os.Create(path)
	if err != nil {
		return err
	}
	enc := png.Encoder{CompressionLevel: png.BestSpeed}
	if err := enc.Encode(f, im); err != nil {
		f.Close()
		return err
	}
	return f.Close()
}

func writeJPEG(path string, im image.Image, q int) error {
	f, err := os.Create(path)
	if err != nil {
		return err
	}
	if err := jpeg.Encode(f, im, &jpeg.Options{Quality: q}); err != nil {
		f.Close()
		return err
	}
	return f.Close()
}

// shrink reduz a imagem para a largura máxima (média por área).
func shrink(src *image.RGBA, maxW int) *image.RGBA {
	b := src.Bounds()
	if b.Dx() <= maxW {
		return src
	}
	w := maxW
	h := b.Dy() * w / b.Dx()
	out := image.NewRGBA(image.Rect(0, 0, w, h))
	for y := 0; y < h; y++ {
		y0, y1 := y*b.Dy()/h, (y+1)*b.Dy()/h
		for x := 0; x < w; x++ {
			x0, x1 := x*b.Dx()/w, (x+1)*b.Dx()/w
			var r, g, bb, n int
			for yy := y0; yy < y1; yy++ {
				row := src.Pix[yy*src.Stride:]
				for xx := x0; xx < x1; xx++ {
					r += int(row[xx*4])
					g += int(row[xx*4+1])
					bb += int(row[xx*4+2])
					n++
				}
			}
			if n == 0 {
				n = 1
			}
			o := y*out.Stride + x*4
			out.Pix[o], out.Pix[o+1], out.Pix[o+2], out.Pix[o+3] = uint8(r/n), uint8(g/n), uint8(bb/n), 255
		}
	}
	return out
}

// MediaHandler serve as capturas, pré-visualizações e templates para a interface.
// Caminhos: /media/tesouros/<arquivo>, /media/calibracao/<arquivo>, /media/templates/<arquivo>.
func MediaHandler(a *App) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		p := strings.TrimPrefix(r.URL.Path, "/")
		parts := strings.SplitN(p, "/", 3)
		if len(parts) != 3 || parts[0] != "media" {
			http.NotFound(w, r)
			return
		}
		a.mu.Lock()
		capDir := a.settings.CapturesDir
		a.mu.Unlock()
		var base string
		switch parts[1] {
		case "tesouros":
			base = capDir
		case "calibracao":
			base = a.paths.Calib
		case "templates":
			base = a.paths.Templates
		default:
			http.NotFound(w, r)
			return
		}
		rel := filepath.Clean(filepath.FromSlash(parts[2]))
		if strings.HasPrefix(rel, "..") || filepath.IsAbs(rel) {
			http.Error(w, "caminho inválido", http.StatusBadRequest)
			return
		}
		full := filepath.Join(base, rel)
		ext := strings.ToLower(filepath.Ext(full))
		if ext != ".png" && ext != ".jpg" && ext != ".jpeg" {
			http.NotFound(w, r)
			return
		}
		w.Header().Set("Cache-Control", "max-age=3600")
		http.ServeFile(w, r, full)
	})
}

func fileExists(p string) bool {
	_, err := os.Stat(p)
	return err == nil
}

func uniqueName(dir, name string) string {
	ext := filepath.Ext(name)
	stem := strings.TrimSuffix(name, ext)
	out := filepath.Join(dir, name)
	for i := 2; fileExists(out); i++ {
		out = filepath.Join(dir, fmt.Sprintf("%s (%d)%s", stem, i, ext))
	}
	return out
}
