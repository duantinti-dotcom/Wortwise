import { icon } from './icons.js';
import { call } from './api.js';
import { toast, errToast } from './fx.js';
import { S, $, $$, esc, pct, RARITY, CATEGORY, refreshTemplates, setRange } from './core.js';

let root, frame = null, sel = null, lastTest = null;

export function render(el) {
  root = el;
  const targets = S.snap.targets;
  el.innerHTML = `
    <div class="head">
      <div><h1>Ensinar o app</h1><p>Mostre ao Treasure Hunter como são as telas do seu jogo. É feito uma vez só e funciona em qualquer resolução.</p></div>
      <div class="actions">
        <button class="btn" id="cFile">${icon('image')}<span>Abrir captura</span></button>
        <button class="btn gold" id="cGrab">${icon('camera')}<span>Capturar tela agora</span></button>
      </div>
    </div>
    <div class="calib">
      <div class="stack">
        <div class="glass card" style="padding:14px">
          <div class="stage" id="stage"><div class="placeholder">${icon('scan')}<div><b style="color:var(--text)">Nenhuma captura carregada</b><br>Abra o Fortnite na tela que deseja calibrar e clique em <b>Capturar tela agora</b>, ou abra uma captura salva (Win + PrtScn).</div></div></div>
          <div class="row mt wrap">
            <span class="faint" id="cInfo" style="font-size:12px">Arraste sobre a imagem para selecionar.</span>
            <span style="flex:1"></span>
            <button class="btn sm" id="cTest">${icon('eye')}<span>Testar nesta captura</span></button>
            <button class="btn sm" id="cLive">${icon('scan')}<span>Testar ao vivo</span></button>
          </div>
        </div>
        <div class="glass card">
          <h3>${icon('checkCircle')}Elementos calibrados<span class="right" id="cCount"></span></h3>
          <div class="checklist" id="checklist"></div>
          <div class="tpl-list mt" id="tplList"></div>
        </div>
      </div>
      <div class="glass card stack" style="gap:14px;position:sticky;top:0">
        <h3 style="margin:0">${icon('target')}Novo elemento</h3>
        <div class="field"><label>O que é este elemento?</label>
          <select class="input" id="fTarget">${targets.map((t) => `<option value="${t.id}">${esc(t.label)}</option>`).join('')}</select>
          <span class="hint" id="fHint"></span></div>
        <div class="field"><label>Nome</label><input class="input" id="fLabel" maxlength="60" placeholder="Ex.: Botão JOGAR"></div>
        <div id="fReward" class="stack" style="gap:14px">
          <div class="field"><label>Categoria da recompensa</label><select class="input" id="fCat">${Object.entries(CATEGORY).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select></div>
          <div class="field"><label>Raridade</label><select class="input" id="fRar">${Object.entries(RARITY).map(([k, v]) => `<option value="${k}" ${k === 'lendario' ? 'selected' : ''}>${v}</option>`).join('')}</select></div>
          <div class="field"><label>Onde a notificação aparece</label>
            <div class="seg" id="fScope"><button data-v="propria" class="on">${icon('user')}Minha conta</button><button data-v="squad">${icon('users')}Feed do Squad</button></div>
            <span class="hint">Use "Feed do Squad" para avisos de itens encontrados por colegas. Eles também acionam as condições de parada.</span></div>
        </div>
        <div class="field"><label>Área de busca</label>
          <div class="seg" id="fArea"><button data-v="proxima" class="on">Próxima</button><button data-v="coluna">Coluna</button><button data-v="linha">Linha</button><button data-v="tela">Tela toda</button></div>
          <span class="hint" id="fAreaHint">Procura perto da posição selecionada (mais rápido).</span></div>
        <div class="field"><label>Confiança mínima <b class="mono" id="fThrV" style="color:var(--gold-2)"></b></label><input type="range" id="fThr" min="0.6" max="0.97" step="0.01" value="0.8"></div>
        <button class="btn gold lg" id="fSave" disabled>${icon('check')}<span>Salvar elemento</span></button>
        <div class="notice info">${icon('info')}<span>Prefira textos, ícones e bordas que não mudam. Evite áreas com o cenário do jogo ao fundo.</span></div>
      </div>
    </div>`;

  $('#cGrab', el).onclick = () => load(call('CalibCapture'));
  $('#cFile', el).onclick = () => load(call('CalibFromFile'));
  $('#cTest', el).onclick = () => test(false);
  $('#cLive', el).onclick = () => test(true);
  const thrLabel = () => { $('#fThrV', el).textContent = pct(+$('#fThr', el).value); setRange($('#fThr', el)); };
  const fT = $('#fTarget', el);
  fT.onchange = () => {
    const t = targets.find((x) => x.id === fT.value);
    $('#fHint', el).textContent = t?.hint || '';
    $('#fReward', el).classList.toggle('hidden', fT.value !== 'recompensa');
    const thr = fT.value === 'recompensa' || fT.value === 'integrante' ? 0.82 : fT.value.startsWith('bau') ? 0.78 : 0.8;
    $('#fThr', el).value = thr; thrLabel();
    $('#fLabel', el).placeholder = fT.value === 'integrante' ? 'Nome do colega, exatamente como aparece' : fT.value === 'recompensa' ? 'Ex.: Token da Loja Pirata' : t?.label;
    if (fT.value === 'recompensa') pickSeg('fArea', 'coluna');
  };
  fT.onchange();
  fT.addEventListener('pointerdown', () => { wizardTouched = true; });
  for (const id of ['fScope', 'fArea']) {
    $(`#${id}`, el).onclick = (e) => { const b = e.target.closest('button'); if (b) pickSeg(id, b.dataset.v); };
  }
  $('#fThr', el).oninput = thrLabel; thrLabel();
  $('#fSave', el).onclick = save;
  setupStage();
  document.addEventListener('templates', drawTemplates);
  drawTemplates();
}

export function show() { refreshTemplates(); }

function pickSeg(id, v) {
  $$(`#${id} button`, root).forEach((b) => b.classList.toggle('on', b.dataset.v === v));
  if (id === 'fArea') {
    $('#fAreaHint', root).textContent = { proxima: 'Procura perto da posição selecionada (mais rápido).', coluna: 'Procura na coluna inteira — ideal para notificações empilhadas.', linha: 'Procura na faixa horizontal inteira.', tela: 'Procura na tela inteira (mais lento).' }[v];
  }
}
const segVal = (id) => $(`#${id} button.on`, root)?.dataset.v;

async function load(p) {
  try {
    const f = await p;
    if (!f || !f.preview) return;
    frame = f; sel = null; lastTest = null;
    const st = $('#stage', root);
    st.innerHTML = `<img src="${esc(f.preview)}" alt="">`;
    $('#cInfo', root).textContent = `${f.w}×${f.h} · ${f.source}${f.blank ? ' — captura preta: use janela sem bordas' : ''}. Arraste para selecionar.`;
    if (f.blank) toast('warn', 'Captura preta', 'O Fortnite em tela cheia exclusiva não pode ser capturado. Use "Janela sem bordas".');
    $('#fSave', root).disabled = true;
  } catch (e) { errToast(e, 'Captura'); }
}

// Área real da imagem dentro do palco (object-fit: contain).
function contentBox() {
  const st = $('#stage', root);
  const r = st.getBoundingClientRect();
  if (!frame) return null;
  const ar = frame.w / frame.h, sr = r.width / r.height;
  let w = r.width, h = r.height, x = 0, y = 0;
  if (ar > sr) { h = w / ar; y = (r.height - h) / 2; } else { w = h * ar; x = (r.width - w) / 2; }
  return { left: r.left + x, top: r.top + y, w, h, ox: x, oy: y };
}

function setupStage() {
  const st = $('#stage', root);
  let start = null;
  st.onpointerdown = (e) => {
    const b = contentBox(); if (!b) return;
    st.setPointerCapture(e.pointerId);
    start = { x: clamp((e.clientX - b.left) / b.w), y: clamp((e.clientY - b.top) / b.h) };
    sel = { x: start.x, y: start.y, w: 0, h: 0 };
    drawSel();
  };
  st.onpointermove = (e) => {
    if (!start) return;
    const b = contentBox();
    const x = clamp((e.clientX - b.left) / b.w), y = clamp((e.clientY - b.top) / b.h);
    sel = { x: Math.min(x, start.x), y: Math.min(y, start.y), w: Math.abs(x - start.x), h: Math.abs(y - start.y) };
    drawSel();
  };
  st.onpointerup = () => {
    start = null;
    const ok = sel && sel.w * frame.w > 10 && sel.h * frame.h > 8;
    $('#fSave', root).disabled = !ok;
    if (!ok) { sel = null; drawSel(); }
  };
  new ResizeObserver(() => { drawSel(); drawHits(); }).observe(st);
}
const clamp = (v) => Math.max(0, Math.min(1, v));

function drawSel() {
  const st = $('#stage', root);
  st.querySelector('.selbox')?.remove();
  if (!sel || !frame) return;
  const b = contentBox();
  const d = document.createElement('div');
  d.className = 'selbox';
  d.style.cssText = `left:${b.ox + sel.x * b.w}px;top:${b.oy + sel.y * b.h}px;width:${sel.w * b.w}px;height:${sel.h * b.h}px`;
  d.dataset.size = `${Math.round(sel.w * frame.w)}×${Math.round(sel.h * frame.h)}`;
  st.appendChild(d);
}

async function save() {
  if (!sel) return;
  try {
    const t = await call('SaveTemplate', {
      target: $('#fTarget', root).value, label: $('#fLabel', root).value, category: $('#fCat', root).value,
      rarity: $('#fRar', root).value, scope: segVal('fScope'), box: sel, area: segVal('fArea'), threshold: +$('#fThr', root).value,
    });
    toast('ok', 'Elemento salvo', t.label);
    sel = null; drawSel();
    $('#fLabel', root).value = '';
    $('#fSave', root).disabled = true;
    await refreshTemplates();
  } catch (e) { errToast(e, 'Não foi possível salvar'); }
}

async function test(live) {
  try {
    const r = await call('TestRecognition', live);
    if (r.frame) { frame = r.frame; sel = null; $('#stage', root).innerHTML = `<img src="${esc(r.frame.preview)}" alt="">`; }
    lastTest = r;
    drawHits();
    drawTemplates();
    const found = (r.detections || []).filter((d) => d.confirmed).length;
    toast(found ? 'ok' : 'warn', `Reconhecimento: ${r.state}`, `${found} de ${(r.detections || []).length} elementos encontrados em ${r.ms.toFixed(1)} ms (${r.source}).`);
  } catch (e) { errToast(e, 'Teste de reconhecimento'); }
}

function drawHits() {
  const st = $('#stage', root);
  $$('.hit', st).forEach((x) => x.remove());
  if (!lastTest || !frame) return;
  const b = contentBox();
  for (const d of lastTest.detections || []) {
    if (!d.confirmed && !d.uncertain) continue;
    const h = document.createElement('div');
    h.className = `hit ${d.confirmed ? '' : 'unc'}`;
    h.style.cssText = `left:${b.ox + d.box.x * b.w}px;top:${b.oy + d.box.y * b.h}px;width:${d.box.w * b.w}px;height:${d.box.h * b.h}px`;
    h.innerHTML = `<span>${esc(d.label)} ${pct(d.score)}${d.confirmed ? '' : ' (incerto)'}</span>`;
    st.appendChild(h);
  }
}

const GUIDE = [
  { id: 'lobby', name: 'Lobby', when: 'Deixe o Fortnite no <b>lobby</b>', what: 'o <b>botão JOGAR</b>' },
  { id: 'partida', name: 'Em partida', when: 'Entre numa <b>partida</b> (já no chão)', what: 'a <b>moldura do minimapa</b> ou da barra de vida' },
  { id: 'squad_eliminado', name: 'Fim de partida', when: 'Quando o Squad cair, na <b>tela de resultado</b>', what: 'a <b>placa de colocação</b> (ex.: "#12")' },
  { id: 'recompensa', name: 'Token da Loja Pirata (opcional)', when: 'Quando aparecer a <b>notificação do Token</b> (sua ou do Squad)', what: 'o <b>ícone ou nome do item</b>' },
];

function drawWizard(cnt) {
  const w = $('#wiz', root);
  if (!w) return;
  const step = GUIDE.find((g) => !cnt[g.id]);
  const n = step ? GUIDE.indexOf(step) + 1 : 0;
  if (!step) {
    w.classList.add('ok');
    w.innerHTML = `<div class="badge-n">${icon('check')}</div><div><h2>Tudo pronto!</h2><span class="muted">O app já reconhece as telas principais e o Token. Volte ao Início e clique em Iniciar.</span></div><button class="btn gold" id="wGo">${icon('compass')}<span>Ir para o Início</span></button>`;
    $('#wGo', w).onclick = () => window.__go?.('painel');
    return;
  }
  w.classList.remove('ok');
  w.innerHTML = `<div class="badge-n">${n}</div>
    <div><h2>Passo ${n} de ${GUIDE.length}: ${step.name}</h2>
      <ol><li>${step.when}.</li><li>Clique em <b>Capturar tela agora</b> (ou use uma captura salva).</li><li>Na imagem, arraste uma caixa em volta de ${step.what}.</li><li>Clique em <b>Salvar elemento</b>.</li></ol></div>
    <button class="btn gold" id="wCap">${icon('camera')}<span>Capturar tela agora</span></button>`;
  $('#wCap', w).onclick = () => load(call('CalibCapture'));
  const ft = $('#fTarget', root);
  if (ft.value !== step.id && !wizardTouched) { ft.value = step.id; ft.onchange(); }
}
let wizardTouched = false;

function drawTemplates() {
  if (!root) return;
  const list = S.templates || [];
  const cnt = {};
  list.forEach((t) => { cnt[t.target] = (cnt[t.target] || 0) + 1; });
  drawWizard(cnt);
  $('#cCount', root).textContent = `${list.length} elemento(s)`;
  $('#checklist', root).innerHTML = S.snap.targets.map((t) => `<div class="${cnt[t.id] ? 'done' : ''} ${t.required ? 'req' : ''}">${icon(cnt[t.id] ? 'checkCircle' : 'circle')}${esc(t.label)}${cnt[t.id] > 1 ? ` <span class="faint">×${cnt[t.id]}</span>` : ''}</div>`).join('');
  const scores = {};
  for (const d of lastTest?.detections || []) scores[d.templateId] = d;
  const tl = $('#tplList', root);
  if (!list.length) {
    tl.innerHTML = `<div class="empty-state">${icon('scan')}Nenhum elemento calibrado. Comece por <b>Lobby</b>, <b>Em partida</b> e <b>Squad eliminado</b>.</div>`;
    return;
  }
  const label = (id) => S.snap.targets.find((x) => x.id === id)?.label || id;
  tl.innerHTML = list.map((t) => {
    const sc = scores[t.id];
    const scTxt = sc ? `<span class="score" style="color:${sc.confirmed ? 'var(--ok)' : sc.uncertain ? 'var(--warn)' : 'var(--text-3)'}">${pct(sc.score)}</span>` : '';
    const extra = t.target === 'recompensa' ? ` · ${esc(CATEGORY[t.category] || '')} · ${t.scope === 'squad' ? 'Squad' : 'Minha conta'}` : '';
    return `<div class="tpl" data-id="${esc(t.id)}"><img src="${esc(t.preview)}" alt="">
      <div><b>${esc(t.label)}</b><div class="s">${esc(label(t.target))}${extra} · ${t.sourceW}×${t.sourceH}</div>
        <div class="row" style="margin-top:6px"><input type="range" min="0.5" max="0.97" step="0.01" value="${t.threshold}" data-thr style="max-width:160px"><span class="mono faint" style="font-size:11px" data-thrv>${pct(t.threshold)}</span>${scTxt}</div></div>
      <button class="btn sm icon ghost" data-del title="Excluir">${icon('trash')}</button></div>`;
  }).join('');
  for (const row of $$('.tpl', tl)) {
    const id = row.dataset.id;
    const r = $('[data-thr]', row);
    setRange(r);
    r.oninput = () => { $('[data-thrv]', row).textContent = pct(+r.value); setRange(r); };
    r.onchange = () => call('SetTemplateThreshold', id, +r.value).then(refreshTemplates).catch(errToast);
    $('[data-del]', row).onclick = async () => { try { await call('DeleteTemplate', id); await refreshTemplates(); toast('ok', 'Elemento removido'); } catch (e) { errToast(e); } };
  }
}
