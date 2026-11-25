// Efeitos: notificações internas, ondulação nos botões, som sintetizado e celebração lendária.
import { icon } from './icons.js';

const toastsEl = () => document.getElementById('toasts');

export function toast(kind, title, msg = '', ms = 4200) {
  const ico = { ok: 'checkCircle', err: 'alert', warn: 'alert', gold: 'sparkle', info: 'info' }[kind] || 'info';
  const el = document.createElement('div');
  el.className = `toast ${kind}`;
  el.innerHTML = `${icon(ico)}<div><b></b><span></span></div>`;
  el.querySelector('b').textContent = title;
  el.querySelector('span').textContent = msg;
  toastsEl().appendChild(el);
  setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), 400); }, ms);
}

export function errToast(e, title = 'Algo deu errado') {
  toast('err', title, String(e?.message || e || ''));
}

// Ondulação a partir do ponto do clique (microinteração).
export function installRipple() {
  document.addEventListener('pointerdown', (ev) => {
    const b = ev.target.closest('.btn, .chip, .emergency');
    if (!b || b.disabled) return;
    const r = b.getBoundingClientRect();
    const s = Math.max(r.width, r.height);
    const d = document.createElement('span');
    d.className = 'ripple';
    d.style.cssText = `width:${s}px;height:${s}px;left:${ev.clientX - r.left - s / 2}px;top:${ev.clientY - r.top - s / 2}px`;
    b.appendChild(d);
    setTimeout(() => d.remove(), 650);
  });
}

// ---------- Som (Web Audio, sem arquivos) ----------
let ctx;
function ac() {
  if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}
function tone(freq, start, dur, vol, type = 'sine') {
  const c = ac();
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = type;
  o.frequency.value = freq;
  g.gain.setValueAtTime(0, c.currentTime + start);
  g.gain.linearRampToValueAtTime(vol, c.currentTime + start + 0.02);
  g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + start + dur);
  o.connect(g).connect(c.destination);
  o.start(c.currentTime + start);
  o.stop(c.currentTime + start + dur + 0.05);
}
export function playSound(kind, volume = 0.6) {
  try {
    const v = 0.18 * volume;
    if (kind === 'legendary') {
      [523.25, 659.25, 783.99, 1046.5, 1318.5].forEach((f, i) => tone(f, i * 0.09, 1.2, v, 'triangle'));
      [2093, 2637, 3136].forEach((f, i) => tone(f, 0.5 + i * 0.07, 0.6, v * 0.35, 'sine'));
    } else if (kind === 'stop') {
      [880, 659.25, 880].forEach((f, i) => tone(f, i * 0.18, 0.35, v, 'square'));
    } else {
      tone(880, 0, 0.25, v * 0.7, 'sine');
      tone(1320, 0.08, 0.3, v * 0.5, 'sine');
    }
  } catch { /* áudio indisponível */ }
}

// ---------- Celebração lendária ----------
let running = false;
export function legendary({ title, message, image }, lite = false) {
  const el = document.getElementById('legend');
  el.querySelector('h2').textContent = title || 'Tesouro lendário';
  el.querySelector('p').textContent = message || '';
  const seal = el.querySelector('.seal');
  seal.style.backgroundImage = image ? `url("${image}")` : '';
  seal.classList.toggle('hidden', !image);
  el.classList.remove('show');
  void el.offsetWidth;
  el.classList.add('show');
  const close = () => el.classList.remove('show');
  el.onclick = close;
  setTimeout(close, 4700);
  if (!lite && !running) coins(el.querySelector('canvas'));
}

function coins(cv) {
  running = true;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const W = cv.clientWidth, H = cv.clientHeight;
  cv.width = W * dpr; cv.height = H * dpr;
  const g = cv.getContext('2d');
  g.scale(dpr, dpr);
  const parts = Array.from({ length: 90 }, () => ({
    x: W / 2 + (Math.random() - 0.5) * 120, y: H / 2 + (Math.random() - 0.5) * 60,
    vx: (Math.random() - 0.5) * 14, vy: -Math.random() * 15 - 4,
    r: 4 + Math.random() * 7, rot: Math.random() * Math.PI, vr: (Math.random() - 0.5) * 0.3,
    spark: Math.random() < 0.35,
  }));
  const t0 = performance.now();
  const frame = (t) => {
    const el = t - t0;
    g.clearRect(0, 0, W, H);
    for (const p of parts) {
      p.vy += 0.42; p.vx *= 0.992; p.x += p.vx; p.y += p.vy; p.rot += p.vr;
      g.save();
      g.translate(p.x, p.y);
      g.globalAlpha = Math.max(0, 1 - el / 4200);
      if (p.spark) {
        g.fillStyle = '#fff3cf';
        g.beginPath();
        for (let i = 0; i < 4; i++) { g.rotate(Math.PI / 2); g.lineTo(0, p.r * 1.2); g.lineTo(p.r * 0.25, p.r * 0.25); }
        g.fill();
      } else {
        g.scale(Math.abs(Math.cos(p.rot)) + 0.15, 1);
        const gr = g.createLinearGradient(-p.r, -p.r, p.r, p.r);
        gr.addColorStop(0, '#fff3cf'); gr.addColorStop(0.45, '#f6cf74'); gr.addColorStop(1, '#a8701f');
        g.fillStyle = gr;
        g.beginPath(); g.arc(0, 0, p.r, 0, Math.PI * 2); g.fill();
        g.strokeStyle = 'rgba(90,58,14,.6)'; g.lineWidth = 1; g.stroke();
      }
      g.restore();
    }
    if (el < 4300) requestAnimationFrame(frame);
    else { g.clearRect(0, 0, W, H); running = false; }
  };
  requestAnimationFrame(frame);
}

// Pequeno gráfico de linha para os medidores (desenha só quando há dado novo).
export function sparkline(canvas, values, max, color = '#f6cf74') {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const w = canvas.clientWidth, h = canvas.clientHeight;
  if (!w || !h) return;
  if (canvas.width !== w * dpr) { canvas.width = w * dpr; canvas.height = h * dpr; }
  const g = canvas.getContext('2d');
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.clearRect(0, 0, w, h);
  if (values.length < 2) return;
  const m = Math.max(max, ...values, 1e-6);
  const step = w / (values.length - 1);
  g.beginPath();
  values.forEach((v, i) => { const x = i * step, y = h - 2 - (v / m) * (h - 4); i ? g.lineTo(x, y) : g.moveTo(x, y); });
  g.strokeStyle = color; g.lineWidth = 1.6; g.lineJoin = 'round'; g.stroke();
  g.lineTo(w, h); g.lineTo(0, h); g.closePath();
  const gr = g.createLinearGradient(0, 0, 0, h);
  gr.addColorStop(0, color + '55'); gr.addColorStop(1, color + '00');
  g.fillStyle = gr; g.fill();
}
