// Estado compartilhado da interface e utilitários.
import { call } from './api.js';
import { toast, errToast } from './fx.js';

export const S = {
  snap: null,      // GetSnapshot
  live: null,      // LiveData (fth:update)
  settings: null,
  templates: [],
  rewards: [],
  activity: [],
  view: 'painel',
};

export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

export const nf = new Intl.NumberFormat('pt-BR');
export const nf1 = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
export const pct = (v) => `${Math.round((v || 0) * 100)}%`;

export function dur(sec) {
  sec = Math.max(0, Math.floor(sec || 0));
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}
export function durHuman(sec) {
  sec = Math.floor(sec || 0);
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60);
  if (h) return `${h} h ${m} min`;
  return `${m} min`;
}
export const dt = (iso) => {
  const d = new Date(iso);
  return isNaN(d) ? '' : d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' });
};
export const tm = (iso) => {
  const d = new Date(iso);
  return isNaN(d) ? '' : d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
};

export const RARITY = {
  comum: 'Comum', incomum: 'Incomum', raro: 'Raro', epico: 'Épico', lendario: 'Lendário', mitico: 'Mítico', exotico: 'Exótico', desconhecida: 'Não identificada',
};
export const CATEGORY = { token_pirata: 'Token da Loja Pirata', skin_dourada: 'Skin dourada', elemental: 'Item elemental', raro: 'Item raro' };
export const SCOPE = { propria: 'Própria conta', squad: 'Anunciado pelo Squad' };

// Salva as configurações (mescla parcial) e atualiza o estado local.
let saveTimer = null;
export function patchSettings(patch, { quiet = false, delay = 0 } = {}) {
  S.settings = deepMerge(structuredClone(S.settings), patch);
  clearTimeout(saveTimer);
  return new Promise((resolve) => {
    saveTimer = setTimeout(async () => {
      try {
        S.settings = await call('SaveSettings', S.settings);
        if (!quiet) toast('ok', 'Configurações salvas');
        document.dispatchEvent(new CustomEvent('settings'));
        resolve(true);
      } catch (e) {
        errToast(e, 'Não foi possível salvar');
        resolve(false);
      }
    }, delay);
  });
}

function deepMerge(a, b) {
  for (const [k, v] of Object.entries(b)) {
    if (v && typeof v === 'object' && !Array.isArray(v)) a[k] = deepMerge(a[k] || {}, v);
    else a[k] = v;
  }
  return a;
}

export function setRange(el) {
  const min = +el.min || 0, max = +el.max || 100;
  el.style.setProperty('--p', `${((el.value - min) / (max - min)) * 100}%`);
}

export function switchHTML(id, checked, extra = '') {
  return `<label class="switch"><input type="checkbox" id="${id}" ${checked ? 'checked' : ''} ${extra}><span></span></label>`;
}

export async function refreshRewards() {
  try { S.rewards = await call('ListRewards'); } catch { S.rewards = []; }
  document.dispatchEvent(new CustomEvent('rewards'));
}
export async function refreshTemplates() {
  try { S.templates = await call('ListTemplates') || []; } catch { S.templates = []; }
  document.dispatchEvent(new CustomEvent('templates'));
}
