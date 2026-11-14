export const THEME_KEY = "ww-theme";

/** Script executado antes da pintura: aplica o tema salvo (ou o do sistema) sem piscar. */
export const THEME_SCRIPT = `(function(){try{var t=localStorage.getItem('${THEME_KEY}');if(t!=='light'&&t!=='dark'){t=matchMedia('(prefers-color-scheme: light)').matches?'light':'dark'}}catch(e){var t='dark'}var d=document.documentElement;d.dataset.theme=t;d.style.colorScheme=t})()`;
