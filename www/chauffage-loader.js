/*
 * chauffage-loader
 * Stable loader for chauffage-programme-card.js, to be referenced ONCE:
 *
 *   configuration.yaml →  frontend:
 *                           extra_module_url:
 *                             - /local/chauffage/chauffage-loader.js
 *
 * It always loads the latest version of the card (next to it): no ?v= to change and no
 * restart when the card is modified. The version comes from the file's modification date
 * (ETag / Last-Modified): the browser keeps the card cached as long as it does not change.
 */
(async () => {
  const url = new URL('./chauffage-programme-card.js', import.meta.url).pathname;
  let version = '';
  try {
    const r = await fetch(url, { method: 'HEAD', cache: 'no-cache' });
    version = r.headers.get('etag') || r.headers.get('last-modified') || '';
  } catch (e) {
    /* offline: fall back to an uncached load */
  }
  try {
    await import(`${url}?v=${encodeURIComponent(version || Date.now())}`);
  } catch (e) {
    console.error('chauffage-loader: cannot load the card', e);
  }
})();
