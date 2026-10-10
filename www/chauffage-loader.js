/*
 * chauffage-loader
 * Chargeur stable de chauffage-programme-card.js, à référencer UNE SEULE FOIS :
 *
 *   configuration.yaml →  frontend:
 *                           extra_module_url:
 *                             - /local/chauffage/chauffage-loader.js
 *
 * Il charge toujours la dernière version de la carte (située à côté de lui) :
 * pas de ?v= à changer ni de redémarrage quand la carte est modifiée.
 * La version est déduite de la date de modification du fichier (ETag / Last-Modified) :
 * le navigateur garde la carte en cache tant qu'elle ne change pas.
 */
(async () => {
  const url = new URL('./chauffage-programme-card.js', import.meta.url).pathname;
  let version = '';
  try {
    const r = await fetch(url, { method: 'HEAD', cache: 'no-cache' });
    version = r.headers.get('etag') || r.headers.get('last-modified') || '';
  } catch (e) {
    /* hors ligne : on retombe sur un chargement sans cache */
  }
  try {
    await import(`${url}?v=${encodeURIComponent(version || Date.now())}`);
  } catch (e) {
    console.error('chauffage-loader : impossible de charger la carte', e);
  }
})();
