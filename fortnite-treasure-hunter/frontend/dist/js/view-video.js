import { icon } from './icons.js';
import { call } from './api.js';
import { toast, errToast } from './fx.js';
import { S, $, $$, esc, switchHTML, patchSettings } from './core.js';

let root;

export function render(el) {
  root = el;
  el.innerHTML = `
    <div class="head">
      <div><h1>Vídeo</h1><p>Resolução, monitor e modo de exibição do Fortnite. No modo automático o app captura apenas a área da janela do jogo — em tela cheia, janela sem bordas ou modo janela.</p></div>
      <div class="actions"><button class="btn" id="vdDetect">${icon('refresh')}<span>Detectar agora</span></button></div>
    </div>
    <div class="grid g-2">
      <div class="glass card">
        <h3>${icon('scan')}Detecção automática</h3>
        <dl class="kv" id="vdInfo"><dt>Status</dt><dd class="faint">Detectando…</dd></dl>
        <div class="stack mt" id="vdWarn" style="gap:8px"></div>
      </div>
      <div class="glass card">
        <h3>${icon('eye')}Pré-visualização da captura</h3>
        <div class="stage" id="vdStage" style="cursor:default"><div class="placeholder">${icon('camera')}<div>Veja exatamente a área que o reconhecimento analisa.</div></div></div>
        <div class="row mt"><button class="btn" id="vdPrev">${icon('camera')}<span>Atualizar pré-visualização</span></button><button class="btn" id="vdTest">${icon('eye')}<span>Testar reconhecimento</span></button><span class="faint" id="vdTestRes" style="font-size:12px"></span></div>
      </div>
    </div>
    <div class="glass card mt">
      <h3>${icon('monitor')}Resolução do Fortnite</h3>
      <div class="seg" id="vdMode"><button data-v="auto">${icon('sparkle')}Detecção automática</button><button data-v="preset">Predefinida</button><button data-v="custom">Personalizada</button></div>
      <div class="res-grid mt" id="vdPresets"></div>
      <div class="row mt hidden" id="vdCustom"><input class="input num" id="vdW" type="number" min="640" max="7680"><span class="faint">×</span><input class="input num" id="vdH" type="number" min="480" max="4320"><button class="btn" id="vdApply">${icon('check')}Aplicar</button></div>
    </div>
    <div class="grid g-2 mt">
      <div class="glass card">
        <h3>${icon('maximize')}Modo de exibição</h3>
        <div class="seg" id="vdDisp"><button data-v="auto">Automático</button><button data-v="tela_cheia">Tela cheia</button><button data-v="sem_bordas">Janela sem bordas</button><button data-v="janela">Modo janela</button></div>
        <p class="faint" style="font-size:12px;margin:12px 0 0">Tela cheia exclusiva pode impedir a captura (imagem preta). O app avisa quando isso acontece e recomenda "Janela sem bordas", que tem a mesma aparência.</p>
        <div class="opt mt"><div class="oico">${icon('scale')}</div><div class="txt"><b>Ajuste automático da escala da interface</b><span>Compensa outra resolução, proporção (ex.: ultrawide) ou escala do HUD do Fortnite testando escalas vizinhas.</span></div>${switchHTML('vdScale', S.settings.autoScale)}</div>
      </div>
      <div class="glass card">
        <h3>${icon('monitor')}Monitor</h3>
        <div class="mon-grid" id="vdMons"></div>
        <p class="faint" style="font-size:12px;margin:12px 0 0">Usado quando a janela do Fortnite não é encontrada ou no modo manual.</p>
      </div>
    </div>`;
  $('#vdDetect', el).onclick = detect;
  $('#vdPrev', el).onclick = preview;
  $('#vdTest', el).onclick = async () => {
    try {
      const r = await call('TestRecognition', true);
      if (r.frame) $('#vdStage', root).innerHTML = `<img src="${esc(r.frame.preview)}" alt="">`;
      const n = (r.detections || []).filter((d) => d.confirmed).length;
      $('#vdTestRes', root).textContent = `Tela: ${r.state} · ${n}/${(r.detections || []).length} elementos · ${r.ms.toFixed(1)} ms`;
    } catch (e) { errToast(e, 'Teste'); }
  };
  $('#vdMode', el).onclick = (e) => { const b = e.target.closest('button'); if (b) patchSettings({ resolutionMode: b.dataset.v }, { quiet: true }).then(sync); };
  $('#vdDisp', el).onclick = (e) => { const b = e.target.closest('button'); if (b) patchSettings({ displayMode: b.dataset.v }, { quiet: true }).then(sync); };
  $('#vdScale', el).onchange = (e) => patchSettings({ autoScale: e.target.checked }, { quiet: true });
  $('#vdApply', el).onclick = () => patchSettings({ resolutionMode: 'custom', resolutionW: +$('#vdW', el).value, resolutionH: +$('#vdH', el).value }).then(sync);
  $('#vdPresets', el).innerHTML = S.snap.resolutions.map((r) => `<button class="chip" data-w="${r.w}" data-h="${r.h}">${esc(r.label)}</button>`).join('');
  $('#vdPresets', el).onclick = (e) => { const b = e.target.closest('[data-w]'); if (b) patchSettings({ resolutionMode: 'preset', resolutionW: +b.dataset.w, resolutionH: +b.dataset.h }, { quiet: true }).then(sync); };
  sync();
  document.addEventListener('settings', sync);
}

export function show() { detect(); }

function sync() {
  if (!root) return;
  const s = S.settings;
  $$('#vdMode button', root).forEach((b) => b.classList.toggle('on', b.dataset.v === s.resolutionMode));
  $$('#vdDisp button', root).forEach((b) => b.classList.toggle('on', b.dataset.v === s.displayMode));
  $('#vdPresets', root).classList.toggle('hidden', s.resolutionMode === 'auto');
  $('#vdCustom', root).classList.toggle('hidden', s.resolutionMode !== 'custom');
  $$('#vdPresets [data-w]', root).forEach((b) => b.classList.toggle('on', s.resolutionMode !== 'auto' && +b.dataset.w === s.resolutionW && +b.dataset.h === s.resolutionH));
  $('#vdW', root).value = s.resolutionW; $('#vdH', root).value = s.resolutionH;
  $('#vdScale', root).checked = s.autoScale;
  drawMonitors(S.snap.monitors);
}

function drawMonitors(mons) {
  const s = S.settings;
  $('#vdMons', root).innerHTML = (mons || []).map((m) => `<div class="mon ${m.index === s.monitor ? 'on' : ''}" data-i="${m.index}"><div class="screen">${m.index + 1}</div><b>${esc(m.name || `Monitor ${m.index + 1}`)}</b><small>${m.w}×${m.h}${m.primary ? ' · principal' : ''}</small></div>`).join('');
  $$('.mon', root).forEach((m) => { m.onclick = () => patchSettings({ monitor: +m.dataset.i }, { quiet: true }).then(sync); });
}

async function detect() {
  try {
    const v = await call('DetectVideo');
    S.snap.monitors = v.monitors;
    drawMonitors(v.monitors);
    const g = v.game, w = v.window;
    const hud = g.hudScale ? `${Math.round(g.hudScale * 100)}%` : 'não informado';
    $('#vdInfo', root).innerHTML = `
      <dt>Fortnite</dt><dd>${v.running ? '<span style="color:var(--ok)">Aberto</span>' : '<span style="color:var(--err)">Fechado</span>'}</dd>
      <dt>Resolução</dt><dd>${esc(v.detected)}</dd>
      <dt>Modo (configuração)</dt><dd>${esc(g.found ? g.modeLabel : 'Arquivo de configuração não encontrado')}</dd>
      <dt>Janela</dt><dd>${w.found ? (w.minimized ? 'Minimizada' : `${w.w}×${w.h} em (${w.x}, ${w.y}) · ${w.mode === 'tela_cheia' ? 'ocupa o monitor' : 'janela'}`) : '—'}</dd>
      <dt>Escala do HUD</dt><dd>${hud}</dd>
      <dt>Área capturada</dt><dd>${v.region.w ? `${v.region.w}×${v.region.h} · ${esc(v.region.source)}` : '—'}</dd>
      <dt>Calibrado em</dt><dd>${v.calibratedAt?.length ? esc(v.calibratedAt.join(', ')) : 'Nenhuma calibração'}</dd>`;
    $('#vdWarn', root).innerHTML = (v.warnings || []).map((t) => `<div class="notice">${icon('alert')}<span>${esc(t)}</span></div>`).join('');
  } catch (e) { errToast(e, 'Detecção'); }
}

async function preview() {
  try {
    const f = await call('CalibCapture');
    $('#vdStage', root).innerHTML = `<img src="${esc(f.preview)}" alt="">`;
    if (f.blank) toast('warn', 'Captura preta', 'Mude o Fortnite para "Janela sem bordas".');
  } catch (e) { errToast(e, 'Pré-visualização'); }
}
