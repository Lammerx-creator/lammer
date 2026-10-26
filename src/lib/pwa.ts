/** Register only the production shell. All learning data remains in IndexedDB. */
export function registerPwa(): void {
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return;
  const register = () => {
    const script = document.querySelector<HTMLScriptElement>('script[type="module"][src]');
    const build = script ? new URL(script.src, location.href).pathname : 'v1';
    const base = new URL(import.meta.env.BASE_URL, location.origin);
    const worker = new URL('sw.js', base);
    worker.searchParams.set('build', build);
    navigator.serviceWorker.register(worker.href, {
      scope: base.pathname,
      updateViaCache: 'none',
    }).catch((error: unknown) => {
      console.warn('Не удалось подготовить офлайн-режим DeutschTrainer:', error);
    });
  };
  if (document.readyState === 'complete') register();
  else window.addEventListener('load', register, { once: true });
}
