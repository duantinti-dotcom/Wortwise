// Conjunto de ícones próprio (traço 1.7, cantos arredondados), injetado como sprite SVG.
const P = {
  compass: '<circle cx="12" cy="12" r="9"/><path d="m15.5 8.5-2.2 4.8-4.8 2.2 2.2-4.8z"/><path d="M12 3v1.6M12 19.4V21M3 12h1.6M19.4 12H21"/>',
  chest: '<path d="M3.5 10.5h17v8a1.5 1.5 0 0 1-1.5 1.5H5a1.5 1.5 0 0 1-1.5-1.5z"/><path d="M3.5 10.5V9a5 5 0 0 1 5-5h7a5 5 0 0 1 5 5v1.5"/><path d="M10 10.5v3a2 2 0 0 0 4 0v-3"/><path d="M8 4.4v6.1M16 4.4v6.1"/>',
  coin: '<ellipse cx="12" cy="12" rx="8.5" ry="8.5"/><ellipse cx="12" cy="12" rx="5.5" ry="5.5"/><path d="M12 9.2v5.6M10.3 10.4h2.6a1.1 1.1 0 0 1 0 2.2h-1.8a1.1 1.1 0 0 0 0 2.2h2.6"/>',
  skull: '<path d="M12 3a7.5 7.5 0 0 0-7.5 7.5c0 2.6 1.3 4.6 3 5.8V19a1 1 0 0 0 1 1h7a1 1 0 0 0 1-1v-2.7c1.7-1.2 3-3.2 3-5.8A7.5 7.5 0 0 0 12 3z"/><circle cx="9.2" cy="11" r="1.6"/><circle cx="14.8" cy="11" r="1.6"/><path d="M10.5 20v-2M13.5 20v-2M11.3 14.6h1.4"/>',
  crown: '<path d="m3.5 8 4 3.5L12 5l4.5 6.5 4-3.5-1.8 10H5.3z"/><path d="M5.5 20.5h13"/>',
  gem: '<path d="M7 4h10l4 5-9 11L3 9z"/><path d="M3 9h18M9.5 4 8 9l4 11M14.5 4 16 9l-4 11"/>',
  flame: '<path d="M12 21c-3.6 0-6.5-2.6-6.5-6.2 0-3.3 2.4-5.1 3.6-7.8.4 1.6 1.3 2.6 2.4 3 .1-2.8 1.3-5.3 3.4-7 0 3.1 3.6 5.6 3.6 10.4 0 4.2-2.9 7.6-6.5 7.6z"/><path d="M12 21c-1.7 0-3-1.3-3-3 0-1.9 1.6-2.7 2.2-4.3.9 1.1 3.8 2 3.8 4.4 0 1.6-1.3 2.9-3 2.9z"/>',
  gold: '<path d="M4 18.5 7 12h10l3 6.5z"/><path d="M7.8 12 10 7h4l2.2 5"/><path d="M12 3v1.5M17.5 5.5l-1 1M6.5 5.5l1 1"/>',
  dashboard: '<rect x="3.5" y="3.5" width="7.5" height="9" rx="2"/><rect x="13" y="3.5" width="7.5" height="5" rx="2"/><rect x="13" y="10.5" width="7.5" height="10" rx="2"/><rect x="3.5" y="14.5" width="7.5" height="6" rx="2"/>',
  eye: '<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="3"/>',
  scan: '<path d="M4 8V6a2 2 0 0 1 2-2h2M16 4h2a2 2 0 0 1 2 2v2M20 16v2a2 2 0 0 1-2 2h-2M8 20H6a2 2 0 0 1-2-2v-2"/><path d="M7.5 12h9"/>',
  monitor: '<rect x="3" y="4" width="18" height="12.5" rx="2"/><path d="M8.5 20.5h7M12 16.5v4"/>',
  flag: '<path d="M5 21V4"/><path d="M5 4.5c4-2 7 2 11 0l2.5-1v10l-2.5 1c-4 2-7-2-11 0"/>',
  gauge: '<path d="M4.2 17.5a9 9 0 1 1 15.6 0"/><path d="m12 13.5 4-5"/><circle cx="12" cy="13.5" r="1.6"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M19.4 13.5a7.6 7.6 0 0 0 0-3l2-1.6-2-3.4-2.4.9a7.6 7.6 0 0 0-2.6-1.5L14 2.5h-4l-.4 2.4A7.6 7.6 0 0 0 7 6.4l-2.4-.9-2 3.4 2 1.6a7.6 7.6 0 0 0 0 3l-2 1.6 2 3.4 2.4-.9a7.6 7.6 0 0 0 2.6 1.5l.4 2.4h4l.4-2.4a7.6 7.6 0 0 0 2.6-1.5l2.4.9 2-3.4z"/>',
  pulse: '<path d="M3 12h4l2.5-6 4 12 2.5-6h5"/>',
  play: '<path d="M7 4.8v14.4a1 1 0 0 0 1.5.9l11.3-7.2a1 1 0 0 0 0-1.7L8.5 3.9A1 1 0 0 0 7 4.8z"/>',
  pause: '<rect x="6" y="4.5" width="4" height="15" rx="1.2"/><rect x="14" y="4.5" width="4" height="15" rx="1.2"/>',
  stop: '<rect x="5.5" y="5.5" width="13" height="13" rx="2.5"/>',
  alert: '<path d="M10.3 3.9 2.4 17.6A2 2 0 0 0 4.1 20.6h15.8a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/><path d="M12 9v4.5M12 17h.01"/>',
  power: '<path d="M12 3v8"/><path d="M6.4 6.6a8 8 0 1 0 11.2 0"/>',
  camera: '<path d="M4 8h3l1.6-2.5h6.8L17 8h3a1 1 0 0 1 1 1v9.5a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z"/><circle cx="12" cy="13.5" r="3.6"/>',
  image: '<rect x="3" y="4" width="18" height="16" rx="2.5"/><circle cx="9" cy="9.5" r="1.8"/><path d="m21 15.5-4.5-4.5L7 20"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3.2 2"/>',
  hourglass: '<path d="M6.5 3h11M6.5 21h11"/><path d="M7.5 3v3.5a4.5 4.5 0 0 0 9 0V3M7.5 21v-3.5a4.5 4.5 0 0 1 9 0V21"/>',
  target: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.3"/>',
  users: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/><path d="M16 4.6a3.5 3.5 0 0 1 0 6.8M18 14a6.5 6.5 0 0 1 3.5 6"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4.5 20.5a7.5 7.5 0 0 1 15 0"/>',
  trophy: '<path d="M8 4h8v5a4 4 0 0 1-8 0z"/><path d="M8 5.5H4.5V7A3.5 3.5 0 0 0 8 10.5M16 5.5h3.5V7a3.5 3.5 0 0 1-3.5 3.5"/><path d="M12 13v3.5M8.5 20.5h7l-1-4h-5z"/>',
  check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
  checkCircle: '<circle cx="12" cy="12" r="9"/><path d="m8 12.2 2.8 2.8L16.3 9.5"/>',
  circle: '<circle cx="12" cy="12" r="9"/>',
  x: '<path d="M6 6l12 12M18 6 6 18"/>',
  minus: '<path d="M5 12h14"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  square: '<rect x="5" y="5" width="14" height="14" rx="1.5"/>',
  tray: '<path d="M4 14.5V18a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3.5"/><path d="M12 4v10M8 10.5l4 4 4-4"/>',
  download: '<path d="M12 4v11M7.5 10.5 12 15l4.5-4.5"/><path d="M4.5 19.5h15"/>',
  trash: '<path d="M4.5 7h15M9.5 7V4.5h5V7M6.5 7l1 13h9l1-13"/><path d="M10 11v5.5M14 11v5.5"/>',
  search: '<circle cx="11" cy="11" r="6.5"/><path d="m20 20-4.2-4.2"/>',
  zoomIn: '<circle cx="11" cy="11" r="6.5"/><path d="m20 20-4.2-4.2M11 8.5v5M8.5 11h5"/>',
  zoomOut: '<circle cx="11" cy="11" r="6.5"/><path d="m20 20-4.2-4.2M8.5 11h5"/>',
  folder: '<path d="M3.5 7.5a2 2 0 0 1 2-2h4l2 2.5h7a2 2 0 0 1 2 2v7.5a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2z"/>',
  bell: '<path d="M6 16.5V11a6 6 0 0 1 12 0v5.5l1.5 2h-15z"/><path d="M10 20.5a2 2 0 0 0 4 0"/>',
  volume: '<path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z"/><path d="M15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11"/>',
  keyboard: '<rect x="2.5" y="6" width="19" height="12" rx="2.5"/><path d="M6 10h.01M9.5 10h.01M13 10h.01M16.5 10h.01M7.5 14h9"/>',
  rocket: '<path d="M12 15.5c4.5-2.5 7-6.5 7-11.5-5 0-9 2.5-11.5 7z"/><path d="m8.5 11-3 .5L3.5 14l3.5 1M13 15.5l-.5 3L10 20.5 9 17"/><circle cx="14.5" cy="9.5" r="1.6"/><path d="M6.5 17.5 4 20"/>',
  leaf: '<path d="M5 19c0-8 5-13.5 15-14 .5 10-5 15-13 15"/><path d="M5 19c2.5-4 5.5-6.5 9-8"/>',
  scale: '<path d="M12 4v16M6 20h12"/><path d="m5 8 7-2 7 2"/><path d="M5 8 2.5 14a3 3 0 0 0 5 0zM19 8l-2.5 6a3 3 0 0 0 5 0z"/>',
  bolt: '<path d="M13 2.5 5 13.5h6l-1 8 8-11h-6z"/>',
  cpu: '<rect x="6" y="6" width="12" height="12" rx="2"/><rect x="9.5" y="9.5" width="5" height="5" rx="1"/><path d="M9 3v3M15 3v3M9 18v3M15 18v3M3 9h3M3 15h3M18 9h3M18 15h3"/>',
  shield: '<path d="M12 3 4.5 6v5.5c0 4.5 3.2 8.2 7.5 9.5 4.3-1.3 7.5-5 7.5-9.5V6z"/><path d="m9 12 2.2 2.2L15.5 10"/>',
  book: '<path d="M4.5 5.5A2 2 0 0 1 6.5 3.5H19v15H6.5a2 2 0 0 0-2 2z"/><path d="M4.5 20.5V5.5M8.5 7.5h6"/>',
  refresh: '<path d="M19.5 12a7.5 7.5 0 1 1-2.2-5.3L19.5 9"/><path d="M19.5 4v5h-5"/>',
  hand: '<path d="M8 13V5.5a1.5 1.5 0 0 1 3 0V11M11 10.5V4a1.5 1.5 0 0 1 3 0v6.5M14 10.5V5.5a1.5 1.5 0 0 1 3 0V14"/><path d="M8 13 6.6 11.3a1.6 1.6 0 0 0-2.5 2l3.4 4.5A6 6 0 0 0 12.3 20H13a4 4 0 0 0 4-4v-2"/>',
  anchor: '<circle cx="12" cy="5" r="2"/><path d="M12 7v14M8.5 10.5h7"/><path d="M4 13.5a8 8 0 0 0 16 0"/>',
  map: '<path d="M9 4.5 3.5 6.5v13L9 17.5l6 2 5.5-2v-13L15 6.5z"/><path d="M9 4.5v13M15 6.5v13"/>',
  sparkle: '<path d="M12 3c.6 4.3 2.2 6 6.5 6.5-4.3.6-5.9 2.2-6.5 6.5-.6-4.3-2.2-5.9-6.5-6.5C9.8 9 11.4 7.3 12 3z"/><path d="M18.5 15.5c.3 1.8.9 2.4 2.5 2.7-1.6.3-2.2.9-2.5 2.6-.3-1.7-.9-2.3-2.5-2.6 1.6-.3 2.2-.9 2.5-2.7z"/>',
  chevron: '<path d="m6 9 6 6 6-6"/>',
  maximize: '<rect x="5" y="5" width="14" height="14" rx="1.5"/>',
  edit: '<path d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16z"/><path d="m13.5 6.5 4 4"/>',
  select: '<rect x="3.5" y="3.5" width="7" height="7" rx="1.5"/><rect x="13.5" y="3.5" width="7" height="7" rx="1.5"/><rect x="3.5" y="13.5" width="7" height="7" rx="1.5"/><path d="m14 17 2 2 4-4"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5.5M12 7.5h.01"/>',
  external: '<path d="M14 4h6v6M20 4l-9 9"/><path d="M18 14v4.5a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 4 18.5v-11A1.5 1.5 0 0 1 5.5 6H10"/>',
};

export function mountIcons() {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('width', '0'); svg.setAttribute('height', '0');
  svg.style.position = 'absolute';
  let html = '<defs><linearGradient id="goldStroke" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff3cf"/><stop offset=".45" stop-color="#f6cf74"/><stop offset="1" stop-color="#a8701f"/></linearGradient></defs>';
  for (const [k, v] of Object.entries(P)) {
    html += `<symbol id="i-${k}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${v}</symbol>`;
  }
  svg.innerHTML = html;
  document.body.prepend(svg);
}

export const icon = (name, cls = '') => `<svg class="${cls}" aria-hidden="true"><use href="#i-${name}"/></svg>`;

// Brasão do aplicativo (bússola dourada sobre baú).
export const crest = `<svg viewBox="0 0 64 64" class="mark" aria-hidden="true">
  <defs>
    <linearGradient id="cg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff3cf"/><stop offset=".4" stop-color="#f6cf74"/><stop offset=".75" stop-color="#d0932f"/><stop offset="1" stop-color="#7a4d12"/></linearGradient>
    <radialGradient id="cb" cx=".35" cy=".3" r=".9"><stop offset="0" stop-color="#2a2f45"/><stop offset="1" stop-color="#0b0d16"/></radialGradient>
  </defs>
  <circle cx="32" cy="32" r="29" fill="url(#cb)" stroke="url(#cg)" stroke-width="2.4"/>
  <circle cx="32" cy="32" r="23.5" fill="none" stroke="url(#cg)" stroke-opacity=".45" stroke-width="1" stroke-dasharray="1.5 3"/>
  <path d="M32 7.5 36 28 32 32 28 28z" fill="url(#cg)"/>
  <path d="M32 56.5 28 36 32 32 36 36z" fill="url(#cg)" opacity=".55"/>
  <path d="M7.5 32 28 28 32 32 28 36z" fill="url(#cg)" opacity=".55"/>
  <path d="M56.5 32 36 36 32 32 36 28z" fill="url(#cg)" opacity=".55"/>
  <circle cx="32" cy="32" r="3.2" fill="#0b0d16" stroke="url(#cg)" stroke-width="1.6"/>
</svg>`;
