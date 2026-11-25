import { icon } from './icons.js';
import { call } from './api.js';
import { errToast } from './fx.js';
import { $, esc } from './core.js';

let root, timer;
const STATES = [['aguardando_fortnite', 'Aguardando'], ['desconhecido', 'Não identificada'], ['lobby', 'Lobby'], ['modo_incorreto', 'Modo incorreto'], ['fila', 'Fila'], ['carregando', 'Carregando'], ['em_partida', 'Em partida'], ['espectando', 'Espectando'], ['squad_eliminado', 'Squad eliminado'], ['vitoria', 'Vitória'], ['erro', 'Erro']];

export function render(el) {
  root = el;
  el.innerHTML = `
    <div class="head"><div><h1>Diagnóstico</h1><p>Máquina de estados, informações do sistema e o log técnico usado para investigar falhas.</p></div>
      <div class="actions"><button class="btn" id="dgOpen">${icon('folder')}<span>Abrir pasta de logs</span></button><button class="btn" id="dgRefresh">${icon('refresh')}</button></div></div>
    <div class="glass card"><h3>${icon('map')}Máquina de estados<span class="right" id="dgMatch"></span></h3><div class="states" id="dgStates">${STATES.map(([k, v]) => `<span data-s="${k}">${v}</span>`).join('')}</div>
      <p class="faint" style="font-size:12px;margin:12px 0 0">Uma tela só muda de estado depois de confirmada em quadros consecutivos. Se ficar presa (carregamento longo, HUD ausente ou tela inesperada), o vigia reavalia a tela e registra um aviso. Eliminação individual com o Squad vivo mantém a partida ativa.</p></div>
    <div class="grid g-2 mt">
      <div class="glass card"><h3>${icon('info')}Sistema</h3><dl class="kv" id="dgSys"></dl></div>
      <div class="glass card"><h3>${icon('shield')}Proteções</h3><ul class="muted" style="margin:0;padding-left:18px;line-height:1.8;font-size:12.5px">
        <li>Partidas contadas uma única vez por número de partida.</li><li>Baús com intervalo mínimo entre contagens e detecção por borda.</li>
        <li>Recompensas deduplicadas por partida, item, origem e integrante durante a exibição da notificação.</li>
        <li>Quadros idênticos reaproveitam o resultado anterior.</li><li>Falhas internas reiniciam o laço de monitoramento automaticamente.</li>
        <li>Arquivos corrompidos são preservados com a extensão .corrompido e recriados.</li></ul></div>
    </div>
    <div class="glass card mt"><h3>${icon('book')}Log de diagnóstico</h3><div class="log" id="dgLog"></div></div>`;
  $('#dgOpen', el).onclick = () => call('OpenLogsFolder').catch(errToast);
  $('#dgRefresh', el).onclick = load;
}

export function show() { load(); clearInterval(timer); timer = setInterval(() => { if (document.querySelector('#v-diagnostico.active')) load(); else clearInterval(timer); }, 4000); }

export function live(d) {
  if (!root) return;
  root.querySelectorAll('[data-s]').forEach((s) => s.classList.toggle('on', s.dataset.s === d.state));
  $('#dgMatch', root).textContent = d.matchSeq ? `Partida #${d.matchSeq} ${d.matchActive ? '(ativa)' : '(encerrada)'}` : '';
}

async function load() {
  try {
    const g = await call('GetDiagnostics');
    $('#dgSys', root).innerHTML = `<dt>Versão</dt><dd>${esc(g.version)}</dd><dt>Sistema</dt><dd>${esc(g.os)}${g.win11 ? ' · Windows 11' : ''}</dd><dt>Processadores lógicos</dt><dd>${g.cpus}</dd><dt>Vidro nativo</dt><dd>${g.glass ? 'Ativo' : 'Desativado'}</dd><dt>Dados</dt><dd class="mono" style="font-size:11.5px;word-break:break-all">${esc(g.dataDir)}</dd><dt>Log</dt><dd class="mono" style="font-size:11.5px;word-break:break-all">${esc(g.logPath)}</dd>`;
    const log = $('#dgLog', root);
    log.textContent = (g.log || []).join('\n') || 'Sem registros.';
    log.scrollTop = log.scrollHeight;
  } catch (e) { errToast(e, 'Diagnóstico'); }
}
