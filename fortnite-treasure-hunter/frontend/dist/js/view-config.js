import { icon } from './icons.js';
import { call } from './api.js';
import { toast, errToast, playSound } from './fx.js';
import { S, $, $$, esc, switchHTML, patchSettings, setRange } from './core.js';

let root;
const HK = [['toggle', 'Iniciar / pausar monitoramento'], ['emergency', 'Parada de emergência'], ['chest', 'Registrar baú aberto'], ['reward', 'Capturar recompensa manual']];

export function render(el) {
  root = el;
  el.innerHTML = `
    <div class="head"><div><h1>Configurações</h1><p>Notificações, armazenamento, atalhos e comportamento do aplicativo no Windows.</p></div></div>
    <div class="grid g-2">
      <div class="stack">
        <div class="glass card">
          <h3>${icon('bell')}Notificações</h3>
          <div class="opt"><div class="oico">${icon('volume')}</div><div class="txt"><b>Notificações sonoras</b><span>Toque dourado para lendários e alerta nas condições de parada.</span></div><button class="btn sm ghost" id="cfSndTest">Testar</button>${switchHTML('cfSnd', false)}</div>
          <div class="opt"><div class="oico">${icon('volume')}</div><div class="txt"><b>Volume</b><input type="range" id="cfVol" min="0" max="1" step="0.05" style="margin-top:8px"></div></div>
          <div class="opt"><div class="oico">${icon('bell')}</div><div class="txt"><b>Notificações do Windows</b><span>Aviso nativo quando uma recompensa especial é identificada.</span></div>${switchHTML('cfWin', false)}</div>
        </div>
        <div class="glass card">
          <h3>${icon('folder')}Armazenamento</h3>
          <div class="field"><label>Pasta das capturas</label><div class="row"><input class="input" id="cfDir" readonly><button class="btn" id="cfDirPick">${icon('folder')}Alterar</button><button class="btn icon ghost" id="cfDirOpen" title="Abrir">${icon('external')}</button></div></div>
          <div class="opt mt"><div class="oico">${icon('alert')}</div><div class="txt"><b>Salvar também identificações não confirmadas</b><span>Ficam marcadas como "não confirmada" e não contam nas estatísticas nem nas condições de parada.</span></div>${switchHTML('cfUnc', false)}</div>
          <p class="faint" style="font-size:12px;margin:10px 0 0">Histórico, estatísticas e calibração ficam em <span class="mono" id="cfData"></span> e são preservados ao reiniciar o computador.</p>
        </div>
        <div class="glass card">
          <h3>${icon('shield')}Regras do Fortnite e segurança</h3>
          <p class="muted" style="margin:0 0 10px;font-size:12.5px">Os Termos de Serviço e o EULA do Fortnite proíbem bots, scripts e programas de automação que joguem por você. Por isso o Treasure Hunter funciona apenas em <b>modo acompanhamento</b>:</p>
          <ul class="muted" style="margin:0;padding-left:18px;font-size:12.5px;line-height:1.7">
            <li>não envia teclas, cliques ou movimentos ao jogo nem a outros programas;</li>
            <li>não muda o foco da janela que você está usando;</li>
            <li>não lê a memória do jogo, não injeta DLL, não manipula pacotes e não interfere no anticheat;</li>
            <li>apenas captura a imagem da tela (como um programa de gravação) e lê o arquivo de configurações de vídeo do Fortnite.</li>
          </ul>
          <p class="faint" style="margin:10px 0 0;font-size:12px">Iniciar partidas, movimentar-se e abrir baús continua sendo feito por você. O app registra o que acontece e avisa quando o seu objetivo for alcançado.</p>
        </div>
      </div>
      <div class="stack">
        <div class="glass card">
          <h3>${icon('keyboard')}Atalhos de teclado globais</h3>
          ${HK.map(([k, t]) => `<div class="opt"><div class="txt"><b>${t}</b><span class="err-hk" data-err="${k}" style="color:var(--err)"></span></div><button class="kbd hotkey" data-hk="${k}"></button></div>`).join('')}
          <p class="faint" style="font-size:12px;margin:8px 0 0">Clique e pressione a combinação (ex.: Ctrl + Alt + F12). Esc cancela, Backspace remove.</p>
        </div>
        <div class="glass card">
          <h3>${icon('gear')}Sistema</h3>
          <div class="opt"><div class="oico">${icon('power')}</div><div class="txt"><b>Iniciar com o Windows</b><span>Abre minimizado na bandeja ao entrar no Windows.</span></div>${switchHTML('cfBoot', false)}</div>
          <div class="opt"><div class="oico">${icon('tray')}</div><div class="txt"><b>Fechar para a bandeja</b><span>O botão fechar mantém o monitoramento ativo em segundo plano.</span></div>${switchHTML('cfTray', false)}</div>
          <div class="opt"><div class="oico">${icon('external')}</div><div class="txt"><b>Abrir o Fortnite ao iniciar</b><span>Se o jogo estiver fechado, pede ao Epic Games Launcher oficial para abri-lo.</span></div>${switchHTML('cfLaunch', false)}</div>
          <div class="opt"><div class="oico">${icon('leaf')}</div><div class="txt"><b>Reduzir efeitos visuais</b><span>Desliga desfoque e animações (menor uso de GPU).</span></div>${switchHTML('cfLite', false)}</div>
          <div class="opt"><div class="oico">${icon('sparkle')}</div><div class="txt"><b>Vidro nativo do Windows 11</b><span>Transparência Acrylic na janela. Aplica ao reiniciar o app.</span></div>${switchHTML('cfGlass', false)}</div>
        </div>
        <div class="glass card">
          <h3>${icon('trash')}Dados</h3>
          <div class="row wrap"><button class="btn" id="cfResetTot">${icon('refresh')}Zerar estatísticas totais</button><button class="btn" id="cfClearAct">${icon('trash')}Limpar histórico de atividades</button></div>
        </div>
      </div>
    </div>`;
  const bind = (id, key) => { $(`#${id}`, el).onchange = (e) => patchSettings({ [key]: e.target.checked }); };
  bind('cfSnd', 'soundEnabled'); bind('cfWin', 'windowsNotifications'); bind('cfUnc', 'saveUncertain');
  bind('cfBoot', 'startWithWindows'); bind('cfTray', 'minimizeToTray'); bind('cfLaunch', 'autoLaunch'); bind('cfLite', 'reduceEffects'); bind('cfGlass', 'windowGlass');
  const vol = $('#cfVol', el);
  vol.oninput = () => setRange(vol);
  vol.onchange = () => patchSettings({ soundVolume: +vol.value }, { quiet: true });
  $('#cfSndTest', el).onclick = () => playSound('legendary', S.settings.soundVolume);
  $('#cfDirPick', el).onclick = async () => { try { const d = await call('ChooseCapturesDir'); if (d) patchSettings({ capturesDir: d }); } catch (e) { errToast(e); } };
  $('#cfDirOpen', el).onclick = () => call('OpenCapturesFolder').catch(errToast);
  $('#cfResetTot', el).onclick = () => confirmAct('Zerar estatísticas totais?', 'As contagens acumuladas voltam a zero. A galeria de Tesouros é mantida.', () => call('ResetTotals'));
  $('#cfClearAct', el).onclick = () => confirmAct('Limpar histórico de atividades?', 'Os registros do histórico serão apagados.', async () => { await call('ClearActivity'); S.activity = []; });
  setupHotkeys();
  sync();
  document.addEventListener('settings', sync);
}

function confirmAct(title, text, fn) {
  const m = $('#modal'), sh = $('#modalSheet');
  sh.innerHTML = `<h2>${esc(title)}</h2><p class="muted">${esc(text)}</p><div class="row mt" style="justify-content:flex-end"><button class="btn ghost" id="caNo">Cancelar</button><button class="btn danger" id="caYes">Confirmar</button></div>`;
  m.classList.add('open');
  $('#caNo').onclick = () => m.classList.remove('open');
  $('#caYes').onclick = async () => { try { await fn(); toast('ok', 'Pronto'); } catch (e) { errToast(e); } m.classList.remove('open'); };
}

function setupHotkeys() {
  let listening = null;
  const names = { Control: 'Ctrl', Alt: 'Alt', Shift: 'Shift', Meta: 'Win' };
  $$('[data-hk]', root).forEach((b) => {
    b.onclick = () => { $$('[data-hk]', root).forEach((x) => x.classList.remove('listening')); listening = b; b.classList.add('listening'); b.textContent = 'Pressione…'; };
  });
  window.addEventListener('keydown', (e) => {
    if (!listening) return;
    e.preventDefault();
    const k = listening.dataset.hk;
    if (e.key === 'Escape') { listening.classList.remove('listening'); listening = null; sync(); return; }
    if (e.key === 'Backspace') { save(k, ''); return; }
    if (names[e.key]) return;
    const mods = [e.ctrlKey && 'Ctrl', e.altKey && 'Alt', e.shiftKey && 'Shift', e.metaKey && 'Win'].filter(Boolean);
    let key = e.key.length === 1 ? e.key.toUpperCase() : e.key;
    if (/^F\d{1,2}$/.test(e.key)) key = e.key;
    const map = { Pause: 'Pause', Home: 'Home', End: 'End', Insert: 'Insert', Delete: 'Delete', PageUp: 'PageUp', PageDown: 'PageDown' };
    if (!(key.length === 1 && /[A-Z0-9]/.test(key)) && !/^F\d{1,2}$/.test(key) && !map[key]) { toast('warn', 'Tecla não suportada', 'Use letras, números, F1–F24 ou Pause/Home/End.'); return; }
    if (!mods.length && !/^F\d{1,2}$/.test(key)) { toast('warn', 'Combine com Ctrl, Alt ou Win', 'Evita conflito com o jogo.'); return; }
    save(k, [...mods, key].join('+'));
  }, true);
  async function save(k, v) {
    const b = listening; listening = null; b?.classList.remove('listening');
    await patchSettings({ hotkeys: { [k]: v } });
    const errs = await call('GetHotkeyErrors').catch(() => ({}));
    S.snap.hotkeyErrors = errs;
    sync();
  }
}

function sync() {
  if (!root) return;
  const s = S.settings;
  const chk = { cfSnd: s.soundEnabled, cfWin: s.windowsNotifications, cfUnc: s.saveUncertain, cfBoot: s.startWithWindows, cfTray: s.minimizeToTray, cfLaunch: s.autoLaunch, cfLite: s.reduceEffects, cfGlass: s.windowGlass };
  for (const [id, v] of Object.entries(chk)) $(`#${id}`, root).checked = !!v;
  const vol = $('#cfVol', root); vol.value = s.soundVolume; setRange(vol);
  $('#cfDir', root).value = s.capturesDir;
  $('#cfData', root).textContent = S.snap.dataDir;
  const cmdKey = { toggle: 'alternar', emergency: 'emergencia', chest: 'bau_manual', reward: 'recompensa_manual' };
  $$('[data-hk]', root).forEach((b) => { if (!b.classList.contains('listening')) b.textContent = s.hotkeys[b.dataset.hk] || 'Nenhum'; });
  $$('[data-err]', root).forEach((e) => { e.textContent = S.snap.hotkeyErrors?.[cmdKey[e.dataset.err]] || ''; });
}
