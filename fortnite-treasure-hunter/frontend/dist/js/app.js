import { mountIcons, icon, crest } from './icons.js';
import { call, on, win } from './api.js';
import { toast, errToast, installRipple, playSound, legendary } from './fx.js';
import { S, $, $$, esc, nf, nf1, dur, durHuman, tm, RARITY, refreshRewards, refreshTemplates, patchSettings } from './core.js';
import * as tesouros from './view-tesouros.js';
import * as visao from './view-visao.js';
import * as video from './view-video.js';
import * as parada from './view-parada.js';
import * as desempenho from './view-desempenho.js';
import * as config from './view-config.js';
import * as diagnostico from './view-diagnostico.js';

const VIEWS = {
  painel: { label: 'Início', icon: 'compass' },
  visao: { label: 'Ensinar o app', icon: 'scan', mod: visao },
  tesouros: { label: 'Meus tesouros', icon: 'chest', mod: tesouros },
  video: { label: 'Vídeo', icon: 'monitor', mod: video },
  parada: { label: 'Condições de parada', icon: 'flag', mod: parada },
  desempenho: { label: 'Desempenho', icon: 'gauge', mod: desempenho },
  config: { label: 'Configurações', icon: 'gear', mod: config },
  diagnostico: { label: 'Diagnóstico', icon: 'pulse', mod: diagnostico },
};

const STATE_HELP = {
  inativo: 'Clique em Iniciar quando for jogar. O app observa a tela e anota tudo sozinho.',
  aguardando_fortnite: 'Abra o Fortnite. O acompanhamento começa assim que o jogo aparecer.',
  desconhecido: 'Ainda não reconheci esta tela. Se continuar assim, ensine-a em "Ensinar o app".',
  lobby: 'Você está no lobby. Entre na partida quando quiser.',
  modo_incorreto: 'Escolha Battle Royale Sem Construção — Squad no lobby.',
  fila: 'Procurando partida…',
  carregando: 'Carregando a partida…',
  em_partida: 'Partida em andamento. Abra baús à vontade: os tesouros que aparecerem serão fotografados.',
  espectando: 'Você caiu, mas o Squad continua vivo. A partida segue contando.',
  squad_eliminado: 'Fim da partida. Volte ao lobby para a próxima.',
  vitoria: 'Vitória Royale! Volte ao lobby para a próxima.',
  erro: 'Apareceu um erro ou desconexão no jogo.',
};

const REQUIRED = ['lobby', 'partida', 'squad_eliminado'];

function renderSteps(d) {
  const el = $('#steps');
  if (!el) return;
  let hidden = false;
  try { hidden = !!localStorage.getItem('stepsHidden'); } catch { /* sem armazenamento */ }
  const cal = d.calibrated || {};
  const taught = REQUIRED.filter((t) => cal[t]).length;
  const steps = [
    { done: d.gameRunning, t: 'Abra o Fortnite', d: 'De preferência em "Janela sem bordas" (Configurações de vídeo do jogo).', btn: d.gameRunning ? '' : `<button class="btn sm" data-act="launch">${icon('external')}Abrir Fortnite</button>` },
    { done: taught === REQUIRED.length, t: `Ensine 3 telas ao app (${taught}/3)`, d: 'Lobby, partida e fim de partida. Leva 2 minutos e só precisa ser feito uma vez.', btn: `<button class="btn sm" data-act="teach">${icon('scan')}Ensinar agora</button>` },
    { done: d.op === 'executando', t: 'Clique em Iniciar e jogue', d: 'Pode minimizar o app. Ele avisa quando achar o seu tesouro.', btn: d.op === 'executando' ? '' : `<button class="btn sm gold" data-act="start">${icon('play')}Iniciar</button>` },
  ];
  const doneN = steps.filter((s) => s.done).length;
  if (hidden || doneN === steps.length) { el.classList.add('hidden'); return; }
  el.classList.remove('hidden');
  const next = steps.findIndex((s) => !s.done);
  const html = `<div class="top"><div><h2>Primeiros passos</h2><p>Siga na ordem. Depois disso é só jogar.</p></div>
      <div class="prog">${doneN} de 3<div class="bar"><i style="width:${(doneN / 3) * 100}%"></i></div>
      <button class="btn sm ghost icon" data-act="hide" title="Ocultar">${icon('x')}</button></div></div>
    <div class="step-list">${steps.map((s, i) => `<div class="step ${s.done ? 'done' : i === next ? 'next' : ''}"><span class="n">${s.done ? '✓' : i + 1}</span><b>${s.t}</b><span class="d">${s.d}</span>${s.done ? '' : s.btn}</div>`).join('')}</div>`;
  if (el.dataset.html === html) return;
  el.dataset.html = html;
  el.innerHTML = html;
  el.onclick = (e) => {
    const b = e.target.closest('[data-act]');
    if (!b) return;
    const act = b.dataset.act;
    if (act === 'launch') call('LaunchFortnite').then(() => toast('ok', 'Pedido enviado ao Epic Games Launcher')).catch((er) => errToast(er, 'Abrir Fortnite'));
    if (act === 'teach') go('visao');
    if (act === 'start') call('StartOperation').catch((er) => errToast(er, 'Não foi possível iniciar'));
    if (act === 'hide') { try { localStorage.setItem('stepsHidden', '1'); } catch { /* sem armazenamento */ } el.classList.add('hidden'); }
  };
}

const STATES_ICON = {
  inativo: 'power', aguardando_fortnite: 'hourglass', desconhecido: 'eye', lobby: 'anchor', modo_incorreto: 'alert', fila: 'search',
  carregando: 'hourglass', em_partida: 'compass', espectando: 'users', squad_eliminado: 'skull', vitoria: 'crown', erro: 'alert',
};

// ---------- Inicialização ----------
async function init() {
  mountIcons();
  installRipple();
  $('#tbBrand').innerHTML = `${crest}<b>TREASURE HUNTER</b>`;
  $('#crest').innerHTML = `${crest}<div class="name">Treasure<br>Hunter<small>Caça ao tesouro</small></div>`;
  $('#wTray').innerHTML = icon('tray');
  $('#wMin').innerHTML = icon('minus');
  $('#wMax').innerHTML = icon('maximize');
  $('#wClose').innerHTML = icon('x');
  $('#wTray').onclick = () => call('HideToTray');
  $('#wMin').onclick = () => win.minimise();
  $('#wMax').onclick = () => win.toggleMax();
  $('#wClose').onclick = () => call('CloseRequested');
  $('#modeChip').innerHTML = `${icon('shield')}<div><b>Modo acompanhamento</b>O app só observa a tela. Nenhum comando é enviado ao jogo.</div>`;
  $('#btnEmergency').innerHTML = `<span class="lbl">${icon('power')}<span>Parada de emergência</span></span>`;
  $('#btnEmergency').onclick = () => call('EmergencyStop').catch(errToast);

  for (const a of $$('#nav a')) {
    const v = VIEWS[a.dataset.view];
    a.innerHTML = `${icon(v.icon)}<span>${v.label}</span>`;
    a.onclick = () => go(a.dataset.view);
  }
  $('#navMore').innerHTML = `${icon('gear')}<span>Mais opções</span><svg class="chev"><use href="#i-chevron"/></svg>`;
  $('#navMore').onclick = () => toggleAdv();

  try {
    S.snap = await call('GetSnapshot');
  } catch (e) {
    document.body.insertAdjacentHTML('beforeend', `<div class="modal open"><div class="sheet glass"><h2>Backend indisponível</h2><p class="muted">${esc(e.message)}</p></div></div>`);
    return;
  }
  S.settings = S.snap.settings;
  S.live = S.snap.live;
  S.activity = S.snap.activity || [];
  S.templates = S.snap.templates || [];
  document.documentElement.classList.toggle('translucent', !!S.snap.translucent);
  applyLite();
  $('#btnEmergency').insertAdjacentHTML('beforeend', `<kbd>${esc(S.settings.hotkeys.emergency || '')}</kbd>`);

  try { if (localStorage.getItem('navAdv')) toggleAdv(true); } catch { /* sem armazenamento */ }
  window.__go = go;
  renderPainel();
  for (const [id, v] of Object.entries(VIEWS)) v.mod?.render($(`#v-${id}`));
  await refreshRewards();
  go('painel');
  updateLive(S.live);

  on('fth:update', (d) => { S.live = d; updateLive(d); });
  on('fth:activity', (a) => { S.activity.unshift(a); if (S.activity.length > 200) S.activity.pop(); renderTimeline(true); });
  on('fth:reward', async () => { await refreshRewards(); });
  on('fth:alert', onAlert);
  on('fth:manualPending', (p) => manualRewardModal(p));
  if (S.snap.pending) manualRewardModal(S.snap.pending);

  document.addEventListener('visibilitychange', () => {
    const hidden = document.hidden;
    document.documentElement.classList.toggle('paused', hidden);
    call('SetVisible', !hidden).catch(() => {});
  });
  document.addEventListener('settings', applyLite);
  setInterval(tickClock, 1000);
}

function applyLite() {
  document.documentElement.classList.toggle('lite', !!S.settings?.reduceEffects);
}

function toggleAdv(force) {
  const open = force ?? !$('#navAdv').classList.contains('open');
  $('#navAdv').classList.toggle('open', open);
  $('#navMore').classList.toggle('open', open);
  try { localStorage.setItem('navAdv', open ? '1' : ''); } catch { /* sem armazenamento */ }
  setTimeout(() => { const a = $(`#nav a[data-view="${S.view}"]`); if (a) moveInd(a); }, 320);
}

function moveInd(a) {
  const ind = $('#navInd');
  const hidden = a.closest('.nav-adv') && !$('#navAdv').classList.contains('open');
  ind.style.opacity = hidden ? 0 : 1;
  ind.style.transform = `translateY(${a.offsetTop}px)`;
}

function go(view) {
  if ($(`#navAdv a[data-view="${view}"]`) && !$('#navAdv').classList.contains('open')) toggleAdv(true);
  S.view = view;
  for (const a of $$('#nav a')) a.classList.toggle('active', a.dataset.view === view);
  for (const s of $$('.view')) s.classList.toggle('active', s.id === `v-${view}`);
  const a = $(`#nav a[data-view="${view}"]`);
  moveInd(a);
  $('#crumb').textContent = VIEWS[view].label;
  VIEWS[view].mod?.show?.();
}

// ---------- Painel ----------
function statTile(id, label, ico, foot = '') {
  return `<div class="glass stat" id="st-${id}"><div class="top"><span class="label">${label}</span><span class="ico">${icon(ico)}</span></div><div class="value">0</div><div class="foot">${foot}</div></div>`;
}

function renderPainel() {
  const el = $('#v-painel');
  const objs = S.snap.objectives;
  const objIcons = { token_pirata: 'coin', skin_dourada: 'gold', elemental: 'flame', raro: 'gem', baus: 'chest' };
  el.innerHTML = `
    <div class="head">
      <div><h1>Início</h1><p>Você joga, o Treasure Hunter observa: conta partidas e baús e guarda uma foto de cada tesouro encontrado.</p></div>
      <div class="actions"><span class="pill" id="pGame"><span class="dot"></span><span>Fortnite</span></span></div>
    </div>
    <div class="grid g-hero">
      <div class="glass op-card" id="opCard">
        <svg class="bgmark" viewBox="0 0 24 24"><use href="#i-compass"/></svg>
        <div class="orb">
          <svg viewBox="0 0 176 176">
            <circle class="ring-track" cx="88" cy="88" r="80" fill="none" stroke-width="6"/>
            <circle class="ring-prog" id="ringProg" cx="88" cy="88" r="80" fill="none" stroke-width="6" stroke-dasharray="502.65" stroke-dashoffset="502.65" transform="rotate(-90 88 88)"/>
            <g class="orbit"><circle cx="88" cy="8" r="5" fill="#fff3cf"/><circle cx="88" cy="8" r="11" fill="#f6cf74" opacity=".25"/></g>
          </svg>
          <div class="core"><div><svg id="stIcon"><use href="#i-power"/></svg><small id="stMatch">—</small></div></div>
        </div>
        <div class="op-info">
          <div class="eyebrow" id="opLabel">Operação parada</div>
          <div class="state" id="stLabel">Inativo</div>
          <div class="state-help" id="stHelp"></div>
          <div class="sub hidden">
            <span>${icon('monitor')}<span id="stRegion">Área de captura: —</span></span>
            <span>${icon('clock')}<span id="stSince">—</span></span>
          </div>
          <div class="timer"><span id="opTimer">00:00:00</span><small>tempo de operação</small></div>
          <div class="op-controls">
            <button class="btn gold lg" id="bStart">${icon('play')}<span>Iniciar</span></button>
            <button class="btn lg" id="bPause">${icon('pause')}<span>Pausar</span></button>
            <button class="btn lg danger" id="bStop">${icon('stop')}<span>Encerrar</span></button>
            <button class="btn lg ghost" id="bLaunch" title="Abrir o Fortnite pelo Epic Games Launcher">${icon('external')}<span>Abrir Fortnite</span></button>
          </div>
          <div class="objective"><span class="lbl">Objetivo</span>
            ${Object.entries(objs).map(([k, v]) => `<button class="chip" data-obj="${k}">${icon(objIcons[k] || 'target')}${esc(v)}</button>`).join('')}
          </div>
        </div>
      </div>
      <div class="glass last-card">
        <h3>${icon('sparkle')}Última recompensa</h3>
        <div class="thumb" id="lastThumb"><div class="empty">${icon('chest')}<div>Nenhuma recompensa confirmada ainda</div></div></div>
        <div class="meta" id="lastMeta"></div>
      </div>
    </div>

    <div class="grid g-stats mt">
      ${statTile('mStart', 'Partidas', 'flag')}
      ${statTile('chests', 'Baús abertos', 'chest')}
      ${statTile('tokens', 'Tokens da Loja Pirata', 'coin')}
      ${statTile('time', 'Tempo jogando', 'hourglass')}
    </div>
    <div class="grid g-stats mt extra-stats" id="extraStats">
      ${statTile('mDone', 'Partidas concluídas', 'trophy')}
      ${statTile('avg', 'Média de baús/partida', 'scale')}
      ${statTile('rare', 'Itens raros', 'gem')}
      ${statTile('special', 'Skins douradas · Elementais', 'gold')}
    </div>
    <div class="more-toggle"><button class="btn sm ghost" id="bMoreStats">${icon('plus')}<span>Ver mais números</span></button></div>

    <div class="grid g-bottom mt">
      <div class="glass card">
        <h3>${icon('book')}Histórico de atividades<span class="right" id="tlCount"></span></h3>
        <div class="timeline" id="timeline"></div>
      </div>
      <div class="stack">
        <div class="glass card">
          <h3>${icon('hand')}O app não viu? Registre você</h3>
          <p class="muted" style="margin:-4px 0 14px;font-size:12.5px">Use os botões ou os atalhos sem sair do jogo.</p>
          <div class="row wrap">
            <button class="btn" id="bChest">${icon('plus')}<span>Baú aberto</span><kbd id="kChest"></kbd></button>
            <button class="btn" id="bReward">${icon('camera')}<span>Registrar recompensa</span><kbd id="kReward"></kbd></button>
          </div>
        </div>
        <div class="glass card">
          <h3>${icon('cpu')}Consumo do aplicativo<span class="right">CPU · GPU · RAM</span></h3>
          <div class="meters">
            <div class="meter"><div class="k">CPU</div><div class="v mono" id="uCpu">—</div></div>
            <div class="meter"><div class="k">GPU</div><div class="v mono" id="uGpu">—</div></div>
            <div class="meter"><div class="k">RAM</div><div class="v mono" id="uRam">—</div></div>
          </div>
          <div class="row mt" style="font-size:12px;color:var(--text-3);gap:16px"><span>Análise: <b class="mono" id="uAn">—</b></span><span>Frequência: <b class="mono" id="uFps">—</b></span></div>
        </div>
      </div>
    </div>`;

  $('#bMoreStats').onclick = () => {
    const open = $('#extraStats').classList.toggle('open');
    $('#bMoreStats').querySelector('span').textContent = open ? 'Mostrar menos' : 'Ver mais números';
  };
  $('#bStart').onclick = async () => { try { await call('StartOperation'); } catch (e) { errToast(e, 'Não foi possível iniciar'); } };
  $('#bPause').onclick = () => (S.live?.op === 'pausado' ? call('ResumeOperation') : call('PauseOperation'));
  $('#bStop').onclick = () => call('StopOperation');
  $('#bLaunch').onclick = () => call('LaunchFortnite').then(() => toast('ok', 'Pedido enviado ao Epic Games Launcher')).catch((e) => errToast(e, 'Abrir Fortnite'));
  $('#bChest').onclick = () => call('RegisterManualChest').then(() => toast('ok', 'Baú registrado')).catch((e) => errToast(e));
  $('#bReward').onclick = () => call('CaptureForManualReward').then(manualRewardModal).catch((e) => errToast(e, 'Captura'));
  for (const c of $$('[data-obj]', el)) c.onclick = () => { patchSettings({ objective: c.dataset.obj }, { quiet: true }); markObjective(c.dataset.obj); };
  markObjective(S.settings.objective);
  setHotkeyLabels();
  document.addEventListener('settings', () => { markObjective(S.settings.objective); setHotkeyLabels(); });
  renderTimeline();
}

function setHotkeyLabels() {
  $('#kChest').textContent = S.settings.hotkeys.chest || '';
  $('#kReward').textContent = S.settings.hotkeys.reward || '';
}

function markObjective(o) {
  for (const c of $$('[data-obj]')) c.classList.toggle('on', c.dataset.obj === o);
  for (const id of ['tokens', 'rare', 'special', 'chests']) $(`#st-${id}`)?.classList.remove('hl');
  const map = { token_pirata: 'tokens', raro: 'rare', skin_dourada: 'special', elemental: 'special', baus: 'chests' };
  $(`#st-${map[o]}`)?.classList.add('hl');
}

function setStat(id, value, foot) {
  const t = $(`#st-${id}`);
  if (!t) return;
  const v = t.querySelector('.value');
  if (v.textContent !== String(value)) {
    v.textContent = value;
    v.classList.remove('bump'); void v.offsetWidth; v.classList.add('bump');
  }
  if (foot !== undefined) t.querySelector('.foot').textContent = foot;
}

let lastOp = null;
function updateLive(d) {
  if (!d) return;
  const opTxt = { executando: 'Monitorando', pausado: 'Pausado', parado: 'Parado' }[d.op];
  const tb = $('#tbStatus');
  tb.className = `pill ${d.op === 'executando' ? 'ok live' : d.op === 'pausado' ? 'warn' : ''}`;
  tb.lastElementChild.textContent = opTxt;
  const pg = $('#pGame');
  pg.className = `pill ${d.gameRunning ? 'ok' : 'err'}`;
  pg.lastElementChild.textContent = d.gameRunning ? (d.gameWindow?.minimized ? 'Fortnite minimizado' : 'Fortnite aberto') : 'Fortnite fechado';

  $('#opCard').classList.toggle('op-running', d.op === 'executando');
  $('#opLabel').textContent = d.op === 'executando' ? 'Monitorando a tela' : d.op === 'pausado' ? 'Operação pausada' : (d.stopMsg ? `Parado — ${d.stopMsg}` : 'Operação parada');
  $('#stLabel').textContent = d.stateLabel || '—';
  $('#stIcon').innerHTML = `<use href="#i-${STATES_ICON[d.state] || 'eye'}"/>`;
  $('#stMatch').textContent = d.matchSeq ? `Partida #${d.matchSeq}` : 'Sem partida';
  $('#stRegion').textContent = d.region?.w ? `Captura: ${d.region.w}×${d.region.h} · ${d.region.source}` : 'Área de captura: —';
  $('#bStart').disabled = d.op === 'executando';
  $('#bStart').querySelector('span').textContent = d.op === 'pausado' ? 'Retomar' : 'Iniciar';
  $('#bPause').disabled = d.op === 'parado';
  $('#bPause').querySelector('span').textContent = d.op === 'pausado' ? 'Retomar' : 'Pausar';
  $('#bStop').disabled = d.op === 'parado';
  $('#bLaunch').classList.toggle('hidden', d.gameRunning);

  const s = d.session, t = d.total;
  const scope = d.op === 'parado' && !s.matchesStarted && !s.chests ? t : s;
  const scopeName = scope === t ? 'total' : 'nesta sessão';
  setStat('mStart', nf.format(scope.matchesStarted), `${nf.format(t.matchesStarted)} no total`);
  setStat('mDone', nf.format(scope.matchesCompleted), `${nf.format(scope.victories)} vitória(s) · ${nf.format(scope.matchesInterrupted)} interrompida(s)`);
  setStat('chests', nf.format(scope.chests), scope.chestsUnconfirmed ? `+${nf.format(scope.chestsUnconfirmed)} não confirmado(s) · ${nf.format(scope.chestsManual)} manual` : `${nf.format(scope.chestsManual)} registrado(s) manualmente`);
  setStat('avg', nf1.format(scope.avgChests || 0), `baús confirmados ${scopeName}`);
  setStat('rare', nf.format(scope.rareItems), scope.rareUnconfirmed ? `+${nf.format(scope.rareUnconfirmed)} não confirmado(s) · ${nf.format(scope.squadRewards)} do Squad` : `${nf.format(scope.squadRewards)} anunciado(s) pelo Squad`);
  setStat('tokens', nf.format(scope.tokens), `${nf.format(t.tokens)} no total`);
  setStat('time', durHuman(d.totalSeconds), `sessão atual: ${dur(d.elapsed)}`);
  setStat('special', `${nf.format(scope.goldSkins)} · ${nf.format(scope.elementals)}`, 'skins douradas · itens elementais');

  // Anel: progresso da condição de parada por tempo/baús/partidas, senão minuto corrente.
  const st = S.settings?.stop || {};
  let prog = (d.elapsed % 60) / 60;
  if (!st.continuous) {
    if (st.timeLimitMin) prog = d.elapsed / (st.timeLimitMin * 60);
    else if (st.chestLimit) prog = s.chests / st.chestLimit;
    else if (st.matchLimit) prog = (s.matchesCompleted + s.matchesInterrupted) / st.matchLimit;
  }
  $('#ringProg').style.strokeDashoffset = 502.65 * (1 - Math.min(1, Math.max(0, prog)));

  const u = d.usage || {};
  if ($('#uCpu')) {
  $('#uCpu').innerHTML = `${nf1.format(u.cpu || 0)}<small>%</small>`;
  $('#uGpu').innerHTML = u.gpuAvailable ? `${nf1.format(u.gpu || 0)}<small>%</small>` : '<small>n/d</small>';
  $('#uRam').innerHTML = `${nf.format(Math.round(u.ramMb || 0))}<small>MB</small>`;
  $('#uAn').textContent = d.perf.frames ? `${nf1.format(d.perf.analyzeMs)} ms` : '—';
  $('#uFps').textContent = `${nf1.format(d.perf.targetFps)} quadros/s`;
  }
  $('#stHelp').textContent = STATE_HELP[d.state] || '';
  renderSteps(d);

  renderLast(d.lastReward);
  for (const v of Object.values(VIEWS)) v.mod?.live?.(d);
  if (lastOp && lastOp !== d.op) {
    if (d.op === 'executando') toast('ok', 'Monitoramento ativo', 'Pode continuar usando o computador normalmente.');
  }
  lastOp = d.op;
  S.sinceBase = { at: Date.now(), since: d.stateSince, elapsed: d.elapsed, op: d.op };
  tickClock();
}

function tickClock() {
  const b = S.sinceBase;
  if (!b) return;
  const extra = b.op === 'executando' ? (Date.now() - b.at) / 1000 : 0;
  $('#opTimer').textContent = dur(b.elapsed + extra);
  const since = new Date(b.since);
  if (!isNaN(since) && since.getFullYear() > 2000) {
    $('#stSince').textContent = `neste estado há ${dur((Date.now() - since) / 1000)}`;
  }
}

let lastRewardId = null;
function renderLast(r) {
  if (!r) return;
  if (r.id === lastRewardId) return;
  lastRewardId = r.id;
  const thumb = r.thumb ? `/media/tesouros/${r.thumb}` : '';
  $('#lastThumb').innerHTML = thumb ? `<img src="${esc(thumb)}" alt="">` : `<div class="empty">${icon('image')}<div>Sem captura</div></div>`;
  const who = r.scope === 'squad' ? `<span class="tag squad">${icon('users')}${esc(r.finder || 'Squad')}</span>` : `<span class="tag own">${icon('user')}Própria conta</span>`;
  $('#lastMeta').innerHTML = `<div style="flex:1;min-width:0"><b>${esc(r.name)}</b><span class="faint" style="font-size:12px">${esc(RARITY[r.rarity] || r.rarity)} · Partida #${r.match} · ${tm(r.at)}</span></div>${who}`;
}

const LV_ICON = { ok: 'checkCircle', aviso: 'alert', erro: 'alert', ouro: 'sparkle', info: 'info' };
function renderTimeline(animateFirst = false) {
  const el = $('#timeline');
  if (!el) return;
  const items = S.activity.slice(0, 80);
  $('#tlCount').textContent = items.length ? `${items.length} recentes` : '';
  if (!items.length) {
    el.innerHTML = `<div class="empty-state">${icon('map')}Nenhuma atividade ainda. Calibre a visão e inicie o monitoramento.</div>`;
    return;
  }
  el.innerHTML = items.map((a, i) => `<div class="tl ${esc(a.level)} ${animateFirst && i === 0 ? 'enter' : ''}"><span class="d"></span><span class="t">${esc(a.text)}</span><span class="w">${tm(a.at)}</span></div>`).join('');
}

// ---------- Alertas ----------
function onAlert(a) {
  const st = S.settings || {};
  if (a.kind === 'legendary') {
    const r = a.reward;
    legendary({ title: a.title, message: a.message, image: r?.thumb ? `/media/tesouros/${r.thumb}` : '' }, st.reduceEffects);
    if (st.soundEnabled) playSound('legendary', st.soundVolume);
  } else if (a.kind === 'stop') {
    toast('gold', a.title, a.message, 9000);
    if (st.soundEnabled) playSound('stop', st.soundVolume);
  } else if (a.kind === 'emergency') {
    toast('err', a.title, a.message, 6000);
  }
}

// ---------- Recompensa manual ----------
function manualRewardModal(p) {
  if (!p) return;
  const m = $('#modal'), sh = $('#modalSheet');
  sh.innerHTML = `
    <h2>Registrar recompensa</h2>
    <p class="muted" style="margin:0 0 16px">A tela foi capturada às ${tm(p.at)}${p.match ? ` (partida #${p.match})` : ''}. Informe o que foi encontrado — o registro fica marcado como manual.</p>
    <img src="${esc(p.preview)}" style="width:100%;border-radius:12px;border:1px solid var(--line);margin-bottom:16px" alt="">
    <div class="grid g-2">
      <div class="field"><label>Item</label><input class="input" id="mrName" placeholder="Ex.: Token da Loja Pirata" maxlength="60"></div>
      <div class="field"><label>Categoria</label><select class="input" id="mrCat">
        <option value="token_pirata">Token da Loja Pirata</option><option value="skin_dourada">Skin dourada</option><option value="elemental">Item elemental</option><option value="raro">Outro item raro</option></select></div>
      <div class="field"><label>Raridade</label><select class="input" id="mrRar">${Object.entries(RARITY).map(([k, v]) => `<option value="${k}" ${k === 'lendario' ? 'selected' : ''}>${v}</option>`).join('')}</select></div>
      <div class="field"><label>Origem</label><select class="input" id="mrScope"><option value="propria">Recebido na minha conta</option><option value="squad">Anunciado pelo Squad</option></select></div>
      <div class="field" style="grid-column:1/-1"><label>Quem encontrou (opcional)</label><input class="input" id="mrFinder" maxlength="40" placeholder="Nome do integrante"></div>
    </div>
    <div class="row mt" style="justify-content:flex-end"><button class="btn ghost" id="mrCancel">Descartar</button><button class="btn gold" id="mrSave">${icon('check')}<span>Salvar nos Tesouros</span></button></div>`;
  m.classList.add('open');
  $('#mrName').focus();
  $('#mrCancel').onclick = () => { call('DiscardManualReward'); m.classList.remove('open'); };
  $('#mrSave').onclick = async () => {
    try {
      await call('SaveManualReward', { pendingId: p.id, name: $('#mrName').value, category: $('#mrCat').value, rarity: $('#mrRar').value, scope: $('#mrScope').value, finder: $('#mrFinder').value });
      m.classList.remove('open');
      toast('ok', 'Recompensa registrada');
    } catch (e) { errToast(e); }
  };
}

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') { $('#modal').classList.remove('open'); $('#viewer').classList.remove('open'); }
});
$('#modal').addEventListener('pointerdown', (e) => { if (e.target.id === 'modal') e.currentTarget.classList.remove('open'); });

init();
