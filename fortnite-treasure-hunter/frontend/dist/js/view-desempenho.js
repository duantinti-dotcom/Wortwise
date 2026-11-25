import { icon } from './icons.js';
import { S, $, $$, nf, nf1, patchSettings, setRange } from './core.js';
import { sparkline } from './fx.js';

let root;
const hist = { cpu: [], gpu: [], ram: [], an: [] };
let lastSample = 0;

const PROFILES = [
  ['economico', 'leaf', 'Econômico', 'Menor consumo de processamento. Ideal para jogar com o máximo de FPS no Fortnite.', ['1 quadro/s', 'confirmação em 2']],
  ['equilibrado', 'scale', 'Equilibrado', 'Equilíbrio entre consumo e tempo de resposta. Recomendado.', ['2 quadros/s', 'confirmação em 2']],
  ['maximo', 'rocket', 'Máximo desempenho', 'Reconhecimento com a menor latência, para não perder notificações rápidas.', ['5 quadros/s', 'confirmação em 3']],
];

export function render(el) {
  root = el;
  el.innerHTML = `
    <div class="head"><div><h1>Desempenho</h1><p>O reconhecimento roda sobre uma cópia reduzida da tela e só procura o que é plausível no momento da partida, por isso o consumo fica baixo mesmo em PCs modestos.</p></div></div>
    <div class="grid g-3">
      ${PROFILES.map(([k, ic, t, d, specs]) => `<div class="glass profile" data-p="${k}"><span class="check-mark">${icon('check')}</span><div class="pi">${icon(ic)}</div><b>${t}</b><p>${d}</p><div class="specs">${specs.map((x) => `<span class="tag">${x}</span>`).join('')}</div></div>`).join('')}
    </div>
    <div class="grid g-2 mt">
      <div class="glass card">
        <h3>${icon('cpu')}Consumo em tempo real<span class="right">app + WebView2</span></h3>
        <div class="meters">
          <div class="meter"><div class="k">CPU</div><div class="v" id="pfCpu">—</div><canvas id="cvCpu"></canvas></div>
          <div class="meter"><div class="k">GPU</div><div class="v" id="pfGpu">—</div><canvas id="cvGpu"></canvas></div>
          <div class="meter"><div class="k">RAM</div><div class="v" id="pfRam">—</div><canvas id="cvRam"></canvas></div>
        </div>
        <div class="kv mt" style="grid-template-columns:auto 1fr auto 1fr">
          <dt>Captura</dt><dd class="mono" id="pfCap">—</dd><dt>Redução</dt><dd class="mono" id="pfDown">—</dd>
          <dt>Análise</dt><dd class="mono" id="pfAn">—</dd><dt>Quadros/s</dt><dd class="mono" id="pfFps">—</dd>
          <dt>Elementos/quadro</dt><dd class="mono" id="pfTpl">—</dd><dt>Quadros iguais</dt><dd class="mono" id="pfSkip">—</dd>
          <dt>CPU do sistema</dt><dd class="mono" id="pfSys">—</dd><dt>Heap Go</dt><dd class="mono" id="pfHeap">—</dd>
        </div>
      </div>
      <div class="glass card">
        <h3>${icon('gauge')}Ajuste fino</h3>
        <div class="field"><label>Frequência de reconhecimento <b class="mono" id="pfFreqV" style="color:var(--gold-2)"></b></label><input type="range" id="pfFreq" min="0" max="8" step="0.5"><span class="hint">0 = usar o padrão do perfil. Valores maiores reagem mais rápido e consomem mais.</span></div>
        <div class="field mt"><label>Quadros para confirmar uma tela <b class="mono" id="pfConfV" style="color:var(--gold-2)"></b></label><input type="range" id="pfConf" min="0" max="6" step="1"><span class="hint">Evita transições falsas (0 = padrão do perfil).</span></div>
        <div class="notice info mt">${icon('info')}<span>Configuração de referência: Intel Core i5-10400F, GTX 1650 e 16 GB de RAM. A meta é manter o app abaixo de 2% de CPU, sem uso perceptível de GPU e abaixo de ~200 MB de RAM no perfil Equilibrado. Os valores acima são medidos ao vivo neste computador.</span></div>
      </div>
    </div>`;
  $$('.profile', el).forEach((p) => { p.onclick = () => patchSettings({ profile: p.dataset.p, scanFps: 0, confirmFrames: 0 }, { quiet: true }).then(sync); });
  const fr = $('#pfFreq', el), cf = $('#pfConf', el);
  fr.oninput = () => { label(); setRange(fr); };
  cf.oninput = () => { label(); setRange(cf); };
  fr.onchange = () => patchSettings({ scanFps: +fr.value }, { quiet: true });
  cf.onchange = () => patchSettings({ confirmFrames: +cf.value }, { quiet: true });
  sync();
  document.addEventListener('settings', sync);
}

function label() {
  const fr = +$('#pfFreq', root).value, cf = +$('#pfConf', root).value;
  $('#pfFreqV', root).textContent = fr ? `${nf1.format(fr)} quadros/s` : 'padrão do perfil';
  $('#pfConfV', root).textContent = cf ? `${cf}` : 'padrão do perfil';
}

function sync() {
  if (!root) return;
  const s = S.settings;
  $$('.profile', root).forEach((p) => p.classList.toggle('on', p.dataset.p === s.profile));
  $('#pfFreq', root).value = s.scanFps; $('#pfConf', root).value = s.confirmFrames;
  setRange($('#pfFreq', root)); setRange($('#pfConf', root)); label();
}

export function live(d) {
  if (!root) return;
  const u = d.usage || {}, p = d.perf || {};
  $('#pfCpu', root).innerHTML = `${nf1.format(u.cpu || 0)}<small>%</small>`;
  $('#pfGpu', root).innerHTML = u.gpuAvailable ? `${nf1.format(u.gpu || 0)}<small>%</small>` : '<small>indisponível</small>';
  $('#pfRam', root).innerHTML = `${nf.format(Math.round(u.ramMb || 0))}<small>MB</small>`;
  const msTxt = (v) => (p.frames ? `${nf1.format(v)} ms` : '—');
  $('#pfCap', root).textContent = msTxt(p.captureMs);
  $('#pfDown', root).textContent = msTxt(p.downscaleMs);
  $('#pfAn', root).textContent = msTxt(p.analyzeMs);
  $('#pfFps', root).textContent = p.frames ? `${nf1.format(p.fps)} / ${nf1.format(p.targetFps)}` : `— / ${nf1.format(p.targetFps)}`;
  $('#pfTpl', root).textContent = p.frames ? nf1.format(p.templates) : '—';
  $('#pfSkip', root).textContent = p.frames ? `${nf1.format(p.skippedPct)}%` : '—';
  $('#pfSys', root).textContent = `${nf1.format(u.systemCpu || 0)}%`;
  $('#pfHeap', root).textContent = `${nf1.format(p.heapMb)} MB`;
  // Uma amostra a cada ~2 s (mesma cadência do medidor do backend).
  if (Date.now() - lastSample > 1900) {
    lastSample = Date.now();
    for (const [k, v] of [['cpu', u.cpu || 0], ['gpu', u.gpu || 0], ['ram', u.ramMb || 0]]) { hist[k].push(v); if (hist[k].length > 60) hist[k].shift(); }
    if (S.view === 'desempenho') {
      sparkline($('#cvCpu', root), hist.cpu, 5);
      sparkline($('#cvGpu', root), hist.gpu, 5, '#7fe9f4');
      sparkline($('#cvRam', root), hist.ram, 200, '#c071ff');
    }
  }
}
