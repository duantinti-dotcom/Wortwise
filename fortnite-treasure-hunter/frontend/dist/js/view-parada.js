import { icon } from './icons.js';
import { S, $, $$, esc, switchHTML, patchSettings, CATEGORY } from './core.js';

let root;

const opts = [
  ['pirateToken', 'coin', 'Token da Loja Pirata', 'Para ao identificar o Token da Loja Pirata.'],
  ['goldSkin', 'gold', 'Skin dourada', 'Para ao identificar uma skin dourada.'],
  ['elemental', 'flame', 'Item elemental', 'Para ao identificar um item elemental.'],
  ['selectedRare', 'gem', 'Itens raros selecionados', 'Para quando qualquer item escolhido abaixo for identificado.'],
];

export function render(el) {
  root = el;
  el.innerHTML = `
    <div class="head"><div><h1>Condições de parada</h1><p>Combine quantas quiser: a operação para na primeira condição atingida, com alerta sonoro e notificação do Windows. Recompensas não confirmadas nunca param a operação.</p></div></div>
    <div class="glass card">
      <div class="opt"><div class="oico">${icon('refresh')}</div><div class="txt"><b>Operação contínua</b><span>Ignora todas as condições abaixo e monitora até você encerrar.</span></div>${switchHTML('pcCont', false)}</div>
    </div>
    <div class="grid g-2 mt" id="pcBody">
      <div class="glass card">
        <h3>${icon('sparkle')}Ao encontrar</h3>
        ${opts.map(([k, ic, t, d]) => `<div class="opt"><div class="oico">${icon(ic)}</div><div class="txt"><b>${t}</b><span>${d}</span></div>${switchHTML(`pc-${k}`, false)}</div>`).join('')}
        <div class="opt"><div class="oico">${icon('users')}</div><div class="txt"><b>Incluir itens encontrados pelo Squad</b><span>Considera notificações de qualquer um dos quatro integrantes, não só da sua conta.</span></div>${switchHTML('pcSquad', false)}</div>
        <div class="field mt" id="pcSelWrap"><label>Itens raros selecionados</label><div class="row wrap" id="pcSel"></div></div>
      </div>
      <div class="glass card">
        <h3>${icon('hourglass')}Limites</h3>
        ${[['chestLimit', 'chest', 'Quantidade de baús', 'baús identificados nesta sessão'], ['matchLimit', 'flag', 'Quantidade de partidas', 'partidas encerradas nesta sessão'], ['timeLimitMin', 'clock', 'Tempo de operação', 'minutos (sem contar pausas)']]
          .map(([k, ic, t, d]) => `<div class="opt"><div class="oico">${icon(ic)}</div><div class="txt"><b>${t}</b><span>${d} · 0 = desativado</span></div><input class="input num" type="number" min="0" max="100000" id="pc-${k}"></div>`).join('')}
        <div class="notice info mt">${icon('info')}<span>O progresso do limite ativo aparece no anel dourado do Painel.</span></div>
      </div>
    </div>`;
  $('#pcCont', el).onchange = (e) => save({ continuous: e.target.checked });
  for (const [k] of opts) $(`#pc-${k}`, el).onchange = (e) => save({ [k]: e.target.checked });
  $('#pcSquad', el).onchange = (e) => save({ includeSquad: e.target.checked });
  for (const k of ['chestLimit', 'matchLimit', 'timeLimitMin']) $(`#pc-${k}`, el).onchange = (e) => save({ [k]: Math.max(0, Math.floor(+e.target.value || 0)) });
  sync();
  document.addEventListener('settings', sync);
  document.addEventListener('templates', sync);
}

export function show() { sync(); }

function save(p) { patchSettings({ stop: p }, { quiet: true }).then(sync); }

function sync() {
  if (!root) return;
  const st = S.settings.stop;
  $('#pcCont', root).checked = st.continuous;
  $('#pcBody', root).style.opacity = st.continuous ? 0.4 : 1;
  $('#pcBody', root).style.pointerEvents = st.continuous ? 'none' : '';
  for (const [k] of opts) $(`#pc-${k}`, root).checked = !!st[k];
  $('#pcSquad', root).checked = !!st.includeSquad;
  for (const k of ['chestLimit', 'matchLimit', 'timeLimitMin']) $(`#pc-${k}`, root).value = st[k] || 0;
  const rewards = (S.templates || []).filter((t) => t.target === 'recompensa');
  const sel = new Set(st.selectedIds || []);
  $('#pcSel', root).innerHTML = rewards.length
    ? rewards.map((t) => `<button class="chip ${sel.has(t.id) ? 'on' : ''}" data-id="${esc(t.id)}">${icon(sel.has(t.id) ? 'checkCircle' : 'circle')}${esc(t.label)} <span class="faint" style="font-weight:600">· ${esc(CATEGORY[t.category] || '')}</span></button>`).join('')
    : '<span class="faint" style="font-size:12.5px">Calibre recompensas na aba Visão para escolhê-las aqui.</span>';
  $$('#pcSel [data-id]', root).forEach((b) => {
    b.onclick = () => {
      const s = new Set(S.settings.stop.selectedIds || []);
      s.has(b.dataset.id) ? s.delete(b.dataset.id) : s.add(b.dataset.id);
      save({ selectedIds: [...s], selectedRare: s.size > 0 ? true : S.settings.stop.selectedRare });
    };
  });
}
