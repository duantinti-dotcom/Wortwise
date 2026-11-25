//go:build windows

package winsys

import (
	"errors"
	"fmt"
	"runtime"
	"strings"
	"sync"
	"syscall"
	"time"
	"unsafe"

	"golang.org/x/sys/windows"
	"golang.org/x/sys/windows/registry"
)

var (
	user32   = windows.NewLazySystemDLL("user32.dll")
	shell32  = windows.NewLazySystemDLL("shell32.dll")
	kernel32 = windows.NewLazySystemDLL("kernel32.dll")
	pdh      = windows.NewLazySystemDLL("pdh.dll")

	pEnumDisplayMonitors      = user32.NewProc("EnumDisplayMonitors")
	pGetMonitorInfoW          = user32.NewProc("GetMonitorInfoW")
	pMonitorFromWindow        = user32.NewProc("MonitorFromWindow")
	pEnumWindows              = user32.NewProc("EnumWindows")
	pGetWindowThreadProcessId = user32.NewProc("GetWindowThreadProcessId")
	pIsWindowVisible          = user32.NewProc("IsWindowVisible")
	pIsIconic                 = user32.NewProc("IsIconic")
	pGetClientRect            = user32.NewProc("GetClientRect")
	pClientToScreen           = user32.NewProc("ClientToScreen")
	pRegisterHotKey           = user32.NewProc("RegisterHotKey")
	pUnregisterHotKey         = user32.NewProc("UnregisterHotKey")
	pGetMessageW              = user32.NewProc("GetMessageW")
	pTranslateMessage         = user32.NewProc("TranslateMessage")
	pDispatchMessageW         = user32.NewProc("DispatchMessageW")
	pRegisterClassExW         = user32.NewProc("RegisterClassExW")
	pCreateWindowExW          = user32.NewProc("CreateWindowExW")
	pDefWindowProcW           = user32.NewProc("DefWindowProcW")
	pDestroyWindow            = user32.NewProc("DestroyWindow")
	pPostMessageW             = user32.NewProc("PostMessageW")
	pPostQuitMessage          = user32.NewProc("PostQuitMessage")
	pCreatePopupMenu          = user32.NewProc("CreatePopupMenu")
	pAppendMenuW              = user32.NewProc("AppendMenuW")
	pTrackPopupMenu           = user32.NewProc("TrackPopupMenu")
	pDestroyMenu              = user32.NewProc("DestroyMenu")
	pGetCursorPos             = user32.NewProc("GetCursorPos")
	pSetForegroundWindow      = user32.NewProc("SetForegroundWindow")
	pRegisterWindowMessageW   = user32.NewProc("RegisterWindowMessageW")
	pLoadIconW                = user32.NewProc("LoadIconW")

	pShellNotifyIconW = shell32.NewProc("Shell_NotifyIconW")
	pExtractIconW     = shell32.NewProc("ExtractIconW")
	pShellExecuteW    = shell32.NewProc("ShellExecuteW")

	pGetSystemTimes          = kernel32.NewProc("GetSystemTimes")
	pK32GetProcessMemoryInfo = kernel32.NewProc("K32GetProcessMemoryInfo")

	pPdhOpenQueryW               = pdh.NewProc("PdhOpenQueryW")
	pPdhAddEnglishCounterW       = pdh.NewProc("PdhAddEnglishCounterW")
	pPdhCollectQueryData         = pdh.NewProc("PdhCollectQueryData")
	pPdhGetFormattedCounterArray = pdh.NewProc("PdhGetFormattedCounterArrayW")
	pPdhCloseQuery               = pdh.NewProc("PdhCloseQuery")
)

type rect struct{ Left, Top, Right, Bottom int32 }
type point struct{ X, Y int32 }

type monitorInfoEx struct {
	Size    uint32
	Monitor rect
	Work    rect
	Flags   uint32
	Device  [32]uint16
}

// ---------- Processos ----------

func processList() (map[uint32]uint32, map[uint32]string) {
	parents := map[uint32]uint32{}
	names := map[uint32]string{}
	snap, err := windows.CreateToolhelp32Snapshot(windows.TH32CS_SNAPPROCESS, 0)
	if err != nil {
		return parents, names
	}
	defer windows.CloseHandle(snap)
	var e windows.ProcessEntry32
	e.Size = uint32(unsafe.Sizeof(e))
	for err = windows.Process32First(snap, &e); err == nil; err = windows.Process32Next(snap, &e) {
		parents[e.ProcessID] = e.ParentProcessID
		names[e.ProcessID] = windows.UTF16ToString(e.ExeFile[:])
	}
	return parents, names
}

// FindProcess procura um processo pelo nome (sem diferenciar maiúsculas).
func FindProcess(want []string) (uint32, bool) {
	_, names := processList()
	for pid, n := range names {
		for _, w := range want {
			if strings.EqualFold(n, w) {
				return pid, true
			}
		}
	}
	return 0, false
}

// ---------- Monitores ----------

// Monitors lista os monitores conectados.
func Monitors() []Monitor {
	var out []Monitor
	cb := syscall.NewCallback(func(h, hdc, r, lp uintptr) uintptr {
		var mi monitorInfoEx
		mi.Size = uint32(unsafe.Sizeof(mi))
		pGetMonitorInfoW.Call(h, uintptr(unsafe.Pointer(&mi)))
		m := Monitor{Index: len(out), Name: windows.UTF16ToString(mi.Device[:]),
			X: int(mi.Monitor.Left), Y: int(mi.Monitor.Top),
			W: int(mi.Monitor.Right - mi.Monitor.Left), H: int(mi.Monitor.Bottom - mi.Monitor.Top),
			Primary: mi.Flags&1 != 0}
		m.Name = strings.TrimPrefix(m.Name, `\\.\`)
		out = append(out, m)
		return 1
	})
	pEnumDisplayMonitors.Call(0, 0, cb, 0)
	if len(out) == 0 {
		out = append(out, Monitor{Index: 0, Name: "Monitor principal", W: 1920, H: 1080, Primary: true})
	}
	return out
}

// ---------- Janela do jogo ----------

// FindGameWindow procura a maior janela visível do processo e devolve a área cliente.
func FindGameWindow(pid uint32) GameWindow {
	gw := GameWindow{PID: pid}
	if pid == 0 {
		return gw
	}
	var best uintptr
	bestArea := int32(-1)
	cb := syscall.NewCallback(func(h, lp uintptr) uintptr {
		var wp uint32
		pGetWindowThreadProcessId.Call(h, uintptr(unsafe.Pointer(&wp)))
		if wp != pid {
			return 1
		}
		if v, _, _ := pIsWindowVisible.Call(h); v == 0 {
			return 1
		}
		var r rect
		pGetClientRect.Call(h, uintptr(unsafe.Pointer(&r)))
		if a := (r.Right - r.Left) * (r.Bottom - r.Top); a > bestArea {
			bestArea, best = a, h
		}
		return 1
	})
	pEnumWindows.Call(cb, 0)
	if best == 0 {
		return gw
	}
	gw.Found = true
	if v, _, _ := pIsIconic.Call(best); v != 0 {
		gw.Minimized = true
		return gw
	}
	var r rect
	pGetClientRect.Call(best, uintptr(unsafe.Pointer(&r)))
	p := point{0, 0}
	pClientToScreen.Call(best, uintptr(unsafe.Pointer(&p)))
	gw.X, gw.Y, gw.W, gw.H = int(p.X), int(p.Y), int(r.Right-r.Left), int(r.Bottom-r.Top)
	gw.Mode = "janela"
	hm, _, _ := pMonitorFromWindow.Call(best, 2)
	var mi monitorInfoEx
	mi.Size = uint32(unsafe.Sizeof(mi))
	pGetMonitorInfoW.Call(hm, uintptr(unsafe.Pointer(&mi)))
	if gw.X == int(mi.Monitor.Left) && gw.Y == int(mi.Monitor.Top) &&
		gw.W == int(mi.Monitor.Right-mi.Monitor.Left) && gw.H == int(mi.Monitor.Bottom-mi.Monitor.Top) {
		gw.Mode = "tela_cheia"
	}
	for _, m := range Monitors() {
		if gw.X >= m.X && gw.X < m.X+m.W && gw.Y >= m.Y && gw.Y < m.Y+m.H {
			gw.Monitor = m.Index
		}
	}
	return gw
}

// ---------- Shell ----------

func shellOpen(target string) error {
	verb, _ := windows.UTF16PtrFromString("open")
	t, _ := windows.UTF16PtrFromString(target)
	r, _, _ := pShellExecuteW.Call(0, uintptr(unsafe.Pointer(verb)), uintptr(unsafe.Pointer(t)), 0, 0, 1)
	if r <= 32 {
		return fmt.Errorf("o Windows não conseguiu abrir (código %d)", r)
	}
	return nil
}

// LaunchFortnite pede ao Epic Games Launcher oficial que abra o Fortnite.
func LaunchFortnite() error {
	if err := shellOpen(FortniteLaunchURI); err != nil {
		return fmt.Errorf("não foi possível acionar o Epic Games Launcher: %w", err)
	}
	return nil
}

// OpenPath abre uma pasta ou arquivo no Explorer.
func OpenPath(p string) error { return shellOpen(p) }

const runKey = `Software\Microsoft\Windows\CurrentVersion\Run`
const runName = "TreasureHunter"

// SetAutostart liga/desliga a inicialização com o Windows (registro do usuário atual).
func SetAutostart(enable bool, exe string) error {
	k, _, err := registry.CreateKey(registry.CURRENT_USER, runKey, registry.SET_VALUE)
	if err != nil {
		return err
	}
	defer k.Close()
	if !enable {
		if err := k.DeleteValue(runName); err != nil && !errors.Is(err, registry.ErrNotExist) {
			return err
		}
		return nil
	}
	return k.SetStringValue(runName, `"`+exe+`" --minimizado`)
}

// IsWindows11 indica build >= 22000.
func IsWindows11() bool {
	v := windows.RtlGetVersion()
	return v.MajorVersion >= 10 && v.BuildNumber >= 22000
}

// ---------- Consumo ----------

// UsageMeter mede CPU/RAM/GPU do aplicativo e dos processos WebView2 filhos.
type UsageMeter struct {
	mu        sync.Mutex
	last      time.Time
	lastCPU   map[uint32]int64
	lastIdle  uint64
	lastTotal uint64
	query     uintptr
	counter   uintptr
	gpuOK     bool
}

// NewUsageMeter cria o medidor (a contagem de GPU usa os contadores de desempenho do Windows).
func NewUsageMeter() *UsageMeter {
	u := &UsageMeter{lastCPU: map[uint32]int64{}}
	if pdh.Load() == nil {
		var q uintptr
		if r, _, _ := pPdhOpenQueryW.Call(0, 0, uintptr(unsafe.Pointer(&q))); r == 0 {
			path, _ := windows.UTF16PtrFromString(`\GPU Engine(*)\Utilization Percentage`)
			var c uintptr
			if r, _, _ := pPdhAddEnglishCounterW.Call(q, uintptr(unsafe.Pointer(path)), 0, uintptr(unsafe.Pointer(&c))); r == 0 {
				u.query, u.counter, u.gpuOK = q, c, true
				pPdhCollectQueryData.Call(q)
			} else {
				pPdhCloseQuery.Call(q)
			}
		}
	}
	return u
}

func (u *UsageMeter) tree() []uint32 {
	parents, _ := processList()
	self := uint32(windows.GetCurrentProcessId())
	set := map[uint32]bool{self: true}
	for changed := true; changed; {
		changed = false
		for pid, pp := range parents {
			if set[pp] && !set[pid] && pid != 0 {
				set[pid] = true
				changed = true
			}
		}
	}
	out := make([]uint32, 0, len(set))
	for p := range set {
		out = append(out, p)
	}
	return out
}

type procMemCounters struct {
	Cb                         uint32
	PageFaultCount             uint32
	PeakWorkingSetSize         uintptr
	WorkingSetSize             uintptr
	QuotaPeakPagedPoolUsage    uintptr
	QuotaPagedPoolUsage        uintptr
	QuotaPeakNonPagedPoolUsage uintptr
	QuotaNonPagedPoolUsage     uintptr
	PagefileUsage              uintptr
	PeakPagefileUsage          uintptr
}

type pdhItem struct {
	Name   *uint16
	Status uint32
	_      uint32
	Value  float64
}

func ftToInt(f windows.Filetime) int64 { return int64(f.HighDateTime)<<32 | int64(f.LowDateTime) }

// Sample mede o consumo desde a última chamada.
func (u *UsageMeter) Sample() Usage {
	u.mu.Lock()
	defer u.mu.Unlock()
	now := time.Now()
	pids := u.tree()
	us := Usage{Processes: len(pids), LogicalCPUs: runtime.NumCPU(), GPUAvailable: u.gpuOK}
	curCPU := map[uint32]int64{}
	var cpuDelta int64
	pidSet := map[string]bool{}
	for _, pid := range pids {
		pidSet[fmt.Sprintf("pid_%d_", pid)] = true
		h, err := windows.OpenProcess(windows.PROCESS_QUERY_LIMITED_INFORMATION, false, pid)
		if err != nil {
			continue
		}
		var c, e, k, usr windows.Filetime
		if windows.GetProcessTimes(h, &c, &e, &k, &usr) == nil {
			t := ftToInt(k) + ftToInt(usr)
			curCPU[pid] = t
			if prev, ok := u.lastCPU[pid]; ok && t >= prev {
				cpuDelta += t - prev
			}
		}
		var pm procMemCounters
		pm.Cb = uint32(unsafe.Sizeof(pm))
		if r, _, _ := pK32GetProcessMemoryInfo.Call(uintptr(h), uintptr(unsafe.Pointer(&pm)), uintptr(pm.Cb)); r != 0 {
			us.RAMMB += float64(pm.WorkingSetSize) / (1024 * 1024)
		}
		windows.CloseHandle(h)
	}
	if !u.last.IsZero() {
		el := now.Sub(u.last).Seconds()
		if el > 0 {
			us.CPUPercent = float64(cpuDelta) / 1e7 / el / float64(us.LogicalCPUs) * 100
		}
	}
	u.lastCPU = curCPU
	var idle, kern, user windows.Filetime
	if r, _, _ := pGetSystemTimes.Call(uintptr(unsafe.Pointer(&idle)), uintptr(unsafe.Pointer(&kern)), uintptr(unsafe.Pointer(&user))); r != 0 {
		i, t := uint64(ftToInt(idle)), uint64(ftToInt(kern)+ftToInt(user))
		if u.lastTotal > 0 && t > u.lastTotal {
			us.SystemCPU = 100 * (1 - float64(i-u.lastIdle)/float64(t-u.lastTotal))
		}
		u.lastIdle, u.lastTotal = i, t
	}
	if u.gpuOK {
		if r, _, _ := pPdhCollectQueryData.Call(u.query); r == 0 {
			var size, count uint32
			const fmtDouble = 0x200
			pPdhGetFormattedCounterArray.Call(u.counter, fmtDouble, uintptr(unsafe.Pointer(&size)), uintptr(unsafe.Pointer(&count)), 0)
			if size > 0 {
				buf := make([]byte, size)
				if r, _, _ := pPdhGetFormattedCounterArray.Call(u.counter, fmtDouble, uintptr(unsafe.Pointer(&size)), uintptr(unsafe.Pointer(&count)), uintptr(unsafe.Pointer(&buf[0]))); r == 0 {
					items := unsafe.Slice((*pdhItem)(unsafe.Pointer(&buf[0])), count)
					perEngine := map[string]float64{}
					for _, it := range items {
						name := windows.UTF16PtrToString(it.Name)
						p := strings.Index(name, "pid_")
						if p < 0 {
							continue
						}
						rest := name[p:]
						us2 := strings.Index(rest[4:], "_")
						if us2 < 0 || !pidSet[rest[:4+us2+1]] || it.Status != 0 {
							continue
						}
						eng := name[strings.LastIndex(name, "engtype_")+1:]
						perEngine[eng] += it.Value
					}
					for _, v := range perEngine {
						if v > us.GPUPercent {
							us.GPUPercent = v
						}
					}
					runtime.KeepAlive(buf)
				}
			}
		}
	}
	u.last = now
	return us
}

// Close libera a consulta de desempenho.
func (u *UsageMeter) Close() {
	if u.gpuOK {
		pPdhCloseQuery.Call(u.query)
		u.gpuOK = false
	}
}

// ---------- Bandeja e atalhos globais ----------

const (
	wmApp               = 0x8000
	wmTray              = wmApp + 1
	wmHotkeyReg         = wmApp + 2
	wmNotify            = wmApp + 3
	wmTooltip           = wmApp + 4
	wmQuitTray          = wmApp + 5
	wmHotkey            = 0x0312
	wmCommand           = 0x0111
	wmLButtonUp         = 0x0202
	wmRButtonUp         = 0x0205
	wmDestroy           = 0x0002
	ninBalloonUserClick = 0x0405
)

type notifyIconData struct {
	CbSize           uint32
	HWnd             windows.HWND
	UID              uint32
	UFlags           uint32
	UCallbackMessage uint32
	HIcon            windows.Handle
	SzTip            [128]uint16
	DwState          uint32
	DwStateMask      uint32
	SzInfo           [256]uint16
	UVersion         uint32
	SzInfoTitle      [64]uint16
	DwInfoFlags      uint32
	GuidItem         windows.GUID
	HBalloonIcon     windows.Handle
}

type wndClassEx struct {
	Size       uint32
	Style      uint32
	WndProc    uintptr
	ClsExtra   int32
	WndExtra   int32
	Instance   windows.Handle
	Icon       windows.Handle
	Cursor     windows.Handle
	Background windows.Handle
	MenuName   *uint16
	ClassName  *uint16
	IconSm     windows.Handle
}

type msg struct {
	HWnd    windows.HWND
	Message uint32
	WParam  uintptr
	LParam  uintptr
	Time    uint32
	Pt      point
	Private uint32
}

// Tray é o ícone da bandeja com menu e o receptor dos atalhos globais.
type Tray struct {
	hwnd           windows.HWND
	icon           windows.Handle
	onCmd          func(TrayCommand)
	mu             sync.Mutex
	tip            string
	notes          []note
	hkWant         map[TrayCommand]Hotkey
	hkIDs          map[int]TrayCommand
	hkResult       chan map[TrayCommand]error
	taskbarCreated uint32
}

type note struct {
	title, msg string
	sound      bool
}

var trayInstance *Tray

var menuItems = []struct {
	id    int
	label string
	cmd   TrayCommand
}{
	{1, "Abrir Treasure Hunter", CmdShow},
	{2, "Iniciar / pausar monitoramento", CmdToggle},
	{3, "Registrar baú manualmente", CmdChest},
	{4, "Parada de emergência", CmdEmergency},
	{0, "", ""},
	{9, "Sair", CmdQuit},
}

func copyUTF16(dst []uint16, s string) {
	u, _ := windows.UTF16FromString(s)
	if len(u) > len(dst) {
		u = u[:len(dst)]
		u[len(u)-1] = 0
	}
	copy(dst, u)
}

func (t *Tray) nid() notifyIconData {
	var d notifyIconData
	d.CbSize = uint32(unsafe.Sizeof(d))
	d.HWnd = t.hwnd
	d.UID = 1
	return d
}

func (t *Tray) addIcon() {
	d := t.nid()
	d.UFlags = 0x1 | 0x2 | 0x4 // MESSAGE | ICON | TIP
	d.UCallbackMessage = wmTray
	d.HIcon = t.icon
	t.mu.Lock()
	copyUTF16(d.SzTip[:], t.tip)
	t.mu.Unlock()
	pShellNotifyIconW.Call(0, uintptr(unsafe.Pointer(&d)))
}

func (t *Tray) wndProc(hwnd windows.HWND, m uint32, wp, lp uintptr) uintptr {
	switch m {
	case wmTray:
		switch lp & 0xFFFF {
		case wmLButtonUp, ninBalloonUserClick:
			go t.onCmd(CmdShow)
		case wmRButtonUp:
			t.showMenu()
		}
		return 0
	case wmCommand:
		id := int(wp & 0xFFFF)
		for _, it := range menuItems {
			if it.id == id && it.cmd != "" {
				go t.onCmd(it.cmd)
			}
		}
		return 0
	case wmHotkey:
		t.mu.Lock()
		cmd, ok := t.hkIDs[int(wp)]
		t.mu.Unlock()
		if ok {
			go t.onCmd(cmd)
		}
		return 0
	case wmHotkeyReg:
		t.registerHotkeys()
		return 0
	case wmNotify:
		t.mu.Lock()
		ns := t.notes
		t.notes = nil
		t.mu.Unlock()
		for _, n := range ns {
			d := t.nid()
			d.UFlags = 0x10 // INFO
			copyUTF16(d.SzInfoTitle[:], n.title)
			copyUTF16(d.SzInfo[:], n.msg)
			d.DwInfoFlags = 0x4 // NIIF_USER (ícone do app)
			d.HBalloonIcon = t.icon
			if !n.sound {
				d.DwInfoFlags |= 0x10
			}
			pShellNotifyIconW.Call(1, uintptr(unsafe.Pointer(&d)))
		}
		return 0
	case wmTooltip:
		d := t.nid()
		d.UFlags = 0x4
		t.mu.Lock()
		copyUTF16(d.SzTip[:], t.tip)
		t.mu.Unlock()
		pShellNotifyIconW.Call(1, uintptr(unsafe.Pointer(&d)))
		return 0
	case wmQuitTray:
		d := t.nid()
		pShellNotifyIconW.Call(2, uintptr(unsafe.Pointer(&d)))
		t.mu.Lock()
		for id := range t.hkIDs {
			pUnregisterHotKey.Call(uintptr(t.hwnd), uintptr(id))
		}
		t.mu.Unlock()
		pDestroyWindow.Call(uintptr(hwnd))
		return 0
	case wmDestroy:
		pPostQuitMessage.Call(0)
		return 0
	}
	if t.taskbarCreated != 0 && m == t.taskbarCreated {
		t.addIcon() // Explorer reiniciado: recria o ícone
		return 0
	}
	r, _, _ := pDefWindowProcW.Call(uintptr(hwnd), uintptr(m), wp, lp)
	return r
}

func (t *Tray) showMenu() {
	menu, _, _ := pCreatePopupMenu.Call()
	for _, it := range menuItems {
		if it.id == 0 {
			pAppendMenuW.Call(menu, 0x800, 0, 0) // separador
			continue
		}
		s, _ := windows.UTF16PtrFromString(it.label)
		pAppendMenuW.Call(menu, 0, uintptr(it.id), uintptr(unsafe.Pointer(s)))
	}
	var p point
	pGetCursorPos.Call(uintptr(unsafe.Pointer(&p)))
	// Necessário para o menu fechar ao clicar fora (a janela é do próprio app, invisível).
	pSetForegroundWindow.Call(uintptr(t.hwnd))
	pTrackPopupMenu.Call(menu, 0x0020, uintptr(p.X), uintptr(p.Y), 0, uintptr(t.hwnd), 0)
	pDestroyMenu.Call(menu)
}

func (t *Tray) registerHotkeys() {
	t.mu.Lock()
	defer t.mu.Unlock()
	for id := range t.hkIDs {
		pUnregisterHotKey.Call(uintptr(t.hwnd), uintptr(id))
	}
	t.hkIDs = map[int]TrayCommand{}
	res := map[TrayCommand]error{}
	id := 100
	for cmd, hk := range t.hkWant {
		id++
		r, _, e := pRegisterHotKey.Call(uintptr(t.hwnd), uintptr(id), uintptr(hk.Mods|ModNoRepeat), uintptr(hk.VK))
		if r == 0 {
			res[cmd] = fmt.Errorf("%s já está em uso por outro programa (%v)", hk.Text, e)
			continue
		}
		t.hkIDs[id] = cmd
	}
	if t.hkResult != nil {
		select {
		case t.hkResult <- res:
		default:
		}
	}
}

// StartTray cria o ícone na bandeja e o laço de mensagens (thread dedicada).
func StartTray(tooltip string, onCmd func(TrayCommand)) (*Tray, error) {
	t := &Tray{onCmd: onCmd, tip: tooltip, hkIDs: map[int]TrayCommand{}}
	ready := make(chan error, 1)
	go func() {
		runtime.LockOSThread()
		defer runtime.UnlockOSThread()
		inst := windows.Handle(0)
		windows.GetModuleHandleEx(0, nil, &inst)
		cls, _ := windows.UTF16PtrFromString("TreasureHunterTray")
		wc := wndClassEx{WndProc: syscall.NewCallback(func(h windows.HWND, m uint32, wp, lp uintptr) uintptr {
			return t.wndProc(h, m, wp, lp)
		}), Instance: inst, ClassName: cls}
		wc.Size = uint32(unsafe.Sizeof(wc))
		pRegisterClassExW.Call(uintptr(unsafe.Pointer(&wc)))
		title, _ := windows.UTF16PtrFromString("Treasure Hunter")
		h, _, err := pCreateWindowExW.Call(0, uintptr(unsafe.Pointer(cls)), uintptr(unsafe.Pointer(title)), 0, 0, 0, 0, 0, 0, 0, uintptr(inst), 0)
		if h == 0 {
			ready <- fmt.Errorf("não foi possível criar a janela da bandeja: %v", err)
			return
		}
		t.hwnd = windows.HWND(h)
		tc, _ := windows.UTF16PtrFromString("TaskbarCreated")
		r, _, _ := pRegisterWindowMessageW.Call(uintptr(unsafe.Pointer(tc)))
		t.taskbarCreated = uint32(r)
		exe, _ := windows.UTF16PtrFromString(executablePath())
		ic, _, _ := pExtractIconW.Call(uintptr(inst), uintptr(unsafe.Pointer(exe)), 0)
		if ic <= 1 {
			ic, _, _ = pLoadIconW.Call(0, 32512) // IDI_APPLICATION
		}
		t.icon = windows.Handle(ic)
		t.addIcon()
		trayInstance = t
		ready <- nil
		var m msg
		for {
			r, _, _ := pGetMessageW.Call(uintptr(unsafe.Pointer(&m)), 0, 0, 0)
			if int32(r) <= 0 {
				return
			}
			pTranslateMessage.Call(uintptr(unsafe.Pointer(&m)))
			pDispatchMessageW.Call(uintptr(unsafe.Pointer(&m)))
		}
	}()
	if err := <-ready; err != nil {
		return nil, err
	}
	return t, nil
}

func executablePath() string {
	buf := make([]uint16, windows.MAX_LONG_PATH)
	n, _ := windows.GetModuleFileName(0, &buf[0], uint32(len(buf)))
	return windows.UTF16ToString(buf[:n])
}

// Notify mostra uma notificação nativa do Windows a partir do ícone da bandeja.
func (t *Tray) Notify(title, m string, sound bool) {
	if t == nil {
		return
	}
	t.mu.Lock()
	t.notes = append(t.notes, note{title, m, sound})
	t.mu.Unlock()
	pPostMessageW.Call(uintptr(t.hwnd), wmNotify, 0, 0)
}

// SetTooltip altera o texto exibido ao passar o mouse no ícone.
func (t *Tray) SetTooltip(s string) {
	if t == nil {
		return
	}
	t.mu.Lock()
	if t.tip == s {
		t.mu.Unlock()
		return
	}
	t.tip = s
	t.mu.Unlock()
	pPostMessageW.Call(uintptr(t.hwnd), wmTooltip, 0, 0)
}

// SetHotkeys registra os atalhos globais e devolve os que falharam.
func (t *Tray) SetHotkeys(m map[TrayCommand]Hotkey) map[TrayCommand]error {
	if t == nil {
		return nil
	}
	ch := make(chan map[TrayCommand]error, 1)
	t.mu.Lock()
	t.hkWant = m
	t.hkResult = ch
	t.mu.Unlock()
	pPostMessageW.Call(uintptr(t.hwnd), wmHotkeyReg, 0, 0)
	select {
	case r := <-ch:
		return r
	case <-time.After(2 * time.Second):
		return map[TrayCommand]error{CmdEmergency: errors.New("tempo esgotado ao registrar atalhos")}
	}
}

// Close remove o ícone e encerra o laço de mensagens.
func (t *Tray) Close() {
	if t == nil {
		return
	}
	pPostMessageW.Call(uintptr(t.hwnd), wmQuitTray, 0, 0)
}
