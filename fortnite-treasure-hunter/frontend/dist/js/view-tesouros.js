import { icon } from './icons.js';
import { call } from './api.js';
import { toast, errToast } from './fx.js';
import { S, $, $$, esc, dt, pct, RARITY, CATEGORY, SCOPE, refreshRewards } from './core.js';

const F = { q: '', cat: '', rar: '', scope: '', conf: '', selecting: false, picked: new Set() };
let root;

export function render(el) {
  root = el;
  el.innerHTML = `
    <div class="head">
      <div><h1>Tesouros</h1><p>Cada recompensa especial identificada — sua ou anunciada pelo Squad — com a captura original, raridade, partida e nível de confiança.</p></div>
      <div class="actions">
        <button class="btn" id="tSel">${icon('select')}<span>Selecionar</span></button>
        <button class="btn hidden" id="tExport">${icon('download')}<span>Exportar</span></button>
        <button class="btn danger hidden" id="tDel">${icon('trash')}<span>Excluir</span></button>
        <button class="btn ghost" id="tFolder" title="Abrir pasta das capturas">${icon('folder')}</button>
      </div>
    </div>
    <div class="glass filters">
      <div class="search">${icon('search')}<input class="input" id="tQ" placeholder="Buscar por item ou integrante"></div>
      <select class="input" id="tCat" style="width:190px"><option value="">Todas as categorias</option>${Object.entries(CATEGORY).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select>
      <select class="input" id="tRar" style="width:170px"><option value="">Todas as raridades</option>${Object.entries(RARITY).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select>
      <div class="seg" id="tScope"><button data-v="" class="on">Todas</button><button data-v="propria">${icon('user')}Minhas</button><button data-v="squad">${icon('users')}Squad</button></div>
      <div class="seg" id="tConf"><button data-v="" class="on">Todas</button><button data-v="1">Confirmadas</button><button data-v="0">Não confirmadas</button></div>
    </div>
    <div class="gallery" id="gallery"></div>`;
  $('#tQ', el).oninput = (e) => { F.q = e.target.value.toLowerCase(); draw(); };
  $('#tCat', el).onchange = (e) => { F.cat = e.target.value; draw(); };
  $('#tRar', el).onchange = (e) => { F.rar = e.target.value; draw(); };
  for (const id of ['tScope', 'tConf']) {
    $(`#${id}`, el).onclick = (e) => {
      const b = e.target.closest('button'); if (!b) return;
      $$(`#${id} button`, el).forEach((x) => x.classList.toggle('on', x === b));
      F[id === 'tScope' ? 'scope' : 'conf'] = b.dataset.v; draw();
    };
  }
  $('#tSel', el).onclick = () => { F.selecting = !F.selecting; F.picked.clear(); draw(); };
  $('#tFolder', el).onclick = () => call('OpenCapturesFolder').catch(errToast);
  $('#tExport', el).onclick = async () => {
    try { const msg = await call('ExportRewards', [...F.picked]); if (msg) toast('ok', 'Exportação concluída', msg); } catch (e) { errToast(e, 'Exportar'); }
  };
  $('#tDel', el).onclick = () => confirmDelete([...F.picked]);
  document.addEventListener('rewards', draw);
}

export function show() { draw(); }

function filtered() {
  return S.rewards.filter((r) => {
    if (F.cat && r.category !== F.cat) return false;
    if (F.rar && r.rarity !== F.rar) return false;
    if (F.scope && r.scope !== F.scope) return false;
    if (F.conf !== '' && String(+r.confirmed) !== F.conf) return false;
    if (F.q && !(`${r.name} ${r.finder || ''}`.toLowerCase().includes(F.q))) return false;
    return true;
  });
}

function draw() {
  if (!root) return;
  const g = $('#gallery', root);
  root.classList.toggle('selecting', F.selecting);
  $('#tSel', root).querySelector('span').textContent = F.selecting ? 'Cancelar seleção' : 'Selecionar';
  $('#tExport', root).classList.toggle('hidden', !F.selecting);
  $('#tDel', root).classList.toggle('hidden', !F.selecting);
  $('#tExport', root).disabled = $('#tDel', root).disabled = !F.picked.size;
  const nav = document.querySelector('#nav a[data-view="tesouros"]');
  nav.querySelector('.badge')?.remove();
  const confirmed = S.rewards.filter((r) => r.confirmed).length;
  if (confirmed) nav.insertAdjacentHTML('beforeend', `<span class="badge">${confirmed}</span>`);
  const list = filtered();
  if (!list.length) {
    g.style.display = 'block';
    g.innerHTML = `<div class="glass card empty-state" style="padding:50px">${icon('chest')}<b style="display:block;color:var(--text);font-size:15px;margin-bottom:4px">${S.rewards.length ? 'Nenhum tesouro com esses filtros' : 'O baú ainda está vazio'}</b>${S.rewards.length ? 'Altere os filtros para ver outras capturas.' : 'Calibre as recompensas especiais na aba Visão. Quando uma delas aparecer na tela — para você ou para o Squad — a captura chega aqui.'}</div>`;
    return;
  }
  g.style.display = '';
  g.innerHTML = list.map((r, i) => card(r, i)).join('');
  for (const c of $$('.treasure', g)) {
    c.onclick = () => {
      const id = c.dataset.id;
      if (F.selecting) {
        F.picked.has(id) ? F.picked.delete(id) : F.picked.add(id);
        c.classList.toggle('picked');
        $('#tExport', root).disabled = $('#tDel', root).disabled = !F.picked.size;
        return;
      }
      openViewer(id);
    };
  }
}

function card(r, i) {
  const rar = r.rarity || 'desconhecida';
  const scope = r.scope === 'squad' ? `<span class="tag squad">${icon('users')}${esc(r.finder || 'Squad')}</span>` : `<span class="tag own">${icon('user')}Minha</span>`;
  const unconf = r.confirmed ? '' : `<span class="tag unconf">${icon('alert')}Não confirmada</span>`;
  const manual = r.source === 'manual' ? `<span class="tag">${icon('hand')}Manual</span>` : '';
  return `<div class="glass treasure r-${esc(rar)} ${r.special ? 'special' : ''} ${F.picked.has(r.id) ? 'picked' : ''}" data-id="${esc(r.id)}" style="animation-delay:${Math.min(i, 12) * 35}ms">
    <div class="img">${r.thumbUrl ? `<img loading="lazy" src="${esc(r.thumbUrl)}" alt="">` : ''}
      <span class="sel">${icon('check')}</span><div class="tags">${unconf}${manual}${scope}</div>
      <span class="rar">${esc(RARITY[rar] || rar)}</span></div>
    <div class="body"><b>${esc(r.name)}</b>
      <div class="info"><span>${icon('clock')}${dt(r.at)}</span><span>${icon('flag')}Partida #${r.match}</span><span>${icon('chest')}${r.chestsSoFar} baús</span></div>
      <div class="conf"><span>Confiança</span><div class="bar"><i style="width:${pct(r.confidence)}"></i></div><span>${pct(r.confidence)}</span></div>
    </div></div>`;
}

// ---------- Visualizador com zoom ----------
function openViewer(id) {
  const r = S.rewards.find((x) => x.id === id);
  if (!r) return;
  const v = $('#viewer');
  const rar = r.rarity || 'desconhecida';
  v.innerHTML = `<div class="viewer-layout">
    <div class="wrapimg" id="vWrap">${r.imageUrl ? `<img id="vImg" src="${esc(r.imageUrl)}" alt="">` : '<div class="empty-state">Sem captura</div>'}
      <div class="zoomctl"><button class="btn sm icon ghost" id="vOut">${icon('zoomOut')}</button><span id="vZ">100%</span><button class="btn sm icon ghost" id="vIn">${icon('zoomIn')}</button><button class="btn sm ghost" id="vFit">Ajustar</button></div></div>
    <div class="glass side r-${esc(rar)}">
      <div class="row"><span class="tag" style="color:var(--rc)">${esc(RARITY[rar] || rar)}</span>${r.confirmed ? `<span class="tag" style="color:var(--ok)">${icon('check')}Confirmada</span>` : `<span class="tag unconf">${icon('alert')}Não confirmada</span>`}<button class="btn sm icon ghost" style="margin-left:auto" id="vClose">${icon('x')}</button></div>
      <h2 style="margin:0;font-family:var(--serif);font-size:22px;letter-spacing:.04em">${esc(r.name)}</h2>
      <dl class="kv">
        <dt>Categoria</dt><dd>${esc(CATEGORY[r.category] || r.category)}</dd>
        <dt>Origem</dt><dd>${esc(SCOPE[r.scope] || r.scope)}</dd>
        <dt>Encontrado por</dt><dd>${esc(r.finder || (r.scope === 'propria' ? 'Você' : 'Não identificado'))}</dd>
        <dt>Data e hora</dt><dd>${dt(r.at)}</dd>
        <dt>Partida</dt><dd>#${r.match}</dd>
        <dt>Baús até então</dt><dd>${r.chestsSoFar}</dd>
        <dt>Confiança</dt><dd>${pct(r.confidence)}</dd>
        <dt>Cor detectada</dt><dd>${esc(RARITY[r.colorRarity] || '—')}</dd>
        <dt>Registro</dt><dd>${r.source === 'manual' ? 'Manual' : 'Automático'}</dd>
        <dt>Resolução</dt><dd>${r.width ? `${r.width}×${r.height}` : '—'}</dd>
      </dl>
      <div class="field"><label>Corrigir nome / raridade</label>
        <input class="input" id="vName" value="${esc(r.name)}" maxlength="60">
        <div class="row"><select class="input" id="vRar">${Object.entries(RARITY).map(([k, n]) => `<option value="${k}" ${k === rar ? 'selected' : ''}>${n}</option>`).join('')}</select><button class="btn" id="vSave">${icon('edit')}Salvar</button></div>
      </div>
      <div class="row" style="margin-top:auto"><button class="btn gold" id="vExp" style="flex:1">${icon('download')}<span>Exportar PNG</span></button><button class="btn danger icon" id="vDel" title="Excluir">${icon('trash')}</button></div>
    </div></div>`;
  v.classList.add('open');
  $('#vClose').onclick = () => v.classList.remove('open');
  v.onpointerdown = (e) => { if (e.target === v) v.classList.remove('open'); };
  $('#vExp').onclick = async () => { try { const p = await call('ExportReward', r.id); if (p) toast('ok', 'Captura exportada', p); } catch (e) { errToast(e, 'Exportar'); } };
  $('#vDel').onclick = () => confirmDelete([r.id]);
  $('#vSave').onclick = async () => {
    try { await call('UpdateReward', r.id, $('#vName').value, $('#vRar').value, ''); await refreshRewards(); toast('ok', 'Registro atualizado'); v.classList.remove('open'); } catch (e) { errToast(e); }
  };
  const img = $('#vImg');
  if (img) zoomPan($('#vWrap'), img);
}

function zoomPan(wrap, img) {
  let z = 1, fit = 1, x = 0, y = 0, drag = null;
  const apply = () => { img.style.transform = `translate(calc(-50% + ${x}px), calc(-50% + ${y}px)) scale(${z})`; $('#vZ').textContent = `${Math.round((z / fit) * 100)}%`; };
  const doFit = () => { fit = Math.min(wrap.clientWidth / img.naturalWidth, wrap.clientHeight / img.naturalHeight); z = fit; x = y = 0; apply(); };
  img.complete ? doFit() : (img.onload = doFit);
  const zoomBy = (f) => { z = Math.min(fit * 8, Math.max(fit * 0.5, z * f)); apply(); };
  wrap.onwheel = (e) => { e.preventDefault(); zoomBy(e.deltaY < 0 ? 1.15 : 1 / 1.15); };
  wrap.onpointerdown = (e) => { if (e.target.closest('.zoomctl')) return; drag = { sx: e.clientX - x, sy: e.clientY - y }; wrap.classList.add('drag'); wrap.setPointerCapture(e.pointerId); };
  wrap.onpointermove = (e) => { if (!drag) return; x = e.clientX - drag.sx; y = e.clientY - drag.sy; apply(); };
  wrap.onpointerup = () => { drag = null; wrap.classList.remove('drag'); };
  wrap.ondblclick = () => (Math.abs(z - fit) < 0.01 ? zoomBy(2.5) : doFit());
  $('#vIn').onclick = () => zoomBy(1.3);
  $('#vOut').onclick = () => zoomBy(1 / 1.3);
  $('#vFit').onclick = doFit;
}

function confirmDelete(ids) {
  if (!ids.length) return;
  const m = $('#modal'), sh = $('#modalSheet');
  sh.innerHTML = `<h2>Excluir ${ids.length > 1 ? `${ids.length} capturas` : 'captura'}?</h2><p class="muted">A imagem original e o registro serão apagados do computador. As estatísticas acumuladas não mudam.</p>
    <div class="row mt" style="justify-content:flex-end"><button class="btn ghost" id="dNo">Cancelar</button><button class="btn danger" id="dYes">${icon('trash')}<span>Excluir</span></button></div>`;
  m.classList.add('open');
  $('#dNo').onclick = () => m.classList.remove('open');
  $('#dYes').onclick = async () => {
    for (const id of ids) { try { await call('DeleteReward', id); } catch (e) { errToast(e); } }
    m.classList.remove('open');
    $('#viewer').classList.remove('open');
    F.picked.clear();
    await refreshRewards();
    toast('ok', ids.length > 1 ? 'Capturas excluídas' : 'Captura excluída');
  };
}
