export const THEME_KEY = "ww-theme";

/** Script executado antes da pintura: aplica o tema salvo (ou o do sistema) sem piscar. */
export const THEME_SCRIPT = `(function(){try{var t=localStorage.getItem('${THEME_KEY}');if(t!=='light'&&t!=='dark'){t=matchMedia('(prefers-color-scheme: light)').matches?'light':'dark'}}catch(e){var t='dark'}var d=document.documentElement;d.dataset.theme=t;d.style.colorScheme=t;if(/(Chrome|Chromium)\\/\\d+/.test(navigator.userAgent)&&CSS.supports('backdrop-filter','url(#x)'))d.classList.add('lens')})()`;

/**
 * Animações em CSS (desenho de gráficos, entradas, faixas) ficam pausadas até o elemento aparecer na tela.
 * Roda antes da hidratação; sem JavaScript, nada fica pausado (a classe "io" nem é aplicada).
 */
export const INVIEW_SCRIPT = `(function(){if(!('IntersectionObserver' in window))return;var d=document.documentElement;d.classList.add('io');var S='.animate-draw,.animate-fade-up,.animate-marquee,.play-on-view';var io=new IntersectionObserver(function(es){es.forEach(function(e){if(e.isIntersecting){e.target.classList.add('in-view');io.unobserve(e.target)}})},{rootMargin:'0px 0px -8% 0px'});function scan(r){if(r.matches&&r.matches(S))io.observe(r);if(r.querySelectorAll)r.querySelectorAll(S).forEach(function(el){if(!el.classList.contains('in-view'))io.observe(el)})}function start(){scan(document.body);new MutationObserver(function(ms){ms.forEach(function(m){m.addedNodes.forEach(function(n){if(n.nodeType===1)scan(n)})})}).observe(document.body,{childList:true,subtree:true})}if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start);else start()})()`;
