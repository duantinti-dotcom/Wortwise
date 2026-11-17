export const THEME_KEY = "ww-theme";

/** Script executado antes da pintura: aplica o tema salvo (ou o do sistema) sem piscar. */
export const THEME_SCRIPT = `(function(){try{var t=localStorage.getItem('${THEME_KEY}');if(t!=='light'&&t!=='dark'){t=matchMedia('(prefers-color-scheme: light)').matches?'light':'dark'}}catch(e){var t='dark'}var d=document.documentElement;d.dataset.theme=t;d.style.colorScheme=t;})()`;

/**
 * Animações em CSS (desenho de gráficos, entradas, faixas) ficam pausadas até o elemento aparecer na tela.
 * Roda antes da hidratação; sem JavaScript, nada fica pausado (a classe "io" nem é aplicada).
 */
export const INVIEW_SCRIPT = `(function(){if(!('IntersectionObserver' in window))return;var d=document.documentElement;d.classList.add('io');var S='.animate-draw,.animate-fade-up,.animate-marquee,.play-on-view';var io=new IntersectionObserver(function(es){es.forEach(function(e){if(e.isIntersecting){e.target.classList.add('in-view');io.unobserve(e.target)}})},{rootMargin:'0px 0px -8% 0px'});function scan(r){if(r.matches&&r.matches(S))io.observe(r);if(r.querySelectorAll)r.querySelectorAll(S).forEach(function(el){if(!el.classList.contains('in-view'))io.observe(el)})}function start(){scan(document.body);new MutationObserver(function(ms){ms.forEach(function(m){m.addedNodes.forEach(function(n){if(n.nodeType===1)scan(n)})})}).observe(document.body,{childList:true,subtree:true})}if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start);else start()})()`;

/**
 * Depois de uma publicação nova, um celular pode abrir uma página antiga cujo arquivo de visual (CSS) ou de
 * código já não existe. Nesse caso a página se recarrega sozinha uma vez, já com a versão nova.
 */
export const ASSET_GUARD_SCRIPT = `(function(){var K='ww-asset-reload';function again(){try{if(sessionStorage.getItem(K))return;sessionStorage.setItem(K,'1')}catch(_){return}location.reload()}addEventListener('error',function(e){var t=e.target;if(!t||!t.tagName)return;var u=t.href||t.src||'';if((t.tagName==='LINK'&&t.rel==='stylesheet')||(t.tagName==='SCRIPT'&&u.indexOf('/_next/')>=0))again()},true);addEventListener('load',function(){var ls=document.querySelectorAll('link[rel=stylesheet]');for(var i=0;i<ls.length;i++){if(!ls[i].sheet){again();return}}setTimeout(function(){try{sessionStorage.removeItem(K)}catch(_){}},3000)})})()`;
