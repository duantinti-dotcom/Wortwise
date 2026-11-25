// Ponte com o backend em Go (Wails). Os métodos existem em window.go.app.App.
const backend = () => window.go?.app?.App;
const rt = () => window.runtime;

export function call(method, ...args) {
  const b = backend();
  if (!b || typeof b[method] !== 'function') {
    return Promise.reject(new Error('Backend indisponível'));
  }
  return b[method](...args);
}

export function on(event, cb) {
  rt()?.EventsOn?.(event, cb);
}

export const win = {
  minimise: () => rt()?.WindowMinimise?.(),
  toggleMax: () => rt()?.WindowToggleMaximise?.(),
};
